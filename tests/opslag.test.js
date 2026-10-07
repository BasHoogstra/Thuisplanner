// 1.4.2, E3: cache-identiteit en gedrag bij fouten in de lokale opslag, bovenop de gemergde E2
// (docs/ontwerp-1.4.2.md, 3; docs/e3-lokale-opslag.md; tests T6–T8 uit ontwerp sectie 8, plus de
// blockers en bevindingen uit de Codex-review van PR #16). Alleen de testversie (test/index.html)
// heeft E3; deze tests draaien daarom altijd tegen 'test'. Opslagfouten worden in de browser
// nagebootst (zie openApp, opts.opslagFout). Nooit echte data.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { openApp, readFixture, serverWrite, sharedDb, assert, zetOpslagFout, DB_URL } = require('./lib');
const { startNepDb } = require('./nepdb');

const APP = path.join(__dirname, '..', 'test', 'index.html');
const KEY = 'testplanner0123456789';
const cacheId = (db, key, gen) => crypto.createHash('sha256').update('huisplan-cache\n' + db.replace(/\/+$/, '') + '\n' + key + '\n' + gen).digest('hex').slice(0, 32);
const NIEUW = 'huisplanCache_' + cacheId(DB_URL, KEY, 1);
const OUD = 'plannerCache_' + KEY;
const MARK = 'huisplanOudeCacheVerwerkt_' + cacheId(DB_URL, KEY, 1);
const wait = ms => new Promise(r => setTimeout(r, ms));
const boodTexts = d => ((d && d.boodschappen) || []).map(b => b.text).sort();
const syncText = page => page.textContent('#syncText');
const toastText = page => page.textContent('#toast');
// Lezen zonder de nagebootste opslagfouten.
const lsRaw = (page, k) => page.evaluate(k => { const c = sessionStorage.getItem('__opslagFout'); sessionStorage.setItem('__opslagFout', '{}'); try { return localStorage.getItem(k); } finally { sessionStorage.setItem('__opslagFout', c || '{}'); } }, k);
const lsKeys = page => page.evaluate(() => Object.keys(localStorage));
const leesCache = async page => { const r = await lsRaw(page, NIEUW); return r ? JSON.parse(r) : null; };
const refresh = page => page.evaluate(() => document.getElementById('refreshBtn').click());
const appToont = (page, t) => page.evaluate(x => (document.getElementById('boodschappenList').textContent || '').includes(x), t);
async function addBood(page, text) {
  await page.click('[data-view="boodschappenView"]');
  await page.fill('#boodschapInput', text);
  await page.press('#boodschapInput', 'Enter');
}
async function until(cond, ms, label) {
  const t0 = Date.now();
  while (!(await cond())) { if (Date.now() - t0 > ms) throw new Error('Time-out: ' + label); await wait(100); }
}
const open = (ctx, o) => openApp(ctx.browser, ctx.base, Object.assign({ target: 'test' }, o));
const blokkeer = route => route.abort('internetdisconnected');
const volgStatus = page => page.evaluate(() => {
  window.__statussen = [document.getElementById('syncText').textContent];
  new MutationObserver(() => window.__statussen.push(document.getElementById('syncText').textContent)).observe(document.getElementById('syncText'), { childList: true, characterData: true, subtree: true });
});
const statussen = page => page.evaluate(() => window.__statussen || []);
// Zou sluiten/herladen gewaarschuwd worden? (beforeunload deterministisch nabootsen)
const waarschuwtBijSluiten = page => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
const OPGESLAGEN = /^(Opgeslagen|Bijgewerkt)/;
const vraagLegacy = async (page, ms) => {
  try { await page.waitForSelector('#confirmOverlay.open', { timeout: ms || 3000 }); } catch (e) { return false; }
  return /oudere lokale kopie/.test(await page.textContent('#confirmTitle'));
};
const fx = () => readFixture('huishouden.json');
function metItem(d, id, text) { d = JSON.parse(JSON.stringify(d)); d.boodschappen.push({ id, text, addedBy: 'Bas', done: false }); return d; }
// canon zoals de app (gesorteerde sleutels, lege waarden weg), voor een basis in een oude cache.
function canon(v) {
  const c = (function cv(x) {
    if (x === null || x === undefined) return undefined;
    if (Array.isArray(x)) { if (!x.length) return undefined; return x.map(y => { const z = cv(y); return z === undefined ? null : z; }); }
    if (typeof x === 'object') { const o = {}; let n = 0; Object.keys(x).sort().forEach(k => { const z = cv(x[k]); if (z !== undefined) { o[k] = z; n++; } }); return n ? o : undefined; }
    return x;
  })(v);
  return c === undefined ? '' : JSON.stringify(c);
}

module.exports = {
  // ── Basis (T6–T8, opnieuw op E2) ──────────────────────────────────────────────────────────────
  async 'E3 statisch: buiten de store alle localStorage-toegang via bewaar()/leesOpslag(); geen stille fouten'() {
    const src = fs.readFileSync(APP, 'utf8');
    const a = src.indexOf('function createFirebaseStore('), b = src.indexOf('\n}\n', a);
    const buiten = src.slice(0, a) + src.slice(b);
    const direct = (buiten.match(/localStorage\.(setItem|removeItem|getItem|key)\(/g) || []).length;
    assert(direct === 3, 'Buiten de store alleen de drie aanroepen in bewaar() en leesOpslag(), gevonden: ' + direct);
    assert(!/try\{[^}]*localStorage[^}]*\}catch\([a-z]+\)\{\}/.test(src), 'localStorage binnen een lege catch');
    assert(/function cacheKey\(\)\{return 'huisplanCache_'\+cacheId\(\);\}/.test(src), 'Cachesleutel niet volgens E3');
  },

  async 'E3: SHA-256 in de app is gelijk aan de standaard'(ctx) {
    const o = await open(ctx, { data: fx() });
    for (const t of ['', 'abc', 'huisplan-cache\nhttps://x\nk\n1', 'Loïs ✓ '.repeat(30)]) {
      const app = await o.page.evaluate(t => window.huisplanOpslag.sha256(t), t);
      assert(app === crypto.createHash('sha256').update(t).digest('hex'), 'SHA-256 wijkt af voor ' + JSON.stringify(t.slice(0, 20)));
    }
    await o.ctx.close();
  },

  async 'T6a: cache per database+planner+generatie met E2-velden en localGen/confirmedGen; hervatten na een fout'(ctx) {
    const o = await open(ctx, { data: fx() });
    const keys = await lsKeys(o.page);
    assert(keys.includes(NIEUW) && !keys.includes(OUD), 'Cachesleutels: ' + keys.join(', '));
    assert(!keys.some(k => /Cache/.test(k) && k.includes(KEY)), 'Plannersleutel leesbaar in een cachesleutel');
    const c = await leesCache(o.page);
    ['format', 'gen', 'id', 'app', 'data', 'base', 'inst', 'seq', 'db', 'localGen', 'confirmedGen'].forEach(f => assert(f in c, 'Veld ontbreekt: ' + f));
    assert(c.format === 2 && c.gen === 1 && c.id === cacheId(DB_URL, KEY, 1) && c.db === DB_URL, 'Cacherecord: ' + JSON.stringify({ format: c.format, gen: c.gen, db: c.db }));
    await o.ctx.route(DB_URL + '/**', blokkeer);
    await addBood(o.page, 'Hervat T6'); await wait(1500);
    const c2 = await leesCache(o.page);
    assert(c2.localGen > c2.confirmedGen && boodTexts(c2.data).includes('Hervat T6'), 'Niet-bevestigde generatie niet in de cache: ' + JSON.stringify({ l: c2.localGen, c: c2.confirmedGen }));
    await o.page.reload(); await wait(1500);
    assert(!OPGESLAGEN.test(await syncText(o.page)), 'Na herladen met een niet-bevestigde wijziging: ' + await syncText(o.page));
    serverWrite(o.state, db => db.boodschappen.push({ id: 'ander-t6', text: 'Ander T6', addedBy: 'Sanne', done: false }));
    await o.ctx.unroute(DB_URL + '/**', blokkeer);
    await refresh(o.page);
    // De afgebroken PUT had een onbekende uitkomst en de server veranderde intussen: E2 vraagt dan
    // eerst (geen stille samenvoeging). "Opnieuw toepassen" zet de wijziging alsnog door.
    try { await o.page.waitForSelector('#confirmOverlay.open', { timeout: 6000 }); await o.page.click('#confirmOkBtn'); } catch (e) {}
    await until(async () => boodTexts(o.state.db).includes('Hervat T6'), 6000, 'samenvoegen vanuit de cache');
    assert(boodTexts(o.state.db).includes('Ander T6'), 'Wijziging van een ander toestel verloren');
    await until(async () => { const c3 = await leesCache(o.page); return c3.confirmedGen >= c3.localGen; }, 5000, 'bevestigde generatie in de cache');
    await o.ctx.close();
  },

  async 'T6d: ledenmigratie start niet als de veiligheidskopie niet duurzaam bewaard kan worden'(ctx) {
    const db = sharedDb(readFixture('leden-oud.json'));
    const o = await open(ctx, { state: db, opslagFout: { schrijven: '^plannerLedenBackup' }, localStorage: { plannerLedenregister: 'aan' } });
    for (let i = 0; i < 6; i++) {
      try { await o.page.waitForSelector('#confirmOverlay.open', { timeout: 2000 }); } catch (e) { break; }
      await o.page.click('#confirmOkBtn'); await wait(150);
    }
    await wait(1500);
    assert(!('members' in (db.db || {})), 'Migratie toch uitgevoerd zonder bewaarde veiligheidskopie');
    assert(/veiligheidskopie/.test(await toastText(o.page)), 'Geen melding: ' + await toastText(o.page));
    await refresh(o.page); await wait(2500);
    assert(!(await o.page.isVisible('#confirmOverlay.open')), 'Ledenvragen opnieuw gesteld na een mislukte veiligheidskopie');
    const r = await o.page.evaluate(() => [window.huisplanOpslag.bewaarDuurzaam('plannerLedenBackup', 'x'), window.huisplanOpslag.bewaarDuurzaam('huisplanProef', 'y'), window.huisplanOpslag.gezond()]);
    assert(r[0] === false && r[1] === true && r[2] === true, 'bewaarDuurzaam/gezond: ' + JSON.stringify(r));
    await o.ctx.close();
  },

  async 'T7a: cache vol bij een wijziging — via het journaal naar de server, nooit "Opgeslagen" zolang lokaal niet lukt'(ctx) {
    const o = await open(ctx, { data: fx() });
    await zetOpslagFout(o.page, { schrijven: '^huisplanCache_' });
    await volgStatus(o.page);
    let journaalBijPut = null;
    o.page.on('request', r => { if (r.method() === 'PUT' && journaalBijPut === null) journaalBijPut = 'wacht'; });
    await addBood(o.page, 'Quota T7a');
    await until(async () => boodTexts(o.state.db).includes('Quota T7a'), 4000, 'naar de server (journaal lukt wel)');
    await wait(800);
    const st = await statussen(o.page);
    assert(!st.slice(1).some(t => OPGESLAGEN.test(t)), 'Toonde "opgeslagen" terwijl lokaal bewaren mislukt: ' + st.join(' | '));
    assert(/Lokaal bewaren mislukt|nog niet veilig|Niet bewaard/.test(await syncText(o.page)), 'Geen eerlijke melding: ' + await syncText(o.page));
    // Lokaal weer mogelijk: de volgende wijziging legt alles vast en dan pas "Opgeslagen".
    await zetOpslagFout(o.page, {});
    await addBood(o.page, 'Daarna T7a');
    await until(async () => boodTexts(o.state.db).includes('Daarna T7a') && OPGESLAGEN.test(await syncText(o.page)), 6000, 'opgeslagen na herstel');
    assert(boodTexts((await leesCache(o.page)).data).includes('Daarna T7a'), 'Cache niet bijgewerkt na herstel');
    await o.ctx.close();
  },

  async 'T7b: netwerk én opslag weg — "Niet bewaard", nooit "Opgeslagen", waarschuwen bij sluiten, later herstel'(ctx) {
    const o = await open(ctx, { data: fx() });
    await zetOpslagFout(o.page, { schrijven: '^huisplanCache_' });
    await o.ctx.route(DB_URL + '/**', blokkeer); await o.ctx.setOffline(true);
    await volgStatus(o.page);
    await addBood(o.page, 'Nergens T7b'); await wait(2500);
    assert(/Niet bewaard/.test(await syncText(o.page)), 'Statusregel: ' + await syncText(o.page));
    assert(!(await statussen(o.page)).slice(1).some(s => OPGESLAGEN.test(s) || /worden bewaard/.test(s)), 'Onterechte claim: ' + (await statussen(o.page)).join(' | '));
    assert(await waarschuwtBijSluiten(o.page), 'Geen waarschuwing vóór sluiten');
    await zetOpslagFout(o.page, {});
    await o.ctx.unroute(DB_URL + '/**', blokkeer); await o.ctx.setOffline(false);
    await refresh(o.page);
    await until(async () => boodTexts(o.state.db).includes('Nergens T7b'), 6000, 'opslaan na weer online');
    await until(async () => OPGESLAGEN.test(await syncText(o.page)), 6000, 'status na herstel');
    assert(!(await waarschuwtBijSluiten(o.page)), 'Nog steeds waarschuwing terwijl alles op de server staat');
    await o.ctx.close();
  },

  async 'T7c: leesfout op de cache — cache onaangeroerd ("onbekend", niet "leeg"), eerlijke status, melding'(ctx) {
    const bestaand = JSON.stringify({ format: 2, gen: 1, id: cacheId(DB_URL, KEY, 1), app: '1.4.1', data: fx(), base: '', t: 1 });
    const o = await open(ctx, { data: fx(), localStorage: { [NIEUW]: bestaand }, opslagFout: { lezen: '^huisplanCache_' } });
    await wait(500);
    assert(/niet te lezen/.test(await toastText(o.page)), 'Geen melding: ' + await toastText(o.page));
    await volgStatus(o.page);
    await addBood(o.page, 'Lees T7c');
    await wait(2000);
    assert((await lsRaw(o.page, NIEUW)) === bestaand, 'Onleesbare cache is overschreven');
    // E2-contract: zolang de cache niet te gebruiken is, is het journaalrecord de duurzame plek van de
    // wijziging; "opgeslagen" verschijnt dan nooit, en sluiten wordt gewaarschuwd.
    assert(JSON.stringify(await o.page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('plannerJournal_')).map(k => localStorage.getItem(k)))).includes('Lees T7c'), 'Wijziging niet duurzaam in het journaal');
    assert(!(await statussen(o.page)).slice(1).some(t => OPGESLAGEN.test(t)), 'Toonde "opgeslagen" terwijl de cache niet te gebruiken is');
    assert(await waarschuwtBijSluiten(o.page), 'Geen waarschuwing bij sluiten');
    assert(!o.state.errors.length, 'Fouten: ' + o.state.errors.join(' | '));
    await o.ctx.close();
  },

  async 'T7d: beschadigde cache wordt apart bewaard, niet vernietigd'(ctx) {
    const kapot = '{"format":2,"data":{"boodsch';
    const o = await open(ctx, { data: fx(), localStorage: { [NIEUW]: kapot } });
    const apart = (await lsKeys(o.page)).filter(k => k.startsWith('huisplanCacheApart_' + cacheId(DB_URL, KEY, 1) + '_'));
    assert(apart.length === 1 && (await lsRaw(o.page, apart[0])) === kapot, 'Beschadigde cache niet apart bewaard');
    assert(/apart bewaard/.test(await toastText(o.page)), 'Geen melding: ' + await toastText(o.page));
    const c = await leesCache(o.page);
    assert(c && c.format === 2 && boodTexts(c.data).length > 0, 'Geen nieuwe, geldige cache na herstel');
    await o.ctx.close();
  },

  async 'T7e: beschadigde cache die niet apart bewaard kan worden, blijft onaangeroerd'(ctx) {
    const kapot = 'geen json';
    const o = await open(ctx, { data: fx(), localStorage: { [NIEUW]: kapot }, opslagFout: { schrijven: '^huisplanCacheApart_' } });
    await addBood(o.page, 'Kapot T7e');
    await wait(2000);
    assert((await lsRaw(o.page, NIEUW)) === kapot, 'Beschadigde cache overschreven terwijl hij niet apart bewaard kon worden');
    assert(JSON.stringify(await o.page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('plannerJournal_')).map(k => localStorage.getItem(k)))).includes('Kapot T7e'), 'Wijziging niet duurzaam in het journaal');
    assert(!OPGESLAGEN.test(await syncText(o.page)), 'Onterecht "opgeslagen": ' + await syncText(o.page));
    await o.ctx.close();
  },

  async 'T7g: koppeling niet te onthouden — sessie werkt via de link, met melding'(ctx) {
    const o = await open(ctx, { data: fx(), opslagFout: { schrijven: '^(planner(DbUrl|Key)|huisplanKoppeling)$' } });
    assert(/koppeling/.test(await toastText(o.page)), 'Geen melding: ' + await toastText(o.page));
    await addBood(o.page, 'Link T7g');
    await until(async () => boodTexts(o.state.db).includes('Link T7g'), 4000, 'opslaan');
    await o.ctx.close();
  },

  async 'T8: cache van een andere planner, database of generatie wordt niet samengevoegd en niet aangeraakt'(ctx) {
    const vreemd = t => metItem(fx(), 'v-' + t, 'Vreemd ' + t);
    const andereDb = 'huisplanCache_' + cacheId('https://andere-db.test', KEY, 1);
    const anderePlanner = 'plannerCache_andereplanner0000000000';
    const ls = {
      [anderePlanner]: JSON.stringify({ data: vreemd('planner'), base: '', t: 1 }),
      [andereDb]: JSON.stringify({ format: 2, gen: 1, id: cacheId('https://andere-db.test', KEY, 1), data: vreemd('database'), base: '' }),
      [NIEUW]: JSON.stringify({ format: 2, gen: 2, id: cacheId(DB_URL, KEY, 1), data: vreemd('generatie'), base: '' })
    };
    const o = await open(ctx, { data: fx(), localStorage: ls });
    await addBood(o.page, 'Eigen T8');
    await until(async () => boodTexts(o.state.db).includes('Eigen T8'), 4000, 'opslaan');
    const op = boodTexts(o.state.db), lokaal = boodTexts((await leesCache(o.page)).data);
    for (const t of ['planner', 'database', 'generatie']) assert(!op.includes('Vreemd ' + t) && !lokaal.includes('Vreemd ' + t), 'Cache van een andere ' + t + ' samengevoegd');
    assert((await lsRaw(o.page, anderePlanner)) === ls[anderePlanner] && (await lsRaw(o.page, andereDb)) === ls[andereDb], 'Vreemde cache aangeraakt');
    const apart = (await lsKeys(o.page)).find(k => k.startsWith('huisplanCacheApart_'));
    assert(apart && (await lsRaw(o.page, apart)) === ls[NIEUW], 'Cache van een andere generatie niet apart bewaard');
    await o.ctx.close();
  },

  // ── Blocker 1: een oude cache omzeilt nooit de database-isolatie ──────────────────────────────
  async 'B1: dezelfde plannersleutel in database A en B — oude cache uit A (live-versie) komt nooit in B'(ctx) {
    // Database A is een echte lokale nepdatabase; de live-versie (index.html) werkt daar en maakt
    // offline een wijziging, die alleen in zijn oude cache (plannerCache_<sleutel>) staat.
    const nep = await startNepDb(fx());
    try {
      const a = await openApp(ctx.browser, ctx.base, { target: 'root', allowUrl: nep.url, localStorage: { plannerDbUrl: nep.url } });
      await wait(1500);
      await a.ctx.route(nep.url + '/**', blokkeer);
      await addBood(a.page, 'Alleen in A');
      await wait(1500);
      const oud = await a.page.evaluate(k => localStorage.getItem(k), OUD);
      assert(oud && oud.includes('Alleen in A') && !JSON.parse(oud).db, 'Testopzet: geen oude cache zonder herkomst uit A');
      // Zelfde toestel (zelfde localStorage), testversie, zelfde plannersleutel, database B (de
      // nagebootste database van deze context).
      const db = a.state; db.db = fx(); db.etag++;
      const pB = await a.ctx.newPage();
      await pB.clock.setFixedTime(new Date(2026, 9, 2, 10, 0, 0));
      await pB.goto(ctx.base + '/test/index.html?db=' + encodeURIComponent(DB_URL) + '&p=' + KEY);
      await wait(2500);
      if (await pB.isVisible('#confirmOverlay.open')) await pB.click('#confirmCancelBtn');
      await pB.click('[data-view="boodschappenView"]');
      await pB.fill('#boodschapInput', 'Eigen B'); await pB.press('#boodschapInput', 'Enter');
      await until(async () => boodTexts(db.db).includes('Eigen B'), 6000, 'B werkt gewoon');
      await wait(1500);
      assert(!boodTexts(db.db).includes('Alleen in A'), 'Gegevens uit database A zijn in database B terechtgekomen');
      const nieuwB = await pB.evaluate(k => localStorage.getItem(k), NIEUW);
      assert(!String(nieuwB).includes('Alleen in A'), 'Gegevens uit A in de cache van B');
      assert((await pB.evaluate(k => localStorage.getItem(k), OUD)) === oud, 'Oude cache van A aangeraakt');
      await a.ctx.close();
    } finally { await nep.stop(); }
  },

  async 'B1: oude cache zonder of met andere herkomst — niet gebruikt, niet geüpload, bewaard, gemeld'(ctx) {
    for (const [naam, extra] of [['zonder herkomst', {}], ['andere database', { db: 'https://andere-db.test' }]]) {
      const oud = JSON.stringify(Object.assign({ data: metItem(fx(), 'oud-a', 'Oud ' + naam), base: canon(fx()), t: 1 }, extra));
      const o = await open(ctx, { data: fx(), localStorage: { [OUD]: oud } });
      assert(await vraagLegacy(o.page), naam + ': geen melding over de bewaarde oude kopie');
      await o.page.click('#confirmCancelBtn');
      await addBood(o.page, 'Eigen ' + naam);
      await until(async () => boodTexts(o.state.db).includes('Eigen ' + naam), 4000, 'opslaan');
      await wait(800);
      assert(!boodTexts(o.state.db).includes('Oud ' + naam) && !(await appToont(o.page, 'Oud ' + naam)), naam + ': oude cache gebruikt of geüpload');
      assert((await lsRaw(o.page, OUD)) === oud, naam + ': oude cache aangeraakt');
      // De herstelroute bevat hem ongewijzigd.
      const exp = JSON.parse(await o.page.evaluate(() => new Promise(res => { const orig = URL.createObjectURL; URL.createObjectURL = b => { b.text().then(res); return 'blob:x'; }; document.getElementById('journalGateExport').click(); setTimeout(() => { URL.createObjectURL = orig; }, 50); })));
      assert(exp.items[OUD] === oud, naam + ': oude cache niet in de herstelgegevens');
      await o.ctx.close();
    }
  },

  async 'B1 (controle): eigen oude cache (zelfde database, E2-vorm) zonder nieuwe cache wordt wél overgenomen'(ctx) {
    const oud = JSON.stringify({ data: metItem(fx(), 'eigen-oud', 'Eigen oud'), base: canon(fx()), t: 1, db: DB_URL, inst: 'i0000000000000000', seq: 3 });
    const o = await open(ctx, { data: fx(), localStorage: { [OUD]: oud } });
    await until(async () => boodTexts(o.state.db).includes('Eigen oud'), 6000, 'eigen oude cache overgenomen en opgeslagen');
    assert((await lsRaw(o.page, MARK)) === crypto.createHash('sha256').update(oud).digest('hex').slice(0, 32), 'Geen duurzame markering van de verwerkte oude cache');
    assert((await lsRaw(o.page, OUD)) === oud, 'Oude cache verwijderd (hoort te blijven staan)');
    await o.ctx.close();
  },

  // ── Blocker 2: opruimen vernietigt nooit mogelijke informatie ─────────────────────────────────
  async 'B2: oude cache met lijst-met-gaten/numerieke vorm — nooit als leeg behandeld, nooit verwijderd, nooit gebruikt'(ctx) {
    const vormen = [
      ['numeriek object', { boodschappen: { 3: { id: 'g1', text: 'Gat 3' }, 7: { id: 'g2', text: 'Gat 7' } } }],
      ['lijst met gaten', { boodschappen: [null, null, { id: 'g3', text: 'Na gaten' }] }],
      ['taken als lijst', { tasks: [{ id: 't1', text: 'Taak' }] }]
    ];
    for (const [naam, data] of vormen) {
      for (const db of [DB_URL, undefined]) {
        const oud = JSON.stringify({ data, base: '', t: 1, db });
        const o = await open(ctx, { data: fx(), localStorage: { [OUD]: oud } });
        await wait(1200);
        if (await o.page.isVisible('#confirmOverlay.open')) await o.page.click('#confirmCancelBtn');
        await refresh(o.page); await wait(1500);
        await o.page.reload(); await wait(2000);
        assert((await lsRaw(o.page, OUD)) === oud, naam + (db ? ' (eigen db)' : '') + ': oude cache gewijzigd of verwijderd');
        assert((await lsRaw(o.page, MARK)) === null, naam + ': als verwerkt gemarkeerd');
        assert(!JSON.stringify(o.state.db).includes('Gat 3') && !JSON.stringify(o.state.db).includes('Na gaten'), naam + ': inhoud geüpload');
        await o.ctx.close();
      }
    }
  },

  async 'B2: oude cache vervangen na verwerking (ander venster/live-versie) — niet verwijderd, niet stil verborgen'(ctx) {
    const oud1 = JSON.stringify({ data: metItem(fx(), 'v1', 'Versie 1'), base: canon(fx()), t: 1, db: DB_URL });
    const o = await open(ctx, { data: fx(), localStorage: { [OUD]: oud1 } });
    await until(async () => boodTexts(o.state.db).includes('Versie 1'), 6000, 'versie 1 overgenomen');
    // Tussen inspectie en (vroegere) opruimactie schrijft een ander venster een nieuwere oude cache.
    const oud2 = JSON.stringify({ data: metItem(fx(), 'v2', 'Versie 2'), base: canon(fx()), t: 2, db: DB_URL });
    await o.page.evaluate(([k, v]) => localStorage.setItem(k, v), [OUD, oud2]);
    await o.page.reload();
    assert(await vraagLegacy(o.page, 4000), 'Nieuwere oude cache stil verborgen achter de nieuwe cache');
    await o.page.click('#confirmCancelBtn');
    await wait(1000);
    assert((await lsRaw(o.page, OUD)) === oud2, 'Vervangen oude cache verwijderd of gewijzigd');
    assert(!boodTexts(o.state.db).includes('Versie 2'), 'Nieuwere oude cache automatisch samengevoegd terwijl er al een nieuwe cache is');
    await o.ctx.close();
  },

  async 'B2: eigen oude cache verwerkt, markering mislukt, server verwijdert het item, herladen — niets herrijst'(ctx) {
    for (const markeringFaalt of [false, true]) {
      const oud = JSON.stringify({ data: metItem(fx(), 'x-oud', 'X oud'), base: canon(fx()), t: 1, db: DB_URL });
      const o = await open(ctx, { data: fx(), localStorage: { [OUD]: oud }, opslagFout: markeringFaalt ? { schrijven: '^huisplanOudeCacheVerwerkt_' } : null });
      await until(async () => boodTexts(o.state.db).includes('X oud'), 6000, 'X overgenomen');
      await wait(800);
      serverWrite(o.state, db => { db.boodschappen = db.boodschappen.filter(b => b.text !== 'X oud'); });
      await o.page.reload(); await wait(2500);
      if (await o.page.isVisible('#confirmOverlay.open')) await o.page.click('#confirmCancelBtn');
      await refresh(o.page); await wait(2000);
      assert(!boodTexts(o.state.db).includes('X oud') && !(await appToont(o.page, 'X oud')), (markeringFaalt ? 'markering mislukt' : 'markering gelukt') + ': X is herrezen');
      assert((await lsRaw(o.page, OUD)) === oud, 'Oude cache verwijderd');
      await o.ctx.close();
    }
  },

  // ── Blocker 3: verlieswaarschuwing ook bij lege of onbekende serverstand ──────────────────────
  async 'B3: onbekende serverstand (database onbereikbaar) + opslag faalt + wijziging alleen in het geheugen — waarschuwen'(ctx) {
    const o = await open(ctx, { data: fx(), dbOnbereikbaar: true, opslagFout: { schrijven: '^huisplanCache_' }, localStorage: { [NIEUW]: null } });
    await volgStatus(o.page);
    await addBood(o.page, 'Alleen geheugen');
    await wait(1200);
    assert(await waarschuwtBijSluiten(o.page), 'Geen waarschuwing bij sluiten terwijl de wijziging nergens staat');
    assert(await o.page.evaluate(() => window.huisplanOpslag.risico()), 'Risico niet herkend');
    assert(/Niet bewaard|Lokaal bewaren mislukt/.test(await syncText(o.page)), 'Statusregel: ' + await syncText(o.page));
    assert(!(await statussen(o.page)).slice(1).some(t => OPGESLAGEN.test(t) || /^Nieuw dagboek/.test(t)), 'Onterechte geruststelling: ' + (await statussen(o.page)).join(' | '));
    await o.ctx.close();
  },

  async 'B3: lege serverstand (nieuwe planner) + daarna offline + opslag faalt + wijziging — waarschuwen'(ctx) {
    const o = await open(ctx, { data: null });
    await zetOpslagFout(o.page, { schrijven: '^huisplanCache_' });
    await o.ctx.route(DB_URL + '/**', blokkeer); await o.ctx.setOffline(true);
    await addBood(o.page, 'Leeg en weg');
    await wait(1500);
    assert(await waarschuwtBijSluiten(o.page), 'Geen waarschuwing bij een lege serverstand');
    assert(/Niet bewaard|Lokaal bewaren mislukt/.test(await syncText(o.page)), 'Statusregel: ' + await syncText(o.page));
    await o.ctx.close();
  },

  async 'B3 (controle): opslag werkt, offline wijziging staat duurzaam lokaal — geen onterechte waarschuwing'(ctx) {
    const o = await open(ctx, { data: fx(), dbOnbereikbaar: true });
    await addBood(o.page, 'Lokaal veilig');
    await wait(1200);
    assert(!(await waarschuwtBijSluiten(o.page)), 'Waarschuwing terwijl de wijziging duurzaam lokaal staat');
    assert(boodTexts((await leesCache(o.page)).data).includes('Lokaal veilig'), 'Niet in de cache');
    await o.ctx.close();
  },

  // ── Overige bevindingen ───────────────────────────────────────────────────────────────────────
  async 'Ledenback-up: alleen een back-up van deze planner telt; een vreemde blijft staan'(ctx) {
    const vreemd = JSON.stringify({ at: '2026-01-01', app: '1.4.0', check: 'vreemd', hadMembers: false, scope: 'anderescope', members: null });
    const zonderScope = JSON.stringify({ at: '2026-01-01', app: '1.4.0', members: [{ id: 'm_x', name: 'X' }] });
    const db = sharedDb(readFixture('leden-oud.json'));
    const o = await open(ctx, { state: db, localStorage: { plannerLedenregister: 'aan', plannerLedenBackup: vreemd, plannerLedenBackupV1: zonderScope } });
    for (let i = 0; i < 6; i++) {
      try { await o.page.waitForSelector('#confirmOverlay.open', { timeout: 2000 }); } catch (e) { break; }
      await o.page.click('#confirmOkBtn'); await wait(150);
    }
    await until(async () => 'members' in (db.db || {}), 6000, 'migratie met eigen back-up');
    assert((await lsRaw(o.page, 'plannerLedenBackup')) === vreemd, 'Vreemde back-up overschreven');
    const scope = cacheId(DB_URL, KEY, 1);
    const eigen = JSON.parse(await lsRaw(o.page, 'plannerLedenBackup_' + scope));
    assert(eigen && eigen.scope === scope && typeof eigen.check === 'string', 'Geen eigen back-up onder een eigen sleutel');
    const st = await o.page.evaluate(() => window.huisplanLeden.status());
    assert(st.vangnet === true, 'Status kent de eigen back-up niet');
    await o.ctx.close();
    // Alleen een vreemde back-up: geen vangnet.
    const o2 = await open(ctx, { data: readFixture('leden-oud.json'), localStorage: { plannerLedenBackup: vreemd } });
    const st2 = await o2.page.evaluate(() => window.huisplanLeden.status());
    assert(st2.vangnet === false, 'Vreemde back-up als vangnet gezien');
    await o2.ctx.close();
  },

  async 'Koppeling: half opgeslagen paar geeft nooit een gemengde database/planner'(ctx) {
    const o = await open(ctx, { data: fx(), opslagFout: { schrijven: '^plannerKey$' } });
    await o.page.goto(ctx.base + '/test/index.html?db=' + encodeURIComponent('https://andere-db.test') + '&p=andereplanner99999');
    await wait(1500);
    const paar = [await lsRaw(o.page, 'plannerDbUrl'), await lsRaw(o.page, 'plannerKey')];
    const k = JSON.parse(await lsRaw(o.page, 'huisplanKoppeling'));
    assert(k.db === 'https://andere-db.test' && k.key === 'andereplanner99999', 'Koppelrecord niet bijgewerkt: ' + JSON.stringify(k));
    const gemengd = paar[0] === 'https://andere-db.test' && paar[1] === KEY;
    assert(!gemengd, 'Gemengd paar opgeslagen: ' + JSON.stringify(paar));
    // Zonder link opnieuw openen: de bewaarde koppeling als geheel.
    await zetOpslagFout(o.page, {});
    await o.page.goto(ctx.base + '/test/index.html'); await wait(1000);
    const url = new URL(o.page.url());
    assert(url.searchParams.get('db') === 'https://andere-db.test' && url.searchParams.get('p') === 'andereplanner99999', 'Herstelde koppeling: ' + o.page.url());
    await o.ctx.close();
  },

  async 'Diagnose: geen plannersleutel of variabel sleuteldeel, ook niet bij korte sleutels'(ctx) {
    const o = await open(ctx, { data: fx(), opslagFout: { schrijven: '^(plannerCache_|plannerJournal_|geheim|a_b)' } });
    await o.page.evaluate(() => { ['plannerCache_kort', 'geheimeSleutel', 'a_b'].forEach(k => window.huisplanOpslag.bewaarDuurzaam(k, 'x')); });
    await addBood(o.page, 'Diag'); await wait(1500); // journaalrecord mislukt ook
    const diag = await o.page.evaluate(() => window.huisplanOpslag.diagnose());
    const namen = diag.map(d => d.sleutel);
    assert(namen.includes('plannerCache_…') && namen.includes('a_…') && namen.includes('…') && namen.includes('plannerJournal_…'), 'Diagnose: ' + JSON.stringify(namen));
    assert(!namen.some(n => n.includes(KEY) || /kort|geheim/.test(n)), 'Gevoelig sleuteldeel in de diagnose: ' + JSON.stringify(namen));
    await o.ctx.close();
  },

  async 'Quarantaine: twee beschadigde caches op hetzelfde tijdstip overschrijven elkaar niet'(ctx) {
    const kapot1 = '{"kapot":1', kapot2 = '{"kapot":2';
    const o = await open(ctx, { data: fx(), localStorage: { [NIEUW]: kapot1 } }); // vaste klok: zelfde Date.now()
    await o.page.evaluate(([k, v]) => localStorage.setItem(k, v), [NIEUW, kapot2]);
    await o.page.reload(); await wait(1500);
    const apart = (await lsKeys(o.page)).filter(k => k.startsWith('huisplanCacheApart_'));
    const inhoud = await Promise.all(apart.map(k => lsRaw(o.page, k)));
    assert(apart.length === 2 && inhoud.includes(kapot1) && inhoud.includes(kapot2), 'Quarantainekopieën overschreven: ' + JSON.stringify(apart));
    await o.ctx.close();
  },

  async 'E2-contract: opslagfout + direct synchroniseren gaat altijd via het journaal (anders niet)'(ctx) {
    for (const journaalFaalt of [false, true]) {
      let journaalBijPut = [];
      const o = await open(ctx, { data: fx() });
      await wait(800);
      await zetOpslagFout(o.page, { schrijven: journaalFaalt ? '^(huisplanCache_|plannerJournal_)' : '^huisplanCache_' });
      const p0 = o.state.puts;
      o.ctx.on('request', async r => { if (r.method() === 'PUT') journaalBijPut.push(r.headers()['if-match'] || 'zonder'); });
      await addBood(o.page, 'Journaal ' + journaalFaalt);
      await wait(2000);
      if (journaalFaalt) {
        assert(o.state.puts === p0, 'Verstuurd zonder journaal');
        assert(/gepauzeerd|Niet bewaard|Lokaal bewaren mislukt/.test(await syncText(o.page)), 'Statusregel: ' + await syncText(o.page));
      } else {
        assert(boodTexts(o.state.db).includes('Journaal false'), 'Niet verstuurd');
        assert(journaalBijPut.length && journaalBijPut.every(h => h !== 'zonder'), 'Onvoorwaardelijke PUT: ' + JSON.stringify(journaalBijPut));
      }
      await o.ctx.close();
    }
  },

  async 'E2-contract: een oude bevestiging maakt een nieuwere lokale generatie niet "veilig" (ook niet in de cache)'(ctx) {
    let houd = false;
    const o = await open(ctx, { data: fx(), onRequest: info => (info.method === 'PUT' && houd ? { delay: 2500 } : undefined) });
    await wait(1500);
    houd = true;
    await addBood(o.page, 'Gen 1');
    await wait(700); // PUT van generatie 1 onderweg
    houd = false;
    await addBood(o.page, 'Gen 2');
    await until(async () => boodTexts(o.state.db).includes('Gen 1'), 5000, 'generatie 1 bevestigd');
    const c = await leesCache(o.page);
    if (!boodTexts(o.state.db).includes('Gen 2')) assert(c.localGen > c.confirmedGen, 'Cache noemt generatie 2 bevestigd na de bevestiging van 1');
    await until(async () => boodTexts(o.state.db).includes('Gen 2') && OPGESLAGEN.test(await syncText(o.page)), 6000, 'generatie 2 bevestigd');
    const c2 = await leesCache(o.page);
    assert(c2.confirmedGen >= c2.localGen, 'Na bevestiging van alles nog niet-bevestigd in de cache');
    await o.ctx.close();
  }
};
