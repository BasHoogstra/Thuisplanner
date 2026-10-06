#!/usr/bin/env node
// E5 / NW-09: lokale, geanonimiseerde classificatie van Huisplan-data (docs/identiteit-en-items.md,
// 3.4; docs/ontwerp-1.4.2.md, 6; besluit 9.7).
//
// Leest bestanden die de producteigenaar zelf op een eigen toestel heeft verzameld en rapporteert
// ALLEEN vormen, aantallen en anonieme kenmerken: nooit waarden, teksten, namen, datums of sleutels
// die zelf gegevens zijn (namen, datums). Er gaat niets naar buiten: het script maakt geen
// netwerkverbinding en schrijft alleen het rapport.
//
// Gebruik (het type van elk bestand is altijd expliciet; er wordt niet geraden):
//   node tools/classificeer.js --raw <server.json> --export <backup.json> --cache <cache.json> \
//        [--app index.html] [--out rapport] [--toon-onbekende-namen]
//   --raw     ruwe serverdata: het planner-object zoals Firebase het teruggeeft
//   --export  een export via Instellingen: {app:'huisplan', version:1, data:{…}}
//   --cache   een lokale cache van één toestel: {data, base, t} (base = tekst); geeft twee bronnen
//   --app     de app waarvan normalizeData wordt gebruikt (standaard index.html, de live-versie)
//   --toon-onbekende-namen  toont namen van onbekende velden i.p.v. een hash (alleen lokaal gebruiken;
//             zo'n rapport niet delen)
// Elk type mag vaker voorkomen. Exitcode: 0 = geen blokkades, 1 = blokkades, 2 = invoerfout.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

// ── Specificatie: eerste indeling uit contract 3.4 en de velden uit docs/dataformaat-v1.md ──────
// vorm: 'lijst' | 'datumMap' (sleutel = datum) | 'naamMap' (sleutel = naam/label) | 'object' |
//       'tekst' | 'vlag' | 'getal' | 'waarde' (tekst/getal/vlag)
// item: velden van elk element (bij een lijst of de waarden van een map)
// personen: velden met een persoonsverwijzing (naam), labels: velden met een vrij label
const ITEM_TAAK = { velden: ['id', 'text', 'done', 'category', 'priority', 'assignedTo', 'author', 'orderStatus', 'period', 'reminder', 'reactions', 'movedFrom', 'startDate', 'endDate'], personen: ['assignedTo', 'author', 'reactions'] };
const SPEC = {
  tasks: { cat: 'Zelfstandig item', vorm: 'datumMap', waarde: { vorm: 'lijst', item: ITEM_TAAK } },
  multiDayTasks: { cat: 'Zelfstandig item', vorm: 'lijst', item: ITEM_TAAK },
  recurring: { cat: 'Zelfstandig item', vorm: 'lijst', item: { velden: ['id', 'text', 'interval', 'days', 'everyWeeks', 'anchorDate', 'dayOfMonth', 'koppelgesprek', 'category', 'priority', 'createdAt'] } },
  backlog: { cat: 'Zelfstandig item', vorm: 'lijst', item: { velden: ['id', 'text', 'category', 'priority', 'addedDate'] } },
  inbox: { cat: 'Zelfstandig item', vorm: 'lijst', item: { velden: ['id', 'text', 'addedBy', 'addedAt'], personen: ['addedBy'] } },
  boodschappen: { cat: 'Zelfstandig item', vorm: 'lijst', item: { velden: ['id', 'text', 'done', 'cat', 'winkel', 'addedBy', 'addedDate', 'qty'], personen: ['addedBy'] } },
  lijsten: { cat: 'Zelfstandig item', vorm: 'lijst', item: { velden: ['id', 'naam', 'items'], sub: { items: { vorm: 'lijst', item: { velden: ['id', 'text', 'done', 'addedBy', 'addedDate'], personen: ['addedBy'] } } } } },
  bestellingen: { cat: 'Zelfstandig item', vorm: 'lijst', item: { velden: ['id', 'text', 'status', 'category', 'assignedTo', 'addedDate', 'expectedDate', 'note', 'tracking', 'addedBy'], personen: ['assignedTo', 'addedBy'] } },
  onderhoud: { cat: 'Zelfstandig item', vorm: 'lijst', item: { velden: ['id', 'text', 'lastDone', 'intervalDays', 'intervalLabel', 'category', 'note', 'foto', 'log'], sub: { log: { vorm: 'lijst', cat: 'Onderdeel van een item', item: { velden: ['date', 'note'] } } } } },
  garanties: { cat: 'Zelfstandig item', vorm: 'lijst', item: { velden: ['id', 'text', 'gekocht', 'verloopt', 'winkel', 'serienummer', 'note', 'foto'] } },
  vervaldata: { cat: 'Zelfstandig item', vorm: 'lijst', item: { velden: ['id', 'naam', 'categorie', 'vervaldatum', 'herinnering', 'notitie'] } },
  verjaardagen: { cat: 'Zelfstandig item', vorm: 'lijst', item: { velden: ['id', 'naam', 'datum', 'jaar'], namenGeenLid: ['naam'] } },
  vakanties: { cat: 'Zelfstandig item', vorm: 'lijst', item: { velden: ['id', 'naam', 'startDatum', 'bestemming', 'paklijst', 'todos', 'notes', 'budget', '_tab'], sub: {
    paklijst: { vorm: 'naamMap', cat: 'Onderdeel van een item', sleutelIsLabel: true, waarde: { vorm: 'lijst' } },
    todos: { vorm: 'lijst', cat: 'Onderdeel van een item' },
    budget: { vorm: 'object', cat: 'Onderdeel van een item', velden: ['bedrag', 'uitgaven'], sub: { uitgaven: { vorm: 'lijst', cat: 'Onderdeel van een item', item: { velden: ['desc', 'amount', 'date'] } } } }
  } } },
  notities: { cat: 'Zelfstandig item', vorm: 'lijst', item: { velden: ['id', 'titel', 'tekst', 'editedBy', 'editedAt'], personen: ['editedBy'] } },
  recepten: { cat: 'Zelfstandig item', vorm: 'lijst', item: { velden: ['id', 'naam', 'categorie', 'link', 'notitie', 'ingredienten'] } },
  gewoonten: { cat: 'Zelfstandig item', vorm: 'lijst', item: { velden: ['id', 'text', 'icon', 'createdDate'] } },
  budget: { cat: 'Zelfstandig item', vorm: 'lijst', item: { velden: ['id', 'cat', 'naam', 'instantie', 'periode', 'bedrag', 'bedragNieuw', 'advies'] } },
  recurringDone: { cat: 'Afvinkhistorie en logboek', vorm: 'datumMap', waarde: { vorm: 'lijst' } },
  gewoontenDone: { cat: 'Afvinkhistorie en logboek', vorm: 'datumMap', waarde: { vorm: 'lijst' } },
  huisgeheugen: { cat: 'Afvinkhistorie en logboek', vorm: 'lijst', item: { velden: ['id', 'type', 'tekst', 'datum', 'auteur', 'ts'], personen: ['auteur'] } },
  boodschappenHistory: { cat: 'Afvinkhistorie en logboek', vorm: 'lijst', item: { velden: ['text', 'norm', 'date'] } },
  wieIsWaar: { cat: 'Per persoon of per dag', vorm: 'datumMap', waarde: { vorm: 'naamMap', sleutelIsPersoon: true } },
  verlanglijstjes: { cat: 'Per persoon of per dag', vorm: 'naamMap', sleutelIsPersoon: true, waarde: { vorm: 'lijst', item: { velden: ['id', 'text', 'claimedBy', 'addedAt'], personen: ['claimedBy'] } } },
  maaltijdplan: { cat: 'Per persoon of per dag', vorm: 'datumMap', waarde: { vorm: 'object', velden: ['type', 'receptId', 'naam', 'ingredienten', 'tekst'] } },
  notes: { cat: 'Per persoon of per dag', vorm: 'datumMap', waarde: { vorm: 'tekst' } },
  winkels: { cat: 'Instelling', vorm: 'lijst' },
  winkelsSet: { cat: 'Instelling', vorm: 'vlag' },
  boodCatOverrides: { cat: 'Instelling', vorm: 'naamMap', waarde: { vorm: 'tekst' } },
  vasteBoodschappen: { cat: 'Instelling', vorm: 'lijst', item: { velden: ['id', 'text'] } },
  vakantiePersonen: { cat: 'Instelling', vorm: 'lijst', elementIsLabel: true },
  budgetCustomCats: { cat: 'Instelling', vorm: 'lijst' },
  lijstenSeeded: { cat: 'Instelling', vorm: 'vlag' },
  budgetSeeded: { cat: 'Instelling', vorm: 'vlag' },
  cadeaus: { cat: 'Archief, niet zichtbaar', vorm: 'lijst', item: { velden: ['id', 'text', 'done'] } },
  briefjes: { cat: 'Archief, niet zichtbaar', vorm: 'lijst' },
  notitieboek: { cat: 'Archief, niet zichtbaar', vorm: 'tekst' },
  notitieboekMeta: { cat: 'Archief, niet zichtbaar', vorm: 'object' },
  // Bekend (dataformaat-v1), maar niet in de eerste indeling van contract 3.4: indeling open.
  meta: { cat: null, vorm: 'object', velden: ['schemaVersion', 'migratedTo', 'minAppVersion', 'members'], sub: { members: { vorm: 'object', velden: ['version', 'migratedAt', 'app', 'same', 'different', 'member', 'notMember'] } } },
  members: { cat: null, vorm: 'lijst', item: { velden: ['id', 'name', 'kind', 'color', 'aliases'] } }
};
// Actie per categorie (contract 3.4, punt 4). Alleen wat de documentatie vastlegt; de rest is een
// besluit van de producteigenaar en wordt niet geraden.
const ACTIE = { 'Archief, niet zichtbaar': 'ongemoeid laten (contract 3.4)' };
const ACTIE_OPEN = 'te beslissen (contract 3.4, punt 4)';

// ── App-functies laden (normalizeData), alleen lezen ────────────────────────────────────────────
function laadApp(appPad) {
  const src = fs.readFileSync(appPad, 'utf8');
  const a = src.indexOf('function canonVal('), b = src.indexOf('function mergeData(');
  if (a < 0 || b < 0) throw new Error('normalizeData/canon niet gevonden in ' + appPad);
  const eind = src.indexOf('\n', b);
  const ctx = {};
  vm.createContext(ctx);
  // defaultPersonen() leest in de app de namen van het toestel; hier anoniem en vast.
  vm.runInContext('function defaultPersonen(){return ["<persoon1>","<persoon2>"];}\n' + src.slice(a, eind + 1), ctx);
  if (typeof ctx.normalizeData !== 'function' || typeof ctx.canon !== 'function') throw new Error('normalizeData of canon ontbreekt na laden');
  return ctx;
}

// ── Hulpjes ──────────────────────────────────────────────────────────────────────────────────────
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const typeVan = v => (v === null ? 'null' : Array.isArray(v) ? 'lijst' : typeof v === 'object' ? 'object' : typeof v === 'string' ? 'tekst' : typeof v === 'number' ? 'getal' : typeof v === 'boolean' ? 'vlag' : typeof v);
const hash8 = s => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 8);
// Firebase geeft een lijst met gaten terug als object met numerieke sleutels (P1-11).
const isLijstAlsObject = v => isObj(v) && Object.keys(v).length > 0 && Object.keys(v).every(k => /^(0|[1-9]\d*)$/.test(k));
const isDatum = k => /^\d{4}-\d{2}-\d{2}$/.test(k);
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// ── Kern: één bron doorlopen ─────────────────────────────────────────────────────────────────────
// Een "plek" is een padpatroon zonder gegevens, bv. tasks.<datum>[] of vakanties[].paklijst.<label>[].
function nieuwVeld() {
  return { voorkomens: 0, typen: {}, elementen: 0, elementTypen: {}, metId: 0, zonderId: 0, ids: new Map(), lijstAlsObject: 0,
    sleutels: 0, sleutelsGeenDatum: 0, personen: {}, labels: 0, namenGeenLid: {}, onbekendeVelden: {} };
}
function doorloop(data, opties) {
  const velden = {};   // plek → telling
  const onbekend = {}; // weergavenaam → aantal (bovenste niveau)
  const plek = p => (velden[p] = velden[p] || nieuwVeld());
  function telType(v, p) { const f = plek(p); f.voorkomens++; const t = isLijstAlsObject(v) ? 'object (lijst met gaten)' : typeVan(v); f.typen[t] = (f.typen[t] || 0) + 1; return f; }
  function item(el, p, spec) {
    const f = plek(p);
    f.elementen++;
    const t = typeVan(el); f.elementTypen[t] = (f.elementTypen[t] || 0) + 1;
    if (isObj(el)) {
      if (el.id != null) { f.metId++; const k = typeof el.id + ':' + String(el.id); f.ids.set(k, (f.ids.get(k) || 0) + 1); } else f.zonderId++;
      if (spec && spec.item) velden2(el, p, spec.item);
    }
    if (spec && spec.elementIsLabel && typeof el === 'string' && el.trim()) f.labels++;
  }
  function velden2(obj, p, ispec) {
    const f = plek(p);
    Object.keys(obj).forEach(k => {
      if (ispec.velden && ispec.velden.indexOf(k) < 0) { const n = opties.toonOnbekend ? k : 'onbekend_' + hash8(k); f.onbekendeVelden[n] = (f.onbekendeVelden[n] || 0) + 1; }
    });
    (ispec.personen || []).forEach(k => {
      const v = obj[k];
      if (v == null || v === '') return;
      let n = 0;
      if (typeof v === 'string') n = 1;
      else if (k === 'reactions' && isObj(v)) Object.keys(v).forEach(e => { if (Array.isArray(v[e])) n += v[e].filter(x => typeof x === 'string' && x).length; });
      f.personen[k] = (f.personen[k] || 0) + n;
    });
    (ispec.namenGeenLid || []).forEach(k => { if (typeof obj[k] === 'string' && obj[k]) f.namenGeenLid[k] = (f.namenGeenLid[k] || 0) + 1; });
    const sub = ispec.sub || {};
    Object.keys(sub).forEach(k => { if (obj[k] !== undefined) waarde(obj[k], p + '.' + k, sub[k]); });
  }
  function waarde(v, p, spec) {
    const f = telType(v, p);
    if (!spec) return;
    if (spec.vorm === 'lijst') {
      if (Array.isArray(v)) v.forEach(el => item(el, p + '[]', spec));
      else if (isLijstAlsObject(v)) { f.lijstAlsObject++; Object.keys(v).forEach(k => item(v[k], p + '[]', spec)); }
    } else if (spec.vorm === 'datumMap' || spec.vorm === 'naamMap') {
      if (!isObj(v)) return;
      const sub = p + (spec.vorm === 'datumMap' ? '.<datum>' : spec.sleutelIsLabel ? '.<label>' : spec.sleutelIsPersoon ? '.<naam>' : '.<sleutel>');
      Object.keys(v).forEach(k => {
        f.sleutels++;
        if (spec.vorm === 'datumMap' && !isDatum(k)) f.sleutelsGeenDatum++;
        if (spec.sleutelIsPersoon && k.trim()) f.personen['<sleutel>'] = (f.personen['<sleutel>'] || 0) + 1;
        if (spec.sleutelIsLabel && k.trim()) f.labels++;
        waarde(v[k], sub, spec.waarde || null);
      });
    } else if (spec.vorm === 'object') {
      if (isObj(v)) velden2(v, p, spec);
    }
  }
  if (!isObj(data)) throw new Error('bron is geen object');
  Object.keys(data).forEach(k => {
    if (!SPEC[k]) { const n = opties.toonOnbekend ? k : 'onbekend_' + hash8(k); onbekend[n] = (onbekend[n] || 0) + 1; telType(data[k], '<onbekend>.' + n); return; }
    waarde(data[k], k, SPEC[k]);
  });
  return { velden, onbekend };
}

// Samenvoeggedrag zoals mergeArrays/merge3 in de app (per element op id, als verzameling, of de
// hele lijst "lokaal wint"), afgeleid uit wat deze bron bevat.
function samenvoegen(f, spec) {
  if (!f.elementen) return 'n.v.t. (leeg)';
  const t = Object.keys(f.elementTypen);
  if (t.length === 1 && t[0] === 'object' && f.zonderId === 0) return 'per element (id)';
  if (t.every(x => x !== 'object' && x !== 'lijst')) return 'als verzameling';
  return 'lokaal wint (hele lijst)';
}

// ── Classificeren over alle bronnen ──────────────────────────────────────────────────────────────
// bronnen: [{soort: 'raw'|'export'|'cache.data'|'cache.base', label, data}]
function classificeer(bronnen, opties) {
  opties = opties || {};
  const app = opties.app; // {normalizeData, canon}
  if (!app) throw new Error('app-functies ontbreken (normalizeData)');
  const perBron = [], plekken = {}, blokkades = [], open = [];
  bronnen.forEach((b, i) => {
    const naam = b.label || (b.soort + '#' + (i + 1));
    const ruw = doorloop(b.data, opties);
    const genorm = doorloop(app.normalizeData(clone(b.data)), opties);
    perBron.push({ naam, soort: b.soort, ruw, genorm });
    [['ruw', ruw], ['genormaliseerd', genorm]].forEach(([fase, r]) => Object.keys(r.velden).forEach(p => {
      const x = plekken[p] = plekken[p] || { bronnen: {}, };
      x.bronnen[naam + ' (' + fase + ')'] = r.velden[p];
    }));
  });
  // Spec per plek terugvinden.
  function specVan(p) {
    if (p.startsWith('<onbekend>')) return null;
    const delen = p.split('.');
    let s = SPEC[delen[0].replace(/\[\]$/, '')], cat = s && s.cat;
    for (let i = 1; i < delen.length && s; i++) {
      const d = delen[i].replace(/\[\]$/, '');
      if (/^<.*>$/.test(d)) { s = s.waarde || null; }
      else { const it = s.item || s; s = it.sub && it.sub[d] || null; if (s && s.cat) cat = s.cat; }
      if (s && s.cat) cat = s.cat;
    }
    return s ? { spec: s, cat } : null;
  }
  const rijen = Object.keys(plekken).sort().map(p => {
    const sp = specVan(p.replace(/\[\]$/, '').replace(/\[\]\./g, '.'));
    const isElement = /\[\]$/.test(p);
    const r = { plek: p, cat: null, actie: null, perBron: {} };
    const top = p.split(/[.[]/)[0];
    if (p.startsWith('<onbekend>')) { r.cat = 'onbekend'; r.actie = 'blokkade'; }
    else { r.cat = (sp && sp.cat) || (SPEC[top] && SPEC[top].cat) || null; r.actie = r.cat ? (ACTIE[r.cat] || ACTIE_OPEN) : 'indeling open'; }
    Object.keys(plekken[p].bronnen).sort().forEach(bn => {
      const f = plekken[p].bronnen[bn];
      const o = { voorkomens: f.voorkomens, typen: f.typen };
      if (isElement) {
        const dubbel = [...f.ids.values()].filter(n => n > 1).length;
        Object.assign(o, { elementen: f.elementen, elementTypen: f.elementTypen, metId: f.metId, zonderId: f.zonderId,
          idUniek: f.metId ? dubbel === 0 : null, dubbeleIds: dubbel, gemengd: f.metId > 0 && f.zonderId > 0,
          samenvoegen: samenvoegen(f, sp && sp.spec) });
      }
      if (f.lijstAlsObject) o.lijstAlsObject = f.lijstAlsObject;
      if (f.sleutels) o.sleutels = f.sleutels;
      if (f.sleutelsGeenDatum) o.sleutelsGeenDatum = f.sleutelsGeenDatum;
      if (Object.keys(f.personen).length) o.persoonsverwijzingen = f.personen;
      if (f.labels) o.labels = f.labels;
      if (Object.keys(f.namenGeenLid).length) o.namenGeenLid = f.namenGeenLid;
      if (Object.keys(f.onbekendeVelden).length) o.onbekendeVelden = f.onbekendeVelden;
      r.perBron[bn] = o;
    });
    return r;
  });
  // Blokkades en open punten (contract 3.4, acceptatiecriteria).
  rijen.forEach(r => {
    Object.keys(r.perBron).forEach(bn => {
      const o = r.perBron[bn];
      const waar = r.plek + ' — ' + bn;
      if (r.cat === 'onbekend') blokkades.push(waar + ': onbekend veld');
      if (o.onbekendeVelden) blokkades.push(waar + ': onbekende velden in elementen (' + Object.keys(o.onbekendeVelden).length + ')');
      if (o.gemengd) blokkades.push(waar + ': gemengde lijst (sommige elementen met, sommige zonder id)');
      if (o.dubbeleIds) blokkades.push(waar + ': ' + o.dubbeleIds + ' dubbele id(s)');
      if (o.lijstAlsObject) blokkades.push(waar + ': lijst als object (lijst met gaten; P1-11)');
      if (o.sleutelsGeenDatum) blokkades.push(waar + ': ' + o.sleutelsGeenDatum + ' sleutel(s) die geen datum zijn');
      if (o.persoonsverwijzingen && o.samenvoegen === 'lokaal wint (hele lijst)') blokkades.push(waar + ': persoonsverwijzingen in een lijst die "lokaal wint" samenvoegt; veiligheid van de omzetting niet beschreven');
      const verwacht = specVerwachtType(r.plek);
      if (verwacht) Object.keys(o.typen).forEach(t => { if (!verwacht.includes(t)) blokkades.push(waar + ': vorm ' + t + ', verwacht ' + verwacht.join(' of ')); });
    });
    if (r.actie === 'indeling open') open.push(r.plek + ': bekend veld, niet in de eerste indeling van contract 3.4');
  });
  // Ruw tegenover genormaliseerd: per bron en plek wat normalizeData verandert.
  const verschil = [];
  perBron.forEach(b => {
    const alle = new Set([...Object.keys(b.ruw.velden), ...Object.keys(b.genorm.velden)]);
    [...alle].sort().forEach(p => {
      const r = b.ruw.velden[p], g = b.genorm.velden[p];
      const elR = r ? r.elementen : 0, elG = g ? g.elementen : 0;
      // Elementen eerst: verdwijnen alle elementen, dan bestaat de plek na normaliseren niet meer.
      if (/\[\]$/.test(p) && elR !== elG) {
        verschil.push({ bron: b.naam, plek: p, wat: 'elementen ' + elR + ' → ' + elG + (elG < elR ? ' (GAAT VERLOREN)' : '') });
        if (elG < elR) blokkades.push(p + ' — ' + b.naam + ': normalizeData laat ' + (elR - elG) + ' element(en) vallen (P1-11)');
      } else if (!r && g) verschil.push({ bron: b.naam, plek: p, wat: 'aangevuld door normalizeData' });
      else if (r && !g) verschil.push({ bron: b.naam, plek: p, wat: 'verdwijnt bij normaliseren' });
      else if (r && g && JSON.stringify(r.typen) !== JSON.stringify(g.typen)) verschil.push({ bron: b.naam, plek: p, wat: 'vorm ' + Object.keys(r.typen).join('/') + ' → ' + Object.keys(g.typen).join('/') });
    });
  });
  return {
    versie: 1,
    bronnen: perBron.map(b => ({ naam: b.naam, soort: b.soort })),
    velden: rijen,
    ruwTegenoverGenormaliseerd: verschil,
    blokkades: [...new Set(blokkades)].sort(),
    open: [...new Set(open)].sort(),
    onbekendeVeldnamen: opties.toonOnbekend ? 'getoond (rapport niet delen)' : 'als hash'
  };
}
function specVerwachtType(plek) {
  if (plek.startsWith('<onbekend>') || /\[\]$/.test(plek)) return null;
  const delen = plek.split('.');
  let s = SPEC[delen[0]];
  for (let i = 1; i < delen.length && s; i++) {
    const d = delen[i].replace(/\[\]$/, '');
    if (/^<.*>$/.test(d)) s = s.waarde || null;
    else { const it = s.item || s; s = it.sub && it.sub[d] || null; }
  }
  if (!s || !s.vorm) return null;
  return { lijst: ['lijst'], datumMap: ['object'], naamMap: ['object'], object: ['object'], tekst: ['tekst'], vlag: ['vlag'], getal: ['getal'] }[s.vorm] || null;
}

// ── Invoer lezen (type altijd expliciet) ─────────────────────────────────────────────────────────
function leesBron(soort, bestand) {
  let tekst, json;
  try { tekst = fs.readFileSync(bestand, 'utf8'); } catch (e) { throw new Error('Kan ' + soort + '-bestand niet lezen'); }
  try { json = JSON.parse(tekst); } catch (e) { throw new Error(soort + '-bestand is geen geldige JSON'); }
  const label = soort + ':' + hash8(path.resolve(bestand)); // geen bestandsnaam (kan een naam bevatten)
  if (soort === 'raw') {
    if (!isObj(json)) throw new Error('raw: verwacht een planner-object');
    if (json.app === 'huisplan' && 'data' in json) throw new Error('raw: dit lijkt een export; gebruik --export');
    if ('data' in json && 'base' in json) throw new Error('raw: dit lijkt een cache; gebruik --cache');
    return [{ soort: 'raw', label, data: json }];
  }
  if (soort === 'export') {
    if (!isObj(json) || json.app !== 'huisplan' || json.version !== 1 || !isObj(json.data)) throw new Error('export: verwacht {app:"huisplan", version:1, data:{…}}');
    return [{ soort: 'export', label, data: json.data }];
  }
  if (soort === 'cache') {
    if (!isObj(json) || !isObj(json.data) || !('base' in json)) throw new Error('cache: verwacht {data:{…}, base:"…"}');
    const uit = [{ soort: 'cache.data', label: label + '.data', data: json.data }];
    if (typeof json.base !== 'string') throw new Error('cache: base is geen tekst');
    if (json.base) {
      let b; try { b = JSON.parse(json.base); } catch (e) { throw new Error('cache: base is geen geldige JSON'); }
      if (!isObj(b)) throw new Error('cache: base is geen object');
      uit.push({ soort: 'cache.base', label: label + '.base', data: b });
    }
    return uit;
  }
  throw new Error('onbekend invoertype: ' + soort);
}

// ── Rapport ──────────────────────────────────────────────────────────────────────────────────────
function rapportMd(r) {
  const L = [];
  L.push('# E5-classificatie (geanonimiseerd)', '', 'Alleen vormen en aantallen; geen waarden, namen, datums of sleutels die gegevens zijn.', '');
  L.push('Bronnen: ' + r.bronnen.map(b => '`' + b.naam + '`').join(', '), '');
  L.push('## Blokkades (' + r.blokkades.length + ')', '');
  if (!r.blokkades.length) L.push('Geen.'); else r.blokkades.forEach(b => L.push('- ' + b));
  L.push('', '## Open punten (' + r.open.length + ')', '');
  if (!r.open.length) L.push('Geen.'); else r.open.forEach(b => L.push('- ' + b));
  L.push('', '## Per veld', '', '| Plek | Categorie | Actie | Bron | Vorm | Elementen | Met id | Uniek | Gemengd | Samenvoegen | Personen | Labels |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  r.velden.forEach(v => Object.keys(v.perBron).forEach(bn => {
    const o = v.perBron[bn];
    const pct = o.elementen ? Math.round(100 * o.metId / o.elementen) + '%' : '';
    L.push('| ' + [v.plek, v.cat || '—', v.actie, bn, Object.keys(o.typen).map(t => t + '×' + o.typen[t]).join(', '),
      o.elementen != null ? o.elementen : '', o.elementen ? pct : '', o.idUniek == null ? '' : o.idUniek ? 'ja' : 'NEE', o.gemengd ? 'JA' : (o.elementen ? 'nee' : ''),
      o.samenvoegen || '', o.persoonsverwijzingen ? Object.keys(o.persoonsverwijzingen).map(k => k + '×' + o.persoonsverwijzingen[k]).join(', ') : '', o.labels || ''].join(' | ') + ' |');
  }));
  L.push('', '## Ruw tegenover genormaliseerd', '');
  if (!r.ruwTegenoverGenormaliseerd.length) L.push('Geen verschil.');
  else { L.push('| Bron | Plek | Verschil |', '| --- | --- | --- |'); r.ruwTegenoverGenormaliseerd.forEach(x => L.push('| ' + [x.bron, x.plek, x.wat].join(' | ') + ' |')); }
  L.push('', 'Onbekende veldnamen: ' + r.onbekendeVeldnamen + '.');
  return L.join('\n') + '\n';
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
function main(argv) {
  const bronnen = [];
  let appPad = path.join(__dirname, '..', 'index.html'), out = null, toonOnbekend = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--raw' || a === '--export' || a === '--cache') { const f = argv[++i]; if (!f) throw new Error(a + ' zonder bestand'); bronnen.push(...leesBron(a.slice(2), f)); }
    else if (a === '--app') appPad = argv[++i];
    else if (a === '--out') out = argv[++i];
    else if (a === '--toon-onbekende-namen') toonOnbekend = true;
    else throw new Error('onbekende optie: ' + a);
  }
  if (!bronnen.length) throw new Error('geen bronnen (gebruik --raw, --export en/of --cache)');
  const r = classificeer(bronnen, { app: laadApp(appPad), toonOnbekend });
  const md = rapportMd(r);
  if (out) { fs.writeFileSync(out + '.md', md); fs.writeFileSync(out + '.json', JSON.stringify(r, null, 2) + '\n'); }
  else process.stdout.write(md);
  return r.blokkades.length ? 1 : 0;
}

if (require.main === module) {
  try { process.exit(main(process.argv.slice(2))); }
  catch (e) { process.stderr.write('Fout: ' + e.message + '\n'); process.exit(2); }
}
module.exports = { classificeer, rapportMd, leesBron, laadApp, main, SPEC };
