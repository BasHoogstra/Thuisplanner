// Thuisplanner dev: één paneel van de synchronisatiedemo (één account, één sessie).
// Gebruikt alleen de publieke (anon) sleutel en de sessie van het demo-account. Logt geen inhoud.
import { maakSync, STATUS } from '/sync/thuisplanner-sync.js';

const STATUSTEKST = {
  [STATUS.LADEN]: 'Laden…', [STATUS.VERBONDEN]: 'Live verbonden', [STATUS.SYNCHRONISEREN]: 'Synchroniseren…',
  [STATUS.OFFLINE]: 'Geen verbinding', [STATUS.GEEN_TOEGANG]: 'Geen toegang', [STATUS.GESTOPT]: 'Gestopt',
};
const $ = s => document.querySelector(s);
const el = (tag, eig = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(eig)) {
    if (k === 'tekst') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const k of kids) if (k) e.append(k);
  return e;
};

const als = new URLSearchParams(location.search).get('als') || 'anna';
const config = await (await fetch('/config.json')).json();
const account = config.accounts[als];

// Gesimuleerde storing: HTTP faalt en de realtime-verbinding gaat dicht (echte offline-stand van de browser
// werkt ook: de module luistert naar online/offline).
let storing = false;
const fetchMetStoring = (...a) => (storing ? Promise.reject(new TypeError('Failed to fetch (gesimuleerde storing)')) : fetch(...a));
const supabase = window.supabase.createClient(config.url, config.anonKey, {
  auth: { persistSession: false, autoRefreshToken: true, storageKey: 'thuisplanner-demo-' + als },
  global: { fetch: fetchMetStoring },
});

$('[data-testid=wie]').textContent = `${account.naam} (account ${als === 'anna' ? 'A' : 'B'})`;
const login = await supabase.auth.signInWithPassword({ email: account.email, password: config.wachtwoord });
if (login.error) {
  zetStatus(STATUS.GEEN_TOEGANG, 'Inloggen mislukt. Draai eerst: npm run seed');
  throw new Error('inloggen mislukt');
}
const lid = await supabase.rpc('my_memberships');
const huishoudenId = lid.data?.[0]?.household_id;
if (!huishoudenId) { zetStatus(STATUS.GEEN_TOEGANG); throw new Error('geen huishouden'); }

let bewerken = null;   // { id, versie, waarde }: de versie waarmee het bewerken begon
let keuze = null;     // { id, naam }: mogelijk dubbel; de gebruiker kiest opnieuw proberen of bewust nieuw
// localStorage: een toevoeging met onbekende uitkomst houdt na herladen, sluiten en opnieuw inloggen
// dezelfde UUID. Weigert de browser opslag, dan toont het paneel een waarschuwing (toestand.opslagDuurzaam).
let opslag = null;
try { opslag = window.localStorage; } catch { /* geen opslag: alleen in het geheugen, met waarschuwing */ }
// Ontwikkelmodus met fictieve gegevens (besluit P3): hier ook de inhoud bewaren, om herstel te laten zien. De echte
// app bewaart alleen de identiteit (P1).
const sync = maakSync({ supabase, huishoudenId, opWijziging: teken, opslag, bewaarInhoud: true });
window.__thuisplannerDemo = { get toestand() { return sync.toestand; } };   // voor de e2e-test

function zetStatus(status, tekst) {
  const s = $('[data-testid=status]');
  s.dataset.status = status;
  s.textContent = tekst || STATUSTEKST[status] || status;
}

function teken(t) {
  zetStatus(t.status);
  for (const x of document.querySelectorAll('[data-testid=toevoegen] input, [data-testid=toevoegen] button')) x.disabled = t.status === STATUS.GEEN_TOEGANG;
  const m = $('[data-testid=melding]');
  m.hidden = !t.melding;
  m.dataset.soort = t.melding?.soort || '';
  m.textContent = t.melding?.tekst || '';
  if (t.melding) m.append(el('button', { type: 'button', tekst: 'Oké', onclick: () => { keuze = null; sync.acties.meldingWeg(); } }));
  if (keuze && t.melding?.soort === 'mogelijk-dubbel') {
    const k = keuze;
    m.append(
      el('button', { type: 'button', tekst: 'Opnieuw proberen', 'data-testid': 'keuze-opnieuw', onclick: () => { keuze = null; sync.acties.opnieuwProberen(k.id); } }),
      el('button', { type: 'button', tekst: 'Toch als nieuwe toevoegen', 'data-testid': 'keuze-nieuw', onclick: () => { keuze = null; toevoegen(k.naam, { bewustNieuw: true }); } }));
  }
  const w = $('[data-testid=opslag-waarschuwing]');
  w.hidden = t.opslagDuurzaam !== false;
  w.textContent = 'Let op: deze browser bewaart niets op dit toestel. Valt de verbinding weg tijdens een toevoeging, dan kan die na herladen of sluiten niet meer worden nagekeken.';
  const bw = $('[data-testid=bewaard-op-toestel]');
  bw.hidden = !(t.status === STATUS.GEEN_TOEGANG && t.bewaardOpToestel > 0);
  bw.textContent = `Er staan nog ${t.bewaardOpToestel || 0} niet-bevestigde toevoegingen op dit toestel.`;
  $('[data-testid=laatst]').textContent = t.laatstOpgehaald ? 'Laatst opgehaald: ' + new Date(t.laatstOpgehaald).toLocaleTimeString('nl-NL') : '';

  const lijst = $('[data-testid=boodschappen]');
  lijst.replaceChildren(...t.boodschappen.map(b => {
    if (bewerken?.id === b.id) {
      const invoer = el('input', { value: bewerken.waarde, 'aria-label': 'Nieuwe naam', 'data-testid': 'bewerk-invoer' });
      invoer.addEventListener('input', () => { bewerken.waarde = invoer.value; });
      return el('li', { 'data-testid': 'boodschap', 'data-naam': b.name },
        invoer,
        el('button', { type: 'button', tekst: 'Bewaar', 'data-testid': 'bewaar', onclick: async () => {
          const { id, versie, waarde } = bewerken; bewerken = null;
          await sync.acties.boodschapHernoemen({ ...b, id }, waarde, versie);
        } }),
        el('button', { type: 'button', tekst: 'Annuleer', onclick: () => { bewerken = null; teken(sync.toestand); } }));
    }
    const vink = el('input', { type: 'checkbox', 'aria-label': 'Afgevinkt', 'data-testid': 'vink' });
    vink.checked = !!b.checked_at;
    if (b.onzeker || b.wachtend || b.geweigerd) vink.disabled = true;
    vink.addEventListener('change', () => sync.acties.boodschapAfvinken(b));
    return el('li', { 'data-testid': 'boodschap', 'data-naam': b.name, class: b.checked_at ? 'af' : '' },
      vink,
      el('span', { class: 'naam', tekst: b.name }),
      b.wachtend ? el('span', { class: 'klein', tekst: 'opslaan…' }) : null,
      b.onzeker ? el('span', { class: 'klein', 'data-testid': 'onbevestigd', tekst: 'niet bevestigd' }) : null,
      b.geweigerd ? el('span', { class: 'klein', 'data-testid': 'geweigerd', tekst: 'niet opgeslagen' }) : null,
      b.onzeker || b.geweigerd ? el('button', { type: 'button', tekst: 'Opnieuw proberen', 'data-testid': 'opnieuw', onclick: () => sync.acties.opnieuwProberen(b.id) }) : null,
      b.onzeker || b.geweigerd ? el('button', { type: 'button', tekst: 'Vergeten', 'data-testid': 'vergeten',
        title: 'Alleen van dit toestel. Staat hij al op de server, dan blijft hij daar.', onclick: () => sync.acties.vergeten(b.id) }) : null,
      ...(b.onzeker || b.wachtend || b.geweigerd ? [] : [
        el('button', { type: 'button', tekst: 'Wijzig', 'data-testid': 'wijzig', onclick: () => {
          bewerken = { id: b.id, versie: b.version, waarde: b.name }; teken(sync.toestand);
        } }),
        el('button', { type: 'button', tekst: 'Verwijder', 'data-testid': 'verwijder', onclick: () => sync.acties.boodschapVerwijderen(b) })]));
  }));
  if (bewerken) { const i = $('[data-testid=bewerk-invoer]'); if (i && document.activeElement?.tagName !== 'INPUT') { i.focus(); } }

  const naamVan = id => t.leden.find(l => l.id === id)?.display_name || '';
  $('[data-testid=afspraken]').replaceChildren(...t.afspraken.map(a => {
    const tijd = a.start_time ? `${a.start_time.slice(0, 5)}${a.end_time ? '–' + a.end_time.slice(0, 5) : ''}` : 'hele dag';
    const mijnPrive = a.visibility === 'private' && !a.is_busy;
    return el('li', { 'data-testid': 'afspraak', 'data-bezet': String(a.is_busy), class: a.is_busy ? 'bezet' : '' },
      el('span', { class: 'tijd', tekst: `${a.start_date} · ${tijd}` }),
      el('span', { class: 'naam', 'data-testid': 'afspraak-titel', tekst: a.is_busy ? 'Bezet' : (a.inhoudNietBewaard ? 'Privé-afspraak (inhoud niet op dit toestel bewaard)' : a.title) }),
      el('span', { class: 'klein', tekst: [naamVan(a.owner_member_id), mijnPrive ? 'privé (alleen jij ziet details)' : '', a.location || ''].filter(Boolean).join(' · ') }));
  }));
}

$('[data-testid=huishouden]').textContent = 'Huishouden: Familie Demo';
$('[data-testid=toevoegen]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const invoer = $('[data-testid=nieuw]');
  const naam = invoer.value.trim();
  if (!naam) return;
  invoer.value = '';
  await toevoegen(naam);
});
// Toevoegen. Is er niets bewaard (geen opdracht: zeker niet opgeslagen), dan komt de invoer terug in het
// veld: niets gaat ongemerkt verloren.
async function toevoegen(naam, opties) {
  const r = await sync.acties.boodschapToevoegen(naam, opties);
  if (r.mogelijkDubbel) { keuze = { id: r.mogelijkDubbel, naam }; teken(sync.toestand); return; }
  if (!r.ok && !r.id && !r.vervallen) { const invoer = $('[data-testid=nieuw]'); if (!invoer.value) invoer.value = naam; }
}
$('[data-testid=verbinding]').addEventListener('click', (e) => {
  storing = !storing;
  e.target.textContent = storing ? 'Verbinding herstellen (simulatie)' : 'Verbinding verbreken (simulatie)';
  if (storing) { supabase.realtime.disconnect(); window.dispatchEvent(new Event('offline')); }
  else window.dispatchEvent(new Event('online'));
});

await sync.start();
