// 1.4.2, E2: één schrijfcoördinatiemodel (docs/ontwerp-1.4.2.md, 2.2; tests T1–T5 uit sectie 8).
// Alleen de testversie (test/index.html) heeft E2; deze tests draaien daarom altijd tegen 'test'.
// Alles tegen de nagebootste database; nooit echte data.
'use strict';
const fs = require('fs');
const path = require('path');
const { openApp, readFixture, serverWrite, sharedDb, assert, DB_URL } = require('./lib');

const APP = path.join(__dirname, '..', 'test', 'index.html');
const wait = ms => new Promise(r => setTimeout(r, ms));
const boodTexts = db => ((db && db.boodschappen) || []).map(b => b.text).sort();
const syncText = page => page.textContent('#syncText');
const readCacheOf = page => page.evaluate(() => {
  const k = Object.keys(localStorage).find(x => x.startsWith('plannerCache_'));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
});
async function addBood(page, text) {
  await page.click('[data-view="boodschappenView"]');
  await page.fill('#boodschapInput', text);
  await page.press('#boodschapInput', 'Enter');
}
async function setHidden(page, hidden) {
  await page.evaluate(h => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}
const refresh = page => page.evaluate(() => document.getElementById('refreshBtn').click());
async function until(cond, ms, label) {
  const t0 = Date.now();
  while (!(await cond())) { if (Date.now() - t0 > ms) throw new Error('Time-out: ' + label); await wait(100); }
}
// Bewaakt de nagebootste database: elke PUT moet if-match hebben, en er mag er hooguit één tegelijk
// onderweg zijn (regels 1 en 2).
function bewaker(extra) {
  const b = { puts: 0, zonderIfMatch: 0, tegelijk: 0, maxTegelijk: 0 };
  b.onRequest = async info => {
    const act = extra ? extra(info, b) : undefined;
    if (info.method !== 'PUT') return act;
    b.puts++; if (!info.ifMatch) b.zonderIfMatch++;
    // Onderweg vanaf binnenkomst tot de server antwoordt (een vertraging wordt hier afgewacht).
    b.tegelijk++; b.maxTegelijk = Math.max(b.maxTegelijk, b.tegelijk);
    if (act && act.delay) await wait(act.delay);
    b.tegelijk--;
    return act && act.delay ? undefined : act;
  };
  return b;
}
const open = (ctx, o) => openApp(ctx.browser, ctx.base, Object.assign({ target: 'test' }, o));
// Wacht tot de eerste keer laden (die één keer terugschrijft, bestaand gedrag) is afgerond.
async function rustig(o) {
  await until(async () => /^(Opgeslagen|Bijgewerkt)/.test(await syncText(o.page)), 5000, 'app in rust na laden');
  await wait(300);
}

module.exports = {
  async 'E2 statisch: één voorwaardelijke PUT in de opslaglaag, geen terugval zonder if-match'() {
    const src = fs.readFileSync(APP, 'utf8');
    const start = src.indexOf('function createFirebaseStore(');
    const end = src.indexOf('var store=createFirebaseStore(');
    const store = src.slice(start, end);
    assert(!/noConditional/.test(store), 'De terugval zonder if-match (noConditional) bestaat nog');
    const puts = store.match(/method:'PUT'/g) || [];
    assert(puts.length === 1, 'Verwacht precies één plek met een PUT (putIfMatch), gevonden: ' + puts.length);
    const fn = store.slice(store.indexOf('function putIfMatch('), store.indexOf('function mergeRemote('));
    assert(/method:'PUT'/.test(fn) && /'if-match':etag/.test(fn) && /if\(!etag\)return/.test(fn), 'putIfMatch stuurt niet altijd if-match of schrijft zonder ETag');
    assert(!/sendBeacon\(/.test(src), 'sendBeacon maakt in Firebase een nieuw kind aan (POST) en hoort niet in de app');
  },

  async 'T1: twee toestellen tegelijk — beide wijzigingen bewaard, elke schrijfactie voorwaardelijk'(ctx) {
    const db = sharedDb(readFixture('huishouden.json'));
    const bw = bewaker();
    const A = await open(ctx, { state: db, onRequest: bw.onRequest });
    const B = await open(ctx, { state: db, onRequest: bw.onRequest, localStorage: { plannerMyName: 'Sanne', plannerPartnerName: 'Bas' } });
    await Promise.all([addBood(A.page, 'Ananas'), addBood(B.page, 'Peren')]);
    await wait(3000);
    await refresh(A.page); await refresh(B.page); await wait(1500);
    const all = boodTexts(db.db);
    ['Ananas', 'Peren'].forEach(t => assert(all.filter(x => x === t).length === 1, t + ' niet precies één keer opgeslagen: ' + all.join(', ')));
    assert(bw.zonderIfMatch === 0, bw.zonderIfMatch + ' PUT(s) zonder if-match');
    assert((db.conflicts || 0) > 0, 'Geen 412 opgetreden bij gelijktijdig opslaan');
    assert(!db.errors.length, 'Fouten: ' + db.errors.join(' | '));
    await A.ctx.close(); await B.ctx.close();
  },

  async 'T2a: verbinding weg vóór de server — alleen voorwaardelijke herpoging, één keer opgeslagen'(ctx) {
    let eerste = false;
    const bw = bewaker(info => { if (info.method === 'PUT' && eerste) { eerste = false; return 'abort'; } });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); eerste = true;
    const p0 = o.state.puts;
    await addBood(o.page, 'Volkoren T2a');
    await wait(900);
    const tussendoor = await syncText(o.page);
    assert(!/^Opgeslagen/.test(tussendoor), 'Toonde "opgeslagen" terwijl de opslag mislukte: ' + tussendoor);
    await until(async () => /^Opgeslagen/.test(await syncText(o.page)), 6000, 'herpoging');
    assert(o.state.puts - p0 === 1, 'Verwacht precies één geslaagde opslag, kreeg ' + (o.state.puts - p0));
    assert(boodTexts(o.state.db).filter(t => t === 'Volkoren T2a').length === 1, 'Volkoren T2a niet precies één keer opgeslagen');
    assert(bw.zonderIfMatch === 0, 'PUT zonder if-match');
    await o.ctx.close();
  },

  async 'T2b: verwerkt maar antwoord verloren — geen dubbele wijziging, wel bevestigd'(ctx) {
    let eerste = false;
    const bw = bewaker(info => { if (info.method === 'PUT' && eerste) { eerste = false; return 'lost'; } });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); eerste = true;
    const p0 = o.state.puts;
    await addBood(o.page, 'Kaas');
    await until(async () => /^Opgeslagen/.test(await syncText(o.page)), 6000, 'bevestiging na verloren antwoord');
    await wait(1500);
    assert(o.state.puts - p0 === 1, 'De verwerkte schrijfactie is nog eens verstuurd (' + (o.state.puts - p0) + ' opslagen)');
    assert(boodTexts(o.state.db).filter(t => t === 'Kaas').length === 1, 'Kaas niet precies één keer opgeslagen');
    const c = await readCacheOf(o.page);
    assert(c.base.indexOf('Kaas') > -1, 'Cache-basis niet bijgewerkt na de bevestiging');
    assert(bw.zonderIfMatch === 0, 'PUT zonder if-match');
    await o.ctx.close();
  },

  async 'T2c: offline → online — lokaal bewaard, geen onterechte "opgeslagen", daarna voorwaardelijk opgeslagen'(ctx) {
    const bw = bewaker();
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    const blokkeer = route => route.abort('internetdisconnected');
    await o.ctx.route(DB_URL + '/**', blokkeer); await o.ctx.setOffline(true);
    await addBood(o.page, 'Thee'); await wait(2500);
    const tekst = await syncText(o.page);
    assert(/Offline/.test(tekst), 'Geen offline-melding: ' + tekst);
    const c = await readCacheOf(o.page);
    assert(boodTexts(c.data).includes('Thee'), 'Offline wijziging niet in de lokale cache');
    serverWrite(o.state, db => db.boodschappen.push({ id: 'remote-t2c', text: 'Honing', addedBy: 'Sanne', done: false }));
    await o.ctx.unroute(DB_URL + '/**', blokkeer); await o.ctx.setOffline(false);
    await until(async () => boodTexts(o.state.db).includes('Thee'), 6000, 'opslaan na weer online');
    ['Thee', 'Honing'].forEach(t => assert(boodTexts(o.state.db).filter(x => x === t).length === 1, t + ' niet precies één keer op de server'));
    assert(bw.zonderIfMatch === 0, 'PUT zonder if-match');
    await o.ctx.close();
  },

  async 'T3: herhaald 412 — samengevoegd, daarna blijvende status, later herstel zonder verlies'(ctx) {
    let storen = false, n = 0;
    const bw = bewaker((info, b) => {
      // Elk ander toestel schrijft net vóór onze PUT: die krijgt dus steeds een 412.
      if (info.method === 'PUT' && storen) { n++; serverWrite(info.state, db => db.boodschappen.push({ id: 'ander-' + n, text: 'Ander ' + n, addedBy: 'Sanne', done: false })); }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); storen = true;
    await addBood(o.page, 'Pruimen T3');
    await until(async () => /mislukt/.test(await syncText(o.page)), 8000, 'blijvende status na herhaald 412');
    const conflicten = o.state.conflicts || 0;
    assert(conflicten >= 5 && conflicten <= 6, 'Verwacht een begrensd aantal pogingen (5), kreeg ' + conflicten + ' conflicten');
    await wait(2500);
    assert((o.state.conflicts || 0) === conflicten, 'Bleef na de blijvende status toch opnieuw proberen');
    const c = await readCacheOf(o.page);
    assert(boodTexts(c.data).includes('Pruimen T3'), 'Lokale wijziging verloren na herhaald conflict');
    storen = false;
    await refresh(o.page);
    await until(async () => boodTexts(o.state.db).includes('Pruimen T3'), 6000, 'herstel na verversen');
    const op = boodTexts(o.state.db);
    for (let i = 1; i <= n; i++) assert(op.includes('Ander ' + i), 'Wijziging van het andere toestel verloren: Ander ' + i);
    assert(op.filter(t => t === 'Pruimen T3').length === 1, 'Pruimen T3 niet precies één keer');
    assert(bw.zonderIfMatch === 0, 'PUT zonder if-match');
    await o.ctx.close();
  },

  async 'T4a: vertraagde leesactie na een nieuwere opslag zet niets terug'(ctx) {
    let vertraag = false;
    const bw = bewaker(info => (info.method === 'GET' && vertraag ? { delay: 2000 } : undefined));
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    vertraag = true;
    await refresh(o.page); // GET met de oude stand, komt pas over 2 s terug
    await wait(100);
    vertraag = false;
    await addBood(o.page, 'Peper');
    await until(async () => boodTexts(o.state.db).includes('Peper'), 4000, 'opslaan Peper');
    await wait(2500); // de vertraagde GET is nu binnen
    const c = await readCacheOf(o.page);
    assert(boodTexts(c.data).includes('Peper'), 'Vertraagde leesactie zette de lokale data terug');
    assert(c.base.indexOf('Peper') > -1, 'Vertraagde leesactie zette de basis terug');
    // Volgende wijziging gaat zonder 412 (de ETag is niet teruggezet).
    const k0 = o.state.conflicts || 0;
    await addBood(o.page, 'Zout');
    await until(async () => boodTexts(o.state.db).includes('Zout'), 4000, 'opslaan Zout');
    assert((o.state.conflicts || 0) === k0, 'ETag was teruggezet: onnodige 412');
    assert(boodTexts(o.state.db).includes('Peper'), 'Peper verdwenen');
    await o.ctx.close();
  },

  async 'T4b: trage flush — geen tweede schrijfactie tegelijk, nieuwere wijziging blijft staan'(ctx) {
    let traag = false;
    const bw = bewaker(info => (info.method === 'PUT' && traag ? { delay: 1500 } : undefined));
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await addBood(o.page, 'Rijst');
    traag = true;
    await setHidden(o.page, true); // flush, antwoord komt pas over 1,5 s
    await wait(100);
    traag = false;
    await setHidden(o.page, false);
    await addBood(o.page, 'Pasta');
    await until(async () => boodTexts(o.state.db).includes('Pasta'), 6000, 'opslaan Pasta na de trage flush');
    await wait(800);
    assert(bw.maxTegelijk === 1, 'Er waren ' + bw.maxTegelijk + ' schrijfacties tegelijk onderweg');
    ['Rijst', 'Pasta'].forEach(t => assert(boodTexts(o.state.db).filter(x => x === t).length === 1, t + ' niet precies één keer'));
    const c = await readCacheOf(o.page);
    assert(boodTexts(c.data).includes('Pasta') && c.base.indexOf('Pasta') > -1, 'Cache of basis teruggezet door het late flush-antwoord');
    assert(/^Opgeslagen/.test(await syncText(o.page)), 'Status: ' + await syncText(o.page));
    await o.ctx.close();
  },

  async 'T5: geen bruikbare ETag — niet schrijven, lokaal bewaren, melden'(ctx) {
    const bw = bewaker();
    const o = await open(ctx, { data: readFixture('huishouden.json'), exposeETag: false, onRequest: bw.onRequest });
    const p0 = bw.puts;
    await addBood(o.page, 'Mosterd'); await wait(1500);
    await setHidden(o.page, true); await wait(500); await setHidden(o.page, false); // ook flush schrijft niet
    await wait(500);
    assert(bw.puts === p0, 'Er werd geschreven zonder bruikbare ETag (' + (bw.puts - p0) + 'x)');
    const t = await syncText(o.page);
    assert(/niet veilig/.test(t), 'Geen melding dat opslaan nu niet veilig kan: ' + t);
    const c = await readCacheOf(o.page);
    assert(boodTexts(c.data).includes('Mosterd'), 'Wijziging niet lokaal bewaard');
    assert(!boodTexts(o.state.db).includes('Mosterd'), 'Wijziging toch op de server');
    await o.ctx.close();
  }
};
