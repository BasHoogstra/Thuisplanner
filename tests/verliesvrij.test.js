// 1.4.2, E2 — tweede Codex-herreview PR #15, punt 3: automatisch verder na een onbekende uitkomst
// alleen als de samenvoeging aantoonbaar verliesvrij is. Pure functies uit test/index.html, los in Node.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { assert } = require('./lib');

const APP = path.join(__dirname, '..', 'test', 'index.html');
let _c = null;
function app() {
  if (_c) return _c;
  const src = fs.readFileSync(APP, 'utf8');
  const a = src.indexOf('function canonVal('), b0 = src.indexOf('function describeChanges(');
  assert(a > -1 && b0 > a, 'Hulpfuncties niet gevonden');
  const b = src.indexOf('\n}\n', b0) + 3;
  _c = {};
  vm.createContext(_c);
  vm.runInContext('function defaultPersonen(){return ["A","B"];}\n' + src.slice(a, b), _c);
  return _c;
}
const C = new Proxy({}, { get: (t, k) => app()[k] });
const j = x => JSON.parse(JSON.stringify(x));
const plain = x => JSON.parse(JSON.stringify(x));
// Verliesvrij-controle zoals de coördinator die doet: alle standen eerst genormaliseerd.
function lv(b, l, r) { const n = x => C.normalizeData(j(x)); const B = n(b), L = n(l), R = n(r); return C.losslessMerge(B, L, R, C.mergeData(j(B), j(L), j(R))); }
// Zoals de coördinator het beslist: beide hypothesen gelijk EN onder beide verliesvrij EN niets
// verloren bij normaliseren.
function automatisch(sent, oldBase, local, remote) {
  const n = x => C.normalizeData(j(x));
  const S = n(sent), O = n(oldBase), L = n(local), R = n(remote);
  const h1 = C.mergeData(j(S), j(L), j(R)), h2 = C.mergeData(j(O), j(L), j(R));
  return { gelijk: C.canon(h1) === C.canon(h2), veilig: C.canon(h1) === C.canon(h2) && !C.normalizeLoses(remote) && C.losslessMerge(S, L, R, h1) && C.losslessMerge(O, L, R, h2), h1: plain(h1), h2: plain(h2) };
}

module.exports = {
  async 'Verliesvrij: lijst zonder id — gelijke hypothesen maar verlies aan de serverkant = NIET automatisch'() {
    // Onze PUT raakte boodschappenHistory niet (sent = oldBase daar); daarna lokaal +Y, op de server +Z.
    const oud = { boodschappenHistory: [{ text: 'X', norm: 'x', date: '2026-10-01' }] };
    const sent = j(oud), local = { boodschappenHistory: oud.boodschappenHistory.concat([{ text: 'Y', norm: 'y', date: '2026-10-02' }]) };
    const remote = { boodschappenHistory: oud.boodschappenHistory.concat([{ text: 'Z', norm: 'z', date: '2026-10-02' }]) };
    const r = automatisch(sent, oud, local, remote);
    assert(r.gelijk, 'Testopzet: de hypothesen zouden gelijk moeten zijn (zo zag de vorige regel het als veilig)');
    assert(!r.h1.boodschappenHistory.some(h => h.norm === 'z'), 'Testopzet: "lokaal wint" zou Z moeten laten vallen');
    assert(!r.veilig, 'Automatisch geaccepteerd terwijl de wijziging van de server verloren gaat');
  },

  async 'Verliesvrij: geneste gegevens — verschillende velden veilig, hetzelfde veld verschillend niet'() {
    const oud = { vakanties: [{ id: 'v', budget: { bedrag: 100, uitgaven: [{ desc: 'a', amount: 1 }] }, naam: 'Reis' }] };
    const lokaal = j(oud); lokaal.vakanties[0].naam = 'Reis 2';
    const server = j(oud); server.vakanties[0].budget.bedrag = 200;
    assert(automatisch(oud, oud, lokaal, server).veilig, 'Verschillende geneste velden: zou veilig moeten zijn');
    const server2 = j(oud); server2.vakanties[0].naam = 'Andere reis';
    assert(!automatisch(oud, oud, lokaal, server2).veilig, 'Hetzelfde geneste veld verschillend gewijzigd: niet veilig');
    // Geneste lijst zonder id (uitgaven): aan beide kanten veranderd = niet veilig.
    const l3 = j(oud); l3.vakanties[0].budget.uitgaven.push({ desc: 'b', amount: 2 });
    const s3 = j(oud); s3.vakanties[0].budget.uitgaven.push({ desc: 'c', amount: 3 });
    assert(!automatisch(oud, oud, l3, s3).veilig, 'Geneste lijst zonder id aan beide kanten veranderd: niet veilig');
  },

  async 'Verliesvrij: lokale bewerking + verwijdering op de server (en omgekeerd) = niet veilig'() {
    const oud = { boodschappen: [{ id: 'a', text: 'Melk', done: false }, { id: 'b', text: 'Brood', done: false }] };
    const lokaalBewerkt = j(oud); lokaalBewerkt.boodschappen[0].done = true;
    const serverVerwijderd = { boodschappen: [oud.boodschappen[1]] };
    assert(!lv(oud, lokaalBewerkt, serverVerwijderd), 'Bewerkt hier, verwijderd daar: niet verliesvrij');
    const lokaalVerwijderd = { boodschappen: [oud.boodschappen[1]] };
    const serverBewerkt = j(oud); serverBewerkt.boodschappen[0].text = 'Halfvolle melk';
    assert(!lv(oud, lokaalVerwijderd, serverBewerkt), 'Verwijderd hier, bewerkt daar: niet verliesvrij');
  },

  async 'Verliesvrij: veilige gevallen blijven automatisch (andere items, gelijke wijziging, één kant)'() {
    const oud = { boodschappen: [{ id: 'a', text: 'Melk' }, { id: 'b', text: 'Brood' }], winkels: ['AH'] };
    // Lokaal verwijderd a, server bewerkt b.
    const l = { boodschappen: [oud.boodschappen[1]], winkels: ['AH'] };
    const s = j(oud); s.boodschappen[1].text = 'Bruin brood';
    assert(lv(oud, l, s), 'Verschillende items: zou verliesvrij moeten zijn');
    // Beide hetzelfde gedaan.
    assert(lv(oud, l, l), 'Gelijke wijziging aan beide kanten');
    // Tekstlijst alleen aan één kant veranderd.
    const l2 = j(oud); l2.winkels = ['AH', 'Jumbo'];
    assert(lv(oud, l2, oud), 'Tekstlijst aan één kant: zou verliesvrij moeten zijn');
  },

  // ── Derde Codex-review, punt 7: structurele twijfel = conservatief ────────────────────────────
  async 'Verliesvrij: tekstlijst aan beide kanten veranderd = niet automatisch (volgorde/dubbelen tellen)'() {
    const oud = { winkels: ['AH', 'Lidl'] };
    // Vroeger als verzameling gezien (lokaal +Jumbo, server -AH = verliesvrij); nu als geheel.
    assert(!lv(oud, { winkels: ['AH', 'Lidl', 'Jumbo'] }, { winkels: ['Lidl'] }), 'Tekstlijst aan beide kanten veranderd toch verliesvrij');
    // Alleen de volgorde (bv. een rangorde) aan beide kanten anders.
    assert(!lv(oud, { winkels: ['Lidl', 'AH'] }, { winkels: ['AH', 'Lidl', 'AH'] }), 'Volgorde/dubbele waarde genegeerd');
    const f = plain(C.flattenPaths({ winkels: ['AH', 'AH'] }));
    assert(f['.winkels'] === '["AH","AH"]', 'Dubbele waarde niet bewaard in de vergelijking: ' + JSON.stringify(f));
  },

  async 'Verliesvrij: typewisseling (object ↔ lijst ↔ waarde) telt altijd als wijziging'() {
    const oud = { notitieboekMeta: { a: 1 }, extra: { x: { y: 1 } } };
    const lokaal = j(oud); lokaal.extra.x = [1, 2];         // object → lijst
    const server = j(oud); server.extra.x = { y: 1, z: 2 }; // object uitgebreid
    assert(!lv(oud, lokaal, server), 'Typewisseling tegen een wijziging in: toch verliesvrij');
    const f1 = plain(C.flattenPaths({ extra: { x: { y: 1 } } })), f2 = plain(C.flattenPaths({ extra: { x: [1] } })), f3 = plain(C.flattenPaths({ extra: { x: 'tekst' } }));
    assert(f1['.extra.x#t'] === 'o' && f2['.extra.x#t'] === 'a' && f3['.extra.x#t'] === undefined && f3['.extra.x'] === '"tekst"', 'Typemarkering ontbreekt: ' + JSON.stringify([f1, f2, f3]));
    // Een typewisseling aan één kant blijft gewoon verliesvrij.
    assert(lv(oud, lokaal, oud), 'Typewisseling aan één kant onterecht als verlies');
  },

  async 'Verliesvrij: volgorde in een lijst met id\'s — aan beide kanten anders = niet automatisch'() {
    const a = { id: 'a', text: 'A' }, b = { id: 'b', text: 'B' }, c = { id: 'c', text: 'C' };
    const oud = { backlog: [a, b, c] };
    assert(!lv(oud, { backlog: [b, a, c] }, { backlog: [a, c, b] }), 'Twee verschillende herordeningen toch verliesvrij');
    // Herordening alleen op de server en lokaal niets: de serverstand wordt overgenomen, verliesvrij.
    assert(lv(oud, oud, { backlog: [c, b, a] }), 'Alleen herordening op de server onterecht als verlies');
    // Herordening op de server + lokaal een item erbij: de samenvoeging houdt de lokale volgorde aan,
    // dus gaat de herordening verloren: niet verliesvrij.
    const m = C.mergeData(j(oud), j({ backlog: [a, b, c, { id: 'd' }] }), j({ backlog: [c, b, a] }));
    assert(!C.losslessMerge(C.normalizeData(j(oud)), C.normalizeData(j({ backlog: [a, b, c, { id: 'd' }] })), C.normalizeData(j({ backlog: [c, b, a] })), m), 'Herordening van de server verloren maar toch verliesvrij');
    // Toevoegen aan beide kanten (andere items, gemeenschappelijke volgorde gelijk) blijft verliesvrij.
    assert(lv(oud, { backlog: [a, b, c, { id: 'd' }] }, { backlog: [a, b, c, { id: 'e' }] }), 'Toevoegen aan beide kanten onterecht als verlies');
  },

  // ── Vierde Codex-review, I1: volgorde van nieuw toegevoegde id-items ─────────────────────────
  async 'Volgorde (I1): Codex-repro basis [a,b], lokaal [a,b,c], server [d,a,b] → [a,b,c,d] is NIET verliesvrij'() {
    const L = ids => ({ backlog: ids.map(id => ({ id, text: id })) });
    const m = C.mergeData(j(L(['a', 'b'])), j(L(['a', 'b', 'c'])), j(L(['d', 'a', 'b'])));
    assert(JSON.stringify(m.backlog.map(x => x.id)) === '["a","b","c","d"]', 'Testopzet: samenvoeging ' + JSON.stringify(m.backlog.map(x => x.id)));
    const n = x => C.normalizeData(j(x));
    assert(!C.losslessMerge(n(L(['a', 'b'])), n(L(['a', 'b', 'c'])), n(L(['d', 'a', 'b'])), m), 'Positie van d (vóór a) verloren maar toch verliesvrij');
    assert(C.losslessMerge(L(['a', 'b']), L(['a', 'b', 'c']), L(['d', 'a', 'b']), L(['d', 'a', 'b', 'c'])), 'Een volgorde die alles respecteert wordt afgekeurd');
  },

  async 'Volgorde (I1): prepend, append, invoegen, beide kanten nieuw, herordenen + toevoegen'() {
    const L = ids => ({ backlog: ids.map(id => ({ id, text: id })) });
    const n = x => C.normalizeData(j(x));
    const geval = (b, l, r) => { const m = C.mergeData(n(L(b)), n(L(l)), n(L(r))); return { m: m.backlog.map(x => x.id), lv: C.losslessMerge(n(L(b)), n(L(l)), n(L(r)), m) }; };
    // Alleen aan één kant: de samenvoeging neemt die kant over → verliesvrij.
    assert(geval(['a', 'b'], ['c', 'a', 'b'], ['a', 'b']).lv, 'Prepend aan één kant onterecht afgekeurd');
    assert(geval(['a', 'b'], ['a', 'b'], ['a', 'b', 'd']).lv, 'Append aan één kant onterecht afgekeurd');
    assert(geval(['a', 'b'], ['a', 'c', 'b'], ['a', 'b']).lv, 'Invoegen aan één kant onterecht afgekeurd');
    // Append aan beide kanten: geen tegenstrijdige positie → verliesvrij.
    assert(geval(['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'd']).lv, 'Append aan beide kanten onterecht afgekeurd');
    // Prepend aan beide kanten / server prepend + lokaal append: de positie van de server gaat verloren.
    const pp = geval(['a', 'b'], ['c', 'a', 'b'], ['d', 'a', 'b']);
    assert(!pp.lv, 'Prepend aan beide kanten (' + pp.m + ') toch verliesvrij');
    assert(!geval(['a', 'b'], ['a', 'b', 'c'], ['d', 'a', 'b']).lv, 'Server prepend + lokaal append toch verliesvrij');
    // Invoegen tussen bestaande items aan beide kanten.
    const ins = geval(['a', 'b'], ['a', 'c', 'b'], ['a', 'd', 'b']);
    assert(!ins.lv, 'Invoegen aan beide kanten (' + ins.m + ') toch verliesvrij');
    // Server herordent, lokaal voegt toe.
    assert(!geval(['a', 'b', 'c'], ['a', 'b', 'c', 'x'], ['c', 'a', 'b']).lv, 'Herordenen + toevoegen toch verliesvrij');
    // Beide kanten herordenen verschillend.
    assert(!geval(['a', 'b', 'c'], ['b', 'a', 'c'], ['a', 'c', 'b']).lv, 'Twee herordeningen toch verliesvrij');
    // Verwijderen aan de ene kant zegt niets over de volgorde.
    assert(geval(['a', 'b', 'c'], ['a', 'c'], ['a', 'b', 'c', 'd']).lv, 'Verwijderen + append onterecht afgekeurd');
  },

  async 'Volgorde (I1): dubbele id\'s, gemengde en geneste lijsten blijven conservatief'() {
    // Dubbele id's: als geheel; aan beide kanten veranderd = niet verliesvrij.
    const dup = { backlog: [{ id: 'a' }, { id: 'a' }] };
    assert(!lv(dup, { backlog: [{ id: 'a' }, { id: 'a' }, { id: 'b' }] }, { backlog: [{ id: 'c' }, { id: 'a' }, { id: 'a' }] }), 'Dubbele id\'s aan beide kanten toch verliesvrij');
    // Gemengd (een element zonder id): als geheel.
    const mix = { backlog: [{ id: 'a' }, { text: 'los' }] };
    assert(!lv(mix, { backlog: [{ id: 'a' }, { text: 'los' }, { id: 'b' }] }, { backlog: [{ id: 'c' }, { id: 'a' }, { text: 'los' }] }), 'Gemengde lijst aan beide kanten toch verliesvrij');
    // Geneste id-lijst (paklijst in een vakantie): dezelfde volgorderegel.
    const V = ids => ({ vakanties: [{ id: 'v', paklijst: { Bas: ids.map(id => ({ id, text: id })) } }] });
    const m = C.mergeData(C.normalizeData(j(V(['a', 'b']))), C.normalizeData(j(V(['a', 'b', 'c']))), C.normalizeData(j(V(['d', 'a', 'b']))));
    const n = x => C.normalizeData(j(x));
    assert(!C.losslessMerge(n(V(['a', 'b'])), n(V(['a', 'b', 'c'])), n(V(['d', 'a', 'b'])), m), 'Geneste id-lijst: positie van de server verloren maar verliesvrij');
  },

  async 'Verliesvrij: gemengde en geneste lijsten zonder id als geheel; toestemming geldt niet voor hele lijsten'() {
    const oud = { vakanties: [{ id: 'v', budget: { uitgaven: [{ desc: 'a', amount: 1 }] }, tags: ['x', { y: 1 }] }] };
    const l = j(oud); l.vakanties[0].tags.push('z');
    const s = j(oud); s.vakanties[0].tags.push('w');
    assert(!lv(oud, l, s), 'Gemengde lijst aan beide kanten veranderd: toch verliesvrij');
    // Toestemming ("opnieuw toepassen") geldt voor losse waarden, niet voor een hele lijst zonder id.
    const sent = { boodschappenHistory: [{ text: 'Melk', norm: 'melk' }], notitieboek: 'van mij' };
    const cp = plain(C.changedPaths({}, sent));
    assert(cp['.notitieboek'] === 1 && !cp['.boodschappenHistory'] && !Object.keys(cp).some(k => /#t$/.test(k)), 'Toestemmingspaden: ' + JSON.stringify(cp));
    const B = {}, L = j(sent), R = { boodschappenHistory: [{ text: 'Brood', norm: 'brood' }], notitieboek: 'van een ander' };
    const X = { boodschappenHistory: L.boodschappenHistory, notitieboek: 'van mij' };
    assert(!C.losslessMerge(B, L, R, X, C.changedPaths(B, sent)), 'Toestemming liet de geschiedenis van een ander vallen');
    const R2 = { notitieboek: 'van een ander' }, X2 = { boodschappenHistory: L.boodschappenHistory, notitieboek: 'van mij' };
    assert(C.losslessMerge(B, L, R2, X2, C.changedPaths(B, sent)), 'Toestemming voor een losse waarde werkt niet');
  },

  async 'Verliesvrij: verloren bevestiging + ander toestel voegt iets toe = automatisch; + verwijdert ons item = niet'() {
    const oud = { boodschappen: [{ id: 'a', text: 'Melk' }] };
    const sent = { boodschappen: oud.boodschappen.concat([{ id: 'x', text: 'Nieuw' }]) };
    const local = j(sent);
    const serverPlus = { boodschappen: sent.boodschappen.concat([{ id: 'y', text: 'Van B' }]) };
    assert(automatisch(sent, oud, local, serverPlus).veilig, 'Verwerkt + toevoeging elders: zou automatisch moeten kunnen');
    assert(!automatisch(sent, oud, local, j(oud)).veilig, 'Ons item weg op de server (verwijderd of nooit aangekomen): niet automatisch');
  },

  async 'Verliesvrij: lijsten met dubbele id\'s of gemengd worden als geheel vergeleken'() {
    const oud = { backlog: [{ id: 'q', text: 'a' }, { text: 'zonder id' }] };
    const l = j(oud); l.backlog[0].text = 'b';
    const s = j(oud); s.backlog[1].text = 'gewijzigd';
    assert(!lv(oud, l, s), 'Gemengde lijst aan beide kanten veranderd: niet verliesvrij');
    const d = { boodschappen: [{ id: 'z', text: '1' }, { id: 'z', text: '2' }] };
    const fl = plain(C.flattenPaths(d));
    const sl = Object.keys(fl).filter(k => !/#t$/.test(k));
    assert(sl.length === 1 && sl[0] === '.boodschappen', 'Dubbele id\'s niet als geheel: ' + JSON.stringify(Object.keys(fl)));
  },

  async 'Lijst met gaten (P1-11): telt nooit als veilig — los van dit pakket niet opgelost'() {
    const raw = { boodschappen: { 3: { id: 'a', text: 'Melk' } } };
    assert(C.normalizeLoses(raw) === true, 'Verlies bij normaliseren niet herkend');
    assert(C.normalizeLoses({ boodschappen: [{ id: 'a' }] }) === false, 'Normale lijst onterecht als verlies');
    const oud = { boodschappen: [{ id: 'a', text: 'Melk' }] };
    assert(!automatisch(oud, oud, oud, raw).veilig, 'Lijst met gaten toch automatisch geaccepteerd');
  },

  async 'describeChanges: noemt per item wat er toegevoegd, gewijzigd of verwijderd is; meta telt niet'() {
    const oud = { boodschappen: [{ id: 'a', text: 'Melk' }, { id: 'b', text: 'Brood' }], tasks: { '2026-10-01': [{ id: 't', text: 'Afval' }] }, meta: { schemaVersion: 1 }, notitieboek: 'x' };
    const nieuw = { boodschappen: [{ id: 'a', text: 'Halfvolle melk' }, { id: 'c', text: 'Kaas' }], tasks: { '2026-10-02': [{ id: 't', text: 'Afval' }] }, meta: { schemaVersion: 1, iets: 1 }, notitieboek: 'y' };
    const ch = plain(C.describeChanges(oud, nieuw)).map(c => c.soort + ':' + (c.noun || c.veld) + ':' + (c.label || ''));
    ['gewijzigd:boodschap:Halfvolle melk', 'toegevoegd:boodschap:Kaas', 'verwijderd:boodschap:Brood', 'anders:notitieboek:'].forEach(x => assert(ch.includes(x), 'Ontbreekt: ' + x + ' in ' + JSON.stringify(ch)));
    assert(!ch.some(x => /meta/.test(x)), 'meta als gebruikerswijziging gemeld');
    assert(ch.includes('anders:tasks:'), 'Verplaatste taak (zelfde inhoud) niet als andere wijziging gemeld: ' + JSON.stringify(ch));
  }
};
