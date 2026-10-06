// E5 / NW-09: de lokale, geanonimiseerde classificatie (tools/classificeer.js).
// Alleen fictieve fixtures; geen browser en geen netwerk.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readFixture, assert, clone } = require('./lib');
const K = require('../tools/classificeer.js');

const ROOT = path.resolve(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'classificeer.js');
let _app = null;
const app = () => (_app = _app || K.laadApp(path.join(ROOT, 'index.html')));
const klas = (bronnen, o) => K.classificeer(bronnen, Object.assign({ app: app() }, o || {}));
const raw = (data, label) => ({ soort: 'raw', label: label || 'raw:test', data });
const rij = (r, plek, bron) => { const v = r.velden.find(x => x.plek === plek); return v && (bron ? v.perBron[bron] : v); };
const FIXTURES = ['huishouden.json', 'legacy.json', 'leden-oud.json', 'leden-praktijk.json', 'leden-praktijk-v14.json'];

// Alle gegevens die nooit in een rapport mogen staan: vrije teksten, namen, persoonsverwijzingen,
// sleutels die namen of datums zijn.
function gevoelig(d) {
  const uit = new Set();
  const TEKST = ['text', 'tekst', 'naam', 'titel', 'note', 'notitie', 'desc', 'bestemming', 'instantie', 'serienummer', 'tracking', 'link', 'name', 'winkel', 'norm', 'claimedBy', 'addedBy', 'author', 'assignedTo', 'auteur', 'editedBy'];
  (function loop(v, sleutelIsData) {
    if (Array.isArray(v)) return v.forEach(x => loop(x, false));
    if (v && typeof v === 'object') {
      Object.keys(v).forEach(k => {
        if (sleutelIsData) uit.add(k);
        if (TEKST.includes(k) && typeof v[k] === 'string') uit.add(v[k]);
        const dataSleutels = ['tasks', 'notes', 'recurringDone', 'gewoontenDone', 'maaltijdplan', 'wieIsWaar', 'verlanglijstjes', 'paklijst', 'boodCatOverrides', 'reactions'].includes(k)
          || (sleutelIsData === 'wiw');
        loop(v[k], k === 'wieIsWaar' ? 'wiwDatum' : sleutelIsData === 'wiwDatum' ? true : dataSleutels);
      });
      return;
    }
  })(d, false);
  (d.vakantiePersonen || []).forEach(x => uit.add(x));
  (function namen(v) { if (Array.isArray(v)) v.forEach(namen); else if (v && typeof v === 'object') Object.keys(v).forEach(k => { if (k === 'reactions' && v[k] && typeof v[k] === 'object') Object.values(v[k]).forEach(a => (a || []).forEach(n => uit.add(n))); namen(v[k]); }); })(d);
  return [...uit].filter(s => typeof s === 'string' && s.trim().length >= 3);
}
function geenLek(rapportTekst, data, label) {
  // Als los woord (niet als deel van een veldnaam zoals vasteBoodschappen).
  const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lek = gevoelig(data).filter(s => new RegExp('(?<![\\p{L}\\p{N}_])' + esc(s) + '(?![\\p{L}\\p{N}_])', 'u').test(rapportTekst));
  assert(!lek.length, label + ': gegevens in het rapport: ' + lek.slice(0, 5).map(s => JSON.stringify(s.slice(0, 20))).join(', '));
  assert(!/\b\d{4}-\d{2}-\d{2}\b/.test(rapportTekst), label + ': datum in het rapport');
}

module.exports = {
  async 'E5: rapport bevat geen huishoudgegevens (alle fixtures, ruw + export + cache, md en json)'() {
    for (const f of FIXTURES) {
      const d = readFixture(f);
      assert(gevoelig(d).length >= 10, f + ': te weinig gevoelige waarden verzameld; de controle zou niets bewijzen');
      const bronnen = [raw(d, 'raw:a'), { soort: 'export', label: 'export:b', data: clone(d) }, { soort: 'cache.data', label: 'cache:c.data', data: clone(d) }];
      const r = klas(bronnen);
      geenLek(K.rapportMd(r), d, f + ' (md)');
      geenLek(JSON.stringify(r), d, f + ' (json)');
    }
  },

  async 'E5: de privacycontrole betrapt een lek (tegenproef met --toon-onbekende-namen)'() {
    const d = readFixture('huishouden.json');
    d.Annelies = { x: 1 }; // een onbekend veld waarvan de naam zelf een gegeven is
    const verborgen = K.rapportMd(klas([raw(d)]));
    assert(!verborgen.includes('Annelies') && /onbekend_[0-9a-f]{8}/.test(verborgen), 'Onbekende veldnaam niet als hash');
    const getoond = K.rapportMd(klas([raw(d)], { toonOnbekend: true }));
    let gevangen = false;
    try { geenLek(getoond, Object.assign({}, d, { naam: 'Annelies' }).naam ? { vakantiePersonen: ['Annelies'] } : d, 'tegenproef'); } catch (e) { gevangen = true; }
    assert(gevangen && getoond.includes('Annelies') && /niet delen/.test(getoond), 'De privacycontrole zag het lek niet, of de waarschuwing ontbreekt');
  },

  async 'E5: herhaalbaar — dezelfde invoer (ook in andere sleutelvolgorde) geeft exact hetzelfde rapport'() {
    const d = readFixture('leden-praktijk.json');
    const omgekeerd = o => (Array.isArray(o) ? o.map(omgekeerd) : o && typeof o === 'object' ? Object.keys(o).reverse().reduce((x, k) => { x[k] = omgekeerd(o[k]); return x; }, {}) : o);
    const a = klas([raw(d)]), b = klas([raw(clone(d))]), c = klas([raw(omgekeerd(d))]);
    assert(JSON.stringify(a) === JSON.stringify(b) && K.rapportMd(a) === K.rapportMd(b), 'Twee runs verschillen');
    assert(JSON.stringify(a) === JSON.stringify(c), 'Sleutelvolgorde verandert het rapport');
  },

  async 'E5: invoer wordt niet gewijzigd'() {
    const d = readFixture('huishouden.json'), kopie = JSON.stringify(d);
    klas([raw(d)]);
    assert(JSON.stringify(d) === kopie, 'Classificeren wijzigde de invoer');
  },

  async 'E5: onbekend veld (bovenste niveau en in elementen) = blokkade, nooit stil ingedeeld'() {
    const d = readFixture('huishouden.json');
    d.nieuwVeld = [1, 2];
    d.boodschappen[0].geheimVeld = 'x';
    const r = klas([raw(d)]);
    assert(r.blokkades.some(b => /onbekend veld/.test(b)), 'Onbekend veld bovenaan geen blokkade: ' + r.blokkades.join(' | '));
    assert(r.blokkades.some(b => /^boodschappen\[\].*onbekende velden in elementen/.test(b)), 'Onbekend subveld geen blokkade');
    const o = r.velden.find(v => v.plek.startsWith('<onbekend>'));
    assert(o && o.cat === 'onbekend' && o.actie === 'blokkade', 'Onbekend veld kreeg een categorie: ' + JSON.stringify(o && o.cat));
  },

  async 'E5: per lijst — id-aanwezigheid, uniekheid, gemengd; dubbele id en gemengde lijst = blokkade'() {
    const d = { boodschappen: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }, { id: 'b', text: 'z' }], backlog: [{ id: 'q', text: 'x' }, { text: 'zonder id' }] };
    const r = klas([raw(d)]);
    const b = rij(r, 'boodschappen[]', 'raw:test (ruw)'), bl = rij(r, 'backlog[]', 'raw:test (ruw)');
    assert(b.elementen === 3 && b.metId === 3 && b.idUniek === false && b.dubbeleIds === 1 && !b.gemengd, 'boodschappen: ' + JSON.stringify(b));
    assert(bl.metId === 1 && bl.zonderId === 1 && bl.gemengd === true && bl.samenvoegen === 'lokaal wint (hele lijst)', 'backlog: ' + JSON.stringify(bl));
    assert(r.blokkades.some(x => /boodschappen\[\].*dubbele id/.test(x)) && r.blokkades.some(x => /backlog\[\].*gemengde lijst/.test(x)), 'Blokkades: ' + r.blokkades.join(' | '));
  },

  async 'E5: samenvoeggedrag zoals mergeArrays (per element, als verzameling, lokaal wint)'() {
    const d = { boodschappen: [{ id: 'a' }], recurringDone: { '2026-10-01': ['r1', 'r2'] }, boodschappenHistory: [{ text: 'x', date: '2026-10-01' }], winkels: ['A', 'B'] };
    const r = klas([raw(d)]);
    assert(rij(r, 'boodschappen[]', 'raw:test (ruw)').samenvoegen === 'per element (id)', 'per element');
    assert(rij(r, 'recurringDone.<datum>[]', 'raw:test (ruw)').samenvoegen === 'als verzameling', 'als verzameling');
    assert(rij(r, 'boodschappenHistory[]', 'raw:test (ruw)').samenvoegen === 'lokaal wint (hele lijst)', 'lokaal wint');
    assert(rij(r, 'winkels[]', 'raw:test (ruw)').samenvoegen === 'als verzameling', 'winkels');
  },

  async 'E5: persoonsverwijzingen en labels per veld (zonder namen), ook sleutels die namen zijn'() {
    const d = {
      tasks: { '2026-10-01': [{ id: 't', author: 'P1', assignedTo: 'P2', reactions: { '👍': ['P1', 'P3'] } }] },
      verlanglijstjes: { P1: [{ id: 'w', text: 'x', claimedBy: 'P2' }], P4: [] },
      wieIsWaar: { '2026-10-01': { P1: 'thuis', P2: 'werk' } },
      vakantiePersonen: ['P1', 'Hond'], vakanties: [{ id: 'v', paklijst: { P1: ['x'], Hond: [] } }],
      verjaardagen: [{ id: 'j', naam: 'Oma', datum: '01-02' }]
    };
    const r = klas([raw(d)]);
    const B = 'raw:test (ruw)';
    assert(JSON.stringify(rij(r, 'tasks.<datum>[]', B).persoonsverwijzingen) === '{"assignedTo":1,"author":1,"reactions":2}', 'tasks: ' + JSON.stringify(rij(r, 'tasks.<datum>[]', B)));
    assert(rij(r, 'verlanglijstjes', B).persoonsverwijzingen['<sleutel>'] === 2 && rij(r, 'verlanglijstjes.<naam>[]', B).persoonsverwijzingen.claimedBy === 1, 'verlanglijstjes');
    assert(rij(r, 'wieIsWaar.<datum>', B).persoonsverwijzingen['<sleutel>'] === 2, 'wieIsWaar');
    assert(rij(r, 'vakantiePersonen[]', B).labels === 2 && rij(r, 'vakanties[].paklijst', B).labels === 2, 'labels');
    assert(rij(r, 'verjaardagen[]', B).namenGeenLid.naam === 1, 'verjaardagen.naam = naam, geen lid');
    const md = K.rapportMd(r);
    ['P1', 'P2', 'P3', 'P4', 'Hond', 'Oma'].forEach(n => assert(!new RegExp('\\b' + n + '\\b').test(md), 'Naam in het rapport: ' + n));
  },

  async 'E5: persoonsverwijzingen in een lijst die "lokaal wint" = blokkade (omzetting niet als veilig beschreven)'() {
    const r = klas([raw({ boodschappen: [{ text: 'x', addedBy: 'P1' }] })]);
    assert(r.blokkades.some(b => /boodschappen\[\].*lokaal wint/.test(b)), 'Geen blokkade: ' + r.blokkades.join(' | '));
  },

  async 'E5: lijst met gaten (object met numerieke sleutels) — zichtbaar als blokkade, inclusief verlies bij normaliseren (P1-11, niet opgelost)'() {
    const d = readFixture('huishouden.json');
    const n = d.boodschappen.length, obj = {}; obj[String(n + 3)] = d.boodschappen[n - 1];
    d.boodschappen = obj;
    const r = klas([raw(d)]);
    assert(r.blokkades.some(b => /^boodschappen — .*lijst als object/.test(b)), 'Lijst als object niet gemeld: ' + r.blokkades.join(' | '));
    assert(r.blokkades.some(b => /^boodschappen\[\] — .*normalizeData laat 1 element/.test(b)), 'Verlies bij normaliseren niet gemeld');
    assert(r.ruwTegenoverGenormaliseerd.some(x => x.plek === 'boodschappen[]' && /GAAT VERLOREN/.test(x.wat)), 'Verschil ruw/genormaliseerd niet zichtbaar');
  },

  async 'E5: verkeerde vorm en niet-datumsleutels = blokkade'() {
    const r = klas([raw({ tasks: [{ id: 'x' }], notes: { 'geen-datum': 'x' }, winkelsSet: 'ja' })]);
    assert(r.blokkades.some(b => /^tasks — .*vorm lijst, verwacht object/.test(b)), 'tasks als lijst');
    assert(r.blokkades.some(b => /^notes — .*sleutel\(s\) die geen datum zijn/.test(b)), 'niet-datumsleutel');
    assert(r.blokkades.some(b => /^winkelsSet — .*vorm tekst, verwacht vlag/.test(b)), 'vlag als tekst');
  },

  async 'E5: ruw tegenover genormaliseerd — wat normalizeData aanvult is per veld zichtbaar'() {
    const r = klas([raw({ boodschappen: [{ id: 'a' }] })]);
    const aangevuld = r.ruwTegenoverGenormaliseerd.filter(x => /aangevuld/.test(x.wat)).map(x => x.plek);
    ['tasks', 'notes', 'vakanties', 'vakantiePersonen', 'notitieboek'].forEach(p => assert(aangevuld.includes(p), p + ' niet als aangevuld gemeld'));
    assert(!aangevuld.includes('boodschappen'), 'boodschappen onterecht als aangevuld');
  },

  async 'E5: bekende velden buiten de eerste indeling (meta, members) = open punt, geen gok'() {
    const r = klas([raw({ meta: { schemaVersion: 1, members: { version: 2 } }, members: [{ id: 'm_1', name: 'P1', kind: 'unknown', color: '#000' }] })]);
    assert(r.open.some(x => /^meta: /.test(x)) && r.open.some(x => /^members: /.test(x)), 'Geen open punt: ' + r.open.join(' | '));
    assert(rij(r, 'meta').cat === null && rij(r, 'meta').actie === 'indeling open', 'meta kreeg een categorie');
    assert(!r.blokkades.some(b => /^meta/.test(b)), 'meta onterecht een blokkade');
  },

  async 'E5: actie per categorie alleen waar de documentatie die vastlegt'() {
    const r = klas([raw({ cadeaus: [{ id: 'c' }], boodschappen: [{ id: 'b' }] })]);
    assert(rij(r, 'cadeaus').actie === 'ongemoeid laten (contract 3.4)', 'archief');
    assert(/te beslissen/.test(rij(r, 'boodschappen').actie), 'andere categorie kreeg een geraden actie');
  },

  async 'E5: invoer — type altijd expliciet, verkeerde of kapotte invoer is een fout (geen gok)'() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'klas-'));
    const w = (n, v) => { const p = path.join(dir, n); fs.writeFileSync(p, typeof v === 'string' ? v : JSON.stringify(v)); return p; };
    const exp = w('e.json', { app: 'huisplan', version: 1, data: { boodschappen: [] } });
    const cache = w('c.json', { data: { boodschappen: [{ id: 'a' }] }, base: JSON.stringify({ boodschappen: [] }), t: 1 });
    const fout = (soort, p, re) => { let e = null; try { K.leesBron(soort, p); } catch (x) { e = x; } assert(e && re.test(e.message), soort + ': ' + (e && e.message)); };
    fout('raw', exp, /lijkt een export/);
    fout('raw', cache, /lijkt een cache/);
    fout('export', w('r.json', { boodschappen: [] }), /verwacht \{app/);
    fout('cache', w('x.json', { data: {}, base: '{kapot' }), /base is geen geldige JSON/);
    fout('cache', w('y.json', { data: {} }), /verwacht \{data/);
    fout('raw', w('z.json', '{niet json'), /geen geldige JSON/);
    fout('raw', w('l.json', [1, 2]), /planner-object/);
    fout('onbekend', exp, /onbekend invoertype/);
    // Het E3-cacheformaat (huisplanCache_…) heeft ook data en base: gewoon een cache.
    const e3 = K.leesBron('cache', w('e3.json', { format: 2, gen: 1, id: 'x', app: '1.4.2', data: { boodschappen: [] }, base: '', t: 1 }));
    assert(e3.length === 1 && e3[0].soort === 'cache.data', 'E3-cache: ' + JSON.stringify(e3.map(b => b.soort)));
    const c = K.leesBron('cache', cache);
    assert(c.length === 2 && c[0].soort === 'cache.data' && c[1].soort === 'cache.base', 'cache geeft data én base');
    assert(!c[0].label.includes('c.json') && !c[0].label.includes(dir), 'Bestandsnaam of map in het label');
  },

  async 'E5: CLI — exitcodes, uitvoerbestanden, geen netwerk'() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'klas-'));
    const p = path.join(dir, 'raw.json');
    fs.writeFileSync(p, JSON.stringify(readFixture('huishouden.json')));
    let r = spawnSync(process.execPath, [TOOL, '--raw', p, '--out', path.join(dir, 'rapport')], { encoding: 'utf8' });
    assert(r.status === 0 && fs.existsSync(path.join(dir, 'rapport.md')) && fs.existsSync(path.join(dir, 'rapport.json')), 'Geldige invoer: exit ' + r.status + ' ' + r.stderr);
    const d = readFixture('huishouden.json'); d.onbekend = 1; fs.writeFileSync(p, JSON.stringify(d));
    r = spawnSync(process.execPath, [TOOL, '--raw', p], { encoding: 'utf8' });
    assert(r.status === 1 && /Blokkades \(\d+\)/.test(r.stdout), 'Blokkade: exit ' + r.status);
    r = spawnSync(process.execPath, [TOOL, '--export', p], { encoding: 'utf8' });
    assert(r.status === 2 && /Fout: export/.test(r.stderr), 'Verkeerd type: exit ' + r.status);
    r = spawnSync(process.execPath, [TOOL], { encoding: 'utf8' });
    assert(r.status === 2, 'Zonder bronnen: exit ' + r.status);
    const src = fs.readFileSync(TOOL, 'utf8');
    assert(!/require\('(https?|net|dgram|tls|dns|child_process)'\)/.test(src) && !/\bfetch\(/.test(src), 'Classifier gebruikt netwerk of processen');
  },

  async 'E5: specificatie dekt alle velden uit het dataformaat-schema'() {
    const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'dataformaat-v1.schema.json'), 'utf8'));
    const ontbreekt = Object.keys(schema.properties || {}).filter(k => !K.SPEC[k]);
    assert(!ontbreekt.length, 'Velden uit het schema zonder classificatie: ' + ontbreekt.join(', '));
  }
};
