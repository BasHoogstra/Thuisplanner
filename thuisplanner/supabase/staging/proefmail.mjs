// Thuisplanner-staging, stap 3: één proefmail via Lettermint, met precies de adapter die de Edge Functions gebruiken
// (functions/_gedeeld/aanbieder.ts), en de proef op idempotentie: hetzelfde verzoek nog eens met dezelfde
// Idempotency-Key moet hetzelfde message_id geven en GEEN tweede mail. Zie docs/thuisplanner-staging-overstap.md, stap 3.
//
// Alleen via staging/proefmail.ps1: die vraagt het token en de ontvanger bij een verborgen prompt, vraagt een getypte
// bevestiging, en zet ze alleen in de omgeving van dit ene proces (LETTERMINT_TOKEN, PROEF_AAN). Dit script toont nooit
// het token of het volledige adres; alleen statuscodes, de uitkomst en het message_id.
//   node --experimental-strip-types staging/proefmail.mjs
// Afzender: die van staging uit thuisplanner/omgevingen.json. LETTERMINT_API_URL alleen voor de lokale tests (de
// adapter accepteert dan uitsluitend een adres op deze computer).
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));

/** Een adres verkort tonen: de eerste letter en het domein (b…@voorbeeld.nl). */
export const verkort = adres => String(adres).replace(/^(.)[^@]*@/, '$1…@');

/** De proefmail zelf: onderwerp en tekst zonder geheimen, met een tijdstip om hem te herkennen. */
export function proefbericht(aan, moment = new Date()) {
  const tijd = moment.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const tekst = `Dit is een proefmail van Thuisplanner (staging), verstuurd op ${tijd}.\n\n`
    + 'Je hoeft niets te doen. We controleren alleen of de mail aankomt, niet in de spam terechtkomt, en maar één keer aankomt.';
  return { aan, onderwerp: 'Thuisplanner (staging): proefmail', tekst,
    html: `<p>Dit is een proefmail van Thuisplanner (staging), verstuurd op ${tijd}.</p><p>Je hoeft niets te doen. We controleren alleen of de mail aankomt, niet in de spam terechtkomt, en maar één keer aankomt.</p>` };
}

/**
 * Verstuur één keer, en daarna hetzelfde verzoek met dezelfde sleutel nog eens. Uitkomst:
 *   'bewezen'        de tweede keer hetzelfde message_id: idempotent, er is één mail
 *   'niet-idempotent' de tweede keer een ander message_id: er kunnen twee mails zijn (LETTERMINT_IDEMPOTENT_BEWEZEN niet zetten)
 *   'onzeker'        de tweede keer geen antwoord of 409: niet bewezen (niet zetten)
 *   'niet-verstuurd' de eerste keer niet aangenomen of onzeker: geen tweede verzoek
 */
export async function proef(aanbieder, bericht, { sleutel = 'proefmail-' + randomUUID(), wacht = ms => new Promise(r => setTimeout(r, ms)), pauzeMs = 3000 } = {}) {
  const poging = async () => {
    try { return { ok: true, berichtId: (await aanbieder.verstuur(bericht, sleutel)).berichtId }; }
    catch (e) { return { ok: false, status: typeof e?.status === 'number' ? e.status : null, melding: String(e?.message ?? e).slice(0, 80) }; }
  };
  const eerste = await poging();
  if (!eerste.ok || !eerste.berichtId) return { uitkomst: 'niet-verstuurd', sleutel, eerste, tweede: null };
  // Even wachten: een verzoek dat bij Lettermint nog loopt, geeft met dezelfde sleutel een 409.
  await wacht(pauzeMs);
  const tweede = await poging();
  const uitkomst = !tweede.ok || !tweede.berichtId ? 'onzeker' : tweede.berichtId === eerste.berichtId ? 'bewezen' : 'niet-idempotent';
  return { uitkomst, sleutel, eerste, tweede };
}

export const UITLEG = {
  'bewezen': 'IDEMPOTENT BEWEZEN: dezelfde sleutel gaf hetzelfde message_id. Er hoort precies één mail aan te komen. Pas als dat in de mailbox klopt, mag LETTERMINT_IDEMPOTENT_BEWEZEN=ja (stap 6).',
  'niet-idempotent': 'NIET IDEMPOTENT: dezelfde sleutel gaf een ander message_id; er kunnen twee mails zijn. LETTERMINT_IDEMPOTENT_BEWEZEN NIET zetten.',
  'onzeker': 'NIET BEWEZEN: het tweede verzoek gaf geen bericht-id (409, time-out of fout). De eerste mail is wel aangenomen. LETTERMINT_IDEMPOTENT_BEWEZEN NIET zetten.',
  'niet-verstuurd': 'NIET VERSTUURD: Lettermint nam de mail niet aan, of het antwoord bleef uit. Er is geen tweede verzoek gedaan.',
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const aan = (process.env.PROEF_AAN ?? '').trim();
  if (!process.env.LETTERMINT_TOKEN) { console.log('GEWEIGERD: geen token (gebruik staging/proefmail.ps1).'); process.exit(2); }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(aan) || aan.length > 254) { console.log('GEWEIGERD: geen geldig ontvangstadres.'); process.exit(2); }
  const omgevingen = JSON.parse(readFileSync(path.join(HIER, '../../omgevingen.json'), 'utf8'));
  const env = new Map(Object.entries({
    LETTERMINT_TOKEN: process.env.LETTERMINT_TOKEN,
    MAIL_AFZENDER: omgevingen.staging.mailAfzender,
    ...(process.env.LETTERMINT_ROUTE ? { LETTERMINT_ROUTE: process.env.LETTERMINT_ROUTE } : {}),
    ...(process.env.LETTERMINT_API_URL ? { LETTERMINT_API_URL: process.env.LETTERMINT_API_URL } : {}),
  }));
  globalThis.Deno = { env: { get: k => env.get(k) } };
  const { lettermint } = await import('../functions/_gedeeld/aanbieder.ts');
  console.log(`afzender: ${omgevingen.staging.mailAfzender}; ontvanger: ${verkort(aan)}; route: ${env.get('LETTERMINT_ROUTE') ?? '(standaard)'}`);
  let r;
  try { r = await proef(lettermint(), proefbericht(aan), process.env.PROEF_PAUZE_MS ? { pauzeMs: Number(process.env.PROEF_PAUZE_MS) } : {}); }
  catch (e) { console.log('FOUT: ' + String(e?.message ?? e).slice(0, 80)); process.exitCode = 1; }
  if (r) {
    const regel = p => (p.ok ? `aangenomen, message_id ${p.berichtId}` : `niet aangenomen of onzeker${p.status ? ` (status ${p.status})` : ''}: ${p.melding}`);
    console.log(`1e verzoek: ${regel(r.eerste)}`);
    if (r.tweede) console.log(`2e verzoek (zelfde sleutel): ${regel(r.tweede)}`);
    console.log(UITLEG[r.uitkomst]);
    // exitCode in plaats van process.exit(): direct na fetch afbreken laat Node op Windows soms vastlopen in libuv.
    process.exitCode = r.uitkomst === 'bewezen' ? 0 : r.uitkomst === 'niet-verstuurd' ? 1 : 3;
  }
}
