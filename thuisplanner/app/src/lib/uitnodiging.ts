// Uitnodigingslinks (KG-5H deel 1, docs/thuisplanner-onboarding.md). Een uitnodiging is een geheim van 64 hexadecimale
// tekens (32 willekeurige bytes; de database bewaart alleen de SHA-256). Wie het heeft, kan één keer lid worden, tot
// het verloopt of wordt ingetrokken. Daarom, en omdat een URL-fragment op zichzelf geen beveiliging is:
// - de link zet het token in het fragment (#/uitnodiging/<token>): het gaat niet mee in verzoeken naar de server, en
//   Referrer-Policy: no-referrer deelt de URL ook niet met andere sites;
// - bij het openen haalt de app het token METEEN uit de adresbalk (geschiedenis, bladwijzer, screenshot), vóór de
//   app zelf iets laadt;
// - het staat daarna alleen in sessionStorage van dit tabblad (dus niet in localStorage of een cookie), zodat het
//   een inlogscherm overleeft, en wordt na 24 uur, na gebruik of bij "niet accepteren" gewist;
// - accepteren gebeurt nooit vanzelf, maar alleen na een expliciete keuze, met het account erbij in beeld;
// - de echte regels (eenmalig, verlopen, ingetrokken, maker nog bevoegd, scheiding tussen huishoudens) dwingt de
//   database af in accept_invite; de app vertrouwt het token niet meer dan dat.
export const TOKEN = /^[0-9a-f]{64}$/;
const SLEUTEL = 'thuisplanner-uitnodiging';
const MAX_LEEFTIJD_MS = 24 * 60 * 60 * 1000;
const PAD = /^#\/uitnodiging\/([0-9a-f]{64})$/;

function opslag(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

/** Het token uit een geplakte link of een los token, of null. */
export function tokenUit(tekst: string): string | null {
  const t = tekst.trim();
  if (TOKEN.test(t)) return t;
  const i = t.indexOf('#/uitnodiging/');
  if (i < 0) return null;
  const m = PAD.exec(t.slice(i));
  return m ? m[1] : null;
}

/** De uitnodigingslink voor dit adres van de app. */
export function maakLink(token: string, basis = window.location.origin + window.location.pathname): string {
  if (!TOKEN.test(token)) throw new Error('Ongeldige uitnodiging');
  return `${basis}#/uitnodiging/${token}`;
}

/** Bewaar een token voor dit tabblad (tot gebruik, 24 uur, of wissen). */
export function bewaarUitnodiging(token: string, nu = Date.now()): void {
  if (!TOKEN.test(token)) return;
  try { opslag()?.setItem(SLEUTEL, JSON.stringify({ token, sinds: nu })); } catch { /* geen opslag: alleen in het geheugen */ }
}

/** Het bewaarde token, of null (ongeldig of te oud wordt meteen gewist). */
export function leesUitnodiging(nu = Date.now()): string | null {
  const s = opslag();
  let w: { token?: unknown; sinds?: unknown } | null = null;
  try { w = JSON.parse(s?.getItem(SLEUTEL) ?? 'null'); } catch { w = null; }
  if (!w) return null;
  if (typeof w.token !== 'string' || !TOKEN.test(w.token) || typeof w.sinds !== 'number' || nu - w.sinds > MAX_LEEFTIJD_MS || w.sinds > nu) {
    vergeetUitnodiging();
    return null;
  }
  return w.token;
}

export function vergeetUitnodiging(): void {
  try { opslag()?.removeItem(SLEUTEL); } catch { /* niets te wissen */ }
}

/**
 * Bij het openen (en bij elke hashwissel): staat er een uitnodiging in de adresbalk, haal hem eruit en bewaar hem.
 * Geeft het token terug, of null. Een ongeldige uitnodigingslink wordt ook uit de adresbalk gehaald.
 */
export function vangUitnodiging(win: Pick<Window, 'location' | 'history'> = window, nu = Date.now()): string | null {
  const hash = win.location.hash;
  if (!hash.startsWith('#/uitnodiging')) return null;
  const m = PAD.exec(hash);
  win.history.replaceState(null, '', win.location.pathname + win.location.search + '#/vandaag');
  if (!m) return null;
  bewaarUitnodiging(m[1], nu);
  return m[1];
}
