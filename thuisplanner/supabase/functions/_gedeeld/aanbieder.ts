// Thuisplanner: de koppeling met de mailaanbieder, verwisselbaar (docs/thuisplanner-uitnodigingsmail-verzending.md).
// De wachtrij, de toestanden en de grenzen staan in de database en weten niets van de aanbieder. Een aanbieder is een
// adapter met drie dingen:
//   - verstuur(mail, sleutel): de aanbieder neemt de mail aan (bericht-id), of gooit een fout;
//   - idempotent: ALLEEN true als bewezen is dat dezelfde sleutel bij die aanbieder hoogstens één mail geeft. Dan mag een
//     onzekere poging (geen antwoord) veilig nog eens; anders nooit (de database dwingt dat af);
//   - bezorging(verzoek): leest een ondertekende melding van de aanbieder (bezorgd of niet bezorgd), of null als de
//     handtekening niet klopt.
//
// Fouten: NietAangenomen = de aanbieder antwoordde en nam de mail zeker NIET aan (5xx/429 tijdelijk, 4xx definitief).
// Elke andere fout (time-out, verbinding weg tijdens of na het versturen) is ONZEKER: de mail kan al weg zijn.
//
// Adapters nu:
//   mailpit       lokaal (MAIL_ADAPTER=mailpit); niet idempotent; geen bezorgmeldingen.
//   test          alleen voor de lokale tests: een nagebootste aanbieder op deze computer (TESTAANBIEDER_URL, alleen
//                 host.docker.internal, localhost of 127.0.0.1). Aan te zetten per database (private.instellingen.
//                 mail_testaanbieder); online staat TESTAANBIEDER_URL niet en eist de nacontrole dat de instelling leeg is.
// De echte aanbieder (keuze B6) komt hier als eigen adapter. Zonder bekende adapter: weigeren (fail-closed).
import { geheimGelijk, hmacHex, instelling, type Mail } from './k1.ts';

export class NietAangenomen extends Error {
  readonly status: number;
  /** De wachttijd die de aanbieder vraagt (Retry-After), in seconden. */
  readonly wachtS: number | null;
  constructor(status: number, wachtS: number | null = null) {
    super(`niet aangenomen: ${status}`);
    this.status = status;
    this.wachtS = wachtS;
  }
  get opnieuw(): boolean { return this.status >= 500 || this.status === 429; }
}

export interface Bezorging { berichtId: string; uitkomst: 'bezorgd' | 'niet_bezorgd' }

export interface Aanbieder {
  naam: string;
  idempotent: boolean;
  verstuur(m: Mail, sleutel?: string): Promise<{ berichtId: string | null }>;
  /** Een geldige melding over één bericht, 'negeren' (geldig maar niet over bezorging), of null (ongeldig). */
  bezorging(req: Request, body: string): Promise<Bezorging | 'negeren' | null>;
}

const TIJDSLIMIET_MS = 2500;

function afzender(): { naam: string; email: string } {
  const a = Deno.env.get('MAIL_AFZENDER') ?? 'Thuisplanner <noreply@thuisplanner.test>';
  const [, naam, email] = a.match(/^(.*?)\s*<(.+)>$/) ?? [null, 'Thuisplanner', a];
  return { naam, email };
}

const wachtTijd = (r: Response) => {
  const w = Number(r.headers.get('retry-after'));
  return Number.isFinite(w) && w > 0 ? Math.min(w, 3600) : null;
};

/** Eén POST met een harde tijdslimiet. Een time-out geeft een gewone (onzekere) fout, nooit NietAangenomen. */
async function post(url: string, kop: Record<string, string>, body: unknown): Promise<Response> {
  const ctl = new AbortController();
  const klok = setTimeout(() => ctl.abort(), TIJDSLIMIET_MS);
  try {
    return await fetch(url, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...kop }, body: JSON.stringify(body) });
  } finally {
    clearTimeout(klok);
  }
}

function mailpit(): Aanbieder {
  return {
    naam: 'mailpit', idempotent: false,
    async verstuur(m, sleutel) {
      const { naam, email } = afzender();
      // Mailpit kent geen idempotentie; de sleutel gaat als kop mee, zodat de tests hem zien.
      const r = await post(`${instelling('MAILPIT_URL')}/api/v1/send`, {}, {
        From: { Email: email, Name: naam }, To: [{ Email: m.aan }], Subject: m.onderwerp, Text: m.tekst, HTML: m.html,
        ...(sleutel ? { Headers: { 'X-Thuisplanner-Sleutel': sleutel } } : {}),
      });
      if (!r.ok) throw new NietAangenomen(r.status, wachtTijd(r));
      const b = await r.json().catch(() => ({}));
      return { berichtId: typeof b.ID === 'string' ? b.ID : null };
    },
    async bezorging() { return null; },
  };
}

/** De nagebootste aanbieder van de lokale tests (tests/integratie/testaanbieder.mjs). */
function testaanbieder(idempotent: boolean): Aanbieder {
  const basis = Deno.env.get('TESTAANBIEDER_URL') ?? '';
  if (!/^http:\/\/(host\.docker\.internal|localhost|127\.0\.0\.1):\d+$/.test(basis)) throw new Error('testaanbieder alleen lokaal');
  return {
    naam: idempotent ? 'test-idempotent' : 'test', idempotent,
    async verstuur(m, sleutel) {
      const { naam, email } = afzender();
      const r = await post(`${basis}/send`, idempotent && sleutel ? { 'Idempotency-Key': sleutel } : {},
        { van: `${naam} <${email}>`, aan: m.aan, onderwerp: m.onderwerp, tekst: m.tekst, html: m.html, sleutel: sleutel ?? null });
      if (!r.ok) throw new NietAangenomen(r.status, wachtTijd(r));
      const b = await r.json().catch(() => ({}));
      return { berichtId: typeof b.id === 'string' ? b.id : null };
    },
    async bezorging(req, body) {
      const verwacht = await hmacHex(instelling('TESTAANBIEDER_GEHEIM'), body);
      if (!geheimGelijk(req.headers.get('x-testaanbieder-handtekening') ?? '', verwacht)) return null;
      const b = JSON.parse(body);
      if (typeof b.id !== 'string' || !['bezorgd', 'niet_bezorgd'].includes(b.uitkomst)) return null;
      return { berichtId: b.id, uitkomst: b.uitkomst };
    },
  };
}

/**
 * Lettermint (Nederland, EU; keuze van 18 oktober 2026). Zie docs/thuisplanner-mailaanbieder-keuze.md.
 * - Versturen: POST /v1/send, met x-lettermint-token, en altijd de rij-id als Idempotency-Key (24 uur geldig).
 * - idempotent: ALLEEN als LETTERMINT_IDEMPOTENT_BEWEZEN=ja. Dat zet de beheerder pas nadat online is bewezen dat
 *   dezelfde sleutel geen tweede mail geeft. Tot dan blijft een verloren antwoord "onzeker" (geen nieuwe poging).
 * - 409 (sleutel al gebruikt, of het eerste verzoek loopt nog of had een onbekende uitkomst): ONZEKER, nooit opnieuw.
 * - 429 en 5xx: niet aangenomen, later opnieuw (met dezelfde sleutel). Andere 4xx: definitief niet aangenomen.
 * - Bezorging: X-Lettermint-Signature "t=<sec>,v1=<hmac-sha256-hex>" over "<t>.<body>", met het webhookgeheim
 *   (whsec_…) letterlijk als sleutel; X-Lettermint-Delivery moet gelijk zijn aan t; hoogstens 5 minuten oud.
 */
const LETTERMINT_API = 'https://api.lettermint.co';
const NIET_BEZORGD = new Set(['message.hard_bounced', 'message.failed', 'message.suppressed', 'message.policy_rejected']);

export function lettermint(): Aanbieder {
  const basis = Deno.env.get('LETTERMINT_API_URL') ?? LETTERMINT_API;
  // Alleen de echte API, of (in de lokale tests) een nagebootste op deze computer.
  if (basis !== LETTERMINT_API && !/^http:\/\/(host\.docker\.internal|localhost|127\.0\.0\.1):\d+$/.test(basis)) throw new Error('LETTERMINT_API_URL ongeldig');
  return {
    naam: 'lettermint',
    idempotent: Deno.env.get('LETTERMINT_IDEMPOTENT_BEWEZEN') === 'ja',
    async verstuur(m, sleutel) {
      const { naam, email } = afzender();
      const route = Deno.env.get('LETTERMINT_ROUTE');
      const r = await post(`${basis}/v1/send`, { 'x-lettermint-token': instelling('LETTERMINT_TOKEN'), ...(sleutel ? { 'Idempotency-Key': sleutel } : {}) },
        { from: `${naam} <${email}>`, to: [m.aan], subject: m.onderwerp, text: m.tekst, html: m.html, ...(route ? { route } : {}) });
      if (r.status === 202 || r.status === 200) {
        const b = await r.json().catch(() => ({}));
        return { berichtId: typeof b.message_id === 'string' ? b.message_id : null };
      }
      // 409: de sleutel is al gebruikt (misschien is de mail al weg). Dat is geen weigering: onzeker.
      if (r.status === 409) throw new Error('lettermint: 409, uitkomst onbekend');
      throw new NietAangenomen(r.status, wachtTijd(r));
    },
    async bezorging(req, body) {
      const kop = req.headers.get('x-lettermint-signature') ?? '';
      const t = kop.match(/(?:^|,)\s*t=(\d+)/)?.[1];
      const v1 = kop.match(/(?:^|,)\s*v1=([0-9a-f]{64})/)?.[1];
      if (!t || !v1 || req.headers.get('x-lettermint-delivery') !== t) return null;
      if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return null;
      if (!geheimGelijk(v1, await hmacHex(instelling('LETTERMINT_WEBHOOK_GEHEIM'), `${t}.${body}`))) return null;
      let b: { event?: string; data?: { message_id?: unknown } };
      try { b = JSON.parse(body); } catch { return null; }
      const id = b.data?.message_id;
      if (b.event === 'message.delivered' && typeof id === 'string') return { berichtId: id, uitkomst: 'bezorgd' };
      if (NIET_BEZORGD.has(b.event ?? '') && typeof id === 'string') return { berichtId: id, uitkomst: 'niet_bezorgd' };
      // Geldig, maar niet over bezorging (bijvoorbeeld een tijdelijke bounce, een test of een spamklacht).
      return 'negeren';
    },
  };
}

/** De aanbieder voor deze omgeving; `test` alleen als de database het vraagt én TESTAANBIEDER_URL lokaal is. */
export function kiesAanbieder(testInstelling: string | null = null): Aanbieder {
  if (testInstelling === 'gewoon' || testInstelling === 'idempotent') return testaanbieder(testInstelling === 'idempotent');
  const naam = instelling('MAIL_ADAPTER');
  if (naam === 'mailpit') return mailpit();
  if (naam === 'lettermint') return lettermint();
  throw new Error(`onbekende mailaanbieder ${naam}`);
}

/** Voor de codes (K1): altijd de ingestelde aanbieder, met de tijdslimiet. */
export async function verstuur(m: Mail, sleutel?: string): Promise<string | null> {
  return (await kiesAanbieder().verstuur(m, sleutel)).berichtId;
}
