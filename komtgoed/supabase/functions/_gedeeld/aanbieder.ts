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
  /** wachtS: de wachttijd die de aanbieder vraagt (Retry-After), in seconden. */
  constructor(readonly status: number, readonly wachtS: number | null = null) { super(`niet aangenomen: ${status}`); }
  get opnieuw(): boolean { return this.status >= 500 || this.status === 429; }
}

export interface Bezorging { berichtId: string; uitkomst: 'bezorgd' | 'niet_bezorgd' }

export interface Aanbieder {
  naam: string;
  idempotent: boolean;
  verstuur(m: Mail, sleutel?: string): Promise<{ berichtId: string | null }>;
  bezorging(req: Request, body: string): Promise<Bezorging | null>;
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

/** De aanbieder voor deze omgeving; `test` alleen als de database het vraagt én TESTAANBIEDER_URL lokaal is. */
export function kiesAanbieder(testInstelling: string | null = null): Aanbieder {
  if (testInstelling === 'gewoon' || testInstelling === 'idempotent') return testaanbieder(testInstelling === 'idempotent');
  const naam = instelling('MAIL_ADAPTER');
  if (naam === 'mailpit') return mailpit();
  throw new Error(`onbekende mailaanbieder ${naam}`);
}

/** Voor de codes (K1): altijd de ingestelde aanbieder, met de tijdslimiet. */
export async function verstuur(m: Mail, sleutel?: string): Promise<string | null> {
  return (await kiesAanbieder().verstuur(m, sleutel)).berichtId;
}
