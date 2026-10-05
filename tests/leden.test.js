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
// 1.4.1: in deze fixture zijn Loïs en Opa Henk alleen vakantielabels; deze tests gaan over andere
// dingen en geven daarom "ja, hoort erbij" mee (zoals de gebruiker zou antwoorden).
const YES = { 'loïs': 'yes', 'opa henk': 'yes' };

// ── Deel 2: hulpjes voor de app ──
const BAS = { plannerMyName: 'Bas', plannerPartnerName: 'Sanne' };
const AAN = { plannerLedenregister: 'aan' };
const wait = ms => new Promise(r => setTimeout(r, ms));
const open = (ctx, db, ls, extra) => openApp(ctx.browser, ctx.base, Object.assign({ state: db, exposeETag: true, localStorage: ls }, extra || {}));
const ls = (page, k) => page.evaluate(k => localStorage.getItem(k), k);
const isDoubt = t => /dezelfde persoon/.test(t);
// Beantwoordt alle vragen die de app stelt: "Hoort … bij jullie huishouden?" via member(titel),
// "Zijn … dezelfde persoon?" via same. Geeft de gestelde vragen terug.
async function answerAll(page, opts = {}) {
  const member = opts.member || (() => true), same = opts.same !== false, asked = [];
  for (;;) {
    try { await page.waitForSelector('#confirmOverlay.open', { timeout: opts.timeout || 2500 }); } catch (e) { break; }
    const t = await page.textContent('#confirmTitle'); asked.push(t);
    if (opts.stopAtDoubt && isDoubt(t)) break;
    await page.click((isDoubt(t) ? same : member(t)) ? '#confirmOkBtn' : '#confirmCancelBtn');
    await wait(150);
  }
  return asked;
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
  await answerAll(o.page);
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
    const p = R.planMemberRegister(d, { myName: 'Bas', partnerName: 'Sanne' }, { [LOIS]: 'same' }, YES);
    assert(!p.doubts.length && !p.questions.length && p.changed, 'Onverwachte twijfel of vraag, of geen wijziging');
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
    const open = R.planMemberRegister(d, { myName: 'Bas' }, {}, YES);
    assert(open.doubts.length === 1 && open.doubts[0].key === LOIS, 'Verwacht één twijfel Loïs/Lois: ' + JSON.stringify(open.doubts));
    assert(!open.added.some(m => m.name === 'Lois'), 'Twijfelgeval toch al als lid toegevoegd');
    const diff = R.planMemberRegister(d, {}, { [LOIS]: 'different' }, YES);
    assert(!diff.doubts.length && names(diff.members).includes('Loïs') && names(diff.members).includes('Lois'), 'Twee personen niet gemaakt');
    // Na het antwoord staat het in het register: opnieuw plannen vraagt niets meer.
    const after = R.planMemberRegister(Object.assign(clone(d), { members: diff.members }), {}, {}, YES);
    assert(!after.doubts.length && !after.questions.length && !after.changed, 'Na het antwoord toch weer twijfel, vraag of wijziging');
  },

  async 'leden: ID\'s zijn stabiel bij opnieuw uitvoeren, andere volgorde en andere toestellen'() {
    const R = loadRegister();
    const d = readFixture('leden-oud.json');
    const dec = { [LOIS]: 'same' };
    const a = R.planMemberRegister(d, { myName: 'Bas', partnerName: 'Sanne' }, dec, YES);
    const again = R.planMemberRegister(Object.assign(clone(d), { members: a.members }), { myName: 'Bas', partnerName: 'Sanne' }, dec, YES);
    assert(!again.changed && JSON.stringify(again.members) === JSON.stringify(a.members), 'Opnieuw uitvoeren verandert het register');
    const b = R.planMemberRegister(d, { myName: 'sanne', partnerName: ' bas' }, dec, YES);
    assert(JSON.stringify(a.members) === JSON.stringify(b.members), 'Ander toestel geeft een ander register');
    const byId = ms => JSON.stringify(ms.slice().sort((x, y) => x.id < y.id ? -1 : 1));
    const c0 = R.planMemberRegister(shuffle(d), { myName: 'Bas' }, dec, YES);
    assert(byId(a.members) === byId(c0.members), 'Andere volgorde in de data geeft andere leden of ID\'s');
    // Een bestaand lid houdt zijn ID, ook als de naam later anders wordt geschreven.
    const renamed = clone(a.members); renamed[0].name = 'Bastiaan'; renamed[0].aliases = ['Bas'];
    const c = R.planMemberRegister(Object.assign(clone(d), { members: renamed }), {}, dec, YES);
    assert(c.members[0].id === a.members[0].id && !c.added.length, 'Bestaand lid kreeg een nieuw ID of dubbel lid');
  },

  async 'leden: twee toestellen die tegelijk migreren maken geen dubbele leden'() {
    const R = loadRegister();
    const d = readFixture('leden-oud.json');
    const dec = { [LOIS]: 'same' };
    // Toestel A kent een naam die nog nergens in de data staat (Kees); B niet.
    const A = R.planMemberRegister(d, { myName: 'Kees', partnerName: 'Bas' }, dec, YES);
    const B = R.planMemberRegister(d, { myName: 'Sanne', partnerName: 'BAS' }, dec, YES);
    const union = {}; A.members.concat(B.members).forEach(m => { union[m.id] = union[m.id] || []; union[m.id].push(m.name); });
    const perKey = {}; Object.values(union).forEach(n => { const k = R.memberKey(n[0]); perKey[k] = (perKey[k] || 0) + 1; });
    assert(Object.values(perKey).every(n => n === 1), 'Zelfde persoon onder twee ID\'s: ' + JSON.stringify(union));
    assert(Object.keys(union).length === 6, 'Verwacht 6 leden na samenvoegen (5 + Kees): ' + JSON.stringify(union));
  },

  async 'leden: tegenstrijdige antwoorden: "twee personen" wint en het register herstelt zich'() {
    const R = loadRegister();
    const d = readFixture('leden-oud.json');
    const h = R.memberDecisionKey(LOIS);
    assert(/^p_[0-9a-f]{16}$/.test(h), 'Sleutel niet veilig voor Firebase: ' + h);
    // Samengevoegde antwoorden van twee toestellen, in beide volgordes: altijd "different".
    assert(R.memberDecisions({ same: { [h]: LOIS }, different: { [h]: LOIS } })[LOIS] === 'different', 'different wint niet');
    assert(R.memberDecisions({ different: { [h]: LOIS }, same: { [h]: LOIS } })[LOIS] === 'different', 'volgorde bepaalt de uitkomst');
    assert(R.memberDecisions({ same: { [h]: LOIS } })[LOIS] === 'same', 'same alleen niet herkend');
    // Register zoals na het samenvoegen van A ("dezelfde": alias) en B ("twee personen": eigen lid).
    const same = R.planMemberRegister(d, {}, { [LOIS]: 'same' }, YES).members;
    const diffM = R.planMemberRegister(d, {}, { [LOIS]: 'different' }, YES).members;
    const merged = same.concat(diffM.filter(m => !same.some(x => x.id === m.id)));
    const fixed = R.planMemberRegister(Object.assign(clone(d), { members: merged }), {}, { [LOIS]: 'different' }, YES);
    assert(fixed.changed && !fixed.members.some(m => (m.aliases || []).includes('Lois')), 'Alias Lois niet weggehaald');
    assert(fixed.members.filter(m => R.findMember([m], 'Lois')).length === 1 && fixed.members.filter(m => R.findMember([m], 'Loïs')).length === 1, 'Lois en Loïs niet elk precies één lid');
    // Ook als alleen het samengevoegde register van A er is: Lois wordt een eigen lid met vast ID.
    const onlyA = R.planMemberRegister(Object.assign(clone(d), { members: same }), {}, { [LOIS]: 'different' }, YES);
    assert(onlyA.members.some(m => m.name === 'Lois' && m.id === R.memberIdFor('Lois')), 'Lois geen eigen lid met vast ID');
    const again = R.planMemberRegister(Object.assign(clone(d), { members: fixed.members }), {}, { [LOIS]: 'different' }, YES);
    assert(!again.changed, 'Herstel is niet idempotent');
  },

  async 'leden: terugdraaien haalt precies het register weg'() {
    const R = loadRegister();
    const d = readFixture('leden-oud.json');
    const m = clone(d); m.members = R.planMemberRegister(d, {}, { [LOIS]: 'same' }, YES).members; m.meta.members = { version: 2 };
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
    const asked = await answerAll(o.page);
    const q = asked.find(isDoubt) || '';
    assert(/Loïs/.test(q) && /Lois/.test(q), 'Vraag noemt niet beide schrijfwijzen: ' + asked.join(' | '));
    assert(asked.filter(t => /bij jullie huishouden/.test(t)).length === 2, 'Verwacht 2 lidvragen (Loïs, Opa Henk): ' + asked.join(' | '));
    await waitForPut(db, b);
    assert(JSON.stringify(db.db.members.map(m => m.name)) === JSON.stringify(['Bas', 'Sanne', 'Lynn', 'Loïs', 'Opa Henk']), 'Register: ' + JSON.stringify(db.db.members));
    const mm = db.db.meta.members;
    assert(mm.version === 2 && Object.values(mm.same || {}).includes(LOIS) && !mm.different && mm.app === '1.4.1', 'meta.members: ' + JSON.stringify(db.db.meta));
    assert(JSON.stringify(Object.values(mm.member || {}).sort()) === JSON.stringify(['loïs', 'opa henk']) && !mm.notMember, 'Lid-antwoorden: ' + JSON.stringify(mm));
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
    assert(st.aan && st.versie === 2 && st.leden === 5 && st.plannerMemberId === basId && st.vangnet, 'Status: ' + JSON.stringify(st));
    assert(!db.errors.length, 'Fouten: ' + db.errors.join(' | '));
    await o.ctx.close();
  },

  async 'leden-app: twee toestellen tegelijk maken geen dubbele leden'(ctx) {
    const db = sharedDb(readFixture('huishouden.json'));
    const [A, B] = await Promise.all([
      open(ctx, db, Object.assign({}, BAS, AAN)),
      open(ctx, db, { plannerMyName: 'Sanne', plannerPartnerName: 'Bas', plannerLedenregister: 'aan' })
    ]);
    // In deze fixture staan Lynn en Freya alleen bij de vakantiepersonen: Lynn hoort erbij, Freya niet.
    const pol = { member: t => !/Freya/.test(t) };
    await Promise.all([answerAll(A.page, pol), answerAll(B.page, pol)]);
    await wait(2000);
    await Promise.all([A, B].map(o => o.page.evaluate(() => document.getElementById('refreshBtn').click())));
    await wait(2000);
    const ms = db.db.members || [];
    assert(new Set(ms.map(m => m.id)).size === ms.length, 'Dubbele ID\'s: ' + JSON.stringify(ms));
    assert(JSON.stringify(ms.map(m => m.name).sort()) === JSON.stringify(['Bas', 'Lynn', 'Sanne']), 'Leden: ' + JSON.stringify(ms));
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

  async 'leden-app: live-versie zonder schakelaar bewaart het register bij opslaan'(ctx) {
    const db = await migrated(ctx);
    const before = JSON.stringify(db.db.members);
    const o = await open(ctx, db, BAS, { target: 'root' });
    const b = db.puts;
    await o.page.click('[data-view="boodschappenView"]');
    await o.page.fill('#boodschapInput', 'Thee'); await o.page.press('#boodschapInput', 'Enter');
    await waitForPut(db, b);
    assert(db.db.boodschappen.some(x => x.text === 'Thee') && JSON.stringify(db.db.members) === before, 'Oude versie raakte het register kwijt');
    assert(db.db.meta.members.version === 2, 'Oude versie raakte meta.members kwijt');
    await o.ctx.close();
  },

  async 'leden-app: terugdraaien geeft exact de planner van vóór de migratie'(ctx) {
    const fx = await baseline(ctx);
    const db = sharedDb(readFixture('leden-oud.json'));
    const o = await open(ctx, db, Object.assign({}, BAS, AAN));
    let b = db.puts;
    await answerAll(o.page, { same: false });
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

  async 'leden-app: terugdraaien na gewone wijzigingen haalt alleen het register weg'(ctx) {
    const db = sharedDb(readFixture('leden-oud.json'));
    const o = await open(ctx, db, Object.assign({}, BAS, AAN));
    let b = db.puts;
    await answerAll(o.page);
    await waitForPut(db, b);
    const vangnetVoor = await ls(o.page, 'plannerLedenBackup');
    // Gewone wijzigingen na de migratie: een boodschap en een taak.
    b = db.puts;
    await o.page.click('[data-view="boodschappenView"]');
    await o.page.fill('#boodschapInput', 'Na migratie'); await o.page.press('#boodschapInput', 'Enter');
    await waitForPut(db, b);
    await o.page.click('[data-view="vandaagView"]');
    await o.page.click('#openTodayBtn'); await wait(400);
    b = db.puts;
    await o.page.fill('#newTaskInput', 'Taak na migratie'); await o.page.click('#addTaskBtn');
    await waitForPut(db, b);
    const voorTerug = clone(db.db);
    b = db.puts;
    const r = await o.page.evaluate(() => window.huisplanLeden.terugdraaien());
    await waitForPut(db, b);
    // Precies members en meta.members weg; al het andere (ook de nieuwe boodschap en taak) gelijk.
    const verwacht = clone(voorTerug); delete verwacht.members; delete verwacht.meta.members;
    const diff = diffPaths(verwacht, db.db, '', { strictMeta: true });
    assert(!diff.length, 'Terugdraaien raakte meer dan het register: ' + diff.join(', '));
    assert(db.db.boodschappen.some(x => x.text === 'Na migratie') && db.db.tasks['2026-10-02'].some(t => t.text === 'Taak na migratie'), 'Wijziging na de migratie verloren');
    // Het vangnet is alleen gelezen (controlesom); met latere wijzigingen meldt het eerlijk "niet gelijk".
    assert(r.gelijkAanVoorDeMigratie === false, 'Controlesom zou moeten afwijken door de latere wijzigingen: ' + JSON.stringify(r));
    assert((await ls(o.page, 'plannerLedenBackup')) === vangnetVoor, 'Vangnet veranderd door terugdraaien');
    // Na herladen komt er niets terug (schakelaar is uit) en de wijzigingen blijven staan.
    b = db.puts;
    await o.page.reload(); await wait(2000);
    assert(!('members' in db.db) && db.db.boodschappen.some(x => x.text === 'Na migratie'), 'Na herladen veranderd');
    assert(!db.errors.length, 'Fouten: ' + db.errors.join(' | '));
    await o.ctx.close();
  },

  async 'leden-app: tegenstrijdige antwoorden op twee toestellen geven een vaste, consistente uitkomst'(ctx) {
    // A antwoordt "dezelfde", B "twee personen", in beide volgordes. Verwacht elke keer hetzelfde:
    // "twee personen" wint (nooit twee mensen samenvoegen zonder dat iedereen het eens is).
    const uitkomsten = [];
    for (const eerst of ['A', 'B']) {
      const db = sharedDb(readFixture('leden-oud.json'));
      const [A, B] = await Promise.all([
        open(ctx, db, Object.assign({}, BAS, AAN)),
        open(ctx, db, { plannerMyName: 'Sanne', plannerPartnerName: 'Bas', plannerLedenregister: 'aan' })
      ]);
      // Eerst de lidvragen (ja), dan staat bij beide de twijfelvraag Loïs/Lois open.
      const open2 = await Promise.all([A, B].map(o => answerAll(o.page, { stopAtDoubt: true })));
      assert(open2.every(a => isDoubt(a[a.length - 1] || '')), 'Twijfelvraag niet bereikt: ' + JSON.stringify(open2));
      const antwoord = { A: () => A.page.click('#confirmOkBtn'), B: () => B.page.click('#confirmCancelBtn') };
      await antwoord[eerst](); await antwoord[eerst === 'A' ? 'B' : 'A']();
      await wait(2500);
      for (let i = 0; i < 2; i++) { await Promise.all([A, B].map(o => o.page.evaluate(() => document.getElementById('refreshBtn').click()))); await wait(2000); }
      const ms = db.db.members;
      const lois = ms.filter(m => ['loïs', 'lois'].includes(m.name.toLowerCase()));
      const metLoisAlias = ms.filter(m => (m.aliases || []).some(a => a.toLowerCase() === 'lois'));
      assert(lois.length === 2 && !metLoisAlias.length, '[' + eerst + ' eerst] Inconsistent register: ' + JSON.stringify(ms));
      assert(new Set(ms.map(m => m.id)).size === ms.length, 'Dubbele ID\'s');
      const cacheA = await A.page.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith('plannerCache_')); return JSON.stringify(JSON.parse(localStorage.getItem(k)).data.members); });
      const cacheB = await B.page.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith('plannerCache_')); return JSON.stringify(JSON.parse(localStorage.getItem(k)).data.members); });
      assert(cacheA === JSON.stringify(ms) && cacheB === JSON.stringify(ms), '[' + eerst + ' eerst] Toestellen lopen uiteen');
      Object.keys(db.db.meta.members).forEach(k => ['same', 'different'].includes(k) && Object.keys(db.db.meta.members[k]).forEach(h => assert(/^p_[0-9a-f]{16}$/.test(h), 'Sleutel niet veilig voor Firebase: ' + h)));
      assert(!db.errors.length, 'Fouten: ' + db.errors.join(' | '));
      uitkomsten.push(JSON.stringify(ms.map(m => [m.id, m.name, m.aliases || null]).sort()));
      await A.ctx.close(); await B.ctx.close();
    }
    assert(uitkomsten[0] === uitkomsten[1], 'Uitkomst hangt af van de volgorde van antwoorden:\n    ' + uitkomsten.join('\n    '));
  },
};

// De app-tests (deel 2) horen bij de versie met het ledenregister van 1.4.1. Draait de testset tegen
// de live-versie (--target=root) terwijl die dat nog niet heeft, dan worden ze overgeslagen.
const liveHasRegister = () => fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').includes("MEMBERS_SWITCH_ON='aan-1.4.1'");
Object.keys(tests).forEach(name => {
  if (!name.startsWith('leden-app:')) return;
  const fn = tests[name];
  tests[name] = async ctx => {
    if (process.env.TARGET === 'root' && !liveHasRegister()) { console.log('    (overgeslagen: live-versie heeft het ledenregister van 1.4.1 nog niet)'); return; }
    return fn(ctx);
  };
});
module.exports = tests;
