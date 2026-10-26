// Thuisplanner · synchronisatielaag (KG-5D). Framework-onafhankelijk: werkt in de browser (demo, later de
// React-app) en in node (tests). Zie docs/thuisplanner-sync.md.
//
// Principes (bouwplan: "Herhaling, synchronisatie en realtime"):
//  - Online eerst. De server is de bron; de client houdt alleen een kopie van wat RLS teruggeeft.
//  - Realtime is alleen een seintje ({t, id, v, op}) op het private kanaal household:<id>:<epoch>. Op een
//    seintje haalt de client opnieuw op via de gewone, met RLS beveiligde weg. Er gaat nooit inhoud door
//    realtime. De kanaalnaam komt van de server (household_channel) en wisselt zodra iemand toegang
//    verliest; dan stapt de client over.
//  - Na (her)verbinden, na "online" en elke 30 s: volledig opnieuw ophalen, per pagina (geen grens van
//    1000 rijen). De cache wordt pas vervangen als alle pagina's binnen zijn.
//  - Elke ophaalronde controleert eerst het lidmaatschap. Is de toegang weg (vertrek, archiveren,
//    huishouden verwijderd), dan wist de client alle gegevens en stopt het kanaal.
//  - Levenscyclus: stop() en verlies van toegang beëindigen de huidige generatie. Een antwoord dat
//    daarna nog binnenkomt (ophalen, schrijven, terugdraaien, kanaalstatus) verandert niets meer en
//    meldt niets meer.
//  - Schrijven met UUID's van de client en met versiecontrole. Een toevoeging is één opdracht met één
//    vaste UUID (de opdrachtidentiteit). Is de uitkomst onbekend (antwoord verloren), dan blijft ze
//    "niet bevestigd" staan tot de server aantoonbaar antwoordt; opnieuw proberen is een expliciete
//    actie op die identiteit, nooit een vergelijking op tekst. Een nieuwe toevoeging met dezelfde inhoud
//    als een onbevestigde vraagt eerst een keuze: opnieuw proberen of bewust nieuw. Opdrachten staan in
//    het geheugen van de pagina (overleeft stop/start en een unmount) en, waar de browser dat toestaat,
//    duurzaam per opdracht in de opslag (overleeft herladen, sluiten en een nieuwe sessie). Er is geen
//    wachtrij voor offline wijzigingen (bouwplan): niets wordt automatisch later verstuurd.
//  - Privacy op het toestel (besluit P1): duurzaam staat standaard alleen de identiteit van een opdracht
//    (soort, UUID, staat, account, huishouden), nooit de inhoud. Na een herstart bevestigt de eerste ophaalronde
//    wat de server al heeft; wat dan nog openstaat, voert de gebruiker opnieuw in onder dezelfde UUID
//    (opnieuwInvoeren), zodat er nooit een tweede ontstaat. Alleen de ontwikkelmodus met fictieve gegevens
//    (besluit P3) bewaart de inhoud ook, met bewaarInhoud: true. Niets wordt ooit stil gewist (P4).
//  - Geen inhoud in logboeken of meldingen: meldingen zijn vaste Nederlandse teksten per foutcode.

const VELDEN_BOODSCHAP = 'id,household_id,name,checked_at,deferred,version,created_at,updated_at';
const VELDEN_TAAK = 'id,household_id,title,due_date,assignee_member_id,done_on,done_by_member_id,trip_id,version,created_at,updated_at';
// F8 Vakanties (V1.2): vakanties, pakitems en koppelingen vakantie–boodschap (docs/thuisplanner-vakanties.md §14).
const VELDEN_VAKANTIE = 'id,household_id,name,start_date,end_date,destination,notes,version,created_at,updated_at';
const VELDEN_PAKITEM = 'id,household_id,trip_id,member_id,name,packed_at,packed_by_member_id,version,created_at,updated_at';
const VELDEN_KOPPELING = 'id,household_id,trip_id,shopping_item_id,settled_at,version,created_at,updated_at';
// Tabellen waarvan een seintje met een al bekende versie niets hoeft te doen.
const MET_VERSIE = new Set(['shopping_items', 'tasks', 'events', 'trips', 'trip_packing_items', 'trip_shopping_links']);
const VELDEN_LID = 'id,household_id,display_name,kind,role,status,color,has_account,sort,created_at';
const VELDEN_AFSPRAAK = 'id,household_id,owner_member_id,visibility,start_date,start_time,end_date,end_time,recurrence_freq,' +
  'recurrence_until,series_id,original_date,version,is_busy,title,location,notes,preparation,participant_ids';

export const STATUS = {
  LADEN: 'laden', VERBONDEN: 'verbonden', SYNCHRONISEREN: 'synchroniseren', OFFLINE: 'offline',
  GEEN_TOEGANG: 'geen-toegang', GESTOPT: 'gestopt',
};

const MELDINGEN = {
  conflict: 'Iemand anders heeft dit net aangepast. De nieuwste versie staat nu op je scherm.',
  offline: 'Geen verbinding: je wijziging is niet verstuurd en dus niet opgeslagen.',
  onzeker: 'De verbinding viel weg: het is niet zeker of je wijziging is opgeslagen. Zodra er weer verbinding is, zie je de actuele stand.',
  onbevestigd: 'De verbinding viel weg: het is nog niet bevestigd of dit is opgeslagen. Opnieuw proberen maakt het nooit dubbel.',
  nogOnbevestigd: 'Opnieuw proberen lukte nu niet. Het is nog steeds niet bevestigd of dit is opgeslagen; je invoer blijft bewaard.',
  sessie: 'Je sessie is verlopen. Log opnieuw in en probeer het opnieuw.',
  sessieBewaard: 'Je sessie is verlopen. Log opnieuw in; je invoer blijft bewaard en wordt dan nagekeken.',
  mogelijkDubbel: 'Dit staat al klaar maar is nog niet bevestigd. Kies: opnieuw proberen, of bewust als nieuwe toevoegen.',
  priveNietBewaard: 'De inhoud van deze privé-afspraak is om privacyredenen niet op dit toestel bewaard. Voer hem opnieuw in om hem af te maken.',
  inhoudNietBewaard: 'De inhoud hiervan is om privacyredenen niet op dit toestel bewaard. Voer het opnieuw in om het af te maken; er komt geen tweede bij.',
  overnemenOnzeker: 'De verbinding viel weg tijdens het overnemen. Het is niet zeker of de paklijst is overgenomen. Opnieuw proberen maakt niets dubbel.',
  toegang: 'Je hebt geen toegang (meer) tot dit huishouden.',
  vakantieWeg: 'Deze vakantie bestaat niet meer. De boodschap is niet toegevoegd.',
  dubbel: 'Dat staat er al.',
  ongeldig: 'Dat kan niet: controleer wat je hebt ingevuld.',
  fout: 'Er ging iets mis. Probeer het opnieuw.',
};

// Onbekende uitkomst: het verzoek kan de server hebben bereikt, maar er kwam geen (bruikbaar) antwoord
// terug (netwerkfout, verbroken verbinding, time-out of een fout van een tussenliggende server). Een
// antwoord met een databasecode is wél een zekere uitkomst: dan is de transactie teruggedraaid.
function onbekend(fout) {
  if (!fout) return false;
  if (fout.onzeker) return true;
  if (fout.code) return false;
  const s = fout.status;
  return !s || s === 408 || s >= 500 || /fetch|network|socket|abort|timeout/i.test(fout.message || '');
}

// Verlopen of ongeldige sessie (JWT): het verzoek is zeker niet uitgevoerd.
function sessieFout(fout) {
  return !!fout && (fout.status === 401 || /^PGRST30\d$/.test(fout.code || ''));
}

// Vertaalt een fout naar een vaste melding. Nooit de ruwe tekst of details tonen of loggen.
export function meldingVoor(fout) {
  if (!fout) return null;
  const code = fout.code || '';
  // Eerst de databasecode: PostgREST geeft een unieke-sleutelfout (23505) ook als HTTP 409, maar dat is "staat er al",
  // geen versieconflict.
  if (code === '23505') return { soort: 'dubbel', tekst: MELDINGEN.dubbel };
  if (code === 'PT409' || fout.status === 409) return { soort: 'conflict', tekst: MELDINGEN.conflict };
  if (sessieFout(fout)) return { soort: 'sessie', tekst: MELDINGEN.sessie };
  if (code === 'P0002' || code === '42501' || fout.status === 403) return { soort: 'toegang', tekst: MELDINGEN.toegang };
  if (code === '23514' || code === '22023' || code === '22P02') return { soort: 'ongeldig', tekst: MELDINGEN.ongeldig };
  if (onbekend(fout)) return { soort: 'onzeker', tekst: MELDINGEN.onzeker };
  return { soort: 'fout', tekst: MELDINGEN.fout };
}

const foutVan = r => (r?.error ? { ...r.error, status: r.status } : null);
const leeg = () => ({ lid: null, leden: [], boodschappen: [], taken: [], afspraken: [], uitzonderingen: [],
  vakanties: [], pakitems: [], vakantieKoppelingen: [] });
// Lijsten met toevoegingen als opdracht (zie OPDRACHTEN).
const OPDRACHT_LIJSTEN = ['boodschappen', 'taken', 'afspraken', 'vakanties', 'pakitems'];

// Een kalenderdag (jjjj-mm-dd) plus n dagen, zonder tijdzone-effecten.
function plusDagen(dag, n) {
  const d = new Date(`${dag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/**
 * De laatste dag van een vakantie (docs/thuisplanner-vakanties.md §6.5): de einddatum; zonder einddatum geldt een
 * vakantie als hoogstens 14 dagen (vertrek + 13); zonder datum: null (nooit voorbij).
 */
export function laatsteDag(v) {
  if (!v?.start_date) return null;
  return v.end_date || plusDagen(v.start_date, 13);
}
/** Is de vakantie voorbij op deze dag (jjjj-mm-dd)? Een vakantie zonder datum is nooit voorbij. */
export function vakantieVoorbij(v, vandaag) {
  const l = laatsteDag(v);
  return l !== null && l < vandaag;
}
// UUID versie 4 uit de cryptografische toevalsgenerator van het platform. crypto.randomUUID() bestaat
// alleen in een "secure context" (HTTPS of localhost); op een telefoon via http://<lan-ip> ontbreekt hij.
// crypto.getRandomValues() is daar wel beschikbaar (Web Crypto, ook zonder secure context) en is even sterk.
// Geen Math.random: ontbreekt ook getRandomValues, dan liever een duidelijke fout dan zwakke id's.
export function uuidV4(c = globalThis.crypto) {
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  if (typeof c?.getRandomValues !== 'function') throw new Error('Geen cryptografische willekeur beschikbaar (crypto.getRandomValues)');
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;   // versie 4
  b[8] = (b[8] & 0x3f) | 0x80;   // variant RFC 4122
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const nieuweId = () => uuidV4();

// De kalenderdag op dit toestel (jjjj-mm-dd), niet in UTC: anders telt een taak die na middernacht maar vóór
// de UTC-dagwissel wordt afgevinkt (in Nederland 00:00–02:00) voor gisteren.
export function lokaleDatum(d = new Date()) {
  const twee = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${twee(d.getMonth() + 1)}-${twee(d.getDate())}`;
}
const tekstSleutel = s => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const VERVALLEN = Symbol('vervallen');   // antwoord van een beëindigde generatie

// Vaste volgorde, lege waarden achteraan (zoals de server sorteerde). ISO-datums en -tijden laten zich
// als tekst vergelijken.
const volgorde = (...velden) => (a, b) => {
  for (const v of velden) {
    const x = a[v] ?? null, y = b[v] ?? null;
    if (x === y) continue;
    if (x === null) return 1;
    if (y === null) return -1;
    return x < y ? -1 : 1;
  }
  return 0;
};
const SORTEER = {
  boodschappen: volgorde('created_at', 'id'),
  taken: volgorde('created_at', 'id'),
  afspraken: volgorde('start_date', 'start_time', 'id'),
  leden: volgorde('sort', 'created_at', 'id'),
  vakanties: volgorde('start_date', 'created_at', 'id'),   // zonder datum achteraan
  pakitems: volgorde('created_at', 'id'),
  vakantieKoppelingen: volgorde('created_at', 'id'),
};

// Opdrachten per account en huishouden in het geheugen van de pagina: ze overleven stop()/start() en een
// unmount van het onderdeel dat de sync gebruikt. (Tests geven een eigen geheugen mee om een herstart
// van de pagina na te bootsen.)
const PAGINAGEHEUGEN = new Map();
const VOORVOEGSEL = 'thuisplanner-opdracht:';

// Alle onbevestigde opdrachten van één account op dit toestel (alle huishoudens): in het paginageheugen en in de
// opslag. Voor de waarschuwing bij uitloggen (besluit P2). Alleen identiteiten, nooit inhoud.
function opdrachtenVanAccount({ opslag = null, geheugen = PAGINAGEHEUGEN, gebruiker }) {
  const ids = new Set();
  const sleutels = [];
  if (!gebruiker) return { ids, sleutels };
  for (const [k, m] of geheugen) if (k.startsWith(`${gebruiker}:`)) for (const id of m.keys()) ids.add(id);
  if (opslag) {
    try {
      const p = `${VOORVOEGSEL}${gebruiker}:`;
      for (let i = 0; i < opslag.length; i++) {
        const k = opslag.key(i);
        if (!k || !k.startsWith(p)) continue;
        sleutels.push(k);
        ids.add(k.slice(k.lastIndexOf(':') + 1));
      }
    } catch { /* opslag niet leesbaar */ }
  }
  return { ids, sleutels };
}

/** Hoeveel opdrachten van dit account op dit toestel nog niet door de server zijn bevestigd (alle huishoudens). */
export function onbevestigdOpToestel(o) {
  return opdrachtenVanAccount(o).ids.size;
}

/**
 * Alle onbevestigde opdrachten van dit account van dit toestel wissen (geheugen en opslag, alle huishoudens). Alleen
 * na een uitdrukkelijke keuze van de gebruiker bij uitloggen (besluit P2); nooit automatisch (P4). Wat de server al
 * heeft, blijft daar. Geeft het aantal gewiste opdrachten.
 */
export function wisOnbevestigdOpToestel({ opslag = null, geheugen = PAGINAGEHEUGEN, gebruiker }) {
  const { ids, sleutels } = opdrachtenVanAccount({ opslag, geheugen, gebruiker });
  if (!gebruiker) return 0;
  // In het geheugen leegmaken in plaats van vervangen: een sync die nog loopt, houdt dezelfde Map vast.
  for (const [k, m] of geheugen) if (k.startsWith(`${gebruiker}:`)) m.clear();
  for (const k of sleutels) { try { opslag.removeItem(k); } catch { /* niets */ } }
  return ids.size;
}
const zonderLeeg = obj => Object.keys(obj || {}).filter(k => obj[k] != null && k !== 'id').sort().map(k => [k, obj[k]]);
// Inhoud van een opdracht, om een mogelijk dubbele nieuwe toevoeging te herkennen (nooit om te hergebruiken).
const inhoudSleutel = o => JSON.stringify(o.soort === 'boodschap' ? [o.soort, tekstSleutel(o.naam)]
  : o.soort === 'taak' ? [o.soort, tekstSleutel(o.titel), zonderLeeg(o.velden)]
    : o.soort === 'vakantie' ? [o.soort, tekstSleutel(o.vakantie?.name), o.vakantie?.start_date ?? null, o.vakantie?.end_date ?? null]
      : o.soort === 'pakitem' ? [o.soort, o.pakitem?.trip_id, o.pakitem?.member_id ?? null, tekstSleutel(o.pakitem?.name)]
        : [o.soort, zonderLeeg(o.afspraak)]);
const prive = o => o.soort === 'afspraak' && o.afspraak?.visibility === 'private';

// Toevoegingen als opdracht: soort -> lijst in de toestand, tabel voor de controle "bestaat dit id al".
const OPDRACHTEN = {
  boodschap: { lijst: 'boodschappen', tabel: 'shopping_items' },
  taak: { lijst: 'taken', tabel: 'tasks' },
  afspraak: { lijst: 'afspraken', tabel: 'events' },
  vakantie: { lijst: 'vakanties', tabel: 'trips' },
  pakitem: { lijst: 'pakitems', tabel: 'trip_packing_items' },
};

/**
 * @param {object} o
 * @param {import('@supabase/supabase-js').SupabaseClient} o.supabase  client met de sessie van de gebruiker (nooit service-role)
 * @param {string} o.huishoudenId
 * @param {(toestand: object) => void} [o.opWijziging]  wordt na elke verandering aangeroepen
 * @param {number} [o.vangnetMs]  periodiek volledig ophalen (standaard 30 s)
 * @param {number} [o.paginaGrootte]  rijen per pagina bij ophalen (standaard 1000)
 * @param {Storage} [o.opslag]  duurzame opslag (in de browser localStorage): onbevestigde toevoegingen
 *   overleven herladen, sluiten en opnieuw inloggen, met dezelfde UUID. Eén sleutel per opdracht, met
 *   account en huishouden. Weigert de browser opslag, dan meldt toestand.opslagDuurzaam = false.
 * @param {boolean} [o.bewaarInhoud]  ook de inhoud duurzaam bewaren (standaard niet, besluit P1). Alleen voor de
 *   ontwikkelmodus met fictieve gegevens (P3). Privé-afspraken nooit, ook dan niet.
 * @param {Map} [o.geheugen]  geheugen van de pagina (standaard gedeeld binnen de pagina)
 * @param {(soort: string, status: string) => void} [o.spoor]  optioneel: kanaalstatus volgen (geen inhoud)
 */
export function maakSync({ supabase, huishoudenId, opWijziging = () => {}, vangnetMs = 30000, debounceMs = 150,
  paginaGrootte = 1000, opslag = null, bewaarInhoud = false, geheugen = PAGINAGEHEUGEN, spoor = () => {},
  vandaag = () => lokaleDatum() }) {
  let toestand = { status: STATUS.LADEN, melding: null, laatstOpgehaald: null, opslagDuurzaam: null, ...leeg() };
  let generatie = 0;         // elke start() en elke beëindiging begint een nieuwe generatie
  let levend = false;        // tussen start() en stop()/verlies van toegang
  let kanaal = null;
  let kanaalNaam = null;     // van de server: household:<id>:<epoch>
  let bezig = null;          // lopende ophaalronde (promise)
  let nogmaals = false;      // tijdens een ronde kwam er een nieuw seintje binnen
  let debounce = null;
  let vangnet = null;
  let herverbinden = null;
  let pogingen = 0;
  let gebruiker = null;      // account-ID van de sessie bij start(): sleutel voor geheugen en opslag
  let duurzaam = false;      // werkt de opslag?
  const bekend = new Map();  // `${t}:${id}` -> versie die we al hebben (dubbele seintjes negeren)
  let openstaand = new Map();     // id -> opdracht die (nog) niet bevestigd is (gedeeld via het paginageheugen)
  const geopend = new Set();      // afgelopen vakanties die de app nu toont: hun paklijst gaat mee in elke ronde
  const verwerkt = { seintjes: 0, genegeerd: 0, rondes: 0 };

  // Hoort een antwoord nog bij de huidige generatie? Zo niet, dan negeren: niets in de cache, niets melden.
  const geldig = g => levend && g === generatie;
  const zet = (delta) => {
    if (!levend) return;
    toestand = { ...toestand, ...delta };
    opWijziging(toestand);
  };

  // ---- opdrachten (toevoegingen): geheugen en opslag ------------------------------------------
  // Staat van een opdracht:
  //   verzenden  onderweg (wordt na een herstart: onzeker, want het antwoord kan verloren zijn);
  //   onzeker    uitkomst onbekend, misschien al op de server. Blijft tot aantoonbaar bevestigd (de
  //              server geeft het id terug, of een poging slaagt of meldt "al verwerkt") of tot de
  //              gebruiker hem uitdrukkelijk vergeet. Een latere fout, ook een verlopen sessie, verandert
  //              dat niet;
  //   geweigerd  de eerste poging is zeker niet uitgevoerd (verlopen sessie): bewaard, met dezelfde UUID.
  // Opgeruimd wordt alleen na bevestiging, na een zekere weigering van een eerste poging (ongeldig, geen
  // lid) of via vergeten. Naar de opslag gaat alleen de identiteit (P1); de inhoud blijft in het paginageheugen.
  // Alleen met bewaarInhoud (ontwikkelmodus) ook de inhoud, behalve van privé-afspraken.
  const prefix = () => `${VOORVOEGSEL}${gebruiker}:${huishoudenId}:`;
  function opslagProef() {
    if (!opslag || !gebruiker) return false;
    try {
      const k = `${VOORVOEGSEL}proef`;
      opslag.setItem(k, '1');
      const ok = opslag.getItem(k) === '1';
      opslag.removeItem(k);
      return ok;
    } catch { return false; }
  }
  function bewaar(o) {
    if (!duurzaam) return false;
    // Zonder inhoud: van een afspraak alleen of hij privé is (dat bepaalt hoe hij opnieuw wordt ingevoerd).
    const inhoud = prive(o) || !bewaarInhoud || o.inhoudNietBewaard
      ? { inhoudNietBewaard: true, ...(o.soort === 'afspraak' ? { afspraak: { visibility: prive(o) ? 'private' : 'household' } } : {}) }
      : { naam: o.naam, titel: o.titel, velden: o.velden, afspraak: o.afspraak, tripId: o.tripId, later: o.later, vakantie: o.vakantie, pakitem: o.pakitem };
    try {
      opslag.setItem(prefix() + o.id, JSON.stringify({ v: 1, soort: o.soort, id: o.id, gebruiker, huishouden: huishoudenId,
        staat: o.staat, ooitOnzeker: !!o.ooitOnzeker, ...inhoud }));
      return true;
    } catch {
      duurzaam = false;
      zet({ opslagDuurzaam: false });
      return false;
    }
  }
  function vergeet(id) {
    openstaand.delete(id);
    if (opslag && gebruiker) { try { opslag.removeItem(prefix() + id); } catch { /* niets */ } }
  }
  function leesOpslag() {
    const uit = new Map();
    if (!opslag || !gebruiker) return uit;
    try {
      const p = prefix();
      for (let i = 0; i < opslag.length; i++) {
        const k = opslag.key(i);
        if (!k || !k.startsWith(p)) continue;
        let o;
        try { o = JSON.parse(opslag.getItem(k)); } catch { continue; }
        // Alleen van dit account en dit huishouden (sleutel én inhoud).
        if (o && o.v === 1 && OPDRACHTEN[o.soort] && o.id === k.slice(p.length) && o.gebruiker === gebruiker && o.huishouden === huishoudenId) uit.set(o.id, o);
      }
    } catch { /* opslag niet leesbaar */ }
    return uit;
  }
  // Opslag en geheugen gelijktrekken: opdrachten uit een vorige sessie of een ander tabblad erbij; wat een
  // ander tabblad bevestigde of vergat, eruit (niet wat hier nog onderweg is).
  function metOpslag() {
    const opgeslagen = leesOpslag();
    for (const [id, o] of opgeslagen) {
      if (openstaand.has(id)) continue;
      const staat = o.staat === 'geweigerd' && !o.ooitOnzeker ? 'geweigerd' : 'onzeker';
      openstaand.set(id, { ...o, staat, ooitOnzeker: staat === 'onzeker', bewaard: true });
    }
    if (duurzaam) for (const [id, o] of openstaand) if (o.bewaard && o.staat !== 'verzenden' && !opgeslagen.has(id)) openstaand.delete(id);
  }

  // Een nog niet bevestigde toevoeging zoals ze in de lijst staat.
  function voorlopig(o) {
    const basis = { id: o.id, version: 0, wachtend: o.staat === 'verzenden', onzeker: o.staat === 'onzeker', geweigerd: o.staat === 'geweigerd' };
    // Inhoud niet op dit toestel (na een herstart, P1): alleen de identiteit, zonder titel of naam.
    if (o.inhoudNietBewaard && o.soort === 'boodschap') return { ...basis, inhoudNietBewaard: true, name: null, checked_at: null, deferred: false };
    if (o.inhoudNietBewaard && o.soort === 'taak') return { ...basis, inhoudNietBewaard: true, title: null, due_date: null, done_on: null };
    if (o.inhoudNietBewaard && o.soort === 'vakantie') return { ...basis, inhoudNietBewaard: true, name: null, start_date: null, end_date: null, destination: null, notes: null };
    if (o.inhoudNietBewaard && o.soort === 'pakitem') return { ...basis, inhoudNietBewaard: true, trip_id: null, member_id: null, name: null, packed_at: null };
    if (o.soort === 'boodschap') return { ...basis, name: String(o.naam).trim(), checked_at: null, deferred: !!o.later };
    if (o.soort === 'taak') return { ...basis, title: o.titel, done_on: null, ...o.velden };
    if (o.soort === 'vakantie') {
      const v = o.vakantie || {};
      return { ...basis, name: v.name, start_date: v.start_date ?? null, end_date: v.end_date ?? null, destination: v.destination ?? null, notes: v.notes ?? null };
    }
    if (o.soort === 'pakitem') {
      const p = o.pakitem || {};
      return { ...basis, trip_id: p.trip_id, member_id: p.member_id ?? null, name: p.name, packed_at: null, packed_by_member_id: null };
    }
    const a = o.afspraak || {};
    if (o.inhoudNietBewaard) return { ...basis, inhoudNietBewaard: true, visibility: a.visibility === 'household' ? 'household' : 'private', start_date: null, title: null, is_busy: false, participant_ids: [] };
    return { ...basis, start_date: a.start_date, start_time: a.start_time ?? null, end_date: a.end_date ?? null,
      end_time: a.end_time ?? null, visibility: a.visibility || 'household', title: a.title, location: a.location ?? null,
      notes: a.notes ?? null, preparation: a.preparation ?? null, participant_ids: a.participant_ids ?? [], is_busy: false };
  }
  // Serverrijen plus de toevoegingen die de server (nog) niet teruggaf. Zit een id er wel bij, dan is die
  // toevoeging aantoonbaar bevestigd.
  // bevestigd: id's die de server aantoonbaar heeft maar die niet in de lijsten staan (een pakitem van een vakantie
  // waarvan de paklijst niet wordt opgehaald, of een intussen verwijderd item).
  function samenvoegen(lijsten, bevestigd = new Set()) {
    metOpslag();
    for (const [id, o] of openstaand) {
      if (bevestigd.has(id) || lijsten[OPDRACHTEN[o.soort].lijst].some(x => x.id === id)) vergeet(id);
    }
    const uit = { ...lijsten };
    for (const o of openstaand.values()) {
      const l = OPDRACHTEN[o.soort].lijst;
      uit[l] = [...uit[l].filter(x => x.id !== o.id), voorlopig(o)];
    }
    for (const l of OPDRACHT_LIJSTEN) uit[l] = [...uit[l]].sort(SORTEER[l]);
    return uit;
  }
  const zonderVoorlopig = (lijst, id) => lijst.filter(x => !(x.id === id && (x.wachtend || x.onzeker || x.geweigerd || x.inhoudNietBewaard)));

  // ---- ophalen ----------------------------------------------------------------------------------
  // Alle pagina's van één bron, op id (keyset): een rij die tijdens het ophalen bestaat en niet wijzigt,
  // komt precies één keer mee, ook als er intussen rijen bijkomen of verdwijnen. Stoppen pas bij een
  // lege pagina, zodat een kleinere servergrens (max_rows) nooit stilletjes rijen afkapt.
  async function allePaginas(maak, g) {
    const rijen = [];
    let na = null;
    for (;;) {
      let q = maak();
      if (na !== null) q = q.gt('id', na);
      const r = await q.order('id').limit(paginaGrootte);
      if (r.error) throw foutVan(r);
      if (!geldig(g)) throw VERVALLEN;
      if (!r.data.length) return rijen;
      rijen.push(...r.data);
      na = r.data[r.data.length - 1].id;
    }
  }

  // Uitzonderingen op herhalende afspraken (verwijderde of losgemaakte voorkomens). Geen id-kolom: keyset
  // op de primaire sleutel (series_id, occurrence_date), met dezelfde garanties als allePaginas.
  async function alleUitzonderingen(g) {
    const rijen = [];
    let na = null;
    for (;;) {
      let q = supabase.from('event_exceptions').select('series_id,occurrence_date').eq('household_id', huishoudenId);
      if (na) q = q.or(`series_id.gt.${na.series_id},and(series_id.eq.${na.series_id},occurrence_date.gt.${na.occurrence_date})`);
      const r = await q.order('series_id').order('occurrence_date').limit(paginaGrootte);
      if (r.error) throw foutVan(r);
      if (!geldig(g)) throw VERVALLEN;
      if (r.data.length === 0) return rijen;   // pas klaar bij een lege pagina (de server kan minder teruggeven)
      rijen.push(...r.data);
      na = r.data[r.data.length - 1];
    }
  }

  async function haalOp(g) {
    // 1. Lidmaatschap: nog actief lid van dit huishouden?
    const lid = await supabase.rpc('my_memberships');
    if (lid.error) throw foutVan(lid);
    if (!geldig(g)) throw VERVALLEN;
    const mijn = (lid.data || []).find(m => m.household_id === huishoudenId);
    if (!mijn) return { geenToegang: true };
    // 2. Kanaalnaam en inhoud, alleen dit huishouden, alleen expliciete kolommen, alleen wat RLS
    //    teruggeeft. Pas als alles binnen is, gaat het naar de cache (geen halve vervanging).
    const [kn, b, t, a, l, u, v] = await Promise.all([
      supabase.rpc('household_channel', { p_household: huishoudenId }),
      allePaginas(() => supabase.from('shopping_items').select(VELDEN_BOODSCHAP).eq('household_id', huishoudenId).is('deleted_at', null), g),
      allePaginas(() => supabase.from('tasks').select(VELDEN_TAAK).eq('household_id', huishoudenId).is('deleted_at', null), g),
      allePaginas(() => supabase.from('event_overview').select(VELDEN_AFSPRAAK).eq('household_id', huishoudenId).is('deleted_at', null), g),
      allePaginas(() => supabase.from('household_members').select(VELDEN_LID).eq('household_id', huishoudenId), g),
      alleUitzonderingen(g),
      allePaginas(() => supabase.from('trips').select(VELDEN_VAKANTIE).eq('household_id', huishoudenId).is('deleted_at', null), g),
    ]);
    if (kn.error) {
      if (kn.error.code === '42501') return { geenToegang: true };
      throw foutVan(kn);
    }
    if (!geldig(g)) throw VERVALLEN;
    // 3. Paklijsten en koppelingen alleen van vakanties die niet voorbij zijn, plus de afgelopen vakanties die de app
    //    nu toont (vakantieOpenen). Zo groeit een ophaalronde niet mee met jaren aan oude paklijsten.
    const dag = vandaag();
    const actief = v.filter(x => geopend.has(x.id) || !vakantieVoorbij(x, dag)).map(x => x.id);
    // Onbevestigde vakanties en pakitems: bestaan ze al op de server (ook verwijderd, of bij een vakantie waarvan de
    // paklijst niet wordt opgehaald)? Dan zijn ze bevestigd.
    const teControleren = soort => [...openstaand.values()].filter(o => o.soort === soort).map(o => o.id);
    const [p, k, cv, cp] = await Promise.all([
      actief.length ? allePaginas(() => supabase.from('trip_packing_items').select(VELDEN_PAKITEM).eq('household_id', huishoudenId).in('trip_id', actief).is('deleted_at', null), g) : [],
      actief.length ? allePaginas(() => supabase.from('trip_shopping_links').select(VELDEN_KOPPELING).eq('household_id', huishoudenId).in('trip_id', actief).is('deleted_at', null), g) : [],
      teControleren('vakantie').length ? allePaginas(() => supabase.from('trips').select('id').eq('household_id', huishoudenId).in('id', teControleren('vakantie')), g) : [],
      teControleren('pakitem').length ? allePaginas(() => supabase.from('trip_packing_items').select('id').eq('household_id', huishoudenId).in('id', teControleren('pakitem')), g) : [],
    ]);
    if (!geldig(g)) throw VERVALLEN;
    return { lid: mijn, kanaalNaam: kn.data, boodschappen: b, taken: t, afspraken: a, leden: l.sort(SORTEER.leden), uitzonderingen: u,
      vakanties: v, pakitems: p, vakantieKoppelingen: k.sort(SORTEER.vakantieKoppelingen), bevestigd: new Set([...cv, ...cp].map(x => x.id)) };
  }

  // Eén ophaalronde tegelijk; seintjes tijdens een ronde leiden tot precies één extra ronde.
  function vernieuw() {
    if (!levend) return Promise.resolve();
    if (bezig) { nogmaals = true; return bezig; }
    const g = generatie;
    const p = (async () => {
      do {
        nogmaals = false;
        verwerkt.rondes++;
        if (toestand.status !== STATUS.OFFLINE) zet({ status: toestand.lid ? STATUS.SYNCHRONISEREN : STATUS.LADEN });
        let r;
        try {
          r = await haalOp(g);
        } catch (e) {
          if (!geldig(g)) return;
          zet(sessieFout(e) ? { status: STATUS.OFFLINE, melding: { soort: 'sessie', tekst: MELDINGEN.sessieBewaard } } : { status: STATUS.OFFLINE });
          planHerverbinden();
          return;
        }
        if (!geldig(g)) return;
        if (r.geenToegang) { beeindig(STATUS.GEEN_TOEGANG, { soort: 'toegang', tekst: MELDINGEN.toegang }); return; }
        bekend.clear();
        for (const x of r.boodschappen) bekend.set(`shopping_items:${x.id}`, x.version);
        for (const x of r.taken) bekend.set(`tasks:${x.id}`, x.version);
        for (const x of r.afspraken) bekend.set(`events:${x.id}`, x.version);
        for (const x of r.vakanties) bekend.set(`trips:${x.id}`, x.version);
        for (const x of r.pakitems) bekend.set(`trip_packing_items:${x.id}`, x.version);
        for (const x of r.vakantieKoppelingen) bekend.set(`trip_shopping_links:${x.id}`, x.version);
        const lijsten = samenvoegen({ boodschappen: r.boodschappen, taken: r.taken, afspraken: r.afspraken,
          vakanties: r.vakanties, pakitems: r.pakitems }, r.bevestigd);
        // Verbonden = gegevens actueel én het kanaal luistert. Kanaal nog niet open: bij de eerste ronde
        // nog "laden", daarna "offline" (er komen dan geen seintjes binnen).
        zet({ lid: r.lid, leden: r.leden, uitzonderingen: r.uitzonderingen, vakantieKoppelingen: r.vakantieKoppelingen, ...lijsten,
              status: kanaalOpen() ? STATUS.VERBONDEN : (kanaal ? STATUS.OFFLINE : STATUS.LADEN),
              laatstOpgehaald: new Date().toISOString() });
        // Andere kanaalnaam (iemand verloor toegang): overstappen. Het oude kanaal krijgt niets meer.
        if (r.kanaalNaam !== kanaalNaam) {
          const wasVerbonden = kanaal !== null;
          kanaalNaam = r.kanaalNaam;
          if (wasVerbonden) verbind();
        }
      } while (nogmaals && geldig(g));
    })();
    bezig = p;
    p.finally(() => { if (bezig === p) bezig = null; });
    return p;
  }

  // Seintje: alleen {t, id, v, op}. Al bekend (zelfde of nieuwere versie)? Dan niets doen.
  function opSeintje(bericht) {
    if (!levend) return;
    const p = bericht?.payload || {};
    verwerkt.seintjes++;
    if (p.v != null && MET_VERSIE.has(p.t)) {
      const al = bekend.get(`${p.t}:${p.id}`);
      if (al != null && al >= p.v) { verwerkt.genegeerd++; return; }
    }
    clearTimeout(debounce);
    debounce = setTimeout(vernieuw, debounceMs);
  }

  const kanaalOpen = () => kanaal?.state === 'joined';

  // Kanaal netjes afmelden. realtime-js geeft bij channel() een bestaand kanaal met dezelfde naam terug;
  // daarom moet het oude echt weg zijn vóór een nieuw kanaal. Zonder verbinding kan afmelden niet: dan
  // lokaal opruimen.
  async function stopKanaal() {
    if (!kanaal) return;
    const k = kanaal;
    kanaal = null;
    if (supabase.realtime.isConnected()) {
      try { await supabase.removeChannel(k); } catch { /* lokaal opruimen hieronder */ }
    }
    if (supabase.getChannels().includes(k)) {
      k.teardown?.();
      supabase.realtime.channels = supabase.realtime.channels.filter(c => c !== k);
    }
  }

  function planHerverbinden() {
    if (!levend || herverbinden) return;
    const g = generatie;
    const wacht = Math.min(30000, 1000 * 2 ** Math.min(pogingen++, 5));
    herverbinden = setTimeout(() => { herverbinden = null; if (geldig(g)) verbind(); }, wacht);
  }

  async function verbind() {
    if (!levend) return;
    const g = generatie;
    if (!kanaalNaam) {
      // Nog geen kanaalnaam (eerste ronde mislukt): eerst ophalen; dat plant zelf opnieuw bij een fout.
      await vernieuw();
      if (!geldig(g) || !kanaalNaam || kanaal) return;
    }
    await stopKanaal();
    if (!geldig(g)) return;
    await supabase.realtime.setAuth();   // het actuele toegangstoken voor private kanalen
    if (!geldig(g)) return;
    // Na een verbroken (of handmatig gesloten) socket verbindt realtime-js niet altijd zelf opnieuw, en
    // connect() doet niets zolang er nog een mislukte verbinding bestaat: dan eerst opruimen.
    if (!supabase.realtime.isConnected()) {
      supabase.realtime.disconnect();
      supabase.realtime.connect();
    }
    const k = supabase.channel(kanaalNaam, { config: { private: true } })
      .on('broadcast', { event: 'wijziging' }, opSeintje);
    kanaal = k;
    k.subscribe((status) => {
      if (!geldig(g) || kanaal !== k) return;
      spoor('kanaal', status);   // alleen de status, nooit inhoud
      if (status === 'SUBSCRIBED') {
        pogingen = 0;
        vernieuw();   // na (her)verbinden altijd volledig ophalen: niets gemist
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Geweigerd of verbroken. Ophalen beslist of het toegang is (geen-toegang), een nieuwe
        // kanaalnaam (overstappen) of netwerk (offline).
        zet({ status: STATUS.OFFLINE });
        vernieuw();
        planHerverbinden();
      }
    });
  }

  const opOnline = () => { if (!levend) return; pogingen = 0; verbind(); };
  const opOffline = () => zet({ status: STATUS.OFFLINE });

  // Einde van deze generatie (stoppen of geen toegang): timers en luisteraars weg, alle gegevens uit de
  // cache, één laatste melding zonder inhoud. Wat daarna nog binnenkomt, hoort bij een oude generatie en
  // wordt genegeerd. Onbevestigde opdrachten blijven in het paginageheugen en de opslag (alleen hun
  // aantal staat in de toestand); ze verdwijnen alleen na bevestiging of via vergeten.
  function beeindig(status, melding = null) {
    generatie++;
    levend = false;
    clearTimeout(debounce); clearTimeout(herverbinden); clearInterval(vangnet);
    debounce = herverbinden = vangnet = null;
    globalThis.removeEventListener?.('online', opOnline);
    globalThis.removeEventListener?.('offline', opOffline);
    bezig = null; nogmaals = false; kanaalNaam = null;
    bekend.clear();
    geopend.clear();
    metOpslag();
    toestand = { status, melding, laatstOpgehaald: null, opslagDuurzaam: toestand.opslagDuurzaam, bewaardOpToestel: openstaand.size, ...leeg() };
    opWijziging(toestand);
    return stopKanaal();
  }

  async function start() {
    if (levend) return;
    generatie++;
    const g = generatie;
    levend = true;
    pogingen = 0;
    toestand = { status: STATUS.LADEN, melding: null, laatstOpgehaald: null, opslagDuurzaam: null, ...leeg() };
    opWijziging(toestand);
    globalThis.addEventListener?.('online', opOnline);
    globalThis.addEventListener?.('offline', opOffline);
    vangnet = setInterval(() => { if (geldig(g)) vernieuw(); }, vangnetMs);
    // Account van deze sessie: sleutel voor geheugen en opslag (nooit opdrachten van een ander account).
    const s = await supabase.auth.getSession();
    if (!geldig(g)) return;
    gebruiker = s.data?.session?.user?.id || null;
    const sleutel = `${gebruiker}:${huishoudenId}`;
    if (!geheugen.has(sleutel)) geheugen.set(sleutel, new Map());
    openstaand = gebruiker ? geheugen.get(sleutel) : new Map();
    duurzaam = opslagProef();
    zet({ opslagDuurzaam: duurzaam });
    metOpslag();
    await vernieuw();
    if (geldig(g) && !kanaal) await verbind();
  }

  // Stoppen (uitloggen, ander huishouden kiezen, unmount): kanaal weg, alle gegevens uit de cache.
  // Onbevestigde opdrachten blijven bewaard (zie beeindig).
  function stop() {
    return beeindig(STATUS.GESTOPT);
  }

  // ---- schrijven ---------------------------------------------------------------------------
  const geenVerbinding = () => globalThis.navigator?.onLine === false;

  // Wijzigen (met versie). Bij een fout wordt alleen de eigen optimistische wijziging teruggedraaid,
  // op de huidige stand (nooit een oude momentopname terugzetten). Onbekende uitkomst: geen tweede
  // poging; de volgende ophaalronde laat zien wat er echt staat.
  async function schrijf(uitvoeren, { optimistisch, terugdraaien } = {}) {
    if (!levend || toestand.status === STATUS.GEEN_TOEGANG) return { ok: false, melding: { soort: 'toegang', tekst: MELDINGEN.toegang } };
    if (geenVerbinding()) {
      const melding = { soort: 'offline', tekst: MELDINGEN.offline };
      zet({ melding });
      return { ok: false, melding };
    }
    const g = generatie;
    if (optimistisch) zet(optimistisch(toestand));
    let r;
    try { r = await uitvoeren(); } catch (e) { r = { error: { onzeker: true, message: String(e?.message || e) } }; }
    if (!geldig(g)) return { ok: false, vervallen: true };
    if (r.error || r.conflict) {
      if (terugdraaien) zet(terugdraaien(toestand));
      const melding = r.conflict ? { soort: 'conflict', tekst: MELDINGEN.conflict } : meldingVoor(foutVan(r));
      zet({ melding });
      vernieuw();
      return { ok: false, melding };
    }
    zet({ melding: null });
    vernieuw();
    return { ok: true, data: r.data };
  }

  // Een toevoeging versturen (eerste keer of opnieuw, altijd met dezelfde UUID).
  function verzend(o) {
    if (o.soort === 'boodschap') {
      // Met een vakantie: de koppeling ontstaat in dezelfde transactie (zonder vakantie: precies de oude aanroep).
      // "Later nodig" (p_later) alleen als het gevraagd is; anders blijft de aanroep zoals hij was.
      return supabase.rpc('add_shopping_items', { p_household: huishoudenId, p_ids: [o.id], p_names: [o.naam], ...(o.tripId ? { p_trip: o.tripId } : {}), ...(o.later ? { p_later: true } : {}) });
    }
    if (o.soort === 'taak') {
      return supabase.from('tasks').insert({ id: o.id, household_id: huishoudenId, title: o.titel, ...o.velden }).select('id');
    }
    if (o.soort === 'vakantie') {
      return supabase.from('trips').insert({ id: o.id, household_id: huishoudenId, ...o.vakantie }).select('id');
    }
    if (o.soort === 'pakitem') {
      return supabase.from('trip_packing_items').insert({ id: o.id, household_id: huishoudenId, ...o.pakitem }).select('id');
    }
    const a = o.afspraak;
    return supabase.rpc('save_event', {
      p_household: huishoudenId, p_id: o.id, p_version: null, p_start_date: a.start_date,
      p_start_time: a.start_time ?? null, p_end_date: a.end_date ?? null, p_end_time: a.end_time ?? null,
      p_visibility: a.visibility || 'household', p_title: a.title, p_location: a.location ?? null, p_notes: a.notes ?? null,
      p_preparation: a.preparation ?? null, p_participants: a.participant_ids ?? null,
      p_recurrence_freq: a.recurrence_freq ?? null, p_recurrence_until: a.recurrence_until ?? null,
    });
  }

  // Uitkomst van één poging: opgeslagen, onzeker (antwoord verloren) of mislukt (zeker niet opgeslagen).
  async function voerUit(o) {
    let r;
    try { r = await verzend(o); } catch { return { uitkomst: 'onzeker' }; }
    if (!r.error) return { uitkomst: 'opgeslagen', data: r.data };
    const fout = foutVan(r);
    if (onbekend(fout)) return { uitkomst: 'onzeker' };
    // Een taak of afspraak met dit id bestaat al: dan heeft een eerdere poging van deze opdracht het al
    // opgeslagen (boodschappen meldt de server zelf als "al_verwerkt").
    if (fout.code === '23505' && o.soort !== 'boodschap') {
      let c;
      try { c = await supabase.from(OPDRACHTEN[o.soort].tabel).select('id').eq('id', o.id).eq('household_id', huishoudenId); }
      catch { return { uitkomst: 'onzeker' }; }
      if (c.error) return onbekend(foutVan(c)) ? { uitkomst: 'onzeker' } : { uitkomst: 'mislukt', fout: foutVan(c) };
      if (c.data.length === 1) return { uitkomst: 'opgeslagen' };
      // Een pakitem met dit id bestaat niet, maar dezelfde tekst staat al bij die persoon: deze opdracht is zeker niet
      // opgeslagen (had een eerdere poging hem opgeslagen, dan bestond dit id, ook na verwijderen).
      if (o.soort === 'pakitem') return { uitkomst: 'mislukt', fout, zeker: true };
    }
    return { uitkomst: 'mislukt', fout };
  }

  async function voegToe(o) {
    if (!levend || toestand.status === STATUS.GEEN_TOEGANG) return { ok: false, melding: { soort: 'toegang', tekst: MELDINGEN.toegang } };
    const nieuw = openstaand.get(o.id) !== o;
    if (geenVerbinding()) {
      // Aantoonbaar offline: niets versturen. Een nieuwe toevoeging is dan zeker niet opgeslagen (de app
      // zet de invoer terug); een bestaande opdracht blijft zoals ze was.
      const melding = nieuw ? { soort: 'offline', tekst: MELDINGEN.offline } : { soort: 'onzeker', tekst: MELDINGEN.nogOnbevestigd };
      zet({ melding });
      return nieuw ? { ok: false, melding } : { ok: false, onzeker: o.staat === 'onzeker', geweigerd: o.staat === 'geweigerd', id: o.id, melding };
    }
    if (o.inhoudNietBewaard) {
      // Zonder inhoud valt er niets te versturen: eerst opnieuw invoeren (opnieuwInvoeren, dezelfde UUID).
      const melding = prive(o) ? { soort: 'prive', tekst: MELDINGEN.priveNietBewaard } : { soort: 'inhoud', tekst: MELDINGEN.inhoudNietBewaard };
      zet({ melding });
      return { ok: false, inhoudOntbreekt: true, id: o.id, melding };
    }
    const g = generatie;
    // Alleen versturen met de sessie van het account waarvoor de opdracht is gemaakt.
    const s = await supabase.auth.getSession();
    if (!geldig(g)) return { ok: false, vervallen: true };
    if (!gebruiker || s.data?.session?.user?.id !== gebruiker) {
      const melding = { soort: 'sessie', tekst: nieuw ? MELDINGEN.sessie : MELDINGEN.sessieBewaard };
      zet({ melding });
      return nieuw ? { ok: false, melding } : { ok: false, onzeker: o.staat === 'onzeker', geweigerd: o.staat === 'geweigerd', id: o.id, melding };
    }
    const l = OPDRACHTEN[o.soort].lijst;
    // Eerst vastleggen (geheugen en opslag), dan pas versturen: valt het antwoord weg of sluit de app,
    // dan blijft deze UUID bewaard.
    o.staat = 'verzenden';
    o.lopend = (o.lopend || 0) + 1;   // pogingen van deze opdracht die nog onderweg zijn
    openstaand.set(o.id, o);
    o.bewaard = bewaar(o);
    zet({ [l]: [...toestand[l].filter(x => x.id !== o.id), voorlopig(o)].sort(SORTEER[l]) });
    const u = await voerUit(o);
    o.lopend--;
    // Loopt er nog een andere poging (bijv. de eerste, waarvan het antwoord nog onderweg is), dan zegt de
    // uitkomst van deze poging niets over die andere: die kan al gecommit zijn. Dus geen zekerheid en niet
    // opruimen; de opdracht blijft onderweg en daarna onzeker.
    const andereLopen = o.lopend > 0;
    // De boekhouding van de opdracht (geheugen en opslag) wordt altijd bijgewerkt, ook na stop(): dat is
    // geen inhoud voor de cache. Cache en meldingen alleen in de eigen generatie.
    const nogBijgehouden = openstaand.get(o.id) === o;   // niet intussen bevestigd of vergeten
    const houd = staat => { if (nogBijgehouden) { o.staat = andereLopen ? 'verzenden' : staat; if (staat === 'onzeker') o.ooitOnzeker = true; o.bewaard = bewaar(o); } };
    let r;
    if (u.uitkomst === 'opgeslagen') {
      if (nogBijgehouden) vergeet(o.id);
      r = { ok: true, id: o.id, data: u.data };
    } else if (u.uitkomst === 'onzeker') {
      houd('onzeker');
      r = { ok: false, onzeker: true, id: o.id, melding: { soort: 'onzeker', tekst: MELDINGEN.onbevestigd } };
    } else if ((o.ooitOnzeker && !u.zeker) || andereLopen) {
      // Een mislukte poging bewijst niet dat een eerdere of nog lopende poging niet is opgeslagen: blijft onzeker.
      houd('onzeker');
      r = { ok: false, onzeker: true, id: o.id, melding: sessieFout(u.fout) ? { soort: 'sessie', tekst: MELDINGEN.sessieBewaard } : { soort: 'onzeker', tekst: MELDINGEN.nogOnbevestigd } };
    } else if (sessieFout(u.fout)) {
      // Eerste poging zeker niet uitgevoerd (verlopen sessie): bewaren voor na het inloggen.
      houd('geweigerd');
      r = { ok: false, geweigerd: true, id: o.id, melding: { soort: 'sessie', tekst: MELDINGEN.sessieBewaard } };
    } else {
      // Enige poging, zeker geweigerd (ongeldig, geen lid, ...): niets opgeslagen, niets te bewaren.
      if (nogBijgehouden) vergeet(o.id);
      // Een boodschap voor een vakantie die intussen verwijderd is: dat zeggen. (Bij een afspraak blijft P0002 bewust
      // neutraal "geen toegang", om een privé-afspraak niet te verraden; een echte toegangsfout geeft hier 42501.)
      const vakantieWeg = o.soort === 'boodschap' && o.tripId && u.fout?.code === 'P0002';
      r = { ok: false, melding: vakantieWeg ? { soort: 'vakantie-weg', tekst: MELDINGEN.vakantieWeg } : meldingVoor(u.fout) };
    }
    if (!geldig(g)) return { ...r, vervallen: true };
    if (r.ok) {
      zet({ melding: null });
    } else if (openstaand.get(o.id) === o) {
      zet({ [l]: toestand[l].map(x => (x.id === o.id ? voorlopig(o) : x)), melding: r.melding });
    } else {
      zet({ [l]: zonderVoorlopig(toestand[l], o.id), melding: r.melding });
    }
    vernieuw();   // staat het er toch? Dan bevestigt de volgende ronde het.
    return r;
  }

  // Een nieuwe toevoeging. Staat er al een onbevestigde opdracht met dezelfde inhoud, dan wordt er niets
  // verstuurd en is een keuze nodig: opnieuw proberen (opnieuwProberen(id)) of bewust nieuw
  // ({ bewustNieuw: true }). Inhoud wordt nooit hergebruikt voor een andere opdracht.
  function nieuweToevoeging(o, { bewustNieuw = false } = {}) {
    if (!bewustNieuw && levend) {
      const sleutel = inhoudSleutel(o);
      const al = [...openstaand.values()].find(x => !x.inhoudNietBewaard && x.soort === o.soort && inhoudSleutel(x) === sleutel);
      if (al) {
        const melding = { soort: 'mogelijk-dubbel', tekst: MELDINGEN.mogelijkDubbel, id: al.id };
        zet({ melding });
        return Promise.resolve({ ok: false, mogelijkDubbel: al.id, melding });
      }
    }
    return voegToe({ ...o, staat: 'nieuw', ooitOnzeker: false });
  }

  // "Later nodig": expliciet (opties.later), of standaard voor een boodschap vanuit een vakantie.
  const laterVan = o => o.later ?? !!o.vakantie;

  // Opnieuw invoeren onder dezelfde UUID: de inhoud komt (weer) op de bestaande opdracht en die wordt verstuurd.
  // Bestaat de opdracht hier niet meer (intussen bevestigd of vergeten), dan toch met deze UUID: staat hij al op de
  // server, dan herkent die hem (taak en afspraak: het id bestaat al; boodschap: het opdrachtregister) en komt er
  // geen tweede. Inhoud wordt nooit op een andere UUID gezet.
  function opnieuwInvoeren(id, inhoud) {
    const bestaand = openstaand.get(id);
    if (bestaand && bestaand.soort !== inhoud.soort) return Promise.resolve({ ok: false, melding: { soort: 'ongeldig', tekst: MELDINGEN.ongeldig } });
    if (bestaand) {
      if (bestaand.inhoudNietBewaard) {
        if (inhoud.soort === 'boodschap') { bestaand.naam = inhoud.naam; if (inhoud.vakantie) bestaand.tripId = inhoud.vakantie; if (laterVan(inhoud)) bestaand.later = true; }
        else if (inhoud.soort === 'taak') { bestaand.titel = inhoud.titel; bestaand.velden = { ...inhoud.velden }; }
        else if (inhoud.soort === 'vakantie') bestaand.vakantie = { ...inhoud.vakantie };
        else if (inhoud.soort === 'pakitem') bestaand.pakitem = { ...inhoud.pakitem };
        else bestaand.afspraak = { ...inhoud.afspraak };
        delete bestaand.inhoudNietBewaard;
      }
      return voegToe(bestaand);
    }
    const nieuw = inhoud.soort === 'boodschap' ? { soort: 'boodschap', id, naam: inhoud.naam, ...(inhoud.vakantie ? { tripId: inhoud.vakantie } : {}), ...(laterVan(inhoud) ? { later: true } : {}) }
      : inhoud.soort === 'taak' ? { soort: 'taak', id, titel: inhoud.titel, velden: { ...inhoud.velden } }
        : inhoud.soort === 'vakantie' ? { soort: 'vakantie', id, vakantie: { ...inhoud.vakantie } }
          : inhoud.soort === 'pakitem' ? { soort: 'pakitem', id, pakitem: { ...inhoud.pakitem } }
            : { soort: 'afspraak', id, afspraak: { ...inhoud.afspraak } };
    return voegToe({ ...nieuw, staat: 'nieuw', ooitOnzeker: false });
  }

  // Uitdrukkelijk vergeten (alleen op dit toestel). Mag ook na stop() of zonder toegang.
  function vergeetOpdracht(id) {
    if (!gebruiker) return false;
    metOpslag();
    const o = openstaand.get(id) || leesOpslag().get(id);
    if (!o) return false;
    vergeet(id);
    if (levend) {
      const l = OPDRACHTEN[o.soort].lijst;
      zet({ [l]: zonderVoorlopig(toestand[l], id), melding: null });
    } else {
      toestand = { ...toestand, bewaardOpToestel: openstaand.size };
      opWijziging(toestand);
    }
    return true;
  }

  // Update met versiecontrole: raakt hij 0 rijen, dan was de versie verouderd (of de rij weg) = conflict.
  // kolommen: wat terugkomt (met 'id,version' kent de app de nieuwe versie, nodig om een verwijdering ongedaan te maken).
  async function bijwerkenMetVersie(tabel, id, versie, velden, kolommen = 'id') {
    const r = await supabase.from(tabel).update(velden).eq('id', id).eq('version', versie).select(kolommen);
    if (r.error) return r;
    return r.data.length === 1 ? r : { conflict: true };
  }

  const vervang = (lijst, id, f) => lijst.map(x => (x.id === id ? f(x) : x));
  const terugZetten = (lijst, item, l) => (lijst.some(x => x.id === item.id) ? lijst : [...lijst, item].sort(SORTEER[l]));

  // Een fout 23505 bij het herstellen van iets dat er intussen al (opnieuw) is: voor een koppeling is dat het gewenste
  // eindresultaat (geslaagd); voor een pakitem niet (melding "dubbel", U1).
  const dubbelIsGoed = uitvoeren => async () => {
    const r = await uitvoeren();
    return r.error?.code === '23505' ? { data: [] } : r;
  };
  const deels = n => ({ soort: 'deels', tekst: n === 1
    ? '1 item bleef staan omdat iemand het intussen had aangepast.'
    : `${n} items bleven staan omdat iemand ze intussen had aangepast.` });

  // Vinkjes van een lijst items in één keer zetten (set_packed). Geeft per item de nieuwe versie of "overgeslagen".
  async function zetVinkjes(vakantieId, items, { optimistisch, terugdraaien }) {
    const r = await schrijf(() => supabase.rpc('set_packed', { p_household: huishoudenId, p_trip: vakantieId, p_items: items }), { optimistisch, terugdraaien });
    if (!r.ok) return r;
    const per = new Map((r.data || []).map(x => [x.id, x]));
    return { ok: true, per, overgeslagen: items.filter(i => per.get(i.id)?.outcome !== 'gezet').length };
  }

  const acties = {
    // opties.vakantie: de boodschap is (ook) voor deze vakantie (koppeling in dezelfde transactie).
    // opties.later: bij "Later nodig" (standaard ja met een vakantie, anders nee).
    boodschapToevoegen(naam, opties = {}) {
      const { vakantie, later, ...rest } = opties || {};
      return nieuweToevoeging({ soort: 'boodschap', id: nieuweId(), naam, ...(vakantie ? { tripId: vakantie } : {}),
        ...(laterVan({ vakantie, later }) ? { later: true } : {}) }, rest);
    },
    boodschapAfvinken(item) {
      const checked_at = item.checked_at ? null : new Date().toISOString();
      return schrijf(() => bijwerkenMetVersie('shopping_items', item.id, item.version, { checked_at }), {
        optimistisch: t => ({ boodschappen: vervang(t.boodschappen, item.id, x => ({ ...x, checked_at, wachtend: true })) }),
        terugdraaien: t => ({ boodschappen: vervang(t.boodschappen, item.id, x => ({ ...x, checked_at: item.checked_at, wachtend: false })) }),
      });
    },
    boodschapHernoemen(item, naam, versie = item.version) {
      return schrijf(() => bijwerkenMetVersie('shopping_items', item.id, versie, { name: naam }), {
        optimistisch: t => ({ boodschappen: vervang(t.boodschappen, item.id, x => ({ ...x, name: naam, wachtend: true })) }),
        terugdraaien: t => ({ boodschappen: vervang(t.boodschappen, item.id, x => ({ ...x, name: item.name, wachtend: false })) }),
      });
    },
    // Tussen "Nu te kopen" en "Later nodig": dezelfde boodschap, alleen een andere lijst.
    boodschapLater(item, later, versie = item.version) {
      return schrijf(() => bijwerkenMetVersie('shopping_items', item.id, versie, { deferred: !!later }, 'id,version'), {
        optimistisch: t => ({ boodschappen: vervang(t.boodschappen, item.id, x => ({ ...x, deferred: !!later, wachtend: true })) }),
        terugdraaien: t => ({ boodschappen: vervang(t.boodschappen, item.id, x => ({ ...x, deferred: !!item.deferred, wachtend: false })) }),
      });
    },
    boodschapVerwijderen(item) {
      return schrijf(() => bijwerkenMetVersie('shopping_items', item.id, item.version, { deleted_at: new Date().toISOString() }), {
        optimistisch: t => ({ boodschappen: t.boodschappen.filter(x => x.id !== item.id) }),
        terugdraaien: t => ({ boodschappen: terugZetten(t.boodschappen, item, 'boodschappen') }),
      });
    },
    taakToevoegen(titel, velden = {}, opties) {
      return nieuweToevoeging({ soort: 'taak', id: nieuweId(), titel, velden: { ...velden } }, opties);
    },
    // Titel, datum of wie het oppakt wijzigen, met de versie waarmee de gebruiker begon.
    taakBijwerken(taak, velden, versie = taak.version) {
      return schrijf(() => bijwerkenMetVersie('tasks', taak.id, versie, velden), {
        optimistisch: t => ({ taken: vervang(t.taken, taak.id, x => ({ ...x, ...velden, wachtend: true })) }),
        terugdraaien: t => ({ taken: vervang(t.taken, taak.id, x => ({ ...x, ...Object.fromEntries(Object.keys(velden).map(k => [k, taak[k]])), wachtend: false })) }),
      });
    },
    // vandaag: de dag die de app als "vandaag" toont (jjjj-mm-dd); zonder: de lokale datum van dit toestel.
    taakAfvinken(taak, vandaag) {
      const done_on = taak.done_on ? null : (vandaag ?? lokaleDatum());
      const done_by_member_id = done_on ? toestand.lid?.member_id ?? null : null;
      return schrijf(() => bijwerkenMetVersie('tasks', taak.id, taak.version, { done_on, done_by_member_id }), {
        optimistisch: t => ({ taken: vervang(t.taken, taak.id, x => ({ ...x, done_on, wachtend: true })) }),
        terugdraaien: t => ({ taken: vervang(t.taken, taak.id, x => ({ ...x, done_on: taak.done_on, wachtend: false })) }),
      });
    },
    taakVerwijderen(taak) {
      return schrijf(() => bijwerkenMetVersie('tasks', taak.id, taak.version, { deleted_at: new Date().toISOString() }), {
        optimistisch: t => ({ taken: t.taken.filter(x => x.id !== taak.id) }),
        terugdraaien: t => ({ taken: terugZetten(t.taken, taak, 'taken') }),
      });
    },
    // Afspraak maken (zonder versie: een toevoeging met vaste UUID) of bijwerken (met de versie
    // waarmee de gebruiker begon).
    // Een opgegeven id is zelf de opdrachtidentiteit: dezelfde id = dezelfde opdracht (ook om de inhoud van
    // een privé-afspraak opnieuw in te voeren die niet op het toestel bewaard is).
    afspraakBewaren(a, opties) {
      if (a.version == null) {
        if (a.id) return opnieuwInvoeren(a.id, { soort: 'afspraak', afspraak: { ...a } });
        return nieuweToevoeging({ soort: 'afspraak', id: nieuweId(), afspraak: { ...a } }, opties);
      }
      return schrijf(() => supabase.rpc('save_event', {
        p_household: huishoudenId, p_id: a.id, p_version: a.version, p_start_date: a.start_date,
        p_start_time: a.start_time ?? null, p_end_date: a.end_date ?? null, p_end_time: a.end_time ?? null,
        p_visibility: a.visibility || 'household', p_title: a.title, p_location: a.location ?? null, p_notes: a.notes ?? null,
        p_preparation: a.preparation ?? null, p_participants: a.participant_ids ?? null,
        p_recurrence_freq: a.recurrence_freq ?? null, p_recurrence_until: a.recurrence_until ?? null,
      }));
    },
    afspraakVerwijderen(a) {
      return schrijf(() => supabase.rpc('delete_event', { p_id: a.id, p_version: a.version }));
    },
    // Eén voorkomen van een reeks wijzigen: de server maakt er een losse afspraak van (met dit id) en zet
    // een uitzondering op de reeks. Zichtbaarheid en herhaling volgen de reeks.
    afspraakVoorkomenWijzigen(reeksId, datum, a) {
      return schrijf(() => supabase.rpc('edit_occurrence', {
        p_series: reeksId, p_original_date: datum, p_id: a.id || nieuweId(), p_start_date: a.start_date,
        p_start_time: a.start_time ?? null, p_end_date: a.end_date ?? null, p_end_time: a.end_time ?? null,
        p_title: a.title, p_location: a.location ?? null, p_notes: a.notes ?? null, p_preparation: a.preparation ?? null,
        p_participants: a.participant_ids ?? null,
      }));
    },
    // Eén voorkomen van een reeks verwijderen (een uitzondering op de reeks).
    afspraakVoorkomenVerwijderen(reeksId, datum) {
      return schrijf(() => supabase.rpc('delete_occurrence', { p_series: reeksId, p_date: datum }));
    },

    // ---- Vakanties (F8, docs/thuisplanner-vakanties.md §14) ----
    // Een vakantie toevoegen: een opdracht met vaste UUID (opnieuw proberen maakt nooit dubbel).
    // v: { name, start_date?, end_date?, destination?, notes? }
    vakantieToevoegen(v, opties) {
      const vakantie = { name: v.name, start_date: v.start_date ?? null, end_date: v.end_date ?? null,
        destination: v.destination ?? null, ...(v.notes != null ? { notes: v.notes } : {}) };
      return nieuweToevoeging({ soort: 'vakantie', id: nieuweId(), vakantie }, opties);
    },
    // Naam, datums, bestemming of notities, met de versie waarmee de gebruiker begon.
    vakantieBijwerken(v, velden, versie = v.version) {
      return schrijf(() => bijwerkenMetVersie('trips', v.id, versie, velden), {
        optimistisch: t => ({ vakanties: vervang(t.vakanties, v.id, x => ({ ...x, ...velden, wachtend: true })).sort(SORTEER.vakanties) }),
        terugdraaien: t => ({ vakanties: vervang(t.vakanties, v.id, x => ({ ...x, ...Object.fromEntries(Object.keys(velden).map(k => [k, v[k]])), wachtend: false })).sort(SORTEER.vakanties) }),
      });
    },
    // Verwijderen (markeren); data[0].version is nodig om het ongedaan te maken (vakantieHerstellen).
    vakantieVerwijderen(v) {
      return schrijf(() => bijwerkenMetVersie('trips', v.id, v.version, { deleted_at: new Date().toISOString() }, 'id,version'), {
        optimistisch: t => ({ vakanties: t.vakanties.filter(x => x.id !== v.id) }),
        terugdraaien: t => ({ vakanties: terugZetten(t.vakanties, v, 'vakanties') }),
      });
    },
    vakantieHerstellen(v, versie) {
      return schrijf(() => bijwerkenMetVersie('trips', v.id, versie, { deleted_at: null }, 'id,version'), {
        optimistisch: t => ({ vakanties: terugZetten(t.vakanties, v, 'vakanties') }),
        terugdraaien: t => ({ vakanties: t.vakanties.filter(x => x.id !== v.id) }),
      });
    },
    // Een afgelopen vakantie tonen: haar paklijst gaat mee in elke ophaalronde tot vakantieSluiten.
    vakantieOpenen(id) { geopend.add(id); return vernieuw(); },
    vakantieSluiten(id) { geopend.delete(id); },

    // Een pakitem toevoegen voor een lid (lidId) of Gezamenlijk (null): een opdracht met vaste UUID. Staat dezelfde tekst
    // al bij die persoon, dan melding "dubbel" en niets toegevoegd.
    pakitemToevoegen(vakantieId, lidId, naam, opties) {
      return nieuweToevoeging({ soort: 'pakitem', id: nieuweId(), pakitem: { trip_id: vakantieId, member_id: lidId ?? null, name: naam } }, opties);
    },
    pakitemAfvinken(item) {
      const packed_at = item.packed_at ? null : new Date().toISOString();
      const packed_by_member_id = packed_at ? toestand.lid?.member_id ?? null : null;
      return schrijf(() => bijwerkenMetVersie('trip_packing_items', item.id, item.version, { packed_at, packed_by_member_id }), {
        optimistisch: t => ({ pakitems: vervang(t.pakitems, item.id, x => ({ ...x, packed_at, packed_by_member_id, wachtend: true })) }),
        terugdraaien: t => ({ pakitems: vervang(t.pakitems, item.id, x => ({ ...x, packed_at: item.packed_at, packed_by_member_id: item.packed_by_member_id, wachtend: false })) }),
      });
    },
    // Tekst aanpassen of verplaatsen naar een ander lid of Gezamenlijk ({ name?, member_id? }). Bestaat het daar al:
    // melding "dubbel" en er verandert niets (U1).
    pakitemBijwerken(item, velden, versie = item.version) {
      return schrijf(() => bijwerkenMetVersie('trip_packing_items', item.id, versie, velden), {
        optimistisch: t => ({ pakitems: vervang(t.pakitems, item.id, x => ({ ...x, ...velden, wachtend: true })) }),
        terugdraaien: t => ({ pakitems: vervang(t.pakitems, item.id, x => ({ ...x, ...Object.fromEntries(Object.keys(velden).map(k => [k, item[k]])), wachtend: false })) }),
      });
    },
    pakitemVerwijderen(item) {
      return schrijf(() => bijwerkenMetVersie('trip_packing_items', item.id, item.version, { deleted_at: new Date().toISOString() }, 'id,version'), {
        optimistisch: t => ({ pakitems: t.pakitems.filter(x => x.id !== item.id) }),
        terugdraaien: t => ({ pakitems: terugZetten(t.pakitems, item, 'pakitems') }),
      });
    },
    // Ongedaan maken van verwijderen. Staat er intussen een gelijk item: melding "dubbel", niets hersteld (U1).
    pakitemHerstellen(item, versie) {
      return schrijf(() => bijwerkenMetVersie('trip_packing_items', item.id, versie, { deleted_at: null }, 'id,version'), {
        optimistisch: t => ({ pakitems: terugZetten(t.pakitems, item, 'pakitems') }),
        terugdraaien: t => ({ pakitems: t.pakitems.filter(x => x.id !== item.id) }),
      });
    },

    // De paklijst van een eerdere vakantie overnemen: voor iedereen, één lid (lid) of alleen Gezamenlijk (gezamenlijk).
    // Aanvullend; wat er al staat, wordt overgeslagen. Onzeker (antwoord verloren)? Dan dezelfde `opdracht` opnieuw
    // meegeven: de server geeft dan dezelfde items terug en maakt niets dubbel (U2).
    async paklijstOvernemen({ van, naar, lid = null, gezamenlijk = false, opdracht = null }) {
      const opdr = opdracht || nieuweId();
      const r = await schrijf(() => supabase.rpc('copy_packing_items', { p_household: huishoudenId, p_command: opdr,
        p_from_trip: van, p_to_trip: naar, p_member: lid, p_gezamenlijk: !!gezamenlijk }));
      if (!r.ok && r.melding?.soort === 'onzeker') {
        const melding = { soort: 'onzeker', tekst: MELDINGEN.overnemenOnzeker };
        zet({ melding });
        return { ...r, opdracht: opdr, melding };
      }
      return { ...r, opdracht: opdr, items: r.ok ? (r.data || []) : undefined };
    },
    // Ongedaan maken van één overname: alleen de items van díe overname (ids uit paklijstOvernemen), en alleen zolang
    // niemand ze aanpaste (versie 1). Wat intussen is aangepast, blijft staan en wordt gemeld.
    async overnemenOngedaanMaken(ids) {
      if (!ids?.length) return { ok: true, verwijderd: 0, gebleven: 0 };
      const r = await schrijf(() => supabase.from('trip_packing_items').update({ deleted_at: new Date().toISOString() })
        .eq('household_id', huishoudenId).in('id', ids).eq('version', 1).is('deleted_at', null).select('id'));
      if (!r.ok) return r;
      const verwijderd = (r.data || []).length;
      const gebleven = ids.length - verwijderd;
      if (gebleven) zet({ melding: deels(gebleven) });
      return { ok: true, verwijderd, gebleven, melding: gebleven ? deels(gebleven) : null };
    },
    // Alle vinkjes van één lid (lidId), van Gezamenlijk (null) of van iedereen ('iedereen') weghalen. Geeft `terug`:
    // wat vinkjesTerugzetten nodig heeft om precies terug te zetten (moment en persoon).
    async vinkjesOpnieuw(vakantieId, lidId) {
      const items = toestand.pakitems.filter(x => x.trip_id === vakantieId && x.packed_at && x.version > 0
        && !x.wachtend && !x.onzeker && !x.geweigerd && (lidId === 'iedereen' || (x.member_id ?? null) === lidId));
      if (!items.length) return { ok: true, terug: [], overgeslagen: 0 };
      const ids = new Set(items.map(i => i.id));
      const r = await zetVinkjes(vakantieId, items.map(i => ({ id: i.id, version: i.version, packed: false })), {
        optimistisch: t => ({ pakitems: t.pakitems.map(x => (ids.has(x.id) ? { ...x, packed_at: null, packed_by_member_id: null, wachtend: true } : x)) }),
        terugdraaien: t => ({ pakitems: t.pakitems.map(x => { const i = items.find(y => y.id === x.id); return i ? { ...x, packed_at: i.packed_at, packed_by_member_id: i.packed_by_member_id, wachtend: false } : x; }) }),
      });
      if (!r.ok) return r;
      const terug = items.filter(i => r.per.get(i.id)?.outcome === 'gezet').map(i => ({ id: i.id, version: r.per.get(i.id).version,
        packed: true, packed_at: i.packed_at, packed_by: i.packed_by_member_id ?? null }));
      if (r.overgeslagen) zet({ melding: deels(r.overgeslagen) });
      return { ok: true, terug, overgeslagen: r.overgeslagen, melding: r.overgeslagen ? deels(r.overgeslagen) : null };
    },
    async vinkjesTerugzetten(vakantieId, terug) {
      if (!terug?.length) return { ok: true, overgeslagen: 0 };
      const per = new Map(terug.map(i => [i.id, i]));
      // Een inpakker die intussen geen actief lid meer is, kan de server niet terugzetten: dan de aanroeper.
      const actief = new Set(toestand.leden.filter(l => l.status === 'active').map(l => l.id));
      const r = await zetVinkjes(vakantieId, terug.map(i => ({ id: i.id, version: i.version, packed: true,
        ...(i.packed_at ? { packed_at: i.packed_at } : {}), ...(i.packed_by && actief.has(i.packed_by) ? { packed_by: i.packed_by } : {}) })), {
        optimistisch: t => ({ pakitems: t.pakitems.map(x => (per.has(x.id) ? { ...x, packed_at: per.get(x.id).packed_at, packed_by_member_id: per.get(x.id).packed_by, wachtend: true } : x)) }),
        terugdraaien: t => ({ pakitems: t.pakitems.map(x => (per.has(x.id) ? { ...x, packed_at: null, packed_by_member_id: null, wachtend: false } : x)) }),
      });
      if (!r.ok) return r;
      if (r.overgeslagen) zet({ melding: deels(r.overgeslagen) });
      return { ok: true, overgeslagen: r.overgeslagen, melding: r.overgeslagen ? deels(r.overgeslagen) : null };
    },

    // Een boodschap niet meer voor deze vakantie (alleen de koppeling; de boodschap blijft op de lijst).
    boodschapOntkoppelen(k) {
      return schrijf(() => bijwerkenMetVersie('trip_shopping_links', k.id, k.version, { deleted_at: new Date().toISOString() }, 'id,version'), {
        optimistisch: t => ({ vakantieKoppelingen: t.vakantieKoppelingen.filter(x => x.id !== k.id) }),
        terugdraaien: t => ({ vakantieKoppelingen: terugZetten(t.vakantieKoppelingen, k, 'vakantieKoppelingen') }),
      });
    },
    // Ongedaan maken van ontkoppelen. Is de boodschap intussen opnieuw gekoppeld, dan is dat al het gewenste resultaat.
    boodschapKoppelingHerstellen(k, versie) {
      return schrijf(dubbelIsGoed(() => bijwerkenMetVersie('trip_shopping_links', k.id, versie, { deleted_at: null }, 'id,version')), {
        optimistisch: t => ({ vakantieKoppelingen: terugZetten(t.vakantieKoppelingen, k, 'vakantieKoppelingen') }),
        terugdraaien: t => ({ vakantieKoppelingen: t.vakantieKoppelingen.filter(x => x.id !== k.id) }),
      });
    },
    // Een niet-bevestigde toevoeging waarvan de inhoud niet op dit toestel staat (P1), opnieuw invoeren onder
    // dezelfde UUID. inhoud: { soort: 'boodschap', naam } | { soort: 'taak', titel, velden } | { soort: 'afspraak', afspraak }.
    opnieuwInvoeren(id, inhoud) { return opnieuwInvoeren(id, inhoud); },
    // Een niet-bevestigde toevoeging opnieuw versturen: dezelfde opdracht, dezelfde UUID.
    opnieuwProberen(id) {
      const o = openstaand.get(id);
      if (!o) return Promise.resolve({ ok: false });
      return voegToe(o);
    },
    // Een onbevestigde opdracht uitdrukkelijk vergeten (alleen op dit toestel; staat ze al op de server,
    // dan blijft ze daar).
    vergeten(id) { return vergeetOpdracht(id); },
    meldingWeg() { zet({ melding: null }); },
  };

  return {
    start, stop, vernieuw, acties,
    verwerkSeintje: opSeintje,   // voor tests: een seintje aanbieden zoals het kanaal dat doet
    get toestand() { return toestand; },
    get statistiek() { return { ...verwerkt }; },
    get openstaand() { return [...openstaand.values()].map(o => ({ soort: o.soort, id: o.id, staat: o.staat, bewaard: !!o.bewaard, zonderInhoud: !!o.inhoudNietBewaard })); },
    vergeten: vergeetOpdracht,   // ook na stop() of zonder toegang
    get kanaalNaam() { return kanaalNaam; },
  };
}
