// 1.4.2, E4: het causale beslislogboek (docs/identiteit-en-items.md, 2.4; docs/ontwerp-1.4.2.md, 5;
// tests T9–T11 uit ontwerp sectie 8, plus race-, conflict- en samenvoegtests).
// Deel 1 test het pure blok "BESLISLOGBOEK" uit test/index.html los in Node. Deel 2 test in de app dat
// onbekende sleutels in meta.members blijven staan. Alleen fictieve data.
//
// Let op: de opId's in deze tests zijn testwaarden. De definitieve, deterministische opId-codering
// voor omgezette 1.4.1-antwoorden (UUIDv5) wacht op goedkeuring (P1-6) en wordt hier niet gekozen.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { openApp, readFixture, sharedDb, waitForPut, assert, clone } = require('./lib');

const APP = path.join(__dirname, '..', 'test', 'index.html');
function laadBlok() {
  const src = fs.readFileSync(APP, 'utf8');
  const a = src.indexOf('// ── LEDENREGISTER (roadmap 1.4)'), b = src.indexOf('// ── einde LEDENREGISTER ──');
  const c = src.indexOf('// ── BESLISLOGBOEK (1.4.2, E4)'), d = src.indexOf('// ── einde BESLISLOGBOEK ──');
  assert(a > -1 && b > a && c > b && d > c, 'Blokken LEDENREGISTER/BESLISLOGBOEK niet gevonden');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + src.slice(c, d), ctx);
  return ctx;
}
// Lui laden: ontbreekt het blok, dan falen alleen deze tests, niet de hele testrunner.
let _blok = null;
const L = new Proxy({}, { get: (t, k) => (_blok = _blok || laadBlok())[k] });
// Resultaten uit de vm-context naar gewone objecten (andere prototypes).
const plain = x => JSON.parse(JSON.stringify(x));
const res = log => plain(L.resolveDecisions(log));
const subj = (log, label) => res(log)['membership:' + label];
const lid = (label, state, basedOn, extra) => Object.assign({ type: 'membership', label, state, basedOn: basedOn || [], byMember: null }, extra || {});
const paar = (a, b, state, basedOn) => ({ type: 'identityPair', pair: [a, b].sort(), state, basedOn: basedOn || [], byMember: null });
function diepBevroren(o) { if (o && typeof o === 'object') { Object.values(o).forEach(diepBevroren); Object.freeze(o); } return o; }
// Deterministische pseudo-willekeur (geen Math.random: tests moeten herhaalbaar zijn).
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0; return s / 4294967296; }; }
function schud(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function logUit(paren) { const o = {}; paren.forEach(([k, v]) => { o[k] = v; }); return o; }
// Testafleiding voor opId's van omgezette antwoorden (NIET de definitieve codering, zie boven).
const testOpId = (type, subject, state) => 'test_' + L.memberHash(type + '\u0000' + subject + '\u0000' + state);

module.exports = {
  // ── T9: lidmaatschap, conflicten, klokken, volgorde ──
  async 'E4/T9: één kop geldt; tegengestelde koppen = conflict (null); oplossen met alle koppen'() {
    const log = { d1: lid('lynn', 'member'), d2: lid('lynn', 'notMember') };
    let r = subj(log, 'lynn');
    assert(r.status === 'conflict' && r.state === null && JSON.stringify(r.heads) === '["d1","d2"]', 'Conflict niet herkend: ' + JSON.stringify(r));
    // Een antwoord dat maar één kop noemt, laat het conflict bestaan.
    r = subj(Object.assign({}, log, { d3: lid('lynn', 'member', ['d1']) }), 'lynn');
    assert(r.status === 'conflict', 'Antwoord op één kop loste het conflict ten onrechte op: ' + JSON.stringify(r));
    // Met alle koppen: opgelost; een latere correctie heeft één voorganger.
    const opgelost = Object.assign({}, log, { d3: lid('lynn', 'member', ['d1', 'd2']) });
    r = subj(opgelost, 'lynn');
    assert(r.status === 'decided' && r.state === 'member' && JSON.stringify(r.heads) === '["d3"]', 'Niet opgelost: ' + JSON.stringify(r));
    r = subj(Object.assign({}, opgelost, { d4: lid('lynn', 'notMember', ['d3']) }), 'lynn');
    assert(r.state === 'notMember' && JSON.stringify(r.heads) === '["d4"]', 'Correctie niet toegepast: ' + JSON.stringify(r));
    // Meerdere koppen met dezelfde uitkomst: geen conflict.
    r = subj({ a: lid('freya', 'notMember'), b: lid('freya', 'notMember') }, 'freya');
    assert(r.status === 'decided' && r.state === 'notMember', 'Gelijke koppen: ' + JSON.stringify(r));
  },

  async 'E4/T9: klokken beslissen nooit (at, ook scheef of omgekeerd, verandert niets)'() {
    const basis = { d1: lid('lynn', 'member'), d2: lid('lynn', 'notMember', ['d1']) };
    const metKlokken = [
      { d1: { at: '2026-10-06T10:00:00Z' }, d2: { at: '2026-10-06T09:00:00Z' } }, // opvolger "eerder"
      { d1: { at: '2099-01-01T00:00:00Z' }, d2: { at: '1970-01-01T00:00:00Z' } },
      { d1: { at: 5 }, d2: {} }
    ];
    for (const k of metKlokken) {
      const log = { d1: Object.assign({}, basis.d1, k.d1), d2: Object.assign({}, basis.d2, k.d2) };
      const r = subj(log, 'lynn');
      assert(r.state === 'notMember' && JSON.stringify(r.heads) === '["d2"]', 'Klok beïnvloedde de uitkomst: ' + JSON.stringify(r));
    }
    // Bij een echt conflict lost geen enkele klok het op.
    const c = subj({ x: lid('oma', 'member', [], { at: '2030-01-01' }), y: lid('oma', 'notMember', [], { at: '2020-01-01' }) }, 'oma');
    assert(c.status === 'conflict' && c.state === null, 'Klok koos een winnaar: ' + JSON.stringify(c));
  },

  async 'E4/T9: opvolger vóór voorganger, en elke volgorde van binnenkomst geeft dezelfde uitkomst'() {
    // Alleen de opvolger is er al: hij geldt. Komen de voorgangers later, dan blijft hij gelden.
    let r = subj({ d3: lid('lynn', 'member', ['d1', 'd2']) }, 'lynn');
    assert(r.state === 'member', 'Opvolger zonder bekende voorgangers: ' + JSON.stringify(r));
    const alle = [['d1', lid('lynn', 'member')], ['d2', lid('lynn', 'notMember')], ['d3', lid('lynn', 'member', ['d1', 'd2'])], ['d4', lid('lynn', 'notMember', ['d3'])],
      ['e1', lid('freya', 'notMember')], ['e2', lid('freya', 'member')]];
    const verwacht = JSON.stringify(res(logUit(alle)));
    const r0 = rng(42);
    for (let i = 0; i < 200; i++) {
      // Willekeurige binnenkomst: telkens een deel, steeds samengevoegd met wat er al was.
      const volgorde = schud(alle, r0);
      let log = {};
      for (const [k, v] of volgorde) log = plain(L.mergeDecisionLogs(log, { [k]: v }).log);
      assert(JSON.stringify(res(log)) === verwacht, 'Uitkomst hangt af van de volgorde: ' + volgorde.map(x => x[0]).join(','));
    }
  },

  async 'E4: nieuwe beslissing bouwt voort op ALLE koppen; basedOn is altijd een lijst'() {
    const log = { d1: lid('lynn', 'member'), d2: lid('lynn', 'notMember'), x: lid('freya', 'member') };
    const n = plain(L.newDecision(log, 'membership', ' Lynn ', 'member', { opId: 'd3', byMember: 'm_bas', at: '2026-10-06' }));
    assert(JSON.stringify(n.decision.basedOn) === '["d1","d2"]' && n.decision.label === 'lynn', 'Niet alle koppen: ' + JSON.stringify(n));
    const eerste = plain(L.newDecision({}, 'membership', 'Nieuw', 'member', { opId: 'n1' }));
    assert(Array.isArray(eerste.decision.basedOn) && eerste.decision.basedOn.length === 0, 'Eerste keuze: basedOn moet [] zijn');
    // Ongeldige invoer: geen beslissing.
    for (const [o, s] of [[{ opId: 'a.b' }, 'member'], [{ opId: 'ok' }, 'misschien'], [{}, 'member']]) {
      let fout = null; try { L.newDecision({}, 'membership', 'x', s, o); } catch (e) { fout = e; }
      assert(fout, 'Ongeldige beslissing geaccepteerd: ' + JSON.stringify([o, s]));
    }
    // basedOn als iets anders dan een lijst is ongeldig.
    const r = subj({ z: Object.assign(lid('lynn', 'member'), { basedOn: 'd1' }) }, 'lynn');
    assert(r.status === 'error' && r.state === null, 'basedOn-tekst geaccepteerd: ' + JSON.stringify(r));
  },

  async 'E4: twee toestellen offline met willekeurige handelingen — samenvoegen verliest niets, één antwoord lost op'() {
    const r0 = rng(7);
    for (let ronde = 0; ronde < 50; ronde++) {
      let A = {}, B = {}, n = 0;
      const labels = ['lynn', 'freya', 'oma'];
      for (let stap = 0; stap < 6; stap++) {
        for (const [naam, toestel] of [['A', () => A], ['B', () => B]]) {
          const l = labels[Math.floor(r0() * labels.length)], st = r0() < 0.5 ? 'member' : 'notMember';
          const nd = plain(L.newDecision(toestel(), 'membership', l, st, { opId: naam + (n++) }));
          if (naam === 'A') A = Object.assign({}, A, { [nd.opId]: nd.decision }); else B = Object.assign({}, B, { [nd.opId]: nd.decision });
        }
      }
      const m1 = plain(L.mergeDecisionLogs(A, B)), m2 = plain(L.mergeDecisionLogs(B, A));
      assert(!m1.collisions.length && Object.keys(m1.log).length === Object.keys(A).length + Object.keys(B).length, 'Beslissing verloren bij samenvoegen');
      assert(JSON.stringify(res(m1.log)) === JSON.stringify(res(m2.log)), 'Samenvoegen is niet symmetrisch');
      // Elk conflict is met één beslissing (op alle koppen) op te lossen.
      let log = m1.log;
      for (const [s, r] of Object.entries(res(log))) {
        if (r.status !== 'conflict') continue;
        const nd = plain(L.newDecision(log, 'membership', r.subject, 'member', { opId: 'fix' + ronde + s.length }));
        log = Object.assign({}, log, { [nd.opId]: nd.decision });
        const na = res(log)[s];
        assert(na.status === 'decided' && na.heads.length === 1, 'Conflict niet opgelost: ' + JSON.stringify(na));
      }
    }
  },

  // ── T10: same/different, apart van lidmaatschap ──
  async 'E4/T10: same/different is een eigen onderwerp; geen impliciete effecten'() {
    const log = { p1: paar('lois', 'loïs', 'same'), m1: lid('lois', 'member') };
    const r = res(log);
    assert(r['identityPair:lois|loïs'].state === 'same', 'Paar: ' + JSON.stringify(r));
    // Een paarbeslissing maakt niemand lid; een lidmaatschapsbeslissing voegt niets samen.
    assert(!r['membership:loïs'], 'Paarbeslissing schiep een lidmaatschap');
    assert(!Object.keys(r).some(k => k.startsWith('identityPair:') && k !== 'identityPair:lois|loïs'), 'Lidmaatschap schiep een paar');
    // (A,B) en (B,A) zijn hetzelfde onderwerp.
    const omg = plain(L.newDecision(log, 'identityPair', ['Loïs', 'lois'], 'different', { opId: 'p2' }));
    assert(JSON.stringify(omg.decision.pair) === '["lois","loïs"]' && JSON.stringify(omg.decision.basedOn) === '["p1"]', 'Paarvolgorde: ' + JSON.stringify(omg));
    // Een paar met twee keer hetzelfde label, of ongesorteerd opgeslagen, is ongeldig.
    for (const p of [['lois', 'lois'], ['loïs', 'lois']]) {
      const x = res({ q: { type: 'identityPair', pair: p, state: 'same', basedOn: [] } });
      const k = Object.keys(x)[0];
      assert(x[k].status === 'error', 'Ongeldig paar geaccepteerd: ' + JSON.stringify(p));
    }
  },

  async 'E4/T10: effectregels — same met tegenstrijdig of onbekend lidmaatschap = null + één vraag; different nooit samen'() {
    const eff = log => plain(L.pairEffect(L.resolveDecisions(log), 'Lois', 'Loïs'));
    let e = eff({ p: paar('lois', 'loïs', 'same'), a: lid('lois', 'member'), b: lid('loïs', 'member') });
    assert(e.link === true && !e.ask, 'same + gelijk lidmaatschap: ' + JSON.stringify(e));
    e = eff({ p: paar('lois', 'loïs', 'same'), a: lid('lois', 'member'), b: lid('loïs', 'notMember') });
    assert(e.link === null && e.ask, 'same + verschillend lidmaatschap: ' + JSON.stringify(e));
    e = eff({ p: paar('lois', 'loïs', 'same'), a: lid('lois', 'member') });
    assert(e.link === null && e.ask, 'same + onbekend lidmaatschap: ' + JSON.stringify(e));
    e = eff({ p: paar('lois', 'loïs', 'same'), a: lid('lois', 'member'), b1: lid('loïs', 'member'), b2: lid('loïs', 'notMember') });
    assert(e.link === null && e.ask, 'same + lidmaatschapsconflict: ' + JSON.stringify(e));
    e = eff({ p: paar('lois', 'loïs', 'different'), a: lid('lois', 'member'), b: lid('loïs', 'member') });
    assert(e.link === false && !e.ask, 'different: ' + JSON.stringify(e));
    e = eff({ p1: paar('lois', 'loïs', 'same'), p2: paar('lois', 'loïs', 'different'), a: lid('lois', 'member'), b: lid('loïs', 'member') });
    assert(e.link === null && e.ask, 'conflict tussen paarbeslissingen: ' + JSON.stringify(e));
    e = eff({ a: lid('lois', 'member'), b: lid('loïs', 'member') });
    assert(e.link === false && !e.ask, 'zonder paarbeslissing nooit samen: ' + JSON.stringify(e));
  },

  async 'E4/T10: basedOn naar een ander onderwerp of type is ongeldig; kringloop is een fout'() {
    let r = res({ m1: lid('lynn', 'member'), p1: paar('lois', 'loïs', 'same', ['m1']) });
    assert(r['identityPair:lois|loïs'].status === 'error' && r['identityPair:lois|loïs'].state === null, 'Verwijzing naar ander type: ' + JSON.stringify(r));
    assert(r['membership:lynn'].state === 'member', 'Ander onderwerp onterecht geraakt');
    r = res({ a: lid('lynn', 'member'), b: lid('freya', 'member', ['a']) });
    assert(r['membership:freya'].status === 'error', 'Verwijzing naar ander label: ' + JSON.stringify(r));
    r = res({ a: lid('lynn', 'member', ['b']), b: lid('lynn', 'notMember', ['a']) });
    assert(r['membership:lynn'].status === 'error' && r['membership:lynn'].state === null, 'Kringloop zonder kop: ' + JSON.stringify(r));
    r = res({ a: lid('lynn', 'member', ['b']), b: lid('lynn', 'notMember', ['a']), c: lid('lynn', 'member') });
    assert(r['membership:lynn'].status === 'error', 'Verborgen kringloop naast een kop: ' + JSON.stringify(r));
    r = res({ a: lid('lynn', 'member', ['a']) });
    assert(r['membership:lynn'].status === 'error', 'Verwijzing naar zichzelf');
    const fouten = plain(L.decisionLogErrors({ a: lid('lynn', 'member', ['b']), b: lid('lynn', 'notMember', ['a']), x: { type: 'raar' }, 'n.v.t': lid('oma', 'member') }));
    assert(fouten.length >= 3 && fouten.some(f => /raar|onbekend type/.test(f) || f.startsWith('x:')) && fouten.some(f => f.startsWith('n.v.t')), 'Foutenlijst onvolledig: ' + JSON.stringify(fouten));
  },

  // ── T11: hetzelfde opId met andere inhoud ──
  async 'E4/T11: zelfde opId met andere inhoud = harde fout, onderwerp null, geen mengvorm'() {
    const a = { d1: lid('lynn', 'member'), x: lid('oma', 'member') };
    const b = { d1: lid('lynn', 'notMember'), y: lid('freya', 'member') };
    const m = plain(L.mergeDecisionLogs(a, b));
    assert(JSON.stringify(m.collisions) === '["d1"]', 'Botsing niet gevonden: ' + JSON.stringify(m.collisions));
    assert(m.log.d1.state === 'member' && Object.keys(m.log.d1).length === Object.keys(a.d1).length, 'Mengvorm of overschreven');
    const r = plain(L.resolveDecisions(m.log, { collisions: m.collisions }));
    assert(r['membership:lynn'].status === 'error' && r['membership:lynn'].state === null, 'Onderwerp niet null: ' + JSON.stringify(r['membership:lynn']));
    assert(r['membership:oma'].state === 'member' && r['membership:freya'].state === 'member', 'Andere onderwerpen geraakt');
    assert(plain(L.decisionLogErrors(m.log, m.collisions)).some(f => /zelfde opId/.test(f)), 'Botsing niet in de foutenlijst');
    // newDecision weigert een bestaand opId met andere inhoud.
    let fout = null; try { L.newDecision(a, 'membership', 'lynn', 'notMember', { opId: 'd1' }); } catch (e) { fout = e; }
    assert(fout && /andere inhoud/.test(fout.message), 'newDecision accepteerde een botsend opId: ' + (fout && fout.message));
    // Hetzelfde verzoek nog eens (ook nu d1 zelf kop is): dezelfde beslissing, geen extra effect.
    const herhaal = plain(L.newDecision(a, 'membership', 'Lynn', 'member', { opId: 'd1' }));
    assert(herhaal.repeated && JSON.stringify(herhaal.decision) === JSON.stringify(a.d1), 'Herhaald verzoek: ' + JSON.stringify(herhaal));
    // Paar: ook het onderwerptype telt mee.
    assert(L.decisionCollisions({ q: paar('a', 'b', 'same') }, { q: paar('a', 'b', 'different') }).length === 1, 'Paarbotsing niet gevonden');
  },

  async 'E4/T11: herhaald verzoek (zelfde inhoud) is geen fout — ook met andere at, basedOn-volgorde of zoals Firebase opslaat'() {
    const d = lid('lynn', 'member', ['b', 'a'], { byMember: 'm_x', at: '2026-10-06T10:00:00Z' });
    const varianten = [
      Object.assign({}, d),
      Object.assign({}, d, { at: '2030-01-01T00:00:00Z' }), // at telt niet mee
      Object.assign({}, d, { basedOn: ['a', 'b'] }),          // volgorde telt niet mee
      Object.assign({}, d, { basedOn: ['a', 'b', 'a'] })      // dubbel telt niet mee
    ];
    for (const v of varianten) assert(!L.decisionCollisions({ k: d }, { k: v }).length, 'Onterechte botsing: ' + JSON.stringify(v));
    // Firebase laat basedOn: [] en byMember: null weg.
    const leeg = lid('oma', 'member'), zoalsFirebase = { type: 'membership', label: 'oma', state: 'member' };
    assert(!L.decisionCollisions({ k: leeg }, { k: zoalsFirebase }).length, 'Weggelaten lege velden gaven een botsing');
    // Wel een botsing: andere byMember (andere handeling met hetzelfde opId).
    assert(L.decisionCollisions({ k: d }, { k: Object.assign({}, d, { byMember: 'm_y' }) }).length === 1, 'Andere byMember niet als botsing gezien');
    const m = plain(L.mergeDecisionLogs({ k: d }, { k: varianten[1] }));
    assert(!m.collisions.length && Object.keys(m.log).length === 1, 'Herhaald verzoek telde dubbel');
  },

  // ── Omzetting 1.4.1 en resolveMember ──
  async 'E4: omzetting 1.4.1 is deterministisch, past "nee wint" en "twee personen wint" één keer toe en is idempotent'() {
    const mm = {
      version: 2, migratedAt: '2026-10-05T10:00:00Z', app: '1.4.1',
      member: { p_1: 'loïs', p_2: 'opa henk', p_3: 'lynn' },
      notMember: { p_4: 'lynn', p_5: 'paard' },
      same: { p_6: 'lois|loïs', p_7: 'bas|bas jr' },
      different: { p_8: 'bas|bas jr' },
      onbekend: { iets: 'van een latere versie' }
    };
    const omgekeerd = Object.assign({}, mm, { member: logUit(Object.entries(mm.member).reverse()), same: logUit(Object.entries(mm.same).reverse()) });
    const a = plain(L.convertMemberAnswers141(mm, testOpId)), b = plain(L.convertMemberAnswers141(omgekeerd, testOpId));
    assert(JSON.stringify(a) === JSON.stringify(b), 'Omzetting hangt af van de sleutelvolgorde');
    const r = res(a);
    assert(r['membership:lynn'].state === 'notMember', '"Nee wint" niet toegepast');
    assert(r['membership:loïs'].state === 'member' && r['membership:paard'].state === 'notMember', 'Lidmaatschap: ' + JSON.stringify(r));
    assert(r['identityPair:bas|bas jr'].state === 'different', '"Twee personen wint" niet toegepast');
    assert(r['identityPair:lois|loïs'].state === 'same', 'same: ' + JSON.stringify(r));
    assert(Object.values(a).every(d => Array.isArray(d.basedOn) && !d.basedOn.length), 'Omgezette beslissingen moeten basedOn: [] hebben');
    assert(!plain(L.decisionLogErrors(a)).length, 'Omzetting gaf ongeldige beslissingen: ' + JSON.stringify(L.decisionLogErrors(a)));
    // Twee migratoren: dezelfde opId's, dus samenvoegen = geen botsing, geen extra beslissingen.
    const m = plain(L.mergeDecisionLogs(a, b));
    assert(!m.collisions.length && Object.keys(m.log).length === Object.keys(a).length, 'Twee migratoren liepen uiteen');
    // In meta.members: onbekende sleutels blijven; opnieuw omzetten verandert niets.
    const w1 = plain(L.withDecisionLog(mm, a)), w2 = plain(L.withDecisionLog(w1.members, plain(L.convertMemberAnswers141(w1.members, testOpId))));
    assert(JSON.stringify(w1.members.onbekend) === JSON.stringify(mm.onbekend) && w1.members.member && w1.members.version === 2, 'Bestaande sleutels niet behouden');
    assert(JSON.stringify(w1.members) === JSON.stringify(w2.members) && !w2.collisions.length, 'Tweede omzetting veranderde iets');
    // Zonder vastgestelde opId-codering geen omzetting.
    let fout = null; try { L.convertMemberAnswers141(mm); } catch (e) { fout = e; }
    assert(fout && /P1-6/.test(fout.message), 'Omzetting zonder opIdFor');
  },

  async 'E4: omzetting geeft dezelfde uitkomst als de 1.4.1-regels (willekeurige fixtures)'() {
    const r0 = rng(99), namen = ['lynn', 'loïs', 'lois', 'oma', 'paard', 'opa henk', 'freya'];
    for (let i = 0; i < 300; i++) {
      const mm = { member: {}, notMember: {}, same: {}, different: {} };
      namen.forEach((n, j) => { if (r0() < 0.4) mm.member['m' + j] = n; if (r0() < 0.3) mm.notMember['n' + j] = n; });
      for (let j = 0; j < 4; j++) {
        const a = namen[Math.floor(r0() * namen.length)], b = namen[Math.floor(r0() * namen.length)];
        if (a === b) continue;
        mm[r0() < 0.5 ? 'same' : 'different']['p' + i + j] = [a, b].sort().join('|');
      }
      const oud141 = plain(L.memberMembership(mm)), paren141 = plain(L.memberDecisions(mm));
      const r = res(plain(L.convertMemberAnswers141(mm, testOpId)));
      for (const n of namen) {
        const verwacht = oud141[n] === 'yes' ? 'member' : oud141[n] === 'no' ? 'notMember' : undefined;
        const kreeg = r['membership:' + n] && r['membership:' + n].state;
        assert(verwacht === kreeg || (verwacht === undefined && kreeg === undefined), 'Lidmaatschap ' + n + ': ' + verwacht + ' ≠ ' + kreeg + ' in ' + JSON.stringify(mm));
      }
      for (const pk of Object.keys(paren141)) {
        const kreeg = r['identityPair:' + pk] && r['identityPair:' + pk].state;
        assert(kreeg === paren141[pk], 'Paar ' + pk + ': ' + paren141[pk] + ' ≠ ' + kreeg);
      }
    }
  },

  async 'E4: resolveMember maakt nooit een lid aan en geeft bij twijfel null'() {
    const members = [
      { id: 'm_bas', name: 'Bas' }, { id: 'm_lois', name: 'Loïs', aliases: ['Lois'] },
      { id: 'u-1', name: 'Sam', legacyIds: ['m_sam'] }, { id: 'm_sam2', name: 'Sam ' }, { id: 'm_lynn', name: 'Lynn' }
    ];
    const zonder = L.resolveDecisions({});
    const R = (ref, r) => L.resolveMember(ref, members, r || zonder);
    assert(R('m_bas') === 'm_bas' && R('Bas') === 'm_bas' && R(' bas ') === 'm_bas', 'Bestaand lid niet gevonden');
    assert(R('m_sam') === 'u-1', 'legacy-ID niet herkend (omzetten moet idempotent zijn)');
    assert(R('Sam') === null, 'Twee leden met dezelfde naam moet null geven (ambiguous)');
    assert(R('Oma') === null && R('') === null && R(null) === null, 'Onbekend label gaf een lid');
    assert(R('Lois') === 'm_lois', 'Alias niet gebruikt');
    const nee = L.resolveDecisions({ a: lid('lynn', 'notMember') });
    assert(R('Lynn', nee) === null, 'notMember gaf toch een lid');
    const conflict = L.resolveDecisions({ a: lid('lynn', 'member'), b: lid('lynn', 'notMember') });
    assert(R('Lynn', conflict) === null, 'Conflict gaf toch een lid');
    const verschil = L.resolveDecisions({ p: paar('lois', 'loïs', 'different') });
    assert(R('Lois', verschil) === null && R('Loïs', verschil) === 'm_lois', 'different via alias gaf toch hetzelfde lid');
    // Puur: invoer wordt nooit gewijzigd, ook niet als ze bevroren is.
    const bevroren = diepBevroren(clone(members));
    assert(L.resolveMember('Bas', bevroren, zonder) === 'm_bas', 'resolveMember op bevroren invoer');
  },

  async 'E4: alle functies zijn puur (bevroren invoer, geen wijziging, gelijke uitvoer bij herhaling)'() {
    const log = diepBevroren({ d1: lid('lynn', 'member'), d2: lid('lynn', 'notMember'), p: paar('lois', 'loïs', 'same') });
    const kopie = JSON.stringify(log);
    const r1 = JSON.stringify(res(log)), r2 = JSON.stringify(res(log));
    L.mergeDecisionLogs(log, log); L.newDecision(log, 'membership', 'lynn', 'member', { opId: 'n' }); L.decisionLogErrors(log);
    L.convertMemberAnswers141(diepBevroren({ member: { a: 'x' } }), testOpId);
    L.withDecisionLog(diepBevroren({ onbekend: { a: 1 }, decisions: { d1: lid('lynn', 'member') } }), log);
    assert(r1 === r2 && JSON.stringify(log) === kopie, 'Niet puur');
    // Geen Date, Math.random of globale toestand in het blok.
    const src = fs.readFileSync(APP, 'utf8');
    const blok = src.slice(src.indexOf('// ── BESLISLOGBOEK (1.4.2, E4)'), src.indexOf('// ── einde BESLISLOGBOEK ──'));
    assert(!/Date\.now|new Date|Math\.random|localStorage|document\.|window\./.test(blok.replace(/^\s*\/\/.*$/gm, '')), 'Het blok gebruikt klok, toeval of globale toestand');
  },

  // ── Deel 2: de app laat onbekende meta.members-sleutels staan ──
  async 'E4 app: ledenregister bijwerken en terugdraaien laten onbekende meta.members-sleutels (zoals een logboek) staan'(ctx) {
    const fx = readFixture('leden-oud.json');
    const logboek = { d1: lid('lynn', 'member', [], { at: '2026-10-06T08:00:00Z' }) };
    fx.meta = Object.assign({}, fx.meta, { members: { decisions: logboek, toekomst: { x: 1 } } });
    const db = sharedDb(fx);
    const o = await openApp(ctx.browser, ctx.base, { target: 'test', state: db, exposeETag: true, localStorage: { plannerMyName: 'Bas', plannerPartnerName: 'Sanne', plannerLedenregister: 'aan' } });
    const b = db.puts;
    for (let i = 0; i < 8; i++) {
      try { await o.page.waitForSelector('#confirmOverlay.open', { timeout: 2500 }); } catch (e) { break; }
      await o.page.click('#confirmOkBtn'); await new Promise(r => setTimeout(r, 150));
    }
    await waitForPut(db, b);
    const mm = db.db.meta.members;
    assert(mm.version === 2 && Array.isArray(db.db.members), 'Migratie niet uitgevoerd: ' + JSON.stringify(mm));
    assert(JSON.stringify(mm.decisions) === JSON.stringify(logboek) && JSON.stringify(mm.toekomst) === '{"x":1}', 'Onbekende sleutels gewist bij bijwerken: ' + JSON.stringify(mm));
    const b2 = db.puts;
    await o.page.evaluate(() => window.huisplanLeden.terugdraaien());
    await waitForPut(db, b2);
    const na = db.db.meta && db.db.meta.members;
    assert(na && JSON.stringify(na.decisions) === JSON.stringify(logboek) && !na.version && !na.member && !('members' in db.db), 'Terugdraaien wiste onbekende sleutels of liet 1.4.1-sleutels staan: ' + JSON.stringify(na));
    assert(!db.errors.length, 'Fouten: ' + db.errors.join(' | '));
    await o.ctx.close();
  }
};
