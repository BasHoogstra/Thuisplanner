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
//  - Geen inhoud in logboeken of meldingen: meldingen zijn vaste Nederlandse teksten per foutcode.

const VELDEN_BOODSCHAP = 'id,household_id,name,checked_at,version,created_at,updated_at';
const VELDEN_TAAK = 'id,household_id,title,due_date,assignee_member_id,done_on,done_by_member_id,version,created_at,updated_at';
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
  toegang: 'Je hebt geen toegang (meer) tot dit huishouden.',
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
  if (code === 'PT409' || fout.status === 409) return { soort: 'conflict', tekst: MELDINGEN.conflict };
  if (sessieFout(fout)) return { soort: 'sessie', tekst: MELDINGEN.sessie };
  if (code === 'P0002' || code === '42501' || fout.status === 403) return { soort: 'toegang', tekst: MELDINGEN.toegang };
  if (code === '23505') return { soort: 'dubbel', tekst: MELDINGEN.dubbel };
  if (code === '23514' || code === '22023' || code === '22P02') return { soort: 'ongeldig', tekst: MELDINGEN.ongeldig };
  if (onbekend(fout)) return { soort: 'onzeker', tekst: MELDINGEN.onzeker };
  return { soort: 'fout', tekst: MELDINGEN.fout };
}

const foutVan = r => (r?.error ? { ...r.error, status: r.status } : null);
const leeg = () => ({ lid: null, leden: [], boodschappen: [], taken: [], afspraken: [], uitzonderingen: [] });
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
};

// Opdrachten per account en huishouden in het geheugen van de pagina: ze overleven stop()/start() en een
// unmount van het onderdeel dat de sync gebruikt. (Tests geven een eigen geheugen mee om een herstart
// van de pagina na te bootsen.)
const PAGINAGEHEUGEN = new Map();
const VOORVOEGSEL = 'thuisplanner-opdracht:';
const zonderLeeg = obj => Object.keys(obj || {}).filter(k => obj[k] != null && k !== 'id').sort().map(k => [k, obj[k]]);
// Inhoud van een opdracht, om een mogelijk dubbele nieuwe toevoeging te herkennen (nooit om te hergebruiken).
const inhoudSleutel = o => JSON.stringify(o.soort === 'boodschap' ? [o.soort, tekstSleutel(o.naam)]
  : o.soort === 'taak' ? [o.soort, tekstSleutel(o.titel), zonderLeeg(o.velden)]
    : [o.soort, zonderLeeg(o.afspraak)]);
const prive = o => o.soort === 'afspraak' && o.afspraak?.visibility === 'private';

// Toevoegingen als opdracht: soort -> lijst in de toestand, tabel voor de controle "bestaat dit id al".
const OPDRACHTEN = {
  boodschap: { lijst: 'boodschappen', tabel: 'shopping_items' },
  taak: { lijst: 'taken', tabel: 'tasks' },
  afspraak: { lijst: 'afspraken', tabel: 'events' },
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
 * @param {Map} [o.geheugen]  geheugen van de pagina (standaard gedeeld binnen de pagina)
 * @param {(soort: string, status: string) => void} [o.spoor]  optioneel: kanaalstatus volgen (geen inhoud)
 */
export function maakSync({ supabase, huishoudenId, opWijziging = () => {}, vangnetMs = 30000, debounceMs = 150,
  paginaGrootte = 1000, opslag = null, geheugen = PAGINAGEHEUGEN, spoor = () => {} }) {
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
  // lid) of via vergeten. Inhoud van privé-afspraken gaat nooit naar de opslag, alleen de identiteit.
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
    const inhoud = prive(o) ? { inhoudNietBewaard: true, afspraak: { visibility: 'private' } }
      : { naam: o.naam, titel: o.titel, velden: o.velden, afspraak: o.afspraak };
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
    if (o.soort === 'boodschap') return { ...basis, name: String(o.naam).trim(), checked_at: null };
    if (o.soort === 'taak') return { ...basis, title: o.titel, done_on: null, ...o.velden };
    const a = o.afspraak || {};
    if (o.inhoudNietBewaard) return { ...basis, inhoudNietBewaard: true, visibility: 'private', start_date: null, title: null, is_busy: false, participant_ids: [] };
    return { ...basis, start_date: a.start_date, start_time: a.start_time ?? null, end_date: a.end_date ?? null,
      end_time: a.end_time ?? null, visibility: a.visibility || 'household', title: a.title, location: a.location ?? null,
      notes: a.notes ?? null, preparation: a.preparation ?? null, participant_ids: a.participant_ids ?? [], is_busy: false };
  }
  // Serverrijen plus de toevoegingen die de server (nog) niet teruggaf. Zit een id er wel bij, dan is die
  // toevoeging aantoonbaar bevestigd.
  function samenvoegen(lijsten) {
    metOpslag();
    for (const [id, o] of openstaand) {
      if (lijsten[OPDRACHTEN[o.soort].lijst].some(x => x.id === id)) vergeet(id);
    }
    const uit = { ...lijsten };
    for (const o of openstaand.values()) {
      const l = OPDRACHTEN[o.soort].lijst;
      uit[l] = [...uit[l].filter(x => x.id !== o.id), voorlopig(o)];
    }
    for (const l of ['boodschappen', 'taken', 'afspraken']) uit[l] = [...uit[l]].sort(SORTEER[l]);
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
    const [kn, b, t, a, l, u] = await Promise.all([
      supabase.rpc('household_channel', { p_household: huishoudenId }),
      allePaginas(() => supabase.from('shopping_items').select(VELDEN_BOODSCHAP).eq('household_id', huishoudenId).is('deleted_at', null), g),
      allePaginas(() => supabase.from('tasks').select(VELDEN_TAAK).eq('household_id', huishoudenId).is('deleted_at', null), g),
      allePaginas(() => supabase.from('event_overview').select(VELDEN_AFSPRAAK).eq('household_id', huishoudenId).is('deleted_at', null), g),
      allePaginas(() => supabase.from('household_members').select(VELDEN_LID).eq('household_id', huishoudenId), g),
      alleUitzonderingen(g),
    ]);
    if (kn.error) {
      if (kn.error.code === '42501') return { geenToegang: true };
      throw foutVan(kn);
    }
    if (!geldig(g)) throw VERVALLEN;
    return { lid: mijn, kanaalNaam: kn.data, boodschappen: b, taken: t, afspraken: a, leden: l.sort(SORTEER.leden), uitzonderingen: u };
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
        const lijsten = samenvoegen({ boodschappen: r.boodschappen, taken: r.taken, afspraken: r.afspraken });
        // Verbonden = gegevens actueel én het kanaal luistert. Kanaal nog niet open: bij de eerste ronde
        // nog "laden", daarna "offline" (er komen dan geen seintjes binnen).
        zet({ lid: r.lid, leden: r.leden, uitzonderingen: r.uitzonderingen, ...lijsten,
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
    if (p.v != null && (p.t === 'shopping_items' || p.t === 'tasks' || p.t === 'events')) {
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
      return supabase.rpc('add_shopping_items', { p_household: huishoudenId, p_ids: [o.id], p_names: [o.naam] });
    }
    if (o.soort === 'taak') {
      return supabase.from('tasks').insert({ id: o.id, household_id: huishoudenId, title: o.titel, ...o.velden }).select('id');
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
      const melding = { soort: 'prive', tekst: MELDINGEN.priveNietBewaard };
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
    } else if (o.ooitOnzeker || andereLopen) {
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
      r = { ok: false, melding: meldingVoor(u.fout) };
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
  async function bijwerkenMetVersie(tabel, id, versie, velden) {
    const r = await supabase.from(tabel).update(velden).eq('id', id).eq('version', versie).select('id');
    if (r.error) return r;
    return r.data.length === 1 ? r : { conflict: true };
  }

  const vervang = (lijst, id, f) => lijst.map(x => (x.id === id ? f(x) : x));
  const terugZetten = (lijst, item, l) => (lijst.some(x => x.id === item.id) ? lijst : [...lijst, item].sort(SORTEER[l]));

  const acties = {
    boodschapToevoegen(naam, opties) {
      return nieuweToevoeging({ soort: 'boodschap', id: nieuweId(), naam }, opties);
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
    taakAfvinken(taak) {
      const done_on = taak.done_on ? null : new Date().toISOString().slice(0, 10);
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
        const bestaand = a.id ? openstaand.get(a.id) : null;
        if (bestaand) {
          if (bestaand.inhoudNietBewaard) { bestaand.afspraak = { ...a }; delete bestaand.inhoudNietBewaard; }
          return voegToe(bestaand);
        }
        return nieuweToevoeging({ soort: 'afspraak', id: a.id || nieuweId(), afspraak: { ...a } }, a.id ? { bewustNieuw: true } : opties);
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
    get openstaand() { return [...openstaand.values()].map(o => ({ soort: o.soort, id: o.id, staat: o.staat, bewaard: !!o.bewaard })); },
    vergeten: vergeetOpdracht,   // ook na stop() of zonder toegang
    get kanaalNaam() { return kanaalNaam; },
  };
}
