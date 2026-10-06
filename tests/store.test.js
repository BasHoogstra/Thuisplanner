// Stap 1.3: de opslaglaag (store.load / store.save / store.subscribe) met FirebaseStore erachter.
// - Statisch: buiten FirebaseStore praat de app-code niet meer rechtstreeks met Firebase.
// - Gedrag: elk scenario draait tegen de oude code (index.html, nog zonder opslaglaag) én tegen
//   de testversie; verzoeken, eindstand in de database, lokale cache en statusregel moeten gelijk zijn.
//   Zodra de live-versie de opslaglaag ook heeft, blijven de inhoudelijke controles het gedrag bewaken.
// - Twee browsers tegelijk op dezelfde nagebootste database (gelijktijdige wijzigingen, 412-conflict,
//   offline en weer online), zoals de roadmap vraagt.
'use strict';
const fs = require('fs');
const path = require('path');
const { openApp, readFixture, serverWrite, sharedDb, assert, firebaseCanon, DB_URL, FIXED_NOW } = require('./lib');

const APP = path.join(__dirname, '..', 'test', 'index.html');

// Code van createFirebaseStore (tot en met de afsluitende accolade) en de rest van de app.
function splitStore() {
  const src = fs.readFileSync(APP, 'utf8');
  const start = src.indexOf('function createFirebaseStore(');
  assert(start > -1, 'createFirebaseStore ontbreekt in test/index.html');
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) break;
  }
  // Commentaarregels tellen niet mee (de uitleg over FirebaseStore staat boven de functie).
  const rest = (src.slice(0, start) + src.slice(i + 1)).replace(/^\s*\/\/.*$/gm, '');
  return { store: src.slice(start, i + 1), rest };
}

async function addBood(page, text) {
  await page.click('[data-view="boodschappenView"]');
  await page.fill('#boodschapInput', text);
  await page.press('#boodschapInput', 'Enter');
}
const boodTexts = db => ((db && db.boodschappen) || []).map(b => b.text).sort();
// Nieuwe id's zijn tijd (vast in de tests) + toeval; voor de vergelijking telt alleen dát er een id is.
const ID_PREFIX = FIXED_NOW.getTime().toString(36);
const stripIds = json => json.replace(new RegExp(ID_PREFIX + '[0-9a-z]{5}', 'g'), '<nieuw-id>');
// Boodschappen zoals dit toestel ze nu heeft (lokale cache; de app-code zelf is van buiten niet te zien).
const localBood = async page => { const c = await readCacheOf(page); return c ? boodTexts(c.data) : []; };
const wait = ms => new Promise(r => setTimeout(r, ms));
// Lokale cache zonder tijdstempel.
const readCacheOf = page => page.evaluate(() => {
  const k = Object.keys(localStorage).find(x => x.startsWith('plannerCache_'));
  if (!k) return null;
  const c = JSON.parse(localStorage.getItem(k)); delete c.t; return { key: k, data: c.data, base: c.base };
});
const syncText = page => page.textContent('#syncText');
async function setHidden(page, hidden) {
  await page.evaluate(h => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

// Een scenario geeft per versie een samenvatting terug; oud en nieuw moeten gelijk zijn.
// Het scenario draait met een leesbare ETag (voorwaardelijk opslaan, if-match, 412 bij conflict),
// zoals de echte Firebase (bevestigd op 3 okt 2026). De variant zonder leesbare ETag wordt niet meer
// vergeleken: daar sloeg de oude code op zonder voorwaarde, en schrijft de testversie sinds 1.4.2
// bewust niet (besluit 9.1). Dat gedrag bewaakt tests/schrijven.test.js (T5).
async function both(ctx, scenario, modes = ['etag']) {
  const res = {};
  for (const mode of modes) {
    const out = {};
    for (const target of ['root', 'test']) out[target] = await scenario(target, mode === 'etag');
    const a = stripIds(JSON.stringify(out.root, null, 1)), b = stripIds(JSON.stringify(out.test, null, 1));
    if (a !== b) {
      const la = a.split('\n'), lb = b.split('\n');
      const i = la.findIndex((l, n) => l !== lb[n]);
      throw new Error('[' + mode + '] Gedrag wijkt af van de oude code (eerste verschil rond regel ' + i + '):\n    oud:   ' + la.slice(Math.max(0, i - 2), i + 3).join(' ') + '\n    nieuw: ' + lb.slice(Math.max(0, i - 2), i + 3).join(' '));
    }
    res[mode] = out.test;
  }
  return res;
}
// Echt offline: Playwright beantwoordt onderschepte verzoeken ook in de offline-stand, dus de
// nagebootste database zelf ook onbereikbaar maken.
const blockDb = route => route.abort('internetdisconnected');
async function goOffline(o) { await o.ctx.route(DB_URL + '/**', blockDb); await o.ctx.setOffline(true); }
async function goOnline(o) { await o.ctx.unroute(DB_URL + '/**', blockDb); await o.ctx.setOffline(false); }
function summary(o) {
  return { log: o.log, db: firebaseCanon(o.state.db), cache: o.cache && { data: firebaseCanon(o.cache.data), base: o.cache.base, key: o.cache.key }, sync: o.sync, conflicts: o.state.conflicts || 0, errors: o.state.errors };
}

module.exports = {
  async 'opslaglaag: alleen FirebaseStore praat met Firebase; interface load/save/subscribe'() {
    const { store, rest } = splitStore();
    ['load:', 'save:', 'subscribe:'].forEach(m => assert(store.includes(m), 'FirebaseStore mist ' + m));
    // Firebase-details die alleen in de store mogen staan.
    const firebaseOnly = ["'X-Firebase-ETag'", "'if-match'", 'ETag', '/planners', 'plannerCache_', "'plannerDbUrl'", "'plannerKey'", 'keepalive'];
    const leaks = firebaseOnly.filter(t => rest.includes(t));
    assert(!leaks.length, 'Firebase-details buiten FirebaseStore: ' + leaks.join(', '));
    // Oude losse sync-functies en -variabelen bestaan niet meer.
    const old = ['dataUrl(', 'loadFromServer', 'pushToServer', 'fetchRemote', 'serverETag', 'lastKnownJSON', 'startAutoSync', 'buildShareLink', 'dbUrl', 'plannerKey'];
    const left = old.filter(t => new RegExp('(^|[^A-Za-z_.\'"])' + t.replace('(', '\\(') + '(?![A-Za-z_])').test(rest.replace(/id="dbUrlInput"|'dbUrlInput'/g, '')));
    assert(!left.length, 'Nog directe Firebase-sync buiten de store: ' + left.join(', '));
    // Geen fetch buiten de store die naar de database gaat (weer en kaarten mogen wel).
    const fetches = rest.match(/fetch\([^;]{0,80}/g) || [];
    const dbFetch = fetches.filter(f => !/wttr\.in|nominatim|overpass|url\+'\?data=/.test(f));
    assert(!dbFetch.length, 'fetch buiten de store: ' + dbFetch.join(' | '));
    // De bestaande opslag (localStorage-sleutels en cacheformaat) is ongewijzigd.
    assert(store.includes("'plannerCache_'+plannerKey") && store.includes('{data:d||getLocal(),base:base,t:Date.now()}'), 'Cacheformaat gewijzigd');
    assert(store.includes("localStorage.setItem('plannerDbUrl',dbUrl);localStorage.setItem('plannerKey',plannerKey);"), 'Opslag van de koppeling gewijzigd');
  },


  async 'opslaglaag: nieuw toestel laden en opslaan gaat als voorheen'(ctx) {
    const fx = readFixture('huishouden.json');
    const r = await both(ctx, async (target, exposeETag) => {
      const log = [];
      const o = await openApp(ctx.browser, ctx.base, { data: fx, target, log, exposeETag });
      await addBood(o.page, 'Pindakaas'); await wait(1500);
      const res = summary({ log, state: o.state, cache: await readCacheOf(o.page), sync: await syncText(o.page) });
      await o.ctx.close(); return res;
    });
    Object.values(r).forEach(x => {
      assert(boodTexts(x.db).includes('Pindakaas'), 'Boodschap niet opgeslagen');
      assert(/^(Opgeslagen|Bijgewerkt)/.test(x.sync), 'Statusregel: ' + x.sync);
      assert(x.cache && x.cache.key === 'plannerCache_testplanner0123456789', 'Cachesleutel gewijzigd');
      assert(!x.errors.length, 'Fouten: ' + x.errors.join(' | '));
    });
    assert(r.etag.log.includes('PUT if-match'), 'Met leesbare ETag wordt niet voorwaardelijk opgeslagen');
  },

  async 'opslaglaag: conflict met een ander toestel wordt samengevoegd als voorheen (412)'(ctx) {
    const fx = readFixture('huishouden.json');
    const r = await both(ctx, async (target, exposeETag) => {
      const log = [];
      const o = await openApp(ctx.browser, ctx.base, { data: fx, target, log, exposeETag });
      serverWrite(o.state, db => db.boodschappen.push({ id: 'remote1', text: 'Van Sanne', addedBy: 'Sanne', done: false }));
      await addBood(o.page, 'Melk'); await wait(2000);
      const res = summary({ log, state: o.state, cache: await readCacheOf(o.page), sync: await syncText(o.page) });
      await o.ctx.close(); return res;
    });
    Object.values(r).forEach(x => {
      ['Melk', 'Van Sanne'].forEach(t => assert(boodTexts(x.db).includes(t), t + ' ontbreekt na samenvoegen'));
      assert(JSON.stringify(firebaseCanon(x.cache.data)) === JSON.stringify(x.db), 'Cache wijkt af van de server na opslaan');
    });
    assert(r.etag.conflicts === 1 && r.etag.log.includes('PUT 412 if-match'), 'Geen 412-conflict opgetreden: ' + r.etag.log.join(', '));
  },

  async 'opslaglaag: offline wijzigen en weer online als voorheen'(ctx) {
    const fx = readFixture('huishouden.json');
    const r = await both(ctx, async (target, exposeETag) => {
      const log = [];
      const o = await openApp(ctx.browser, ctx.base, { data: fx, target, log, exposeETag });
      await goOffline(o);
      await addBood(o.page, 'Brood'); await wait(1500);
      const offlineText = await syncText(o.page), putsOffline = o.state.puts;
      const cachedOffline = await localBood(o.page);
      serverWrite(o.state, db => db.boodschappen.push({ id: 'remote2', text: 'Kaas', addedBy: 'Sanne', done: false }));
      await goOnline(o); await wait(2500);
      const res = Object.assign(summary({ log, state: o.state, cache: await readCacheOf(o.page), sync: await syncText(o.page) }), { offlineText, putsOffline, cachedOffline });
      await o.ctx.close(); return res;
    });
    Object.values(r).forEach(x => {
      assert(/Offline/.test(x.offlineText), 'Geen offline-melding: ' + x.offlineText);
      assert(x.cachedOffline.includes('Brood'), 'Offline wijziging niet in de lokale cache');
      ['Brood', 'Kaas'].forEach(t => assert(boodTexts(x.db).includes(t), t + ' ontbreekt na weer online'));
      assert(/^(Opgeslagen|Bijgewerkt)/.test(x.sync), 'Statusregel na weer online: ' + x.sync);
    });
  },

  async 'opslaglaag: opstarten uit de cache met niet-opgeslagen wijziging als voorheen'(ctx) {
    const fx = readFixture('huishouden.json');
    const r = await both(ctx, async (target, exposeETag) => {
      const log = [];
      const o = await openApp(ctx.browser, ctx.base, { data: fx, target, log, exposeETag });
      await o.ctx.route(DB_URL + '/**', blockDb); // server onbereikbaar, de app-pagina zelf wel
      await addBood(o.page, 'Eieren'); await wait(1500);
      const failText = await syncText(o.page);
      await o.page.reload(); await wait(1500);
      const startText = await syncText(o.page);
      await o.page.click('[data-view="boodschappenView"]');
      const shown = (await o.page.textContent('#boodschappenView')).includes('Eieren');
      serverWrite(o.state, db => db.boodschappen.push({ id: 'remote3', text: 'Thee', addedBy: 'Sanne', done: false }));
      await o.ctx.unroute(DB_URL + '/**', blockDb);
      await o.page.evaluate(() => document.getElementById('refreshBtn').click());
      await wait(2500);
      const res = Object.assign(summary({ log, state: o.state, cache: await readCacheOf(o.page), sync: await syncText(o.page) }), { failText, startText, shown });
      await o.ctx.close(); return res;
    });
    Object.values(r).forEach(x => {
      assert(/mislukt/.test(x.failText), 'Geen melding bij mislukte opslag: ' + x.failText);
      assert(x.shown, 'Niet-opgeslagen wijziging niet zichtbaar na opnieuw openen');
      ['Eieren', 'Thee'].forEach(t => assert(boodTexts(x.db).includes(t), t + ' ontbreekt na samenvoegen'));
    });
  },

  async 'opslaglaag: naar de achtergrond verstuurt de wijziging direct als voorheen'(ctx) {
    const fx = readFixture('huishouden.json');
    const r = await both(ctx, async (target, exposeETag) => {
      const log = [];
      const o = await openApp(ctx.browser, ctx.base, { data: fx, target, log, exposeETag });
      const before = o.state.puts;
      await addBood(o.page, 'Koffie');
      await setHidden(o.page, true); await wait(1500);
      const res = Object.assign(summary({ log, state: o.state, cache: await readCacheOf(o.page), sync: await syncText(o.page) }), { extraPuts: o.state.puts - before });
      await setHidden(o.page, false);
      await o.ctx.close(); return res;
    });
    Object.values(r).forEach(x => {
      assert(x.extraPuts === 1, 'Verwacht precies één opslag bij naar de achtergrond, kreeg ' + x.extraPuts);
      assert(boodTexts(x.db).includes('Koffie'), 'Wijziging niet verstuurd');
    });
  },

  async 'opslaglaag: geen toegang (403), open database en deellink als voorheen'(ctx) {
    const fx = readFixture('huishouden.json');
    const r = await both(ctx, async target => {
      const o1 = await openApp(ctx.browser, ctx.base, { data: fx, target, settle: 10 });
      await o1.ctx.route(DB_URL + '/planners/**', route => route.fulfill({ status: 403, body: '{"error":"Permission denied"}' }));
      await o1.page.reload(); await wait(1500);
      const denied = await syncText(o1.page);
      await o1.ctx.close();
      const o2 = await openApp(ctx.browser, ctx.base, { data: fx, target, settle: 10 });
      await o2.ctx.route(DB_URL + '/planners.json*', route => route.fulfill({ status: 200, body: '{"x":true}' }));
      await o2.page.reload(); await wait(4000);
      const toast = await o2.page.evaluate(() => document.body.innerText.includes('Jullie database staat open voor iedereen.'));
      await o2.page.evaluate(() => document.getElementById('checkSecurityBtn').click()); await wait(500);
      const sec = await o2.page.textContent('#securityStatus');
      // Deellink via de deelknop (navigator.share nagebootst).
      await o2.page.evaluate(() => { navigator.share = o => { window.__shared = o.url; return Promise.resolve(); }; document.getElementById('shareBtn').click(); });
      const link = await o2.page.evaluate(() => window.__shared || '');
      await o2.ctx.close();
      return { denied, toast, sec, link: link.replace(/^http:\/\/[^/]+\/(test\/)?index\.html/, '') };
    });
    const x = r.etag;
    assert(/Toegang geweigerd/.test(x.denied), 'Geen melding bij 403: ' + x.denied);
    assert(x.toast, 'Geen waarschuwing over een open database');
    assert(/Open/.test(x.sec), 'Beveiligingscheck: ' + x.sec);
    assert(x.link === '?db=' + encodeURIComponent(DB_URL) + '&p=testplanner0123456789', 'Deellink gewijzigd: ' + x.link);
  },

  async 'opslaglaag: installeren en herstellen met herstelcode als voorheen'(ctx) {
    const fx = readFixture('huishouden.json');
    const r = await both(ctx, async target => {
      const noLink = { plannerDbUrl: null, plannerKey: null };
      const o = await openApp(ctx.browser, ctx.base, { data: undefined, target, localStorage: noLink, settle: 800 });
      const setupShown = await o.page.isVisible('#setupOverlay');
      await o.page.fill('#dbUrlInput', DB_URL + '/');
      await o.page.click('#setupSubmitBtn'); await wait(1500);
      const key = await o.page.evaluate(() => localStorage.getItem('plannerKey'));
      const ls = await o.page.evaluate(() => localStorage.getItem('plannerDbUrl'));
      const url = new URL(o.page.url());
      const setup = { setupShown, keyOk: /^[0-9a-f]{32}$/.test(key), ls, urlOk: url.searchParams.get('db') === DB_URL && url.searchParams.get('p') === key, sync: await syncText(o.page), puts: o.state.puts };
      await o.ctx.close();
      const h = await openApp(ctx.browser, ctx.base, { data: fx, target, localStorage: noLink, settle: 800 });
      await h.page.evaluate(k => {
        document.getElementById('herstelKeyInput').value = k;
        document.getElementById('herstelDbInput').value = 'https://fake-huisplan.test';
        document.getElementById('herstelSubmitBtn').click();
      }, 'testplanner0123456789');
      await wait(2000);
      const herstel = { overlay: await h.page.isVisible('#setupOverlay'), n: (await localBood(h.page)).length, puts: h.state.puts, gets: h.state.gets > 0 };
      await h.ctx.close();
      return { setup, herstel };
    });
    const x = r.etag;
    assert(x.setup.setupShown && x.setup.keyOk && x.setup.urlOk && x.setup.ls === DB_URL, 'Installatie: ' + JSON.stringify(x.setup));
    assert(!x.herstel.overlay && x.herstel.n === fx.boodschappen.length, 'Herstellen: ' + JSON.stringify(x.herstel));
  },

  async 'twee browsers tegelijk: gelijktijdige wijzigingen, 412 en offline gaan niet verloren'(ctx) {
    // Met leesbare ETag (voorwaardelijk opslaan), zoals de synchronisatie bedoeld is. Het
    // gelijktijdige moment is tijdsafhankelijk; daarom hier geen stap-voor-stap-vergelijking met
    // de oude code, wel dezelfde eindcontroles voor beide versies.
    const fx = readFixture('huishouden.json');
    for (const target of ['root', 'test']) {
      const db = sharedDb(fx);
      const A = await openApp(ctx.browser, ctx.base, { state: db, target, exposeETag: true });
      const B = await openApp(ctx.browser, ctx.base, { state: db, target, exposeETag: true, localStorage: { plannerMyName: 'Sanne', plannerPartnerName: 'Bas' } });
      // Tegelijk iets toevoegen: één van beide krijgt een 412 en voegt samen.
      await Promise.all([addBood(A.page, 'Ananas'), addBood(B.page, 'Peren')]);
      await wait(2500);
      // A ververst en ziet nu ook die van B.
      await A.page.evaluate(() => document.getElementById('refreshBtn').click()); await wait(1500);
      const aSees = await localBood(A.page);
      // B offline, A wijzigt intussen; B weer online.
      await goOffline(B);
      await addBood(B.page, 'Kiwi');
      await addBood(A.page, 'Bananen'); await wait(1500);
      await goOnline(B); await wait(3000);
      await A.page.evaluate(() => document.getElementById('refreshBtn').click()); await wait(1500);
      const all = boodTexts(db.db), aFinal = await localBood(A.page), bFinal = await localBood(B.page);
      const label = '[' + (target === 'root' ? 'oud' : 'nieuw') + '] ';
      ['Ananas', 'Peren', 'Kiwi', 'Bananen'].forEach(t => assert(all.filter(x => x === t).length === 1, label + t + ' niet precies één keer opgeslagen: ' + all.join(', ')));
      assert((db.conflicts || 0) > 0, label + 'Geen 412-conflict opgetreden bij gelijktijdig opslaan');
      assert(['Ananas', 'Peren'].every(t => aSees.includes(t)), label + 'Toestel A ziet de wijziging van B niet');
      assert(JSON.stringify(aFinal) === JSON.stringify(all) && JSON.stringify(bFinal) === JSON.stringify(all), label + 'Toestellen lopen uiteen');
      assert(!db.errors.length, label + 'Fouten: ' + db.errors.join(' | '));
      await A.ctx.close(); await B.ctx.close();
    }
  },
};
