// Thuisplanner D6, alleen voor de lokale tests: een nagebootste mailaanbieder op deze computer. De Edge Function bereikt
// hem via TESTAANBIEDER_URL (host.docker.internal, API-poort + 7) zodra private.instellingen.mail_testaanbieder gezet is.
// Hij houdt bij wat hij echt "verstuurt", en kan per verzoek een gedrag krijgen:
//   ok           aannemen (200, bericht-id)
//   503 | 400    weigeren (niet aangenomen)
//   429:<s>      weigeren met Retry-After
//   verlies      WEL versturen, maar het antwoord pas na 4 s geven (de adapter geeft na 2,5 s op): "mogelijk verstuurd,
//                antwoord verloren"
//   traag        NIET versturen en pas na 4 s weigeren: onzeker voor de adapter, maar er ging niets weg
//   () => {...}  eerst die (synchrone) functie uitvoeren, dan aannemen zoals 'ok'
// Met een Idempotency-Key die hij al kent, verstuurt hij niets opnieuw en geeft hij hetzelfde bericht-id (zoals een
// idempotente aanbieder). Bezorgmeldingen ondertekent hij met TESTAANBIEDER_GEHEIM (HMAC-SHA256, hex).
import { createHmac, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));

/** De lokale waarden uit supabase/functions/.env (gemaakt door k1-lokaal.mjs). */
export function functieEnv() {
  const tekst = readFileSync(path.resolve(HIER, '../../functions/.env'), 'utf8');
  return Object.fromEntries(tekst.split(/\r?\n/).filter(r => r.includes('=') && !r.startsWith('#')).map(r => [r.slice(0, r.indexOf('=')), r.slice(r.indexOf('=') + 1)]));
}

/**
 * Luisteren op een vaste poort, met geduld. De poort ligt vast (de Edge Functions kennen hem via TESTAANBIEDER_URL), maar
 * op Linux valt hij in het bereik van tijdelijke uitgaande poorten (32768–60999): een gewone verbinding van de runner kan
 * hem even bezet houden (EADDRINUSE, CI van PR #56 en #60 op 25 november 2026). Dan opnieuw proberen, en bij de eerste
 * keer tonen wie de poort heeft. Een andere fout, of nog steeds bezet na alle pogingen: meteen een duidelijke fout.
 * De workflow reserveert de poorten van de stack ook (ip_local_reserved_ports); dit is het vangnet.
 */
export async function luisterMetGeduld(server, poort, adres, { pogingen = 30, wachtMs = 1000, meld = console.error } = {}) {
  for (let i = 1; ; i++) {
    try {
      await new Promise((ok, fout) => {
        const bijFout = e => { server.off('listening', bijLuisteren); fout(e); };
        const bijLuisteren = () => { server.off('error', bijFout); ok(); };
        server.once('error', bijFout);
        server.once('listening', bijLuisteren);
        server.listen(poort, adres);
      });
      if (i > 1) meld(`testaanbieder: poort ${poort} vrij na ${i} pogingen`);
      return;
    } catch (e) {
      if (e?.code !== 'EADDRINUSE' || i >= pogingen) {
        if (e?.code === 'EADDRINUSE') e.message = `poort ${poort} na ${pogingen} pogingen nog bezet: ${e.message}`;
        throw e;
      }
      if (i === 1) meld(`testaanbieder: poort ${poort} bezet, opnieuw proberen. Wie: ${wieHeeftPoort(poort)}`);
      await new Promise(r => setTimeout(r, wachtMs));
    }
  }
}

/** Alleen voor de foutmelding: wie heeft de poort (Linux: ss), zonder dat het mislukken ervan iets uitmaakt. */
function wieHeeftPoort(poort) {
  try {
    return execSync(`ss -tanp 2>/dev/null | grep -E ':${Number(poort)}[[:space:]]' | head -5`, { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'onbekend';
  } catch { return 'onbekend'; }
}

export async function startTestaanbieder(poort) {
  const geheim = functieEnv().TESTAANBIEDER_GEHEIM;
  const t = {
    verstuurd: [],          // { id, aan, sleutel, onderwerp, tekst }
    herhaald: 0,            // verzoeken met een bekende sleutel (niets verstuurd)
    verzoeken: 0,
    gedrag: [],             // wachtrij van gedragingen voor de volgende verzoeken; leeg = ok
    sleutels: new Map(),
    zet(...g) { this.gedrag.push(...g); },
    voor(aan) { return this.verstuurd.filter(v => v.aan === aan); },
    wis() { this.verstuurd = []; this.herhaald = 0; this.verzoeken = 0; this.gedrag = []; this.sleutels.clear(); },
    async bezorg(functies, id, uitkomst, { vals = false } = {}) {
      const body = JSON.stringify({ id, uitkomst });
      const handtekening = vals ? 'f'.repeat(64) : createHmac('sha256', geheim).update(body).digest('hex');
      const r = await fetch(`${functies}/mail-bezorging?aanbieder=test`, { method: 'POST', body,
        headers: { 'Content-Type': 'application/json', 'x-testaanbieder-handtekening': handtekening } });
      return r.status;
    },
  };
  const server = createServer((req, res) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => {
      if (req.method !== 'POST' || req.url !== '/send') { res.writeHead(404).end(); return; }
      t.verzoeken++;
      const m = JSON.parse(data);
      const sleutel = req.headers['idempotency-key'] ?? null;
      const antwoord = (status, body, kop = {}) => res.writeHead(status, { 'Content-Type': 'application/json', ...kop }).end(JSON.stringify(body));
      if (sleutel && t.sleutels.has(sleutel)) { t.herhaald++; antwoord(200, { id: t.sleutels.get(sleutel) }); return; }
      let g = t.gedrag.shift() ?? 'ok';
      // Een functie als gedrag: eerst iets doen op het moment dat de mail binnenkomt (bijv. PostgREST stoppen), dan 'ok'.
      if (typeof g === 'function') { try { g(); } finally { g = 'ok'; } }
      const verstuur = () => {
        const id = 'test-' + randomUUID();
        t.verstuurd.push({ id, aan: m.aan, sleutel: m.sleutel, onderwerp: m.onderwerp, tekst: m.tekst });
        if (sleutel) t.sleutels.set(sleutel, id);
        return id;
      };
      if (g === 'ok') antwoord(200, { id: verstuur() });
      else if (g === 'verlies') { const id = verstuur(); setTimeout(() => antwoord(200, { id }), 4000); }
      else if (g === 'traag') setTimeout(() => antwoord(503, {}), 4000);
      else if (g.startsWith('429')) antwoord(429, {}, { 'Retry-After': g.split(':')[1] ?? '60' });
      else antwoord(Number(g), {});
    });
  });
  await luisterMetGeduld(server, poort, process.env.TESTAANBIEDER_ADRES ?? '127.0.0.1');
  t.stop = () => new Promise(ok => { server.closeAllConnections?.(); server.close(() => ok()); });
  return t;
}
