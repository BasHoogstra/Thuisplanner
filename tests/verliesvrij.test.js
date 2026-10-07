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

  async 'Verliesvrij: veilige gevallen blijven automatisch (andere items, gelijke wijziging, verzamelingen)'() {
    const oud = { boodschappen: [{ id: 'a', text: 'Melk' }, { id: 'b', text: 'Brood' }], winkels: ['AH'] };
    // Lokaal verwijderd a, server bewerkt b.
    const l = { boodschappen: [oud.boodschappen[1]], winkels: ['AH'] };
    const s = j(oud); s.boodschappen[1].text = 'Bruin brood';
    assert(lv(oud, l, s), 'Verschillende items: zou verliesvrij moeten zijn');
    // Beide hetzelfde gedaan.
    assert(lv(oud, l, l), 'Gelijke wijziging aan beide kanten');
    // Verzameling (tekstlijst): lokaal +Jumbo, server -AH.
    const l2 = j(oud); l2.winkels = ['AH', 'Jumbo'];
    const s2 = j(oud); s2.winkels = [];
    const m2 = C.mergeData(j(oud), j(l2), j(s2));
    assert(lv(oud, l2, s2) && JSON.stringify(m2.winkels) === '["Jumbo"]', 'Verzameling: ' + JSON.stringify(m2.winkels));
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
    assert(Object.keys(fl).length === 1 && Object.keys(fl)[0] === '.boodschappen', 'Dubbele id\'s niet als geheel: ' + JSON.stringify(Object.keys(fl)));
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
