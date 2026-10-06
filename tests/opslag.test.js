// 1.4.2, E3: cache-identiteit en gedrag bij fouten in de lokale opslag (docs/ontwerp-1.4.2.md, 3;
// docs/identiteit-en-items.md, 3.2; tests T6–T8 uit ontwerp sectie 8, plus extra gevallen).
// Alleen de testversie (test/index.html) heeft E3; deze tests draaien daarom altijd tegen 'test'.
// Opslagfouten worden nagebootst in de browser (zie openApp, opts.opslagFout). Nooit echte data.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { openApp, readFixture, serverWrite, sharedDb, assert, zetOpslagFout, DB_URL } = require('./lib');

const APP = path.join(__dirname, '..', 'test', 'index.html');
const KEY = 'testplanner0123456789';
const cacheId = (db, key, gen) => crypto.createHash('sha256').update('huisplan-cache\n' + db.replace(/\/+$/, '') + '\n' + key + '\n' + gen).digest('hex').slice(0, 32);
const NIEUW = 'huisplanCache_' + cacheId(DB_URL, KEY, 1);
const OUD = 'plannerCache_' + KEY;
const wait = ms => new Promise(r => setTimeout(r, ms));
const boodTexts = d => ((d && d.boodschappen) || []).map(b => b.text).sort();
const syncText = page => page.textContent('#syncText');
const toastText = page => page.textContent('#toast');
const lsRaw = (page, k) => page.evaluate(async k => { const c = sessionStorage.getItem('__opslagFout'); sessionStorage.setItem('__opslagFout', '{}'); try { return localStorage.getItem(k); } finally { sessionStorage.setItem('__opslagFout', c || '{}'); } }, k);
const lsKeys = page => page.evaluate(() => Object.keys(localStorage));
const leesCache = async page => { const r = await lsRaw(page, NIEUW); return r ? JSON.parse(r) : null; };
const refresh = page => page.evaluate(() => document.getElementById('refreshBtn').click());
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
// Bijhouden of de statusregel ooit "Opgeslagen" toonde (ook kortstondig).
const volgStatus = page => page.evaluate(() => {
  window.__statussen = [];
  new MutationObserver(() => window.__statussen.push(document.getElementById('syncText').textContent)).observe(document.getElementById('syncText'), { childList: true, characterData: true, subtree: true });
});
const statussen = page => page.evaluate(() => window.__statussen || []);

module.exports = {
  async 'E3 statisch: alle localStorage-toegang via bewaar()/leesOpslag(), geen stille fouten'() {
    const src = fs.readFileSync(APP, 'utf8');
    const direct = (src.match(/localStorage\.(setItem|removeItem|getItem)\(/g) || []).length;
    assert(direct === 3, 'Verwacht alleen de drie aanroepen in bewaar() en leesOpslag(), gevonden: ' + direct);
    assert(!/try\{[^}]*bewaar\([^}]*\}catch\([a-z]+\)\{\}/.test(src), 'bewaar() binnen een lege catch');
    assert(!/catch\([a-z]+\)\{\}\s*\}\s*\n\s*function readCache/.test(src), 'Lege catch in de cache');
    // De cachesleutel bevat de plannersleutel niet.
    assert(!/'plannerCache_'\+plannerKey\)?;?\s*\}\s*function writeCache/.test(src) && /function cacheKey\(\)\{return 'huisplanCache_'\+cacheId\(\);\}/.test(src), 'Cachesleutel niet volgens E3');
  },

  async 'E3: SHA-256 in de app is gelijk aan de standaard'(ctx) {
    const o = await open(ctx, { data: readFixture('huishouden.json') });
    for (const t of ['', 'abc', 'huisplan-cache\nhttps://x\nk\n1', 'Loïs ✓ '.repeat(30)]) {
      const app = await o.page.evaluate(t => window.huisplanOpslag.sha256(t), t);
      assert(app === crypto.createHash('sha256').update(t).digest('hex'), 'SHA-256 wijkt af voor ' + JSON.stringify(t.slice(0, 20)));
    }
    await o.ctx.close();
  },

  async 'T6a: cache per database+planner+generatie, zonder plannersleutel in de naam; hervatten na een fout'(ctx) {
    const o = await open(ctx, { data: readFixture('huishouden.json') });
    const keys = await lsKeys(o.page);
    assert(keys.includes(NIEUW), 'Nieuwe cachesleutel ontbreekt: ' + keys.join(', '));
    assert(!keys.some(k => /Cache/.test(k) && k.includes(KEY)), 'Plannersleutel leesbaar in een cachesleutel');
    const c = await leesCache(o.page);
    assert(c.format === 2 && c.gen === 1 && c.id === cacheId(DB_URL, KEY, 1) && c.app && c.data && typeof c.base === 'string', 'Cacherecord: ' + JSON.stringify(Object.keys(c)));
    // Fout: server onbereikbaar, wijziging maken, app sluiten en heropenen, server terug.
    await o.ctx.route(DB_URL + '/**', blokkeer);
    await addBood(o.page, 'Hervat T6'); await wait(1500);
    await o.page.reload(); await wait(1500);
    serverWrite(o.state, db => db.boodschappen.push({ id: 'ander-t6', text: 'Ander T6', addedBy: 'Sanne', done: false }));
    await o.ctx.unroute(DB_URL + '/**', blokkeer);
    await refresh(o.page);
    await until(async () => boodTexts(o.state.db).includes('Hervat T6'), 6000, 'samenvoegen vanuit de cache');
    assert(boodTexts(o.state.db).includes('Ander T6'), 'Wijziging van een ander toestel verloren');
    await o.ctx.close();
  },

  async 'T6b: oude cache (1.4.1) wordt overgenomen en pas opgeruimd als alles aantoonbaar op de server staat'(ctx) {
    const fx = readFixture('huishouden.json');
    const lokaal = JSON.parse(JSON.stringify(fx));
    lokaal.boodschappen.push({ id: 'oud-1', text: 'Uit oude cache', addedBy: 'Bas', done: false });
    const oud = JSON.stringify({ data: lokaal, base: '', t: 1 });
    const db = sharedDb(fx);
    // Eerst offline: de oude cache wordt gebruikt maar niet opgeruimd.
    const o = await open(ctx, { state: db, localStorage: { [OUD]: oud }, dbOnbereikbaar: true });
    await o.page.click('[data-view="boodschappenView"]');
    assert((await o.page.textContent('#boodschappenView')).includes('Uit oude cache'), 'Oude cache niet gebruikt bij opstarten');
    assert((await lsRaw(o.page, OUD)) === oud, 'Oude cache aangeraakt vóór bevestiging');
    let c = await leesCache(o.page);
    assert(!c || c.legacy === 'te-verwerken', 'Nieuwe cache zonder markering "te verwerken"');
    db.onbereikbaar = false;
    await refresh(o.page);
    await until(async () => boodTexts(db.db).includes('Uit oude cache'), 6000, 'inhoud oude cache op de server');
    await wait(800); await refresh(o.page); await wait(1500);
    assert((await lsRaw(o.page, OUD)) === null, 'Oude cache niet opgeruimd na bevestiging');
    c = await leesCache(o.page);
    assert(c && !c.legacy && boodTexts(c.data).includes('Uit oude cache'), 'Nieuwe cache onvolledig na opruimen');
    await o.ctx.close();
  },

  async 'T6c: oude cache met wijzigingen die niet op de server staan, blijft staan'(ctx) {
    // Bijv. de live-versie op hetzelfde toestel heeft daarna nog iets bewaard dat niet op de server staat.
    const fx = readFixture('huishouden.json');
    const db = sharedDb(fx);
    const o = await open(ctx, { state: db });
    const base = await o.page.evaluate(k => JSON.parse(localStorage.getItem(k)).base, NIEUW);
    const lokaal = JSON.parse(JSON.stringify(fx));
    lokaal.boodschappen.push({ id: 'live-1', text: 'Alleen in live-cache', addedBy: 'Bas', done: false });
    const oud = JSON.stringify({ data: lokaal, base: base, t: 2 });
    await o.page.evaluate(([k, v]) => localStorage.setItem(k, v), [OUD, oud]);
    await o.page.reload(); await wait(1500);
    await refresh(o.page); await wait(1500);
    assert((await lsRaw(o.page, OUD)) === oud, 'Oude cache met onverwerkte wijziging is opgeruimd');
    await o.ctx.close();
  },

  async 'T6d: ledenmigratie start niet als de veiligheidskopie niet duurzaam bewaard kan worden'(ctx) {
    const db = sharedDb(readFixture('leden-oud.json'));
    const o = await open(ctx, { state: db, exposeETag: true, opslagFout: { schrijven: '^plannerLedenBackup' }, localStorage: { plannerMyName: 'Bas', plannerPartnerName: 'Sanne', plannerLedenregister: 'aan' } });
    for (let i = 0; i < 6; i++) {
      try { await o.page.waitForSelector('#confirmOverlay.open', { timeout: 2000 }); } catch (e) { break; }
      await o.page.click('#confirmOkBtn'); await wait(150);
    }
    await wait(1500);
    assert(!('members' in (db.db || {})), 'Migratie toch uitgevoerd zonder bewaarde veiligheidskopie');
    assert(/veiligheidskopie/.test(await toastText(o.page)), 'Geen melding: ' + await toastText(o.page));
    // Niet opnieuw lastigvallen in dezelfde sessie (de migratie zou toch niet starten).
    await refresh(o.page); await wait(2500);
    assert(!(await o.page.isVisible('#confirmOverlay.open')), 'Ledenvragen opnieuw gesteld na een mislukte veiligheidskopie');
    const diag = await o.page.evaluate(() => window.huisplanOpslag.diagnose());
    assert(diag.some(d => d.sleutel === 'plannerLedenBackup' && d.soort === 'schrijven'), 'Mislukte veiligheidskopie niet in de diagnose');
    // De bouwsteen zelf: schrijven + teruglezen.
    const r = await o.page.evaluate(() => [window.huisplanOpslag.bewaarDuurzaam('plannerLedenBackup', 'x'), window.huisplanOpslag.bewaarDuurzaam('huisplanProef', 'y'), window.huisplanOpslag.gezond()]);
    assert(r[0] === false && r[1] === true && r[2] === true, 'bewaarDuurzaam/gezond: ' + JSON.stringify(r));
    await o.ctx.close();
  },

  async 'T7a: cache vol bij een wijziging — melding, direct synchroniseren, pas daarna "Opgeslagen"'(ctx) {
    const o = await open(ctx, { data: readFixture('huishouden.json') });
    await zetOpslagFout(o.page, { schrijven: '^huisplanCache_' });
    await volgStatus(o.page);
    await addBood(o.page, 'Quota T7a');
    await until(async () => boodTexts(o.state.db).includes('Quota T7a'), 4000, 'direct gesynchroniseerd');
    await wait(500);
    const st = await statussen(o.page);
    const eerstOpgeslagen = st.findIndex(t => /^Opgeslagen/.test(t));
    assert(st.some(t => /nog niet veilig bewaard/.test(t)), 'Geen melding dat de wijziging nog niet veilig is: ' + st.join(' | '));
    assert(eerstOpgeslagen === -1 || st.slice(0, eerstOpgeslagen).some(t => /nog niet veilig/.test(t)), 'Statusvolgorde: ' + st.join(' | '));
    assert(/^(Opgeslagen|Bijgewerkt)/.test(await syncText(o.page)), 'Na bevestiging door de server: ' + await syncText(o.page));
    await o.ctx.close();
  },

  async 'T7b: netwerk én opslag weg — "Niet bewaard", nooit "Opgeslagen", waarschuwen bij sluiten, later herstel'(ctx) {
    const o = await open(ctx, { data: readFixture('huishouden.json') });
    await zetOpslagFout(o.page, { schrijven: '^huisplanCache_' });
    await o.ctx.route(DB_URL + '/**', blokkeer); await o.ctx.setOffline(true);
    await volgStatus(o.page);
    await addBood(o.page, 'Nergens T7b'); await wait(2500);
    const t = await syncText(o.page);
    assert(/Niet bewaard/.test(t), 'Statusregel: ' + t);
    assert(!(await statussen(o.page)).some(s => /^Opgeslagen|worden bewaard/.test(s)), 'Onterechte claim: ' + (await statussen(o.page)).join(' | '));
    assert(await o.page.evaluate(() => window.huisplanOpslag.risico()), 'Geen waarschuwing vóór sluiten');
    assert((await o.page.textContent('#boodschappenView')).includes('Nergens T7b'), 'Wijziging niet meer in het geheugen');
    await o.ctx.unroute(DB_URL + '/**', blokkeer); await o.ctx.setOffline(false);
    await until(async () => boodTexts(o.state.db).includes('Nergens T7b'), 6000, 'opslaan na weer online');
    await until(async () => /^Opgeslagen|^Bijgewerkt/.test(await syncText(o.page)), 4000, 'status na herstel');
    assert(!(await o.page.evaluate(() => window.huisplanOpslag.risico())), 'Nog steeds waarschuwing terwijl alles op de server staat');
    await o.ctx.close();
  },

  async 'T7c: leesfout op de cache — app werkt, cache onaangeroerd ("onbekend", niet "leeg"), melding'(ctx) {
    const fx = readFixture('huishouden.json');
    const bestaand = JSON.stringify({ format: 2, gen: 1, id: cacheId(DB_URL, KEY, 1), app: '1.4.1', data: fx, base: '', t: 1 });
    const o = await open(ctx, { data: fx, localStorage: { [NIEUW]: bestaand }, opslagFout: { lezen: '^huisplanCache_' } });
    await wait(500);
    assert(/niet te lezen/.test(await toastText(o.page)), 'Geen melding: ' + await toastText(o.page));
    await addBood(o.page, 'Lees T7c');
    await until(async () => boodTexts(o.state.db).includes('Lees T7c'), 4000, 'opslaan naar de server');
    assert((await lsRaw(o.page, NIEUW)) === bestaand, 'Onleesbare cache is overschreven');
    assert(!o.state.errors.length, 'Fouten: ' + o.state.errors.join(' | '));
    await o.ctx.close();
  },

  async 'T7d: beschadigde cache wordt apart bewaard, niet vernietigd'(ctx) {
    const kapot = '{"format":2,"data":{"boodsch';
    const o = await open(ctx, { data: readFixture('huishouden.json'), localStorage: { [NIEUW]: kapot } });
    const keys = await lsKeys(o.page);
    const apart = keys.filter(k => k.startsWith('huisplanCacheApart_' + cacheId(DB_URL, KEY, 1) + '_'));
    assert(apart.length === 1 && (await lsRaw(o.page, apart[0])) === kapot, 'Beschadigde cache niet apart bewaard: ' + keys.join(', '));
    assert(/apart bewaard/.test(await toastText(o.page)), 'Geen melding: ' + await toastText(o.page));
    const c = await leesCache(o.page);
    assert(c && c.format === 2 && boodTexts(c.data).length > 0, 'Geen nieuwe, geldige cache na herstel');
    await o.ctx.close();
  },

  async 'T7e: beschadigde cache die niet apart bewaard kan worden, blijft onaangeroerd'(ctx) {
    const kapot = 'geen json';
    const o = await open(ctx, { data: readFixture('huishouden.json'), localStorage: { [NIEUW]: kapot }, opslagFout: { schrijven: '^huisplanCacheApart_' } });
    await addBood(o.page, 'Kapot T7e');
    await until(async () => boodTexts(o.state.db).includes('Kapot T7e'), 4000, 'opslaan naar de server');
    assert((await lsRaw(o.page, NIEUW)) === kapot, 'Beschadigde cache overschreven terwijl hij niet apart bewaard kon worden');
    await o.ctx.close();
  },

  async 'T7f: verwijderen van de oude cache mislukt — onschadelijk, wel in de diagnose'(ctx) {
    const fx = readFixture('huishouden.json');
    const oud = JSON.stringify({ data: fx, base: '', t: 1 });
    const o = await open(ctx, { data: fx, localStorage: { [OUD]: oud }, opslagFout: { verwijderen: '^plannerCache_' } });
    await wait(500); await refresh(o.page); await wait(1500);
    assert((await lsRaw(o.page, OUD)) === oud, 'Oude cache toch weg');
    const diag = await o.page.evaluate(() => window.huisplanOpslag.diagnose());
    assert(diag.some(d => d.soort === 'verwijderen'), 'Mislukt verwijderen niet in de diagnose');
    assert(!diag.some(d => d.sleutel.includes(KEY)), 'Plannersleutel in de diagnose');
    assert(!/niet veilig|Niet bewaard/.test(await syncText(o.page)), 'Onnodige foutmelding: ' + await syncText(o.page));
    await o.ctx.close();
  },

  async 'T7g: koppeling niet te onthouden — sessie werkt via de link, met melding'(ctx) {
    const o = await open(ctx, { data: readFixture('huishouden.json'), opslagFout: { schrijven: '^planner(DbUrl|Key)$' } });
    assert(/koppeling/.test(await toastText(o.page)), 'Geen melding: ' + await toastText(o.page));
    await addBood(o.page, 'Link T7g');
    await until(async () => boodTexts(o.state.db).includes('Link T7g'), 4000, 'opslaan');
    await o.ctx.close();
  },

  async 'T8: cache van een andere planner, database of generatie wordt niet samengevoegd en niet aangeraakt'(ctx) {
    const fx = readFixture('huishouden.json');
    const vreemd = t => { const d = JSON.parse(JSON.stringify(fx)); d.boodschappen.push({ id: 'v-' + t, text: 'Vreemd ' + t, done: false }); return d; };
    const andereDb = 'huisplanCache_' + cacheId('https://andere-db.test', KEY, 1);
    const anderePlanner = 'plannerCache_andereplanner0000000000';
    const ls = {
      [anderePlanner]: JSON.stringify({ data: vreemd('planner'), base: '', t: 1 }),
      [andereDb]: JSON.stringify({ format: 2, gen: 1, id: cacheId('https://andere-db.test', KEY, 1), data: vreemd('database'), base: '' }),
      // Onder de juiste sleutel, maar van een andere opslaggeneratie: geen gewone cache.
      [NIEUW]: JSON.stringify({ format: 2, gen: 2, id: cacheId(DB_URL, KEY, 1), data: vreemd('generatie'), base: '' })
    };
    const o = await open(ctx, { data: fx, localStorage: ls });
    await addBood(o.page, 'Eigen T8');
    await until(async () => boodTexts(o.state.db).includes('Eigen T8'), 4000, 'opslaan');
    const op = boodTexts(o.state.db), lokaal = boodTexts((await leesCache(o.page)).data);
    for (const t of ['planner', 'database', 'generatie']) {
      assert(!op.includes('Vreemd ' + t) && !lokaal.includes('Vreemd ' + t), 'Cache van een andere ' + t + ' samengevoegd');
    }
    assert((await lsRaw(o.page, anderePlanner)) === ls[anderePlanner] && (await lsRaw(o.page, andereDb)) === ls[andereDb], 'Vreemde cache aangeraakt');
    const keys = await lsKeys(o.page);
    const apart = keys.find(k => k.startsWith('huisplanCacheApart_'));
    assert(apart && (await lsRaw(o.page, apart)) === ls[NIEUW], 'Cache van een andere generatie niet apart bewaard');
    await o.ctx.close();
  }
};
