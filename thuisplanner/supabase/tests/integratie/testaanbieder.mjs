// Thuisplanner D6, alleen voor de lokale tests: een nagebootste mailaanbieder op deze computer. De Edge Function bereikt
// hem via TESTAANBIEDER_URL (host.docker.internal, API-poort + 7) zodra private.instellingen.mail_testaanbieder gezet is.
// Hij houdt bij wat hij echt "verstuurt", en kan per verzoek een gedrag krijgen:
//   ok           aannemen (200, bericht-id)
//   503 | 400    weigeren (niet aangenomen)
//   429:<s>      weigeren met Retry-After
//   verlies      WEL versturen, maar het antwoord pas na 4 s geven (de adapter geeft na 2,5 s op): "mogelijk verstuurd,
//                antwoord verloren"
//   traag        NIET versturen en pas na 4 s weigeren: onzeker voor de adapter, maar er ging niets weg
// Met een Idempotency-Key die hij al kent, verstuurt hij niets opnieuw en geeft hij hetzelfde bericht-id (zoals een
// idempotente aanbieder). Bezorgmeldingen ondertekent hij met TESTAANBIEDER_GEHEIM (HMAC-SHA256, hex).
import { createHmac, randomUUID } from 'node:crypto';
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
      const g = t.gedrag.shift() ?? 'ok';
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
  await new Promise((ok, fout) => { server.once('error', fout); server.listen(poort, process.env.TESTAANBIEDER_ADRES ?? '127.0.0.1', ok); });
  t.stop = () => new Promise(ok => { server.closeAllConnections?.(); server.close(() => ok()); });
  return t;
}
