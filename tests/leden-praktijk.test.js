// Stap 1.4.1: huishoudlid ≠ elke naam die ergens in de planner staat.
// Praktijk (4 okt 2026): 1.4.0 maakte op een echte planner zes leden: Bas, Sanne, Lynn, Loïs, Freya
// (het paard) en Boodschappen (een paklijstkolom). Oorzaak: vakantiePersonen en de paklijstkolommen
// zijn vrije labels. Deze tests leggen vast dat zulke labels alleen kandidaat zijn, dat een bestaand
// 1.4.0-register veilig wordt gecorrigeerd, en dat de vakantiegegevens zelf ongewijzigd blijven.
// Fixtures: tests/fixtures/leden-praktijk.json (verzonnen inhoud, zelfde vorm als de praktijk) en
// leden-praktijk-v14.json (dezelfde planner met het register zoals 1.4.0 het maakte).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { openApp, readFixture, sharedDb, diffPaths, waitForPut, assert, clone } = require('./lib');

const APP = path.join(__dirname, '..', 'test', 'index.html');
function loadRegister() {
  const src = fs.readFileSync(APP, 'utf8');
  const a = src.indexOf('// ── LEDENREGISTER (roadmap 1.4)'), b = src.indexOf('// ── einde LEDENREGISTER ──');
  assert(a > -1 && b > a, 'Ledenregister-blok niet gevonden in test/index.html');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b), ctx);
  return ctx;
}
const names = ms => ms.map(m => m.name);
const DEV_BAS = { myName: 'Bas', partnerName: 'Sanne' };
const DEV_SANNE = { myName: 'Sanne', partnerName: 'Bas' };
// Zo zou de gebruiker antwoorden: de kinderen horen erbij, het paard en de categorie niet.
const ANS = { lynn: 'yes', 'loïs': 'yes', freya: 'no', boodschappen: 'no' };
const HUISHOUDEN = ['Bas', 'Sanne', 'Lynn', 'Loïs'];

// ── app-hulpjes ──
const wait = ms => new Promise(r => setTimeout(r, ms));
const ls = (page, k) => page.evaluate(k => localStorage.getItem(k), k);
const open = (ctx, db, lsItems, extra) => openApp(ctx.browser, ctx.base, Object.assign({ state: db, exposeETag: true, localStorage: lsItems }, extra || {}));
async function answerAll(page, member) {
  const asked = [];
  for (;;) {
    try { await page.waitForSelector('#confirmOverlay.open', { timeout: 2500 }); } catch (e) { break; }
    const t = await page.textContent('#confirmTitle'); asked.push(t);
    await page.click(member(t) ? '#confirmOkBtn' : '#confirmCancelBtn');
    await wait(150);
  }
  return asked;
}
const realistic = t => !/Freya|Boodschappen|Oma/.test(t);
// Een toestel zoals dat van Bas na de activatie van 1.4.0: schakelaar aan, gekoppeld aan Bas.
function basDevice(v14) {
  return { plannerMyName: 'Bas', plannerPartnerName: 'Sanne', plannerLedenregister: 'aan', plannerMemberId: v14.members.find(m => m.name === 'Bas').id };
}
// Corrigeert het 1.4.0-register op de nagebootste database en geeft die terug.
async function corrected(ctx) {
  const v14 = readFixture('leden-praktijk-v14.json');
  const db = sharedDb(v14);
  const o = await open(ctx, db, basDevice(v14));
  const b = db.puts;
  await answerAll(o.page, realistic);
  await waitForPut(db, b);
  await o.ctx.close();
  return { db, v14 };
}

const tests = {
  // ───────────── rekenblok ─────────────
  async 'praktijk: vakantielabels zijn kandidaat; alleen echte huishoudleden worden lid'() {
    const R = loadRegister();
    const d = readFixture('leden-praktijk.json');
    const p0 = R.planMemberRegister(d, DEV_BAS, {}, {});
    assert(JSON.stringify(names(p0.members)) === '["Bas","Sanne"]', 'Zonder antwoorden alleen de betrouwbare leden: ' + names(p0.members));
    assert(JSON.stringify(p0.questions.map(q => q.name)) === '["Lynn","Loïs","Freya","Boodschappen"]', 'Vragen: ' + JSON.stringify(p0.questions));
    p0.questions.forEach(q => assert(q.sources.every(s => ['vakantiePersonen', 'vakanties.paklijst'].includes(s)), 'Vraag zonder labelbron: ' + JSON.stringify(q)));
    const p = R.planMemberRegister(d, DEV_BAS, {}, ANS);
    assert(JSON.stringify(names(p.members)) === JSON.stringify(HUISHOUDEN), 'Leden: ' + names(p.members));
    assert(!R.findMember(p.members, 'Freya') && !R.findMember(p.members, 'Boodschappen'), 'Paard of categorie toch lid');
    p.members.forEach(m => assert(m.id === R.memberIdFor(m.name), 'ID niet vast afgeleid: ' + JSON.stringify(m)));
    assert(!p.questions.length && !p.doubts.length, 'Na de antwoorden nog vragen');
  },

  async 'praktijk: 1.4-register met 6 leden wordt 4 leden met dezelfde ID\'s; vakantiegegevens blijven'() {
    const R = loadRegister();
    const v14 = readFixture('leden-praktijk-v14.json');
    const voor = clone(v14);
    assert(JSON.stringify(names(v14.members)) === '["Bas","Sanne","Lynn","Loïs","Freya","Boodschappen"]', 'Fixture is niet het 1.4.0-register');
    const q = R.planMemberRegister(v14, DEV_BAS, {}, {});
    assert(JSON.stringify(q.questions.map(x => x.name)) === '["Lynn","Loïs","Freya","Boodschappen"]' && !q.removed.length, 'Zonder antwoorden mag er niets weg: ' + JSON.stringify(q.questions));
    const p = R.planMemberRegister(v14, DEV_BAS, {}, ANS);
    assert(JSON.stringify(names(p.members)) === JSON.stringify(HUISHOUDEN), 'Leden na correctie: ' + names(p.members));
    assert(JSON.stringify(names(p.removed)) === '["Freya","Boodschappen"]', 'Verwijderd: ' + names(p.removed));
    // Blijvende leden zijn precies dezelfde objecten (ID, kleur, kind) als in 1.4.0.
    p.members.forEach(m => assert(JSON.stringify(m) === JSON.stringify(v14.members.find(x => x.id === m.id)), 'Lid veranderd: ' + JSON.stringify(m)));
    // Plannen verandert de planner zelf niet; Freya en Boodschappen blijven in de vakantiegegevens.
    assert(JSON.stringify(v14) === JSON.stringify(voor), 'planMemberRegister wijzigde de invoer');
    const na = clone(v14); na.members = p.members;
    assert(na.vakantiePersonen.includes('Freya') && na.vakantiePersonen.includes('Boodschappen'), 'Labels uit vakantiePersonen verdwenen');
    assert(na.vakanties[0].paklijst.Freya[0].text === 'Hooinet' && na.vakanties[0].paklijst.Boodschappen[0].text === 'Koffie', 'Paklijst van Freya of Boodschappen beschadigd');
  },

  async 'praktijk: oma die meegaat op vakantie wordt niet vanzelf huishoudlid'() {
    const R = loadRegister();
    const d = readFixture('leden-praktijk.json');
    d.vakantiePersonen.push('Oma'); d.vakanties[0].paklijst.Oma = [{ id: 'p7', text: 'Leesbril', done: false }];
    const p = R.planMemberRegister(d, DEV_BAS, {}, ANS);
    assert(!R.findMember(p.members, 'Oma') && p.questions.some(q => q.name === 'Oma'), 'Oma zonder vraag lid geworden of niet gevraagd');
    const nee = R.planMemberRegister(d, DEV_BAS, {}, Object.assign({ oma: 'no' }, ANS));
    assert(!R.findMember(nee.members, 'Oma') && !nee.questions.length, 'Na "nee" toch lid of opnieuw gevraagd');
  },

  async 'praktijk: een huishoudlid dat ook in de vakantiegegevens staat blijft één lid, zonder vraag'() {
    const R = loadRegister();
    const d = readFixture('leden-praktijk.json');
    const p = R.planMemberRegister(d, DEV_BAS, {}, ANS);
    ['Bas', 'Sanne'].forEach(n => {
      assert(p.members.filter(m => R.findMember([m], n)).length === 1, n + ' niet precies één keer lid');
      assert(!R.planMemberRegister(d, DEV_BAS, {}, {}).questions.some(q => q.name === n), n + ' werd toch gevraagd');
    });
  },

  async 'praktijk: nieuw huishouden zonder geschiedenis krijgt alleen de namen van het toestel'() {
    const R = loadRegister();
    const p = R.planMemberRegister({}, DEV_BAS, {}, {});
    assert(JSON.stringify(names(p.members)) === '["Bas","Sanne"]' && !p.questions.length, 'Nieuw huishouden: ' + JSON.stringify(p));
    const p2 = R.planMemberRegister({ vakantiePersonen: ['Bas', 'Sanne'] }, DEV_BAS, {}, {});
    assert(JSON.stringify(names(p2.members)) === '["Bas","Sanne"]' && !p2.questions.length, 'Standaard vakantiePersonen gaf vragen');
  },

  async 'praktijk: idempotent, twee toestellen gelijk, en "nee" wint bij tegenstrijdige antwoorden'() {
    const R = loadRegister();
    const v14 = readFixture('leden-praktijk-v14.json');
    const a = R.planMemberRegister(v14, DEV_BAS, {}, ANS);
    const b = R.planMemberRegister(v14, DEV_SANNE, {}, ANS);
    assert(JSON.stringify(a.members) === JSON.stringify(b.members), 'Twee toestellen geven een ander register');
    const again = R.planMemberRegister(Object.assign(clone(v14), { members: a.members }), DEV_BAS, {}, ANS);
    assert(!again.changed && !again.questions.length && JSON.stringify(again.members) === JSON.stringify(a.members), 'Opnieuw uitvoeren verandert iets');
    const h = R.memberDecisionKey('freya');
    assert(R.memberMembership({ member: { [h]: 'freya' }, notMember: { [h]: 'freya' } }).freya === 'no', '"ja" wint van "nee"');
    assert(R.memberMembership({ notMember: { [h]: 'freya' }, member: { [h]: 'freya' } }).freya === 'no', 'volgorde bepaalt de uitkomst');
    assert(/^p_[0-9a-f]{16}$/.test(h), 'Sleutel niet veilig voor Firebase: ' + h);
  },

  // ───────────── de app op de nagebootste database ─────────────
  async 'praktijk-app: 1.4-register wordt na vragen gecorrigeerd; vakantie, ID\'s en koppeling blijven'(ctx) {
    const v14 = readFixture('leden-praktijk-v14.json');
    const db = sharedDb(v14);
    const o = await open(ctx, db, basDevice(v14));
    const b = db.puts;
    const asked = await answerAll(o.page, realistic);
    assert(asked.length === 4 && ['Lynn', 'Loïs', 'Freya', 'Boodschappen'].every((n, i) => asked[i].includes('“' + n + '”') && /bij jullie huishouden/.test(asked[i]) && /vakantiepersonen en paklijsten/.test(asked[i])), 'Vragen: ' + asked.join(' | '));
    await waitForPut(db, b);
    assert(JSON.stringify(db.db.members.map(m => m.name)) === JSON.stringify(HUISHOUDEN), 'Leden: ' + JSON.stringify(db.db.members));
    db.db.members.forEach(m => assert(JSON.stringify(m) === JSON.stringify(v14.members.find(x => x.id === m.id)), 'Lid veranderd: ' + JSON.stringify(m)));
    // Alleen members en meta.members veranderd; vakantiePersonen en paklijsten (Freya, Boodschappen) gelijk.
    const rest = clone(db.db); delete rest.members; delete rest.meta.members;
    const exp = clone(v14); delete exp.members; delete exp.meta.members;
    const diff = diffPaths(exp, rest);
    assert(!diff.length, 'Correctie wijzigde andere data: ' + diff.join(', '));
    const mm = db.db.meta.members;
    assert(mm.version === 2 && mm.app === '1.4.1' && mm.migratedAt === v14.meta.members.migratedAt, 'meta.members: ' + JSON.stringify(mm));
    assert(JSON.stringify(Object.values(mm.member).sort()) === '["loïs","lynn"]' && JSON.stringify(Object.values(mm.notMember).sort()) === '["boodschappen","freya"]', 'Antwoorden: ' + JSON.stringify(mm));
    assert((await ls(o.page, 'plannerMemberId')) === basDevice(v14).plannerMemberId, 'plannerMemberId wijst niet meer naar Bas');
    assert((await ls(o.page, 'plannerLedenregister')) === 'aan-1.4.1', 'Schakelaar niet omgezet naar aan-1.4.1');
    const v1 = JSON.parse(await ls(o.page, 'plannerLedenBackupV1'));
    assert(v1 && v1.members.length === 6 && v1.meta.version === 1, 'Geen vangnet van het 1.4.0-register');
    const errs = require('./schema.test.js').__validate(db.db);
    assert(!errs.length, 'Past niet in het schema: ' + errs.slice(0, 5).join(' | '));
    // Idempotent: opnieuw openen vraagt en schrijft niets.
    const puts0 = db.puts;
    await o.page.reload();
    assert(!(await answerAll(o.page, () => true)).length && db.puts === puts0, 'Opnieuw openen vroeg of schreef iets');
    // Gewone wijziging, daarna terugdraaien: alleen het register weg, de rest blijft.
    let b2 = db.puts;
    await o.page.click('[data-view="boodschappenView"]');
    await o.page.fill('#boodschapInput', 'Wortels'); await o.page.press('#boodschapInput', 'Enter');
    await waitForPut(db, b2);
    b2 = db.puts;
    await o.page.evaluate(() => window.huisplanLeden.terugdraaien());
    await waitForPut(db, b2);
    assert(!('members' in db.db) && !(db.db.meta && db.db.meta.members), 'Register niet weg na terugdraaien');
    assert(db.db.boodschappen.some(x => x.text === 'Wortels') && db.db.vakantiePersonen.includes('Freya') && db.db.vakanties[0].paklijst.Boodschappen.length === 1, 'Terugdraaien raakte andere data');
    assert(!db.errors.length, 'Fouten: ' + db.errors.join(' | '));
    await o.ctx.close();
  },

  async 'praktijk-app: twee toestellen corrigeren tegelijk zonder dubbele of verdwenen leden'(ctx) {
    const v14 = readFixture('leden-praktijk-v14.json');
    const db = sharedDb(v14);
    const [A, B] = await Promise.all([
      open(ctx, db, basDevice(v14)),
      open(ctx, db, { plannerMyName: 'Sanne', plannerPartnerName: 'Bas', plannerLedenregister: 'aan' })
    ]);
    await Promise.all([answerAll(A.page, realistic), answerAll(B.page, realistic)]);
    await wait(2000);
    for (let i = 0; i < 2; i++) { await Promise.all([A, B].map(o => o.page.evaluate(() => document.getElementById('refreshBtn').click()))); await wait(2000); }
    const ms = db.db.members;
    assert(JSON.stringify(ms.map(m => m.name)) === JSON.stringify(HUISHOUDEN) && new Set(ms.map(m => m.id)).size === 4, 'Leden: ' + JSON.stringify(ms));
    assert((await ls(B.page, 'plannerMemberId')) === ms.find(m => m.name === 'Sanne').id, 'Sanne niet gekoppeld');
    assert(db.db.vakantiePersonen.length === 6 && Object.keys(db.db.vakanties[0].paklijst).length === 6, 'Vakantiegegevens veranderd');
    assert(!db.errors.length, 'Fouten: ' + db.errors.join(' | '));
    await A.ctx.close(); await B.ctx.close();
  },

  async 'praktijk-app: een nog openstaande oudere versie zet Freya en Boodschappen niet terug'(ctx) {
    const { db } = await corrected(ctx);
    // Hetzelfde toestel, maar met de live-versie (op dit moment nog 1.4.0); de schakelaar staat na
    // 1.4.1 op 'aan-1.4.1', wat 1.4.0 niet als "aan" herkent.
    const o = await open(ctx, db, { plannerMyName: 'Bas', plannerPartnerName: 'Sanne', plannerLedenregister: 'aan-1.4.1' }, { target: 'root' });
    const b = db.puts;
    await o.page.click('[data-view="boodschappenView"]');
    await o.page.fill('#boodschapInput', 'Hooi'); await o.page.press('#boodschapInput', 'Enter');
    await waitForPut(db, b);
    await wait(1500);
    assert(JSON.stringify(db.db.members.map(m => m.name)) === JSON.stringify(HUISHOUDEN), 'Oudere versie zette labels terug: ' + JSON.stringify(db.db.members.map(m => m.name)));
    assert(db.db.boodschappen.some(x => x.text === 'Hooi') && db.db.meta.members.version === 2, 'Opslaan of meta.members mis');
    await o.ctx.close();
  },
};

// App-tests horen bij de versie met 1.4.1; tegen een live-versie zonder 1.4.1 worden ze overgeslagen.
const liveHas141 = () => fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').includes("MEMBERS_SWITCH_ON='aan-1.4.1'");
Object.keys(tests).forEach(name => {
  if (!name.startsWith('praktijk-app:')) return;
  const fn = tests[name];
  tests[name] = async ctx => {
    if (process.env.TARGET === 'root' && !liveHas141()) { console.log('    (overgeslagen: live-versie heeft het ledenregister van 1.4.1 nog niet)'); return; }
    return fn(ctx);
  };
});
module.exports = tests;
