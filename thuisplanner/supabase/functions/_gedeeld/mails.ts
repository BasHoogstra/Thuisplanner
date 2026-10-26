// Thuisplanner: de teksten van de mails. De code staat nooit in het onderwerp of de voorbeeldregel (B3), maar groot en
// zonder spaties in de mail zelf, zodat automatisch invullen (iOS) hem kan herkennen. Nooit een link met een geheim.
import type { Mail } from './k1.ts';

const VOORBEELD = 'De code staat in deze mail. Hij is 10 minuten geldig.';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function opmaak(alinea: string[], code?: string, voorbeeld = VOORBEELD): string {
  return `<!doctype html><html lang="nl"><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1b2421">
<div style="display:none;max-height:0;overflow:hidden">${escape(voorbeeld)}</div>
${alinea.slice(0, 1).map(a => `<p>${escape(a)}</p>`).join('')}
${code ? `<p style="font-size:30px;font-weight:700;letter-spacing:4px;margin:16px 0">${code}</p>` : ''}
${alinea.slice(1).map(a => `<p>${escape(a)}</p>`).join('')}
<p style="color:#56615c;font-size:13px">Thuisplanner</p></body></html>`;
}

/** Een gemaskeerd adres voor in een mail aan iemand anders (j…@….nl). */
export function gemaskeerd(email: string): string {
  const [naam, domein = ''] = email.split('@');
  const tld = domein.includes('.') ? domein.slice(domein.lastIndexOf('.')) : '';
  return `${naam.slice(0, 1)}…@…${tld}`;
}

export function inlogcode(aan: string, code: string): Mail {
  const a = ['Gebruik deze code om in te loggen bij Thuisplanner. De code is 10 minuten geldig.',
    'Heb je dit niet aangevraagd? Dan kun je deze mail negeren; zonder de code kan niemand inloggen.'];
  return { aan, onderwerp: 'Je inlogcode voor Thuisplanner', tekst: `${VOORBEELD}\n\n${a[0]}\n\n${code}\n\n${a[1]}\n`, html: opmaak(a, code) };
}

export function beslotenTest(aan: string): Mail {
  const a = ['Je wilde je aanmelden bij Thuisplanner. Thuisplanner is nog in een besloten test: aanmelden kan nu alleen als je bent uitgenodigd.',
    'Ben je uitgenodigd? Gebruik dan het e-mailadres waarop je de uitnodiging kreeg.', 'Heb je dit niet aangevraagd? Dan kun je deze mail negeren.'];
  return { aan, onderwerp: 'Thuisplanner is nog in een besloten test', tekst: a.join('\n\n') + '\n', html: opmaak(a) };
}

export function wijzigingOud(aan: string, code: string, nieuw: string): Mail {
  const a = [`Er is gevraagd het e-mailadres van je Thuisplanner-account te wijzigen naar ${gemaskeerd(nieuw)}. Bevestig dit met deze code (10 minuten geldig):`,
    'Was jij dit niet? Geef de code dan aan niemand en wijzig niets: zonder deze code verandert je adres niet. Log in de app uit op alle toestellen als je denkt dat iemand anders bij je account kan.'];
  return { aan, onderwerp: 'Bevestig de wijziging van je e-mailadres', tekst: `${VOORBEELD}\n\n${a[0]}\n\n${code}\n\n${a[1]}\n`, html: opmaak(a, code) };
}

export function wijzigingNieuw(aan: string, code: string): Mail {
  const a = ['Bevestig met deze code dat dit je nieuwe e-mailadres voor Thuisplanner is (10 minuten geldig):',
    'Heb je dit niet aangevraagd? Dan kun je deze mail negeren.'];
  return { aan, onderwerp: 'Bevestig je nieuwe e-mailadres voor Thuisplanner', tekst: `${VOORBEELD}\n\n${a[0]}\n\n${code}\n\n${a[1]}\n`, html: opmaak(a, code) };
}

/**
 * Een naam van een gebruiker in de mail (uitnodiger, huishouden): kort, op één regel, en zonder iets dat op een link of
 * adres lijkt. Zo blijft de tekst vast en is de uitnodigingsmail geen kanaal voor reclame of phishing.
 */
export function veiligeNaam(naam: string | null, anders: string): string {
  const n = (naam ?? '').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').replace(/\s+/g, ' ').trim();
  if (!n || n.length > 40 || /[@<>/\\:]|www\.|\.[a-z]{2,}\b/i.test(n)) return anders;
  return n;
}

/** De uitnodigingsmail (D6, B4): geen token en geen link met een geheim, alleen de app en "log in met dit adres". */
export function uitnodiging(aan: string, door: string | null, huishouden: string | null, appUrl: string, geldigTot: string): Mail {
  const wie = veiligeNaam(door, 'Iemand');
  const waar = veiligeNaam(huishouden, '');
  const a = [`${wie} nodigt je uit voor ${waar ? `het huishouden ${waar}` : 'een huishouden'} in Thuisplanner.`,
    `Open Thuisplanner en log in met dit e-mailadres (${aan}). De uitnodiging staat dan voor je klaar. Geldig tot ${geldigTot}.`,
    `Thuisplanner: ${appUrl}`, 'Ken je de afzender niet? Dan kun je deze mail negeren. Er gebeurt niets zolang je niet inlogt.'];
  return { aan, onderwerp: `${wie} nodigt je uit voor Thuisplanner`, tekst: a.join('\n\n') + '\n',
    html: opmaak(a, undefined, 'Log in met dit e-mailadres om de uitnodiging te zien.') };
}
