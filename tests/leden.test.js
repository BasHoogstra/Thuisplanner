// Stap 1.4: ledenregister (data.members) en "wie ben ik op dit toestel" (plannerMemberId).
// Deel 1 test het pure rekenblok uit test/index.html los in Node (alle naambronnen, varianten,
// twijfel, stabiele ID's, twee toestellen). Deel 2 test de app op de nagebootste database.
// Nooit tegen de echte planner: alles draait op fixtures.
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
const ids = ms => ms.map(m => m.id);
const names = ms => ms.map(m => m.name);
const shuffle = (d) => { const c = clone(d); Object.keys(c).forEach(k => { if (Array.isArray(c[k])) c[k].reverse(); }); return c; };
const LOIS = 'lois|loïs';

// ── Deel 2: hulpjes voor de app ──
const BAS = { plannerMyName: 'Bas', plannerPartnerName: 'Sanne' };
const AAN = { plannerLedenregister: 'aan' };
const wait = ms => new Promise(r => setTimeout(r, ms));
const open = (ctx, db, ls, extra) => openApp(ctx.browser, ctx.base, Object.assign({ state: db, exposeETag: true, localStorage: ls }, extra || {}));
const ls = (page, k) => page.evaluate(k => localStorage.getItem(k), k);
async function answerDoubt(page, same) {
  await page.waitForSelector('#confirmOverlay.open', { timeout: 4000 });
  const q = await page.textContent('#confirmTitle');
  await page.click(same ? '#confirmOkBtn' : '#confirmCancelBtn');
  return q;
}
// Zo ziet de planner eruit na openen zónder 1.4-migratie (de bestaande omzetting van 'me'/'partner'
// naar namen draait gewoon); daarmee vergelijken we wat de migratie verder nog verandert.
async function baseline(ctx) {
  const db = sharedDb(readFixture('leden-oud.json'));
  const o = await open(ctx, db, BAS);
  await wait(500); await o.ctx.close();
  return clone(db.db);
}
// Planner na een geslaagde migratie (Loïs = Lois bevestigd), als startpunt voor andere tests.
async function migrated(ctx) {
  const db = sharedDb(readFixture('leden-oud.json'));
  const o = await open(ctx, db, Object.assign({}, BAS, AAN));
  const b = db.puts;
  await answerDoubt(o.page, true);
  await waitForPut(db, b);
  await o.ctx.close();
  return db;
}

const tests = {
  // ───────────── Deel 1: rekenblok ─────────────
  async 'leden: alle bekende naamvelden worden gevonden, plaatsvervangers niet'() {
    const R = loadRegister();
    const found = R.collectMemberNames(readFixture('leden-oud.json'));
    const srcs = new Set(found.map(f => f.src));
    ['vakantiePersonen', 'tasks.author', 'tasks.assignedTo', 'tasks.reactions', 'multiDayTasks.author', 'bestellingen.addedBy',
      'bestellingen.assignedTo', 'boodschappen.addedBy', 'inbox.addedBy', 'lijsten.items.addedBy', 'huisgeheugen.auteur',
      'notities.editedBy', 'verlanglijstjes', 'verlanglijstjes.claimedBy', 'wieIsWaar', 'vakanties.paklijst']
      .forEach(s => assert(srcs.has(s), 'Naambron niet gevonden: ' + s));
    const keys = new Set(found.map(f => f.key));
    ['me', 'partner', 'ik'].forEach(p => assert(!keys.has(p), 'Plaatsvervanger als persoon gezien: ' + p));
    assert(JSON.stringify([...keys].sort()) === JSON.stringify(['bas', 'lois', 'loïs', 'lynn', 'opa henk', 'sanne']), 'Gevonden namen: ' + [...keys]);
  },

  async 'leden: register uit bestaande data, geen naam verloren, hoofdletters en spaties samengevoegd'() {
    const R = loadRegister();
    const d = readFixture('leden-oud.json');
    const p = R.planMemberRegister(d, { myName: 'Bas', partnerName: 'Sanne' }, { [LOIS]: 'same' });
    assert(!p.doubts.length && p.changed, 'Onverwachte twijfel of geen wijziging');
    assert(JSON.stringify(names(p.members)) === JSON.stringify(['Bas', 'Sanne', 'Lynn', 'Loïs', 'Opa Henk']), 'Leden: ' + names(p.members));
    assert(new Set(ids(p.members)).size === p.members.length, 'Dubbele ID');
    p.members.forEach(m => {
      assert(/^m_[0-9a-f]{16}$/.test(m.id) && m.id === R.memberIdFor(m.name), 'ID niet afgeleid van de naam: ' + JSON.stringify(m));
      assert(m.kind === 'unknown' && /^#[0-9a-f]{6}$/.test(m.color), 'kind/color: ' + JSON.stringify(m));
    });
    // 'Bas', 'bas' en ' BAS ' zijn één lid; elke naam in de data hoort bij een lid.
    R.collectMemberNames(d).forEach(f => assert(R.findMember(p.members, f.name), 'Naam zonder lid: ' + f.name + ' (' + f.src + ')'));
    assert(R.findMember(p.members, ' bAs ').name === 'Bas', 'Variant van Bas niet herkend');
    assert(JSON.stringify(p.members.find(m => m.name === 'Loïs').aliases) === '["Lois"]', 'Lois niet als andere schrijfwijze van Loïs bewaard');
  },

  async 'leden: twijfelgeval wordt gevraagd, het antwoord wordt gebruikt en niet opnieuw gevraagd'() {
    const R = loadRegister();
    const d = readFixture('leden-oud.json');
    const open = R.planMemberRegister(d, { myName: 'Bas' }, {});
    assert(open.doubts.length === 1 && open.doubts[0].key === LOIS, 'Verwacht één twijfel Loïs/Lois: ' + JSON.stringify(open.doubts));
    assert(!open.added.some(m => m.name === 'Lois'), 'Twijfelgeval toch al als lid toegevoegd');
    const diff = R.planMemberRegister(d, {}, { [LOIS]: 'different' });
    assert(!diff.doubts.length && names(diff.members).includes('Loïs') && names(diff.members).includes('Lois'), 'Twee personen niet gemaakt');
    // Na het antwoord staat het in het register: opnieuw plannen vraagt niets meer.
    const after = R.planMemberRegister(Object.assign(clone(d), { members: diff.members }), {}, {});
    assert(!after.doubts.length && !after.changed, 'Na het antwoord toch weer twijfel of wijziging');
  },

  async 'leden: ID\'s zijn stabiel bij opnieuw uitvoeren, andere volgorde en andere toestellen'() {
    const R = loadRegister();
    const d = readFixture('leden-oud.json');
    const dec = { [LOIS]: 'same' };
    const a = R.planMemberRegister(d, { myName: 'Bas', partnerName: 'Sanne' }, dec);
    const again = R.planMemberRegister(Object.assign(clone(d), { members: a.members }), { myName: 'Bas', partnerName: 'Sanne' }, dec);
    assert(!again.changed && JSON.stringify(again.members) === JSON.stringify(a.members), 'Opnieuw uitvoeren verandert het register');
    const b = R.planMemberRegister(d, { myName: 'sanne', partnerName: ' bas' }, dec);
    assert(JSON.stringify(a.members) === JSON.stringify(b.members), 'Ander toestel geeft een ander register');
    const byId = ms => JSON.stringify(ms.slice().sort((x, y) => x.id < y.id ? -1 : 1));
    const c0 = R.planMemberRegister(shuffle(d), { myName: 'Bas' }, dec);
    assert(byId(a.members) === byId(c0.members), 'Andere volgorde in de data geeft andere leden of ID\'s');
    // Een bestaand lid houdt zijn ID, ook als de naam later anders wordt geschreven.
    const renamed = clone(a.members); renamed[0].name = 'Bastiaan'; renamed[0].aliases = ['Bas'];
    const c = R.planMemberRegister(Object.assign(clone(d), { members: renamed }), {}, dec);
    assert(c.members[0].id === a.members[0].id && !c.added.length, 'Bestaand lid kreeg een nieuw ID of dubbel lid');
  },

  async 'leden: twee toestellen die tegelijk migreren maken geen dubbele leden'() {
    const R = loadRegister();
    const d = readFixture('leden-oud.json');
    const dec = { [LOIS]: 'same' };
    // Toestel A kent een naam die nog nergens in de data staat (Kees); B niet.
    const A = R.planMemberRegister(d, { myName: 'Kees', partnerName: 'Bas' }, dec);
    const B = R.planMemberRegister(d, { myName: 'Sanne', partnerName: 'BAS' }, dec);
    const union = {}; A.members.concat(B.members).forEach(m => { union[m.id] = union[m.id] || []; union[m.id].push(m.name); });
    const perKey = {}; Object.values(union).forEach(n => { const k = R.memberKey(n[0]); perKey[k] = (perKey[k] || 0) + 1; });
    assert(Object.values(perKey).every(n => n === 1), 'Zelfde persoon onder twee ID\'s: ' + JSON.stringify(union));
    assert(Object.keys(union).length === 6, 'Verwacht 6 leden na samenvoegen (5 + Kees): ' + JSON.stringify(union));
  },

  async 'leden: terugdraaien haalt precies het register weg'() {
    const R = loadRegister();
    const d = readFixture('leden-oud.json');
    const m = clone(d); m.members = R.planMemberRegister(d, {}, { [LOIS]: 'same' }).members; m.meta.members = { version: 1 };
    assert(JSON.stringify(R.withoutMemberRegister(m)) === JSON.stringify(d), 'Terugdraaien geeft niet de oude stand');
  },

  // ───────────── Deel 2: de app op de nagebootste database ─────────────
  async 'leden-app: zonder schakelaar wordt er niets gemigreerd'(ctx) {
    const db = sharedDb(readFixture('leden-oud.json'));
    const o = await open(ctx, db, BAS);
    await wait(500);
    assert(!(await o.page.isVisible('#confirmOverlay.open')), 'Vraag verschijnt terwijl de migratie uit staat');
    assert(!('members' in (db.db || {})) && !(db.db.meta && db.db.meta.members), 'Register geschreven zonder schakelaar');
    assert((await ls(o.page, 'plannerMemberId')) === null, 'plannerMemberId gezet zonder register');
    await o.ctx.close();
  },

  async 'leden-app: migratie vraagt één keer, schrijft alleen het register en is idempotent'(ctx) {
    const fx = await baseline(ctx);
    const db = sharedDb(readFixture('leden-oud.json'));
    const o = await open(ctx, db, Object.assign({}, BAS, AAN));
    const b = db.puts;
    const q = await answerDoubt(o.page, true);
    assert(/Loïs/.test(q) && /Lois/.test(q), 'Vraag noemt niet beide schrijfwijzen: ' + q);
    await waitForPut(db, b);
    assert(JSON.stringify(db.db.members.map(m => m.name)) === JSON.stringify(['Bas', 'Sanne', 'Lynn', 'Loïs', 'Opa Henk']), 'Register: ' + JSON.stringify(db.db.members));
    assert(db.db.meta.members.version === 1 && db.db.meta.members.decisions[LOIS] === 'same' && db.db.meta.members.app === '1.4.0', 'meta.members: ' + JSON.stringify(db.db.meta));
    // Additief: verder is de data gelijk aan vóór de migratie (alle namen staan er nog).
    const rest = clone(db.db); delete rest.members; delete rest.meta.members;
    const diff = diffPaths(fx, rest);
    assert(!diff.length, 'Migratie wijzigde andere data: ' + diff.join(', '));
    assert(JSON.parse(await ls(o.page, 'plannerLedenBackup')).check, 'Geen vangnet vóór de migratie');
    const errs = require('./schema.test.js').__validate(db.db);
    assert(!errs.length, 'Gemigreerde data past niet in het schema: ' + errs.slice(0, 5).join(' | '));
    const basId = db.db.members[0].id;
    assert((await ls(o.page, 'plannerMemberId')) === basId, 'Toestel niet gekoppeld aan Bas');
    // Opnieuw openen: geen vraag, geen extra opslag, zelfde ID's.
    const ids0 = JSON.stringify(db.db.members.map(m => m.id)), puts0 = db.puts;
    await o.page.reload(); await wait(2000);
    assert(!(await o.page.isVisible('#confirmOverlay.open')), 'Vraag opnieuw gesteld');
    assert(db.puts === puts0 && JSON.stringify(db.db.members.map(m => m.id)) === ids0, 'Opnieuw openen veranderde het register (puts ' + puts0 + '→' + db.puts + ')');
    const st = await o.page.evaluate(() => window.huisplanLeden.status());
    assert(st.aan && st.versie === 1 && st.leden === 5 && st.plannerMemberId === basId && st.vangnet, 'Status: ' + JSON.stringify(st));
    assert(!db.errors.length, 'Fouten: ' + db.errors.join(' | '));
    await o.ctx.close();
  },

  async 'leden-app: twee toestellen tegelijk maken geen dubbele leden'(ctx) {
    const db = sharedDb(readFixture('huishouden.json'));
    const [A, B] = await Promise.all([
      open(ctx, db, Object.assign({}, BAS, AAN)),
      open(ctx, db, { plannerMyName: 'Sanne', plannerPartnerName: 'Bas', plannerLedenregister: 'aan' })
    ]);
    await wait(2500);
    await Promise.all([A, B].map(o => o.page.evaluate(() => document.getElementById('refreshBtn').click())));
    await wait(2000);
    const ms = db.db.members || [];
    assert(new Set(ms.map(m => m.id)).size === ms.length, 'Dubbele ID\'s: ' + JSON.stringify(ms));
    assert(JSON.stringify(ms.map(m => m.name).sort()) === JSON.stringify(['Bas', 'Freya', 'Lynn', 'Sanne']), 'Leden: ' + JSON.stringify(ms));
    const idA = await ls(A.page, 'plannerMemberId'), idB = await ls(B.page, 'plannerMemberId');
    assert(idA === ms.find(m => m.name === 'Bas').id && idB === ms.find(m => m.name === 'Sanne').id, 'Toestellen verkeerd gekoppeld');
    assert(!db.errors.length, 'Fouten: ' + db.errors.join(' | '));
    await A.ctx.close(); await B.ctx.close();
  },

  async 'leden-app: toestel met alleen plannerMemberId krijgt zijn naam uit het register'(ctx) {
    const db = await migrated(ctx);
    const sanneId = db.db.members.find(m => m.name === 'Sanne').id;
    const o = await open(ctx, db, { plannerMyName: null, plannerPartnerName: null, plannerMemberId: sanneId });
    assert(!(await o.page.isVisible('#nameBanner')), 'Naambalk zichtbaar terwijl de identiteit bekend is');
    assert((await o.page.textContent('#greetingText')).includes('Sanne'), 'Begroeting zonder Sanne');
    assert((await ls(o.page, 'plannerMyName')) === 'Sanne', 'myName niet afgeleid');
    const b = db.puts;
    await o.page.click('[data-view="boodschappenView"]');
    await o.page.fill('#boodschapInput', 'Kaas'); await o.page.press('#boodschapInput', 'Enter');
    await waitForPut(db, b);
    assert(db.db.boodschappen.find(x => x.text === 'Kaas').addedBy === 'Sanne', 'addedBy niet Sanne');
    await o.ctx.close();
  },

  async 'leden-app: bestaande naam blijft leidend (ook andere hoofdletters); koppeling via het register'(ctx) {
    const db = await migrated(ctx);
    const o = await open(ctx, db, { plannerMyName: 'bas', plannerPartnerName: 'Sanne' });
    assert((await ls(o.page, 'plannerMemberId')) === db.db.members[0].id, 'bas niet gekoppeld aan lid Bas');
    assert((await ls(o.page, 'plannerMyName')) === 'bas', 'Opgeslagen naam veranderd (verlanglijstjes hangen aan deze spelling)');
    assert((await o.page.textContent('#greetingText')).includes('bas'), 'Begroeting gebruikt niet de bestaande naam');
    await o.ctx.close();
  },

  async 'leden-app: toestel zonder identiteit werkt als voorheen en kan kiezen uit het register'(ctx) {
    const db = await migrated(ctx);
    const o = await open(ctx, db, { plannerMyName: null, plannerPartnerName: null });
    assert(await o.page.isVisible('#nameBanner'), 'Naambalk ontbreekt');
    const opts = await o.page.$$eval('#memberNameList option', os => os.map(x => x.value));
    assert(JSON.stringify(opts) === JSON.stringify(['Bas', 'Sanne', 'Lynn', 'Loïs', 'Opa Henk']), 'Keuzelijst: ' + opts);
    assert((await ls(o.page, 'plannerMemberId')) === null, 'Gekoppeld zonder identiteit');
    await o.page.fill('#nameBannerInput', 'lynn'); await o.page.click('#nameBannerSave'); await wait(300);
    assert((await ls(o.page, 'plannerMemberId')) === db.db.members.find(m => m.name === 'Lynn').id, 'Niet gekoppeld na kiezen');
    assert((await ls(o.page, 'plannerMyName')) === 'lynn', 'Ingevulde naam niet bewaard zoals getypt');
    await o.ctx.close();
  },

  async 'leden-app: oude versie (1.3) bewaart het register bij opslaan'(ctx) {
    const db = await migrated(ctx);
    const before = JSON.stringify(db.db.members);
    const o = await open(ctx, db, BAS, { target: 'root' });
    const b = db.puts;
    await o.page.click('[data-view="boodschappenView"]');
    await o.page.fill('#boodschapInput', 'Thee'); await o.page.press('#boodschapInput', 'Enter');
    await waitForPut(db, b);
    assert(db.db.boodschappen.some(x => x.text === 'Thee') && JSON.stringify(db.db.members) === before, 'Oude versie raakte het register kwijt');
    assert(db.db.meta.members.version === 1, 'Oude versie raakte meta.members kwijt');
    await o.ctx.close();
  },

  async 'leden-app: terugdraaien geeft exact de planner van vóór de migratie'(ctx) {
    const fx = await baseline(ctx);
    const db = sharedDb(readFixture('leden-oud.json'));
    const o = await open(ctx, db, Object.assign({}, BAS, AAN));
    let b = db.puts;
    await answerDoubt(o.page, false);
    await waitForPut(db, b);
    assert(db.db.members.length === 6, 'Verwacht 6 leden bij "twee personen"');
    b = db.puts;
    const r = await o.page.evaluate(() => window.huisplanLeden.terugdraaien());
    await waitForPut(db, b);
    assert(r.gelijkAanVoorDeMigratie === true, 'Controlesom wijkt af: ' + JSON.stringify(r));
    const diff = diffPaths(fx, db.db);
    assert(!diff.length && !('members' in db.db), 'Na terugdraaien wijkt de data af: ' + diff.join(', '));
    assert((await ls(o.page, 'plannerMemberId')) === null && (await ls(o.page, 'plannerLedenregister')) === null, 'Toestelinstellingen niet teruggezet');
    await o.ctx.close();
  },
};

// De app-tests (deel 2) horen bij de versie die het register heeft. Draait de testset tegen de
// live-versie (--target=root) terwijl die nog 1.3 is, dan worden ze overgeslagen met een melding.
const liveHasRegister = () => fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').includes('// ── LEDENREGISTER (roadmap 1.4)');
Object.keys(tests).forEach(name => {
  if (!name.startsWith('leden-app:')) return;
  const fn = tests[name];
  tests[name] = async ctx => {
    if (process.env.TARGET === 'root' && !liveHasRegister()) { console.log('    (overgeslagen: live-versie heeft het ledenregister nog niet)'); return; }
    return fn(ctx);
  };
});
module.exports = tests;
