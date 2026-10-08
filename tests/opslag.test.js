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
// Statusregel volgen vanaf het laden van de pagina (ook na herladen).
const VOLG_VANAF_START = `window.addEventListener('DOMContentLoaded',()=>{window.__statussen=[];const el=document.getElementById('syncText');if(!el)return;new MutationObserver(()=>window.__statussen.push(el.textContent)).observe(el,{childList:true,characterData:true,subtree:true});});`;
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

// Opslagfouten met tellers, vóór de app geladen (ook na herladen): regels in sessionStorage '__fout2'.
// {op: 'get'|'set'|'remove', key: regex, skip: eerst zoveel keer gewoon laten slagen, n: daarna zoveel
// keer falen (-1 = altijd)}. 'set'/'get' gooien, 'remove' gooit ook (zoals een geblokkeerde opslag).
const FOUT2_SRC = `(function(){
  var P = Storage.prototype, oS = P.setItem, oG = P.getItem, oR = P.removeItem;
  function regels(){ try { return JSON.parse(oG.call(sessionStorage, '__fout2') || '[]'); } catch (e) { return []; } }
  function raak(st, op, k){
    if (st !== window.localStorage) return false;
    var rs = regels(), hit = false;
    for (var i = 0; i < rs.length; i++) { var r = rs[i];
      if (r.op !== op || !new RegExp(r.key).test(String(k))) continue;
      if (r.skip > 0) { r.skip--; continue; }
      if (r.n === 0) continue;
      if (r.n > 0) r.n--; hit = true; break; }
    oS.call(sessionStorage, '__fout2', JSON.stringify(rs));
    return hit;
  }
  P.setItem = function (k, v) { if (raak(this, 'set', k)) throw new DOMException('fout2', 'QuotaExceededError'); return oS.call(this, k, v); };
  P.getItem = function (k) { if (raak(this, 'get', k)) throw new DOMException('fout2', 'SecurityError'); return oG.call(this, k); };
  P.removeItem = function (k) { if (raak(this, 'remove', k)) throw new DOMException('fout2', 'SecurityError'); return oR.call(this, k); };
})();`;
const zetFout2 = (page, regels) => page.evaluate(r => sessionStorage.setItem('__fout2', JSON.stringify(r)), regels);
const apartKopieen = async page => { const ks = (await lsKeys(page)).filter(k => k.startsWith('huisplanCacheApart_') || k.startsWith('huisplanCacheConflict_')); return Promise.all(ks.map(k => lsRaw(page, k))); };

module.exports = {
  // ── Vijfde Codex-review #16 ───────────────────────────────────────────────────────────────────
  // B1: een verliesvrijheidsbewijs geldt alleen voor de serverversie waartegen het is berekend. Na een
  // 412 (de server veranderde tussen controle en PUT) opnieuw dezelfde controle; nooit een winnaar.
  ...(() => {
    const out = {};
    const H = (t, d) => ({ text: t, norm: t.toLowerCase(), date: d });
    const histX = d => d.boodschappenHistory.push(H('X r5', '2026-10-01'));
    const histY = d => d.boodschappenHistory.push(H('Y r5', '2026-10-01'));
    const item = (id, t) => d => d.boodschappen.push({ id, text: t, done: false });
    const cacheVan = (basis, lokaal) => {
      const cdata = JSON.parse(JSON.stringify(basis)); lokaal.forEach(f => f(cdata));
      return JSON.stringify({ format: 2, gen: 1, id: cacheId(DB_URL, KEY, 1), app: '1.4.1', data: cdata, base: canon(basis), t: 1, inst: 'i00000000000000c5', seq: 1, localGen: 1, confirmedGen: 0 });
    };
    const journaal = async page => (await lsKeys(page)).filter(k => k.startsWith('plannerJournal_'));
    // Elke PUT n (1, 2, ...) krijgt vlak vóór verwerking de serverwijziging wijzigingen[n-1] (dus een 412).
    const metWijzigingen = wijzigingen => { let n = 0; return ({ method, state }) => { if (method === 'PUT' && n < wijzigingen.length) serverWrite(state, wijzigingen[n++]); return null; }; };
    // X duurzaam: de oorspronkelijke cache, of een bewijs/kopie met precies dat geschiedenisitem.
    const bewaardX = async (page, cache) => (await lsRaw(page, NIEUW)) === cache || (await apartKopieen(page)).some(b => { try { return JSON.parse(b).data.boodschappenHistory.some(h => h.text === 'X r5'); } catch (e) { return false; } });
    out['R5-B1: verliesvrij bij opstarten, daarna 412 door een conflicterende wijziging tussen controle en PUT — geen winnaar, X en Y bewaard, nooit "opgeslagen", ook na herladen'] = async ctx => {
      const basis = fx(), cache = cacheVan(basis, [histX]);
      const o = await open(ctx, { data: basis, localStorage: { [NIEUW]: cache }, onRequest: metWijzigingen([histY]), initScript: VOLG_VANAF_START });
      await wait(3000);
      const db = () => JSON.stringify(o.state.db);
      assert(o.state.conflicts >= 1, 'Testopzet: geen 412');
      assert(db().includes('Y r5'), 'Y (wijziging tussen controle en PUT) van de server verdwenen');
      assert(!db().includes('X r5'), 'Na de 412 toch een winnaar gekozen (X op de server)');
      assert(await bewaardX(o.page, cache), 'X nergens meer duurzaam bewaard');
      assert(await o.page.isVisible('#confirmOverlay.open') && /niet zonder verlies/.test(await o.page.textContent('#confirmTitle')), 'Geen herstelmelding na het conflict');
      await o.page.click('#confirmCancelBtn');
      assert(!(await statussen(o.page)).some(t => OPGESLAGEN.test(t)), '"Opgeslagen" terwijl het conflict open is: ' + (await statussen(o.page)).join(' | '));
      assert(!(await journaal(o.page)).length, 'Journaal blijft staan na een afgehandelde 412');
      for (let i = 0; i < 2; i++) {
        await o.page.reload(); await wait(2500);
        const w = 'herladen ' + (i + 1);
        assert(await o.page.isVisible('#confirmOverlay.open') && /niet zonder verlies/.test(await o.page.textContent('#confirmTitle')), w + ': conflict niet meer gemeld');
        await o.page.click('#confirmCancelBtn');
        await addBood(o.page, 'Nieuw r5 ' + i); await wait(2000);
        assert(db().includes('Y r5') && !db().includes('X r5'), w + ': Y verdwenen of X als winnaar');
        assert(boodTexts(o.state.db).includes('Nieuw r5 ' + i), w + ': nieuwe wijziging niet opgeslagen');
        assert(await bewaardX(o.page, cache), w + ': X verdwenen');
        assert(!(await statussen(o.page)).some(t => OPGESLAGEN.test(t)), w + ': "opgeslagen" terwijl het conflict open is');
      }
      await o.ctx.close();
    };
    out['R5-B1: herhaalde 412 met onafhankelijke wijzigingen tijdens de herpogingen — alles samengevoegd, daarna pas "opgeslagen"'] = async ctx => {
      const basis = fx(), cache = cacheVan(basis, [item('x-r5', 'X r5')]);
      const o = await open(ctx, { data: basis, localStorage: { [NIEUW]: cache }, onRequest: metWijzigingen([item('y-r5', 'Y r5'), item('w-r5', 'W r5')]) });
      await until(async () => ['X r5', 'Y r5', 'W r5'].every(t => boodTexts(o.state.db).includes(t)) && OPGESLAGEN.test(await syncText(o.page)), 8000, 'X, Y en W samengevoegd en opgeslagen');
      assert(o.state.conflicts >= 2, 'Testopzet: geen twee 412-antwoorden');
      assert(!(await o.page.isVisible('#confirmOverlay.open')), 'Onterechte herstelmelding');
      assert(!(await lsKeys(o.page)).some(k => k.startsWith('huisplanCacheConflict_')), 'Onterecht conflictbewijs');
      await o.ctx.close();
    };
    out['R5-B1: eerste 412 onafhankelijk, tweede 412 conflicterend — geblokkeerd bij de tweede, X en beide serverwijzigingen bewaard'] = async ctx => {
      const basis = fx(), cache = cacheVan(basis, [item('x-r5', 'X r5'), histX]);
      const o = await open(ctx, { data: basis, localStorage: { [NIEUW]: cache }, onRequest: metWijzigingen([item('y-r5', 'Y r5'), histY]), initScript: VOLG_VANAF_START });
      await wait(4000);
      const db = JSON.stringify(o.state.db);
      assert(o.state.conflicts >= 2, 'Testopzet: geen twee 412-antwoorden');
      assert(boodTexts(o.state.db).includes('Y r5') && db.includes('"Y r5"'), 'Serverwijzigingen verdwenen');
      assert(o.state.db.boodschappenHistory.some(h => h.text === 'Y r5') && !o.state.db.boodschappenHistory.some(h => h.text === 'X r5'), 'Geschiedenis: winnaar gekozen');
      const bewijs = (await apartKopieen(o.page)).concat([await lsRaw(o.page, NIEUW)]).filter(Boolean);
      assert(bewijs.some(b => b.includes('X r5') && b.includes('x-r5')), 'X (cache-inhoud) nergens duurzaam bewaard');
      assert(!(await statussen(o.page)).some(t => OPGESLAGEN.test(t)), '"Opgeslagen" terwijl het conflict open is');
      await o.ctx.close();
    };
    return out;
  })(),

  // B2: bescherming tegen overschrijven van conflictbewijs geldt over alle vensters (gedeelde opslag).
  ...(() => {
    const out = {};
    const H = (t, d) => ({ text: t, norm: t.toLowerCase(), date: d });
    const pageUrl = o => o.url;
    const bewijzen = async page => (await lsKeys(page)).filter(k => k.startsWith('huisplanCacheConflict_') || k.startsWith('huisplanCacheApart_'));
    const xBewaard = async (page, cacheX) => (await lsRaw(page, NIEUW)) === cacheX || (await Promise.all((await bewijzen(page)).map(k => lsRaw(page, k)))).includes(cacheX);
    const poortOpen = page => page.evaluate(() => { const g = document.getElementById('journalGateOverlay'); return !!g && !g.hidden; });
    const sluitMelding = async page => { if (await page.isVisible('#confirmOverlay.open')) await page.click('#confirmCancelBtn'); };
    const meldt = async page => (await page.isVisible('#confirmOverlay.open') && /niet zonder verlies/.test(await page.textContent('#confirmTitle'))) || await poortOpen(page);
    for (const kopie of ['lukt', 'mislukt']) {
      for (const volgorde of ['A ontdekt eerst', 'B schrijft eerst']) {
        out['R5-B2: tweede venster en conflictcache — herstelkopie ' + kopie + ', ' + volgorde + ': X nooit uit alle opslag, melding blijft na herladen, nooit "opgeslagen"'] = async ctx => {
          const basis = fx(), sdata = JSON.parse(JSON.stringify(basis)), xdata = JSON.parse(JSON.stringify(basis));
          sdata.boodschappenHistory.push(H('Y r5b', '2026-10-01')); xdata.boodschappenHistory.push(H('X r5b', '2026-10-01'));
          const cacheX = JSON.stringify({ format: 2, gen: 1, id: cacheId(DB_URL, KEY, 1), app: '1.4.1', data: xdata, base: canon(basis), t: 1, inst: 'i00000000000000b5', seq: 3, localGen: 1, confirmedGen: 0 });
          const fout = kopie === 'mislukt' ? { schrijven: '^huisplanCache(Conflict|Apart)_' } : null;
          // Venster B staat al open op [oud, Y]; daarna komt in de gedeelde cache de onbevestigde [oud, X].
          const B = await open(ctx, { data: sdata, opslagFout: fout, initScript: VOLG_VANAF_START });
          await B.page.evaluate(([k, v]) => localStorage.setItem(k, v), [NIEUW, cacheX]);
          const A = { page: await B.ctx.newPage() };
          const openA = async () => { await A.page.goto(pageUrl(B)); await wait(2500); };
          const db = () => JSON.stringify(B.state.db);
          const controle = async w => {
            assert(await xBewaard(B.page, cacheX), w + ': X uit alle duurzame opslag verdwenen');
            assert(db().includes('Y r5b') && !db().includes('X r5b'), w + ': Y verdwenen of X als winnaar');
          };
          if (volgorde === 'A ontdekt eerst') {
            await openA();
            assert(await meldt(A.page), 'A: conflict niet gemeld');
            await sluitMelding(A.page);
            await controle('na ontdekken door A');
            await addBood(B.page, 'Z r5b'); await wait(2500);
          } else {
            await addBood(B.page, 'Z r5b'); await wait(2500);
            await controle('na Z van B');
            await openA();
            assert(await meldt(A.page), 'A: conflict niet gemeld (B schreef eerst)');
            await sluitMelding(A.page);
          }
          await sluitMelding(B.page);
          await controle('na Z van B en ontdekken door A');
          const zErgens = async () => boodTexts(B.state.db).includes('Z r5b') || (await lsKeys(B.page)).some(k => k.startsWith('plannerJournal_')) && (await Promise.all((await lsKeys(B.page)).filter(k => k.startsWith('plannerJournal_')).map(k => lsRaw(B.page, k)))).some(j => String(j).includes('Z r5b'));
          assert(await zErgens(), 'Z van B nergens bewaard');
          for (const p of [A.page, B.page]) assert(!OPGESLAGEN.test(await syncText(p)), '"Opgeslagen" terwijl het conflict open is: ' + await syncText(p));
          // Herladen (beide vensters, wisselend) met nieuwe wijzigingen.
          for (let i = 0; i < 2; i++) {
            for (const [naam, p] of i % 2 ? [['B', B.page], ['A', A.page]] : [['A', A.page], ['B', B.page]]) {
              await p.reload(); await wait(2500);
              const w = naam + ', herladen ' + (i + 1);
              assert(await meldt(p), w + ': conflict niet meer gemeld');
              await sluitMelding(p);
              if (!(await poortOpen(p))) { await addBood(p, 'Nieuw ' + naam + i); await wait(2000); await sluitMelding(p); }
              await controle(w);
              assert(!OPGESLAGEN.test(await syncText(p)), w + ': "opgeslagen" terwijl het conflict open is');
            }
          }
          await B.ctx.close();
        };
      }
    }
    // Race: B leest de cache vóórdat C schrijft en overschrijft daarna C's onbevestigde stand. C merkt
    // dat via het storage-event (oldValue) en legt zijn eigen stand duurzaam vast.
    out['R5-B2: check-then-write-race tussen twee vensters — de overschreven stand van het levende venster wordt alsnog duurzaam bewaard'] = async ctx => {
      // Beide vensters melden "offline" (navigator.onLine): wijzigingen blijven onbevestigd en alleen in de
      // cache (geen journaal), precies de stand die bij overschrijven verloren zou gaan.
      const offline = `Object.defineProperty(Navigator.prototype,'onLine',{configurable:true,get(){return false;}});`;
      const B = await open(ctx, { data: fx(), initScript: offline });
      const C = { page: await B.ctx.newPage() };
      await C.page.goto(B.url); await wait(2000);
      await B.page.evaluate(k => { window.__oud = localStorage.getItem(k); }, NIEUW);
      await addBood(C.page, 'W r5c'); await wait(1500);
      assert(String(await lsRaw(C.page, NIEUW)).includes('W r5c'), 'Testopzet: W niet in de cache');
      // B's volgende cachelezing geeft nog de stand van vóór C's opslag (de race), daarna normaal.
      await B.page.evaluate(k => { const g = Storage.prototype.getItem; let een = true; Storage.prototype.getItem = function (x) { if (een && this === localStorage && x === k) { een = false; return window.__oud; } return g.call(this, x); }; }, NIEUW);
      await addBood(B.page, 'V r5c'); await wait(2000);
      const alles = (await Promise.all((await lsKeys(C.page)).filter(k => k.startsWith('huisplanCache')).map(k => lsRaw(C.page, k)))).join('\n');
      assert(alles.includes('W r5c'), 'W (onbevestigd, van het levende venster C) uit alle duurzame opslag verdwenen');
      assert(alles.includes('V r5c'), 'V van B niet bewaard');
      await B.ctx.close();
    };
    return out;
  })(),

  // ── Vierde Codex-review #16 ───────────────────────────────────────────────────────────────────
  // B1: een vastgesteld herstelconflict mag niet alleen in het geheugen bestaan. Na herladen (zonder
  // journaal) mag de gewone load() geen winnaar kiezen; X (cache) en Y (server) blijven allebei.
  ...(() => {
    const out = {};
    const H = (t, d) => ({ text: t, norm: t.toLowerCase(), date: d });
    const gevallen = [
      ['geschiedenis zonder id aan beide kanten', d => d.boodschappenHistory.push(H('X r4', '2026-10-01')), d => d.boodschappenHistory.push(H('Y r4', '2026-10-01'))],
      ['zelfde item verschillend gewijzigd', d => { d.boodschappen.find(b => b.id === 'b-melk').text = 'X r4'; }, d => { d.boodschappen.find(b => b.id === 'b-melk').text = 'Y r4'; }]
    ];
    const opzet = (lokaal, server, basis) => {
      basis = basis || fx(); const cdata = JSON.parse(JSON.stringify(basis)), sdata = JSON.parse(JSON.stringify(basis));
      lokaal(cdata); server(sdata);
      return { sdata, cache: JSON.stringify({ format: 2, gen: 1, id: cacheId(DB_URL, KEY, 1), app: '1.4.1', data: cdata, base: canon(basis), t: 1, localGen: 1, confirmedGen: 0 }) };
    };
    const journaalSleutels = async page => (await lsKeys(page)).filter(k => k.startsWith('plannerJournal_'));
    // Na elke (her)start: melding, cache met X onaangeroerd, Y op de server en X niet, nooit "opgeslagen".
    async function controleer(o, cache, naam, metJournaal) {
      if (!metJournaal) {
        assert(await o.page.isVisible('#confirmOverlay.open') && /niet zonder verlies/.test(await o.page.textContent('#confirmTitle')), naam + ': geen herstelmelding (' + (await o.page.isVisible('#confirmOverlay.open') ? await o.page.textContent('#confirmTitle') : 'geen venster') + '), status: ' + await syncText(o.page));
      }
      if (await o.page.isVisible('#confirmOverlay.open')) await o.page.click('#confirmCancelBtn');
      const db = JSON.stringify(o.state.db);
      assert(db.includes('Y r4'), naam + ': Y van de server verdwenen');
      assert(!db.includes('X r4'), naam + ': automatisch een winnaar gekozen (X op de server)');
      const raw = await lsRaw(o.page, NIEUW);
      assert(raw === cache || (await apartKopieen(o.page)).includes(cache), naam + ': X (cache) verdwenen');
      // (Vijfde review: het duurzame bewijs is de cache zelf óf een write-once conflictkopie van precies die cache.)
      const st = await statussen(o.page);
      assert(!st.some(t => OPGESLAGEN.test(t)), naam + ': "opgeslagen" terwijl het conflict open is: ' + st.join(' | '));
    }
    const volgVanafStart = `window.addEventListener('DOMContentLoaded',()=>{window.__statussen=[];const el=document.getElementById('syncText');if(!el)return;new MutationObserver(()=>window.__statussen.push(el.textContent)).observe(el,{childList:true,characterData:true,subtree:true});});`;
    gevallen.forEach(([naam, lokaal, server]) => {
      out['R4-B1: herstelconflict, offline vóór de PUT, géén journaal; herladen online + twee keer — ' + naam + ': X en Y blijven, geen winnaar, nooit "opgeslagen"'] = async ctx => {
        const { sdata, cache } = opzet(lokaal, server);
        // De verbinding valt weg vóór de eerste PUT: de browser meldt offline zodra de serverstand binnen
        // is (navigator.onLine), daarna gaat ook het netwerk echt dicht. Zo ontstaat er geen journaal.
        // (De vlag wordt bij het laden van de pagina gelezen: een pagina blijft offline tot ze herlaadt.)
        const nietOnline = `(function(){var on=sessionStorage.getItem('__nietOnline')==='0';Object.defineProperty(Navigator.prototype,'onLine',{configurable:true,get(){return on;}});})();`;
        const o = await open(ctx, { data: sdata, localStorage: { [NIEUW]: cache }, opslagFout: { lezen: '^huisplanCache_' }, initScript: volgVanafStart + nietOnline });
        await wait(1200);
        await zetOpslagFout(o.page, {});
        await o.ctx.route(DB_URL + '/**', blokkeer); await o.ctx.setOffline(true);
        await addBood(o.page, 'Z r4'); await wait(2500);
        assert(!(await journaalSleutels(o.page)).length, naam + ': testopzet: toch een journaal');
        await controleer(o, cache, naam + ', eerste sessie', false);
        await o.page.evaluate(() => sessionStorage.setItem('__nietOnline', '0'));
        await o.ctx.unroute(DB_URL + '/**', blokkeer); await o.ctx.setOffline(false);
        await wait(1000);
        assert(!(await journaalSleutels(o.page)).length, naam + ': testopzet: journaal vóór herladen');
        for (let i = 0; i < 3; i++) {
          await o.page.reload(); await wait(2500);
          await controleer(o, cache, naam + ', herladen ' + (i + 1), false);
          assert(!(await journaalSleutels(o.page)).length, naam + ', herladen ' + (i + 1) + ': testopzet: toch een journaal');
        }
        await o.ctx.close();
      };
      out['R4-B1: hervatte cache in een gewone start (geen leesfout, geen journaal) — ' + naam + ': geblokkeerd, ook na twee keer herladen'] = async ctx => {
        const { sdata, cache } = opzet(lokaal, server);
        const o = await open(ctx, { data: sdata, localStorage: { [NIEUW]: cache }, initScript: volgVanafStart });
        await wait(2500);
        await controleer(o, cache, naam + ', eerste start', false);
        for (let i = 0; i < 2; i++) {
          await o.page.reload(); await wait(2500);
          await controleer(o, cache, naam + ', herladen ' + (i + 1), false);
        }
        await o.ctx.close();
      };
      out['R4-B1: herstelconflict mét journaal (PUT onderweg afgebroken) — ' + naam + ': X en Y blijven over drie keer herladen'] = async ctx => {
        const { sdata, cache } = opzet(lokaal, server);
        const o = await open(ctx, { data: sdata, localStorage: { [NIEUW]: cache }, opslagFout: { lezen: '^huisplanCache_' }, initScript: volgVanafStart });
        await wait(1200);
        await zetOpslagFout(o.page, {});
        await o.ctx.route(DB_URL + '/**', blokkeer); // online, maar het verzoek valt weg: uitkomst onbekend
        await addBood(o.page, 'Z r4'); await wait(3000);
        assert((await journaalSleutels(o.page)).length, naam + ': testopzet: geen journaal');
        await controleer(o, cache, naam + ', eerste sessie', true);
        await o.ctx.unroute(DB_URL + '/**', blokkeer);
        for (let i = 0; i < 3; i++) {
          await o.page.reload(); await wait(2500);
          await controleer(o, cache, naam + ', herladen ' + (i + 1), true);
        }
        await o.ctx.close();
      };
    });
    // Controle: onafhankelijke wijzigingen na herladen worden nog gewoon (verliesvrij) samengevoegd.
    out['R4-B1 (controle): hervatte cache met onafhankelijke toevoeging — verliesvrij samengevoegd en opgeslagen'] = async ctx => {
      const { sdata, cache } = opzet(d => d.boodschappen.push({ id: 'x-r4c', text: 'X r4c', done: false }), d => d.boodschappen.push({ id: 'y-r4c', text: 'Y r4c', done: false }));
      const o = await open(ctx, { data: sdata, localStorage: { [NIEUW]: cache } });
      await until(async () => ['X r4c', 'Y r4c'].every(t => boodTexts(o.state.db).includes(t)) && OPGESLAGEN.test(await syncText(o.page)), 6000, 'X en Y samengevoegd en opgeslagen');
      assert(!(await o.page.isVisible('#confirmOverlay.open')), 'Onterechte herstelmelding');
      await o.ctx.close();
    };
    return out;
  })(),

  // B2: een markering die er staat maar niet te herkennen is, is geen afwezige markering.
  ...(() => {
    const out = {};
    const oud = JSON.stringify({ data: metItem(fx(), 'x-r4m', 'X r4m'), base: canon(fx()), t: 1, db: DB_URL });
    const hash = crypto.createHash('sha256').update(oud).digest('hex').slice(0, 32);
    const varianten = [
      ['onbekende toestand', JSON.stringify({ h: hash, s: 'future-state' })],
      ['kapotte JSON', '{"h":"' + hash + '","s":'],
      ['verkeerde structuur (lijst)', JSON.stringify([hash, 'klaar'])],
      ['ontbrekende hash', JSON.stringify({ s: 'klaar' })],
      ['ontbrekende toestand', JSON.stringify({ h: hash })],
      ['hash geen tekst', JSON.stringify({ h: 123, s: 'klaar' })]
    ];
    const nietIngelezen = async (o, w) => {
      assert(!boodTexts(o.state.db).includes('X r4m') && !(await appToont(o.page, 'X r4m')), w + ': X ingelezen');
      assert(!String(await lsRaw(o.page, NIEUW)).includes('X r4m'), w + ': X in de nieuwe cache');
      assert((await lsRaw(o.page, OUD)) === oud, w + ': oude cache gewijzigd of verwijderd');
    };
    out['R4-B2: markering aanwezig maar onbekend/kapot/verkeerde vorm — nooit importeren, niets aanraken, gemeld over twee keer herladen'] = async ctx => {
      for (const [naam, mark] of varianten) {
        const o = await open(ctx, { data: fx(), localStorage: { [OUD]: oud, [MARK]: mark } });
        for (let i = 0; i < 3; i++) {
          if (i) await o.page.reload();
          const w = naam + (i ? ', herladen ' + i : ', eerste start');
          assert(await vraagLegacy(o.page, 4000) && /verwerkingsmarkering/.test(await o.page.textContent('#confirmTitle')), w + ': geen (juiste) melding');
          await o.page.click('#confirmCancelBtn');
          await addBood(o.page, 'Ander r4 ' + i); await wait(1500);
          await nietIngelezen(o, w);
          assert((await lsRaw(o.page, MARK)) === mark, w + ': markering gewijzigd');
          const exp = JSON.parse(await o.page.evaluate(() => window.huisplanOpslag.herstelgegevens()));
          assert(exp.items[OUD] === oud && exp.items[MARK] === mark, w + ': herstelgegevens zonder oude cache of markering');
        }
        await o.ctx.close();
      }
    };
    out['R4-B2: markering tijdelijk niet te lezen — niet importeren, niets aanraken; daarna alleen bij aantoonbare afwezigheid'] = async ctx => {
      // Markering afwezig, maar de eerste sessie kan hem niet lezen: dan is "afwezig" niet bewezen.
      const o = await open(ctx, { data: fx(), localStorage: { [OUD]: oud }, opslagFout: { lezen: '^huisplanOudeCacheVerwerkt_' } });
      assert(await vraagLegacy(o.page, 4000), 'Leesfout markering: geen melding');
      await o.page.click('#confirmCancelBtn'); await wait(1500);
      await nietIngelezen(o, 'leesfout markering');
      assert((await lsRaw(o.page, MARK)) === null, 'Leesfout markering: toch een markering geschreven');
      // Een geldige markering 'klaar' die even niet te lezen is: ook niet importeren.
      await o.ctx.close();
      const o2 = await open(ctx, { data: fx(), localStorage: { [OUD]: oud, [MARK]: JSON.stringify({ h: hash, s: 'klaar' }) }, opslagFout: { lezen: '^huisplanOudeCacheVerwerkt_' } });
      await wait(2000);
      if (await o2.page.isVisible('#confirmOverlay.open')) await o2.page.click('#confirmCancelBtn');
      await nietIngelezen(o2, 'leesfout bij "klaar"');
      await zetOpslagFout(o2.page, {});
      for (let i = 0; i < 2; i++) {
        await o2.page.reload(); await wait(2000);
        if (await o2.page.isVisible('#confirmOverlay.open')) await o2.page.click('#confirmCancelBtn');
        await nietIngelezen(o2, '"klaar", herladen ' + (i + 1));
      }
      await o2.ctx.close();
    };
    return out;
  })(),

  // ── Derde Codex-review #16 ────────────────────────────────────────────────────────────────────
  // Cache (onbevestigd) even onleesbaar bij opstarten; intussen verandert de server; daarna weer leesbaar.
  // Opnemen alleen als de E2-controle (losslessMerge) het verliesvrij vindt; anders blokkeren.
  ...(() => {
    const out = {};
    const H = (t, d) => ({ text: t, norm: t.toLowerCase(), date: d });
    const gevallen = [
      // [naam, cache-wijziging, server-wijziging, verliesvrij?]
      ['onafhankelijke toevoegingen (lijst met id)', d => d.boodschappen.push({ id: 'x-r3', text: 'X r3', done: false }), d => d.boodschappen.push({ id: 'y-r3', text: 'Y r3', done: false }), true],
      ['geschiedenis zonder id aan beide kanten', d => d.boodschappenHistory.push(H('X r3', '2026-10-01')), d => d.boodschappenHistory.push(H('Y r3', '2026-10-01')), false],
      ['zelfde item verschillend gewijzigd', d => { d.boodschappen.find(b => b.id === 'b-melk').text = 'X r3'; }, d => { d.boodschappen.find(b => b.id === 'b-melk').text = 'Y r3'; }, false]
    ];
    gevallen.forEach(([naam, lokaal, server, verliesvrij]) => {
      out['R3-B1: weer leesbare cache, ' + naam + ' — ' + (verliesvrij ? 'beide behouden' : 'geblokkeerd, niets verloren, nooit "opgeslagen"')] = async ctx => {
        const basis = fx(), cdata = JSON.parse(JSON.stringify(basis)), sdata = JSON.parse(JSON.stringify(basis));
        lokaal(cdata); server(sdata);
        const cache = JSON.stringify({ format: 2, gen: 1, id: cacheId(DB_URL, KEY, 1), app: '1.4.1', data: cdata, base: canon(basis), t: 1, localGen: 1, confirmedGen: 0 });
        const o = await open(ctx, { data: sdata, localStorage: { [NIEUW]: cache }, opslagFout: { lezen: '^huisplanCache_' } });
        await wait(1200);
        await zetOpslagFout(o.page, {});
        await volgStatus(o.page);
        await addBood(o.page, 'Z r3');
        await wait(2500);
        const st = await statussen(o.page);
        const heeftX = async () => { const raw = await lsRaw(o.page, NIEUW); return String(raw).includes('X r3') || JSON.stringify(o.state.db).includes('X r3') || (await apartKopieen(o.page)).some(a => a.includes('X r3')); };
        if (verliesvrij) {
          await until(async () => ['X r3', 'Y r3', 'Z r3'].every(t => boodTexts(o.state.db).includes(t)) && OPGESLAGEN.test(await syncText(o.page)), 6000, naam + ': X, Y en Z op de server');
        } else {
          if (await o.page.isVisible('#confirmOverlay.open')) {
            assert(/niet zonder verlies/.test(await o.page.textContent('#confirmTitle')), naam + ': melding: ' + await o.page.textContent('#confirmTitle'));
            await o.page.click('#confirmCancelBtn');
          }
          assert((await lsRaw(o.page, NIEUW)) === cache || (await apartKopieen(o.page)).includes(cache), naam + ': cache met X overschreven zonder bewijs');
          assert(!st.slice(1).some(t => OPGESLAGEN.test(t)), naam + ': "opgeslagen" terwijl X alleen lokaal/apart staat: ' + st.join(' | '));
          assert(JSON.stringify(o.state.db).includes('Y r3') && !JSON.stringify(o.state.db).includes('X r3'), naam + ': automatisch een winnaar gekozen');
          assert((await apartKopieen(o.page)).includes(cache), naam + ': herstelgegevens niet apart bewaard');
        }
        for (let i = 0; i < 2; i++) {
          await o.page.reload(); await wait(2500);
          if (await o.page.isVisible('#confirmOverlay.open')) await o.page.click('#confirmCancelBtn');
          assert(await heeftX(), naam + ', herladen ' + (i + 1) + ': X verloren');
          assert(JSON.stringify(o.state.db).includes('Y r3'), naam + ', herladen ' + (i + 1) + ': Y verloren');
          if (!verliesvrij) assert(!OPGESLAGEN.test(await syncText(o.page)), naam + ', herladen ' + (i + 1) + ': "opgeslagen" terwijl X niet is opgenomen');
        }
        await o.ctx.close();
      };
    });
    return out;
  })(),

  async 'R3-B2: onderbreking tussen herstel en toepassen — nieuwe wijziging van de gebruiker blijft (geheugen, cache, journaal, server)'(ctx) {
    const basis = fx(), cdata = metItem(basis, 'x-r3b', 'X r3b');
    const cache = JSON.stringify({ format: 2, gen: 1, id: cacheId(DB_URL, KEY, 1), app: '1.4.1', data: cdata, base: canon(basis), t: 1, localGen: 1, confirmedGen: 0 });
    const o = await open(ctx, { data: basis, localStorage: { [NIEUW]: cache }, opslagFout: { lezen: '^huisplanCache_' } });
    await wait(1200);
    await zetOpslagFout(o.page, {});
    await o.page.click('[data-view="boodschappenView"]');
    // In één synchrone stap: de eerste toevoeging zet het herstel in gang; de tweede komt vóórdat een
    // eventuele uitgestelde toepassing (setTimeout) kan draaien.
    await o.page.evaluate(() => {
      const voeg = t => { const i = document.getElementById('boodschapInput'); i.value = t; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); };
      voeg('Y1 r3b'); voeg('Y2 r3b');
    });
    await until(async () => ['X r3b', 'Y1 r3b', 'Y2 r3b'].every(t => boodTexts(o.state.db).includes(t)), 8000, 'X, Y1 en Y2 op de server');
    await wait(1500);
    for (const t of ['X r3b', 'Y1 r3b', 'Y2 r3b']) {
      assert(await appToont(o.page, t), 'Geheugen: ' + t + ' verloren');
      assert(String(await lsRaw(o.page, NIEUW)).includes(t), 'Cache: ' + t + ' verloren');
    }
    const journaal = await o.page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('plannerJournal_')).map(k => localStorage.getItem(k)));
    assert(journaal.every(j => ['Y2 r3b'].every(t => j.includes(t))), 'Journaal bevat een verouderde stand zonder Y2');
    await o.page.reload(); await wait(2500);
    for (const t of ['X r3b', 'Y1 r3b', 'Y2 r3b']) assert(boodTexts(o.state.db).includes(t) && await appToont(o.page, t), 'Na herladen: ' + t + ' verloren');
    await o.ctx.close();
  },

  async 'R3: overname van een oude cache gereserveerd maar niet afgerond — blijft gemeld over meerdere herladingen, nooit opnieuw ingelezen'(ctx) {
    const oud = JSON.stringify({ data: metItem(fx(), 'x-r3l', 'X r3l'), base: canon(fx()), t: 1, db: DB_URL });
    const hash = crypto.createHash('sha256').update(oud).digest('hex').slice(0, 32);
    // Eerste sessie: de markering lukt, de nieuwe cache (de eigenlijke overname) niet.
    const o = await open(ctx, { data: fx(), localStorage: { [OUD]: oud }, opslagFout: { schrijven: '^huisplanCache_' } });
    await wait(2500);
    if (await o.page.isVisible('#confirmOverlay.open')) await o.page.click('#confirmCancelBtn');
    assert(JSON.parse(await lsRaw(o.page, MARK)).s === 'gereserveerd' && JSON.parse(await lsRaw(o.page, MARK)).h === hash, 'Markering niet "gereserveerd": ' + await lsRaw(o.page, MARK));
    assert(!boodTexts(o.state.db).includes('X r3l'), 'Toch ingelezen');
    // Een ander toestel verwijdert intussen iets; opslag werkt weer; meerdere herladingen.
    await zetOpslagFout(o.page, {});
    for (let i = 0; i < 3; i++) {
      await o.page.reload();
      assert(await vraagLegacy(o.page, 4000) && /niet afgerond/.test(await o.page.textContent('#confirmTitle')), 'Herladen ' + (i + 1) + ': geen melding van de onafgeronde overname');
      await o.page.click('#confirmCancelBtn');
      await addBood(o.page, 'Ander ' + i); await wait(1500);
      assert(!boodTexts(o.state.db).includes('X r3l') && !(await appToont(o.page, 'X r3l')), 'Herladen ' + (i + 1) + ': opnieuw ingelezen');
    }
    assert((await leesCache(o.page)) && !String(await lsRaw(o.page, NIEUW)).includes('X r3l'), 'Testopzet: nieuwe cache zonder X bestaat niet');
    assert((await lsRaw(o.page, OUD)) === oud, 'Oude cache gewijzigd of verwijderd');
    await o.ctx.close();
  },

  // ── Tweede Codex-review #16 ───────────────────────────────────────────────────────────────────
  async 'R2-B1: cache bij opstarten even niet te lezen, daarna wel — onbevestigde X wordt nooit overschreven en overleeft herladen'(ctx) {
    for (const apartLukt of [true, false]) {
      const cache = JSON.stringify({ format: 2, gen: 1, id: cacheId(DB_URL, KEY, 1), app: '1.4.1', data: metItem(fx(), 'x-r2', 'X r2'), base: canon(fx()), t: 1, localGen: 1, confirmedGen: 0 });
      const o = await open(ctx, { data: fx(), localStorage: { [NIEUW]: cache }, opslagFout: Object.assign({ lezen: '^huisplanCache_' }, apartLukt ? {} : { schrijven: '^huisplanCacheApart_' }) });
      await wait(1200);
      assert(!(await appToont(o.page, 'X r2')), 'Testopzet: X toch hervat terwijl de cache niet te lezen was');
      // De leesfout gaat over vóór de eerste vervangende schrijfactie.
      await zetOpslagFout(o.page, apartLukt ? {} : { schrijven: '^huisplanCacheApart_' });
      if (await o.page.isVisible('#confirmOverlay.open')) await o.page.click('#confirmCancelBtn');
      await addBood(o.page, 'Y r2');
      await wait(2500);
      if (await o.page.isVisible('#confirmOverlay.open')) await o.page.click('#confirmCancelBtn');
      const w = apartLukt ? 'apart bewaren lukt' : 'apart bewaren lukt niet';
      if (apartLukt) {
        assert((await apartKopieen(o.page)).includes(cache), w + ': geen duurzaam bewijs vóór het overschrijven');
        await until(async () => boodTexts(o.state.db).includes('X r2'), 6000, w + ': X opgenomen en opgeslagen');
      } else {
        assert((await lsRaw(o.page, NIEUW)) === cache, w + ': cache met X overschreven');
      }
      // Over twee keer herladen heen: X is nooit verloren.
      for (let i = 0; i < 2; i++) {
        await zetOpslagFout(o.page, {});
        await o.page.reload(); await wait(2500);
        if (await o.page.isVisible('#confirmOverlay.open')) await o.page.click('#confirmCancelBtn');
        const c = await lsRaw(o.page, NIEUW);
        const ergens = boodTexts(o.state.db).includes('X r2') || String(c).includes('X r2') || (await apartKopieen(o.page)).some(a => a.includes('X r2'));
        assert(ergens, w + ', herladen ' + (i + 1) + ': X verloren');
      }
      if (apartLukt) assert(boodTexts(o.state.db).filter(t => t === 'X r2').length === 1 && boodTexts(o.state.db).includes('Y r2'), w + ': X of Y niet (precies één keer) op de server');
      await o.ctx.close();
    }
  },

  async 'R2-B2: eigen oude cache — markering mislukt, of nieuwe cache later kapot/weg + server verwijdert X + herladen: X nooit opnieuw'(ctx) {
    const gevallen = [['markering mislukt', true, 'kapot'], ['markering gelukt, cache kapot', false, 'kapot'], ['markering gelukt, cache weg', false, 'weg']];
    for (const [naam, markeringFaalt, metCache] of gevallen) {
      const oud = JSON.stringify({ data: metItem(fx(), 'x-oud2', 'X oud2'), base: canon(fx()), t: 1, db: DB_URL });
      const o = await open(ctx, { data: fx(), localStorage: { [OUD]: oud }, opslagFout: markeringFaalt ? { schrijven: '^huisplanOudeCacheVerwerkt_' } : null });
      await wait(3000);
      if (await o.page.isVisible('#confirmOverlay.open')) await o.page.click('#confirmCancelBtn');
      if (markeringFaalt) assert(!boodTexts(o.state.db).includes('X oud2'), naam + ': overgenomen zonder duurzame markering');
      else await until(async () => boodTexts(o.state.db).includes('X oud2'), 6000, naam + ': X overgenomen');
      // Ander toestel verwijdert X; de nieuwe cache raakt beschadigd of weg; herladen (dezelfde oude cache staat er nog).
      serverWrite(o.state, db => { db.boodschappen = db.boodschappen.filter(b => b.text !== 'X oud2'); });
      await o.page.evaluate(([k, wat]) => { if (wat === 'weg') localStorage.removeItem(k); else localStorage.setItem(k, '{kapot'); }, [NIEUW, metCache]);
      for (let i = 0; i < 2; i++) {
        await o.page.reload(); await wait(2500);
        if (await o.page.isVisible('#confirmOverlay.open')) await o.page.click('#confirmCancelBtn');
        await refresh(o.page); await wait(1500);
        assert(!boodTexts(o.state.db).includes('X oud2') && !(await appToont(o.page, 'X oud2')), naam + ', herladen ' + (i + 1) + ': X opnieuw ingelezen of geüpload');
      }
      assert((await lsRaw(o.page, OUD)) === oud, naam + ': oude cache verwijderd of gewijzigd');
      await o.ctx.close();
    }
  },

  async 'R2-B3: koppeling — record faalt, db=B lukt, planner faalt, terugzetten en wissen falen, herladen zonder link: nooit B + planner van A'(ctx) {
    // Variant 1: de exacte Codex-volgorde op deze versie (die schrijft de losse sleutels niet meer).
    // Variant 2: dezelfde gemengde eindtoestand, achtergelaten door een oudere versie, met een
    // geldig-ogend maar ontbrekend koppelrecord.
    for (const variant of ['schrijfvolgorde', 'gemengd achtergelaten']) {
      // Koppeling A staat alleen als los paar (zoals van een oudere versie), met als bewijs een geldige
      // cache die precies bij database A + planner A hoort.
      const cacheA = JSON.stringify({ format: 2, gen: 1, id: cacheId(DB_URL, KEY, 1), app: '1.4.1', data: fx(), base: canon(fx()), t: 1, db: DB_URL, localGen: 0, confirmedGen: 0 });
      // Exact zoals Codex: een legacy-koppeling A zonder koppelrecord; het koppelrecord is vanaf de
      // start niet te schrijven (dus ook geen oud record van A om op terug te vallen).
      const start = variant === 'schrijfvolgorde' ? `;sessionStorage.getItem('__fout2')||sessionStorage.setItem('__fout2', ${JSON.stringify(JSON.stringify([{ op: 'set', key: '^huisplanKoppeling$', n: -1 }]))});` : '';
      const o = await open(ctx, { data: fx(), initScript: FOUT2_SRC + start, localStorage: { huisplanKoppeling: null, [NIEUW]: cacheA } });
      await wait(1500);
      assert(await o.page.isHidden('#setupOverlay') || !(await o.page.isVisible('#setupOverlay')), 'Testopzet: niet verbonden met A');
      const B = 'https://andere-db.test', BKEY = 'bplanner00000000000x';
      if (variant === 'schrijfvolgorde') {
        await zetFout2(o.page, [
          { op: 'set', key: '^huisplanKoppeling$', n: -1 },
          { op: 'set', key: '^plannerDbUrl$', skip: 1, n: -1 },  // B lukt, terugzetten naar A mislukt
          { op: 'set', key: '^plannerKey$', n: -1 },
          { op: 'remove', key: '^(plannerDbUrl|plannerKey|huisplanKoppeling)$', n: -1 }
        ]);
        await o.page.goto(ctx.base + '/test/index.html?db=' + encodeURIComponent(B) + '&p=' + BKEY);
        await wait(1500);
      } else {
        await o.page.evaluate(b => { localStorage.setItem('plannerDbUrl', b); localStorage.removeItem('huisplanKoppeling'); }, B);
      }
      await zetFout2(o.page, []);
      await o.page.goto(ctx.base + '/test/index.html'); await wait(1500);
      const u = new URL(o.page.url());
      const gemengd = u.searchParams.get('db') === B && u.searchParams.get('p') === KEY;
      assert(!gemengd, variant + ': gemengde koppeling gebruikt: ' + o.page.url());
      const geldig = (!u.searchParams.get('db') && await o.page.isVisible('#setupOverlay')) || (u.searchParams.get('db') === DB_URL && u.searchParams.get('p') === KEY) || (u.searchParams.get('db') === B && u.searchParams.get('p') === BKEY);
      assert(geldig, variant + ': onverwachte koppeling: ' + o.page.url());
      await o.ctx.close();
    }
  },

  async 'R2: allereerste opslagactie faalt (vóór alle initialisatie) — geen crash, app en waarschuwing bij sluiten werken'(ctx) {
    for (const [naam, regels] of [['eerste lezing faalt één keer', [{ op: 'get', key: '.*', n: 1 }]], ['alle lezingen falen', [{ op: 'get', key: '.*', n: -1 }]]]) {
      const o = await open(ctx, { data: fx(), initScript: FOUT2_SRC + `;sessionStorage.getItem('__fout2')||sessionStorage.setItem('__fout2', ${JSON.stringify(JSON.stringify(regels))});` });
      await wait(1500);
      const fouten = o.state.errors.filter(e => /pageerror/.test(e));
      assert(!fouten.length, naam + ': app crasht: ' + fouten.join(' | '));
      assert(await o.page.evaluate(() => !!window.huisplanOpslag && typeof window.huisplanOpslag.risico === 'function'), naam + ': opslagdiagnose niet bereikt');
      assert(await o.page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return true; }), naam + ': beforeunload faalt');
      const diag = await o.page.evaluate(() => window.huisplanOpslag.diagnose());
      assert(diag.some(d => d.soort === 'lezen'), naam + ': leesfout niet in de diagnose');
      // Er is een zichtbare toestand: werkende app, herstel- of installatiescherm.
      const zichtbaar = (await o.page.textContent('#syncText')).trim().length > 0 || await o.page.isVisible('#journalGateOverlay') || await o.page.isVisible('#setupOverlay');
      assert(zichtbaar, naam + ': geen status, herstel- of installatiescherm');
      await o.ctx.close();
    }
  },

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
    assert((await lsRaw(o.page, MARK)) === JSON.stringify({ h: crypto.createHash('sha256').update(oud).digest('hex').slice(0, 32), s: 'klaar' }), 'Geen duurzame markering "klaar" van de verwerkte oude cache: ' + await lsRaw(o.page, MARK));
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

  async 'B2: eigen oude cache verwerkt, server verwijdert het item, herladen — niets herrijst'(ctx) {
    // Mislukte markering: sinds de tweede review wordt dan helemaal niet overgenomen (zie R2-B2).
    for (const markeringFaalt of [false]) {
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
