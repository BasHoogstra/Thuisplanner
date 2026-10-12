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
//    vaste UUID: is de uitkomst onbekend (antwoord verloren), dan blijft ze "niet bevestigd" staan en
//    gebruikt opnieuw proberen dezelfde UUID, ook na een herstart (opslag). Zo ontstaat er nooit een
//    dubbele toevoeging. Er is geen wachtrij voor offline wijzigingen (bouwplan): zonder verbinding
//    wordt niets automatisch later verstuurd.
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

// Vertaalt een fout naar een vaste melding. Nooit de ruwe tekst of details tonen of loggen.
export function meldingVoor(fout) {
  if (!fout) return null;
  const code = fout.code || '';
  if (code === 'PT409' || fout.status === 409) return { soort: 'conflict', tekst: MELDINGEN.conflict };
  if (code === 'P0002' || code === '42501' || fout.status === 401 || fout.status === 403) return { soort: 'toegang', tekst: MELDINGEN.toegang };
  if (code === '23505') return { soort: 'dubbel', tekst: MELDINGEN.dubbel };
  if (code === '23514' || code === '22023' || code === '22P02') return { soort: 'ongeldig', tekst: MELDINGEN.ongeldig };
  if (onbekend(fout)) return { soort: 'onzeker', tekst: MELDINGEN.onzeker };
  return { soort: 'fout', tekst: MELDINGEN.fout };
}

const foutVan = r => (r?.error ? { ...r.error, status: r.status } : null);
const leeg = () => ({ lid: null, leden: [], boodschappen: [], taken: [], afspraken: [] });
const nieuweId = () => globalThis.crypto.randomUUID();
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
 * @param {{getItem, setItem, removeItem}} [o.opslag]  optioneel (bijv. sessionStorage): toevoegingen met
 *   onbekende uitkomst overleven een herstart, met dezelfde UUID. Alleen eigen, nog niet bevestigde invoer.
 * @param {(soort: string, status: string) => void} [o.spoor]  optioneel: kanaalstatus volgen (geen inhoud)
 */
export function maakSync({ supabase, huishoudenId, opWijziging = () => {}, vangnetMs = 30000, debounceMs = 150,
  paginaGrootte = 1000, opslag = null, spoor = () => {} }) {
  let toestand = { status: STATUS.LADEN, melding: null, laatstOpgehaald: null, ...leeg() };
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
  let gebruiker = null;      // account-ID, alleen als sleutel voor de opslag
  const bekend = new Map();  // `${t}:${id}` -> versie die we al hebben (dubbele seintjes negeren)
  const openstaand = new Map();   // id -> toevoeging die (nog) niet bevestigd is
  const verwerkt = { seintjes: 0, genegeerd: 0, rondes: 0 };

  // Hoort een antwoord nog bij de huidige generatie? Zo niet, dan negeren: niets in de cache, niets melden.
  const geldig = g => levend && g === generatie;
  const zet = (delta) => {
    if (!levend) return;
    toestand = { ...toestand, ...delta };
    opWijziging(toestand);
  };

  // ---- opdrachten met onbekende uitkomst (opslag) ----------------------------------------------
  const opslagSleutel = () => (opslag && gebruiker ? `thuisplanner-openstaand:${gebruiker}:${huishoudenId}` : null);
  function bewaarOpdrachten() {
    const k = opslagSleutel();
    if (!k) return;
    try {
      if (openstaand.size) opslag.setItem(k, JSON.stringify([...openstaand.values()].map(({ onzeker, ...o }) => o)));
      else opslag.removeItem(k);
    } catch { /* opslag vol of geweigerd: alleen in het geheugen */ }
  }
  function laadOpdrachten() {
    const k = opslagSleutel();
    if (!k) return;
    let lijst = [];
    try { lijst = JSON.parse(opslag.getItem(k) || '[]'); } catch { lijst = []; }
    for (const o of Array.isArray(lijst) ? lijst : []) {
      if (o && OPDRACHTEN[o.soort] && typeof o.id === 'string') openstaand.set(o.id, { ...o, onzeker: true });
    }
  }
  function wisOpdrachten() {
    openstaand.clear();
    const k = opslagSleutel();
    if (k) { try { opslag.removeItem(k); } catch { /* niets */ } }
  }

  // Een nog niet bevestigde toevoeging zoals ze in de lijst staat.
  function voorlopig(o) {
    const basis = { id: o.id, version: 0, wachtend: !o.onzeker, onzeker: !!o.onzeker };
    if (o.soort === 'boodschap') return { ...basis, name: o.naam.trim(), checked_at: null };
    if (o.soort === 'taak') return { ...basis, title: o.titel, done_on: null, ...o.velden };
    const a = o.afspraak;
    return { ...basis, start_date: a.start_date, start_time: a.start_time ?? null, end_date: a.end_date ?? null,
      end_time: a.end_time ?? null, visibility: a.visibility || 'household', title: a.title, location: a.location ?? null,
      notes: a.notes ?? null, preparation: a.preparation ?? null, participant_ids: a.participant_ids ?? [], is_busy: false };
  }
  // Serverrijen plus de toevoegingen die de server (nog) niet teruggaf. Zit een id er wel bij, dan is die
  // toevoeging bevestigd.
  function samenvoegen(lijsten) {
    for (const [id, o] of openstaand) {
      if (lijsten[OPDRACHTEN[o.soort].lijst].some(x => x.id === id)) openstaand.delete(id);
    }
    bewaarOpdrachten();
    const uit = { ...lijsten };
    for (const o of openstaand.values()) {
      const l = OPDRACHTEN[o.soort].lijst;
      uit[l] = [...uit[l].filter(x => x.id !== o.id), voorlopig(o)];
    }
    for (const l of ['boodschappen', 'taken', 'afspraken']) uit[l] = [...uit[l]].sort(SORTEER[l]);
    return uit;
  }
  const lijstenNu = () => ({ boodschappen: toestand.boodschappen, taken: toestand.taken, afspraken: toestand.afspraken });
  const zonderVoorlopig = (lijst, id) => lijst.filter(x => !(x.id === id && (x.wachtend || x.onzeker)));

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
      if (r.error) throw r.error;
      if (!geldig(g)) throw VERVALLEN;
      if (!r.data.length) return rijen;
      rijen.push(...r.data);
      na = r.data[r.data.length - 1].id;
    }
  }

  async function haalOp(g) {
    // 1. Lidmaatschap: nog actief lid van dit huishouden?
    const lid = await supabase.rpc('my_memberships');
    if (lid.error) throw lid.error;
    if (!geldig(g)) throw VERVALLEN;
    const mijn = (lid.data || []).find(m => m.household_id === huishoudenId);
    if (!mijn) return { geenToegang: true };
    // 2. Kanaalnaam en inhoud, alleen dit huishouden, alleen expliciete kolommen, alleen wat RLS
    //    teruggeeft. Pas als alles binnen is, gaat het naar de cache (geen halve vervanging).
    const [kn, b, t, a, l] = await Promise.all([
      supabase.rpc('household_channel', { p_household: huishoudenId }),
      allePaginas(() => supabase.from('shopping_items').select(VELDEN_BOODSCHAP).eq('household_id', huishoudenId).is('deleted_at', null), g),
      allePaginas(() => supabase.from('tasks').select(VELDEN_TAAK).eq('household_id', huishoudenId).is('deleted_at', null), g),
      allePaginas(() => supabase.from('event_overview').select(VELDEN_AFSPRAAK).eq('household_id', huishoudenId).is('deleted_at', null), g),
      allePaginas(() => supabase.from('household_members').select(VELDEN_LID).eq('household_id', huishoudenId), g),
    ]);
    if (kn.error) {
      if (kn.error.code === '42501') return { geenToegang: true };
      throw kn.error;
    }
    if (!geldig(g)) throw VERVALLEN;
    return { lid: mijn, kanaalNaam: kn.data, boodschappen: b, taken: t, afspraken: a, leden: l.sort(SORTEER.leden) };
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
        } catch {
          if (!geldig(g)) return;
          zet({ status: STATUS.OFFLINE });
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
        zet({ lid: r.lid, leden: r.leden, ...lijsten,
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

  // Einde van deze generatie (stoppen of geen toegang): timers en luisteraars weg, alle gegevens en
  // openstaande opdrachten uit het geheugen en de opslag, één laatste melding zonder inhoud. Wat daarna
  // nog binnenkomt, hoort bij een oude generatie en wordt genegeerd.
  function beeindig(status, melding = null) {
    generatie++;
    levend = false;
    clearTimeout(debounce); clearTimeout(herverbinden); clearInterval(vangnet);
    debounce = herverbinden = vangnet = null;
    globalThis.removeEventListener?.('online', opOnline);
    globalThis.removeEventListener?.('offline', opOffline);
    bezig = null; nogmaals = false; kanaalNaam = null;
    bekend.clear();
    wisOpdrachten();
    gebruiker = null;
    toestand = { status, melding, laatstOpgehaald: null, ...leeg() };
    opWijziging(toestand);
    return stopKanaal();
  }

  async function start() {
    if (levend) return;
    generatie++;
    const g = generatie;
    levend = true;
    pogingen = 0;
    toestand = { status: STATUS.LADEN, melding: null, laatstOpgehaald: null, ...leeg() };
    opWijziging(toestand);
    globalThis.addEventListener?.('online', opOnline);
    globalThis.addEventListener?.('offline', opOffline);
    vangnet = setInterval(() => { if (geldig(g)) vernieuw(); }, vangnetMs);
    if (opslag) {
      const s = await supabase.auth.getSession();
      if (!geldig(g)) return;
      gebruiker = s.data?.session?.user?.id || null;
      laadOpdrachten();
    }
    await vernieuw();
    if (geldig(g) && !kanaal) await verbind();
  }

  // Stoppen (uitloggen, ander huishouden kiezen): kanaal weg, alle gegevens uit het geheugen.
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
    if (geenVerbinding()) {
      const melding = { soort: 'offline', tekst: MELDINGEN.offline };
      if (!openstaand.has(o.id)) { zet({ melding }); return { ok: false, melding }; }
      zet({ melding: { soort: 'onzeker', tekst: MELDINGEN.onbevestigd } });
      return { ok: false, onzeker: true, id: o.id, melding: toestand.melding };
    }
    const g = generatie;
    const l = OPDRACHTEN[o.soort].lijst;
    // Eerst vastleggen (ook in de opslag), dan pas versturen: valt het antwoord weg of sluit de app,
    // dan blijft deze UUID bewaard voor opnieuw proberen.
    openstaand.set(o.id, { ...o, onzeker: false });
    bewaarOpdrachten();
    zet({ [l]: [...toestand[l].filter(x => x.id !== o.id), voorlopig(openstaand.get(o.id))].sort(SORTEER[l]) });
    const u = await voerUit(o);
    if (!geldig(g)) return { ok: false, vervallen: true };
    if (u.uitkomst === 'opgeslagen') {
      openstaand.delete(o.id);
      bewaarOpdrachten();
      zet({ melding: null });
      vernieuw();
      return { ok: true, id: o.id, data: u.data };
    }
    if (u.uitkomst === 'onzeker') {
      if (openstaand.has(o.id)) openstaand.set(o.id, { ...o, onzeker: true });
      bewaarOpdrachten();
      const melding = { soort: 'onzeker', tekst: MELDINGEN.onbevestigd };
      if (openstaand.has(o.id)) zet({ [l]: toestand[l].map(x => (x.id === o.id && x.wachtend ? voorlopig(openstaand.get(o.id)) : x)) });
      zet({ melding });
      vernieuw();   // staat het er toch? Dan bevestigt de volgende ronde het.
      return { ok: false, onzeker: true, id: o.id, melding };
    }
    openstaand.delete(o.id);
    bewaarOpdrachten();
    zet({ [l]: zonderVoorlopig(toestand[l], o.id) });
    const melding = meldingVoor(u.fout);
    zet({ melding });
    vernieuw();
    return { ok: false, melding };
  }

  // Dezelfde toevoeging opnieuw (zelfde tekst, nog niet bevestigd) = dezelfde opdracht, dezelfde UUID.
  const zelfdeOpdracht = (soort, tekst) =>
    [...openstaand.values()].find(o => o.soort === soort && tekstSleutel(soort === 'boodschap' ? o.naam : o.titel) === tekstSleutel(tekst));

  // Update met versiecontrole: raakt hij 0 rijen, dan was de versie verouderd (of de rij weg) = conflict.
  async function bijwerkenMetVersie(tabel, id, versie, velden) {
    const r = await supabase.from(tabel).update(velden).eq('id', id).eq('version', versie).select('id');
    if (r.error) return r;
    return r.data.length === 1 ? r : { conflict: true };
  }

  const vervang = (lijst, id, f) => lijst.map(x => (x.id === id ? f(x) : x));
  const terugZetten = (lijst, item, l) => (lijst.some(x => x.id === item.id) ? lijst : [...lijst, item].sort(SORTEER[l]));

  const acties = {
    boodschapToevoegen(naam) {
      const o = zelfdeOpdracht('boodschap', naam) || { soort: 'boodschap', id: nieuweId(), naam };
      return voegToe(o);
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
    taakToevoegen(titel, velden = {}) {
      const o = zelfdeOpdracht('taak', titel) || { soort: 'taak', id: nieuweId(), titel, velden };
      return voegToe(o);
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
    afspraakBewaren(a) {
      if (a.version == null) {
        const id = a.id || nieuweId();
        return voegToe(openstaand.get(id) || { soort: 'afspraak', id, afspraak: { ...a, id } });
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
    // Een niet-bevestigde toevoeging opnieuw versturen: dezelfde opdracht, dezelfde UUID.
    opnieuwProberen(id) {
      const o = openstaand.get(id);
      if (!o) return Promise.resolve({ ok: false });
      return voegToe(o);
    },
    meldingWeg() { zet({ melding: null }); },
  };

  return {
    start, stop, vernieuw, acties,
    verwerkSeintje: opSeintje,   // voor tests: een seintje aanbieden zoals het kanaal dat doet
    get toestand() { return toestand; },
    get statistiek() { return { ...verwerkt }; },
    get openstaand() { return [...openstaand.values()].map(o => ({ soort: o.soort, id: o.id, onzeker: o.onzeker })); },
    get kanaalNaam() { return kanaalNaam; },
  };
}
