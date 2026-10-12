// Thuisplanner · synchronisatielaag (KG-5D). Framework-onafhankelijk: werkt in de browser (demo, later de
// React-app) en in node (tests). Zie docs/thuisplanner-sync.md.
//
// Principes (bouwplan: "Herhaling, synchronisatie en realtime"):
//  - Online eerst. De server is de bron; de client houdt alleen een kopie van wat RLS teruggeeft.
//  - Realtime is alleen een seintje ({t, id, v, op}) op het private kanaal household:<id>. Op een seintje
//    haalt de client opnieuw op via de gewone, met RLS beveiligde weg. Er gaat nooit inhoud door realtime.
//  - Na (her)verbinden, na "online" en elke 30 s: volledig opnieuw ophalen. Zo mist de client niets.
//  - Elke ophaalronde controleert eerst het lidmaatschap. Is de toegang weg (vertrek, archiveren,
//    huishouden verwijderd), dan wist de client alle gegevens en stopt het kanaal.
//  - Schrijven met UUID's van de client (geen dubbele toevoegingen) en met versiecontrole (geen
//    verloren wijzigingen). Een conflict wordt gemeld en de actuele stand opgehaald.
//  - Geen inhoud in logboeken of meldingen: meldingen zijn vaste Nederlandse teksten per foutcode.

const VELDEN_BOODSCHAP = 'id,household_id,name,checked_at,version,created_at,updated_at';
const VELDEN_TAAK = 'id,household_id,title,due_date,assignee_member_id,done_on,done_by_member_id,version,created_at,updated_at';
const VELDEN_LID = 'id,household_id,display_name,kind,role,status,color,has_account';
const VELDEN_AFSPRAAK = 'id,household_id,owner_member_id,visibility,start_date,start_time,end_date,end_time,recurrence_freq,' +
  'recurrence_until,series_id,original_date,version,is_busy,title,location,notes,preparation,participant_ids';

export const STATUS = {
  LADEN: 'laden', VERBONDEN: 'verbonden', SYNCHRONISEREN: 'synchroniseren', OFFLINE: 'offline',
  GEEN_TOEGANG: 'geen-toegang', GESTOPT: 'gestopt',
};

const MELDINGEN = {
  conflict: 'Iemand anders heeft dit net aangepast. De nieuwste versie staat nu op je scherm.',
  offline: 'Geen verbinding: je wijziging is niet opgeslagen.',
  toegang: 'Je hebt geen toegang (meer) tot dit huishouden.',
  dubbel: 'Dat staat er al.',
  ongeldig: 'Dat kan niet: controleer wat je hebt ingevuld.',
  fout: 'Er ging iets mis. Probeer het opnieuw.',
};

// Vertaalt een fout naar een vaste melding. Nooit de ruwe tekst of details tonen of loggen.
export function meldingVoor(fout) {
  if (!fout) return null;
  const code = fout.code || '';
  if (code === 'PT409' || fout.status === 409) return { soort: 'conflict', tekst: MELDINGEN.conflict };
  if (code === 'P0002' || code === '42501' || fout.status === 401 || fout.status === 403) return { soort: 'toegang', tekst: MELDINGEN.toegang };
  if (code === '23505') return { soort: 'dubbel', tekst: MELDINGEN.dubbel };
  if (code === '23514' || code === '22023' || code === '22P02') return { soort: 'ongeldig', tekst: MELDINGEN.ongeldig };
  if (fout.offline || /fetch|network|Failed to fetch/i.test(fout.message || '')) return { soort: 'offline', tekst: MELDINGEN.offline };
  return { soort: 'fout', tekst: MELDINGEN.fout };
}

const leeg = () => ({ lid: null, leden: [], boodschappen: [], taken: [], afspraken: [] });
const nieuweId = () => globalThis.crypto.randomUUID();

/**
 * @param {object} o
 * @param {import('@supabase/supabase-js').SupabaseClient} o.supabase  client met de sessie van de gebruiker (nooit service-role)
 * @param {string} o.huishoudenId
 * @param {(toestand: object) => void} [o.opWijziging]  wordt na elke verandering aangeroepen
 * @param {number} [o.vangnetMs]  periodiek volledig ophalen (standaard 30 s)
 * @param {(soort: string, status: string) => void} [o.spoor]  optioneel: kanaalstatus volgen (geen inhoud)
 */
export function maakSync({ supabase, huishoudenId, opWijziging = () => {}, vangnetMs = 30000, debounceMs = 150, spoor = () => {} }) {
  let toestand = { status: STATUS.LADEN, melding: null, laatstOpgehaald: null, ...leeg() };
  let kanaal = null;
  let gestopt = false;
  let bezig = null;          // lopende ophaalronde (promise)
  let nogmaals = false;      // tijdens een ronde kwam er een nieuw seintje binnen
  let debounce = null;
  let vangnet = null;
  let herverbinden = null;
  let pogingen = 0;
  const bekend = new Map();  // `${t}:${id}` -> versie die we al hebben (dubbele seintjes negeren)
  const verwerkt = { seintjes: 0, genegeerd: 0, rondes: 0 };

  const zet = (delta) => { toestand = { ...toestand, ...delta }; opWijziging(toestand); };
  const wis = (status, melding = null) => { bekend.clear(); zet({ status, melding, ...leeg() }); };

  async function haalOp() {
    // 1. Lidmaatschap: nog actief lid van dit huishouden?
    const lid = await supabase.rpc('my_memberships');
    if (lid.error) throw lid.error;
    const mijn = (lid.data || []).find(m => m.household_id === huishoudenId);
    if (!mijn) return { geenToegang: true };
    // 2. Inhoud, alleen dit huishouden, alleen expliciete kolommen, alleen wat RLS teruggeeft.
    const [b, t, a, l] = await Promise.all([
      supabase.from('shopping_items').select(VELDEN_BOODSCHAP).eq('household_id', huishoudenId).is('deleted_at', null).order('created_at').order('id'),
      supabase.from('tasks').select(VELDEN_TAAK).eq('household_id', huishoudenId).is('deleted_at', null).order('created_at').order('id'),
      supabase.from('event_overview').select(VELDEN_AFSPRAAK).eq('household_id', huishoudenId).is('deleted_at', null).order('start_date').order('start_time'),
      supabase.from('household_members').select(VELDEN_LID).eq('household_id', huishoudenId).order('sort').order('created_at'),
    ]);
    for (const r of [b, t, a, l]) if (r.error) throw r.error;
    return { lid: mijn, boodschappen: b.data, taken: t.data, afspraken: a.data, leden: l.data };
  }

  // Eén ophaalronde tegelijk; seintjes tijdens een ronde leiden tot precies één extra ronde.
  async function vernieuw() {
    if (gestopt) return;
    if (bezig) { nogmaals = true; return bezig; }
    bezig = (async () => {
      do {
        nogmaals = false;
        verwerkt.rondes++;
        if (toestand.status !== STATUS.OFFLINE) zet({ status: toestand.lid ? STATUS.SYNCHRONISEREN : STATUS.LADEN });
        try {
          const r = await haalOp();
          if (gestopt) return;
          if (r.geenToegang) { await stopKanaal(); wis(STATUS.GEEN_TOEGANG, { soort: 'toegang', tekst: MELDINGEN.toegang }); return; }
          bekend.clear();
          for (const x of r.boodschappen) bekend.set(`shopping_items:${x.id}`, x.version);
          for (const x of r.taken) bekend.set(`tasks:${x.id}`, x.version);
          for (const x of r.afspraken) bekend.set(`events:${x.id}`, x.version);
          // Verbonden = gegevens actueel én het kanaal luistert. Kanaal nog niet open: bij de eerste ronde
          // nog "laden", daarna "offline" (er komen dan geen seintjes binnen).
          zet({ ...r, status: kanaalOpen() ? STATUS.VERBONDEN : (kanaal ? STATUS.OFFLINE : STATUS.LADEN),
                laatstOpgehaald: new Date().toISOString() });
        } catch (e) {
          if (gestopt) return;
          zet({ status: STATUS.OFFLINE });
          planHerverbinden();
          return;
        }
      } while (nogmaals && !gestopt);
    })().finally(() => { bezig = null; });
    return bezig;
  }

  // Seintje: alleen {t, id, v, op}. Al bekend (zelfde of nieuwere versie)? Dan niets doen.
  function opSeintje(bericht) {
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
    if (gestopt || herverbinden) return;
    const wacht = Math.min(30000, 1000 * 2 ** Math.min(pogingen++, 5));
    herverbinden = setTimeout(() => { herverbinden = null; verbind(); }, wacht);
  }

  async function verbind() {
    if (gestopt) return;
    await stopKanaal();
    if (gestopt) return;
    await supabase.realtime.setAuth();   // het actuele toegangstoken voor private kanalen
    // Na een verbroken (of handmatig gesloten) socket verbindt realtime-js niet altijd zelf opnieuw, en
    // connect() doet niets zolang er nog een mislukte verbinding bestaat: dan eerst opruimen.
    if (!supabase.realtime.isConnected()) {
      supabase.realtime.disconnect();
      supabase.realtime.connect();
    }
    const k = supabase.channel(`household:${huishoudenId}`, { config: { private: true } })
      .on('broadcast', { event: 'wijziging' }, opSeintje);
    kanaal = k;
    k.subscribe((status) => {
      spoor('kanaal', status);   // alleen de status, nooit inhoud
      if (gestopt || kanaal !== k) return;
      if (status === 'SUBSCRIBED') {
        pogingen = 0;
        vernieuw();   // na (her)verbinden altijd volledig ophalen: niets gemist
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Geweigerd of verbroken. Ophalen beslist of het toegang is (geen-toegang) of netwerk (offline).
        zet({ status: STATUS.OFFLINE });
        vernieuw();
        planHerverbinden();
      }
    });
  }

  const opOnline = () => { pogingen = 0; verbind(); };
  const opOffline = () => zet({ status: STATUS.OFFLINE });

  async function start() {
    gestopt = false;
    zet({ status: STATUS.LADEN });
    globalThis.addEventListener?.('online', opOnline);
    globalThis.addEventListener?.('offline', opOffline);
    vangnet = setInterval(() => { if (toestand.status !== STATUS.GEEN_TOEGANG) vernieuw(); }, vangnetMs);
    await vernieuw();
    if (toestand.status !== STATUS.GEEN_TOEGANG) await verbind();
  }

  // Stoppen (uitloggen, ander huishouden kiezen): kanaal weg, alle gegevens uit het geheugen.
  function stop() {
    gestopt = true;
    clearTimeout(debounce); clearTimeout(herverbinden); clearInterval(vangnet);
    globalThis.removeEventListener?.('online', opOnline);
    globalThis.removeEventListener?.('offline', opOffline);
    wis(STATUS.GESTOPT);
    return stopKanaal();
  }

  // ---- schrijven ---------------------------------------------------------------------------
  async function schrijf(uitvoeren, { optimistisch, terugdraaien } = {}) {
    if (toestand.status === STATUS.GEEN_TOEGANG || gestopt) return { ok: false, melding: { soort: 'toegang', tekst: MELDINGEN.toegang } };
    const vorige = toestand;
    if (optimistisch) zet(optimistisch(toestand));
    let r;
    try { r = await uitvoeren(); } catch (e) { r = { error: { offline: true, message: String(e?.message || e) } }; }
    if (r.error || r.conflict) {
      if (terugdraaien !== false) zet({ boodschappen: vorige.boodschappen, taken: vorige.taken, afspraken: vorige.afspraken });
      const melding = r.conflict ? { soort: 'conflict', tekst: MELDINGEN.conflict } : meldingVoor(r.error);
      zet({ melding });
      vernieuw();
      return { ok: false, melding };
    }
    zet({ melding: null });
    vernieuw();
    return { ok: true, data: r.data };
  }

  // Update met versiecontrole: raakt hij 0 rijen, dan was de versie verouderd (of de rij weg) = conflict.
  async function bijwerkenMetVersie(tabel, id, versie, velden) {
    const r = await supabase.from(tabel).update(velden).eq('id', id).eq('version', versie).select('id');
    if (r.error) return r;
    return r.data.length === 1 ? r : { conflict: true };
  }

  const vervang = (lijst, id, f) => lijst.map(x => (x.id === id ? f(x) : x));

  const acties = {
    boodschapToevoegen(naam) {
      const id = nieuweId();
      return schrijf(() => supabase.rpc('add_shopping_items', { p_household: huishoudenId, p_ids: [id], p_names: [naam] }), {
        optimistisch: t => ({ boodschappen: [...t.boodschappen, { id, name: naam.trim(), checked_at: null, version: 0, wachtend: true }] }),
      });
    },
    boodschapAfvinken(item) {
      const checked_at = item.checked_at ? null : new Date().toISOString();
      return schrijf(() => bijwerkenMetVersie('shopping_items', item.id, item.version, { checked_at }), {
        optimistisch: t => ({ boodschappen: vervang(t.boodschappen, item.id, x => ({ ...x, checked_at, wachtend: true })) }),
      });
    },
    boodschapHernoemen(item, naam, versie = item.version) {
      return schrijf(() => bijwerkenMetVersie('shopping_items', item.id, versie, { name: naam }), {
        optimistisch: t => ({ boodschappen: vervang(t.boodschappen, item.id, x => ({ ...x, name: naam, wachtend: true })) }),
      });
    },
    boodschapVerwijderen(item) {
      return schrijf(() => bijwerkenMetVersie('shopping_items', item.id, item.version, { deleted_at: new Date().toISOString() }), {
        optimistisch: t => ({ boodschappen: t.boodschappen.filter(x => x.id !== item.id) }),
      });
    },
    taakToevoegen(titel, velden = {}) {
      const id = nieuweId();
      return schrijf(() => supabase.from('tasks').insert({ id, household_id: huishoudenId, title: titel, ...velden }).select('id'), {
        optimistisch: t => ({ taken: [...t.taken, { id, title: titel, ...velden, version: 0, wachtend: true }] }),
      });
    },
    taakAfvinken(taak) {
      const done_on = taak.done_on ? null : new Date().toISOString().slice(0, 10);
      const done_by_member_id = done_on ? toestand.lid?.member_id ?? null : null;
      return schrijf(() => bijwerkenMetVersie('tasks', taak.id, taak.version, { done_on, done_by_member_id }), {
        optimistisch: t => ({ taken: vervang(t.taken, taak.id, x => ({ ...x, done_on, wachtend: true })) }),
      });
    },
    taakVerwijderen(taak) {
      return schrijf(() => bijwerkenMetVersie('tasks', taak.id, taak.version, { deleted_at: new Date().toISOString() }), {
        optimistisch: t => ({ taken: t.taken.filter(x => x.id !== taak.id) }),
      });
    },
    // Afspraak maken (zonder versie) of bijwerken (met de versie waarmee de gebruiker begon).
    afspraakBewaren(a) {
      const id = a.id || nieuweId();
      return schrijf(() => supabase.rpc('save_event', {
        p_household: huishoudenId, p_id: id, p_version: a.version ?? null, p_start_date: a.start_date,
        p_start_time: a.start_time ?? null, p_end_date: a.end_date ?? null, p_end_time: a.end_time ?? null,
        p_visibility: a.visibility || 'household', p_title: a.title, p_location: a.location ?? null, p_notes: a.notes ?? null,
        p_preparation: a.preparation ?? null, p_participants: a.participant_ids ?? null,
        p_recurrence_freq: a.recurrence_freq ?? null, p_recurrence_until: a.recurrence_until ?? null,
      }));
    },
    afspraakVerwijderen(a) {
      return schrijf(() => supabase.rpc('delete_event', { p_id: a.id, p_version: a.version }));
    },
    meldingWeg() { zet({ melding: null }); },
  };

  return {
    start, stop, vernieuw, acties,
    verwerkSeintje: opSeintje,   // voor tests: een seintje aanbieden zoals het kanaal dat doet
    get toestand() { return toestand; },
    get statistiek() { return { ...verwerkt }; },
  };
}
