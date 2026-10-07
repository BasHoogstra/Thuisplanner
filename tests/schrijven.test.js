// 1.4.2, E2: één schrijfcoördinatiemodel (docs/ontwerp-1.4.2.md, 2.2; tests T1–T5 uit sectie 8).
// Alleen de testversie (test/index.html) heeft E2; deze tests draaien daarom altijd tegen 'test'.
// Alles tegen de nagebootste database; nooit echte data.
'use strict';
const fs = require('fs');
const path = require('path');
const { openApp, readFixture, serverWrite, sharedDb, assert, clone, DB_URL } = require('./lib');

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
  // Elke instructie (vertraging, momentopname, …) gaat ongewijzigd door naar de nagebootste database;
  // die meldt via onDone wanneer een PUT is afgehandeld. Zo telt "onderweg" exact.
  b.onRequest = async info => {
    const act = extra ? extra(info, b) : undefined;
    if (info.method === 'PUT') { b.puts++; if (!info.ifMatch) b.zonderIfMatch++; b.tegelijk++; b.maxTegelijk = Math.max(b.maxTegelijk, b.tegelijk); }
    return act;
  };
  b.onDone = info => { if (info.method === 'PUT') b.tegelijk--; };
  b.onRequest.bewaker = b;
  return b;
}
const open = (ctx, o) => openApp(ctx.browser, ctx.base, Object.assign({ target: 'test' }, o, o && o.onRequest && o.onRequest.bewaker ? { onDone: o.onRequest.bewaker.onDone } : {}));
// Wacht tot de eerste keer laden (die één keer terugschrijft, bestaand gedrag) is afgerond.
// De vraag na een onzekere uitkomst (Codex-blocker 2) afwachten en beantwoorden.
const ONZEKER = /verbinding weg/;
async function vraagZichtbaar(page, ms) {
  try { await page.waitForSelector('#confirmOverlay.open', { timeout: ms || 6000 }); } catch (e) { return false; }
  return ONZEKER.test(await page.textContent('#confirmTitle'));
}
async function vraagBeantwoord(page, opnieuw) {
  assert(await vraagZichtbaar(page), 'Geen vraag na een onzekere uitkomst');
  await page.click(opnieuw ? '#confirmOkBtn' : '#confirmCancelBtn');
}
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

  async 'T2a: verbinding weg vóór de server — geen automatische herhaling bij een onzekere uitkomst; na de keuze één keer opgeslagen'(ctx) {
    let eerste = false;
    const bw = bewaker(info => { if (info.method === 'PUT' && eerste) { eerste = false; return 'abort'; } });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); eerste = true;
    const p0 = o.state.puts;
    await addBood(o.page, 'Volkoren T2a');
    await wait(900);
    const tussendoor = await syncText(o.page);
    assert(!/^Opgeslagen/.test(tussendoor), 'Toonde "opgeslagen" terwijl de opslag mislukte: ' + tussendoor);
    // De server staat nog op de oude stand. Zonder schrijfmarkering is "niet aangekomen" niet te
    // onderscheiden van "aangekomen en daarna door een ander teruggedraaid" (Codex-blocker 2): dus geen
    // automatische herhaling, maar één vraag. Met "opnieuw toepassen" wordt het precies één keer opgeslagen.
    await vraagBeantwoord(o.page, true);
    await until(async () => /^Opgeslagen/.test(await syncText(o.page)), 6000, 'opslaan na de keuze');
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
  },

  // ── Codex-review PR #15: regressietests ──────────────────────────────────────────────

  async 'Codex B1: opslag die ontstaat tijdens het tekenen van een binnenkomende stand wordt niet "bevestigd"'(ctx) {
    // Een ander toestel zet een open taak op gisteren. Bij het tekenen schuift renderVandaag() die door
    // naar vandaag en slaat op (nieuwe lokale generatie). Die mag load() niet als bevestigd markeren.
    const bw = bewaker();
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o);
    serverWrite(o.state, db => { (db.tasks['2026-10-01'] = db.tasks['2026-10-01'] || []).push({ id: 't-gisteren', text: 'Vergeten taak', done: false, category: 'overig', priority: 'normaal', assignedTo: null, author: 'Sanne', orderStatus: null }); });
    await refresh(o.page);
    await until(async () => ((o.state.db.tasks['2026-10-02'] || []).some(t => t.id === 't-gisteren')), 5000, 'doorgeschoven taak op de server');
    assert(!((o.state.db.tasks['2026-10-01'] || []).some(t => t.id === 't-gisteren')), 'Taak staat op de server nog op gisteren');
    await until(async () => /^(Opgeslagen|Bijgewerkt)/.test(await syncText(o.page)), 4000, 'rust');
    assert(bw.zonderIfMatch === 0, 'PUT zonder if-match');
    await o.ctx.close();
  },

  async 'Codex B2: antwoord kwijt + ander toestel verwijdert ons nieuwe item — niets automatisch terugzetten'(ctx) {
    let fase = 0;
    const bw = bewaker((info) => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
      // Vóór de herstellezing: het andere toestel had onze wijziging al ontvangen en verwijdert het item.
      if (info.method === 'GET' && fase === 2) { fase = 3; serverWrite(info.state, db => { db.boodschappen = db.boodschappen.filter(b => b.text !== 'Verwijderd elders'); }); }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    const p0 = o.state.puts;
    await addBood(o.page, 'Verwijderd elders');
    assert(await vraagZichtbaar(o.page), 'Geen vraag bij een onzekere uitkomst');
    await wait(1500);
    assert(o.state.puts - p0 === 1, 'Herstel schreef automatisch opnieuw (' + (o.state.puts - p0) + ' opslagen)');
    assert(!boodTexts(o.state.db).includes('Verwijderd elders'), 'Verwijdering van het andere toestel automatisch teruggedraaid');
    // Keuze "laat staan": de verwijdering van het andere toestel blijft.
    await o.page.click('#confirmCancelBtn');
    await until(async () => /^(Opgeslagen|Bijgewerkt)/.test(await syncText(o.page)), 5000, 'rust na de keuze');
    await wait(800);
    assert(!boodTexts(o.state.db).includes('Verwijderd elders') && !boodTexts((await readCacheOf(o.page)).data).includes('Verwijderd elders'), 'Item toch teruggekomen');
    await o.ctx.close();
  },

  async 'Codex B2: dezelfde situatie met keuze "opnieuw toepassen" zet het item (bewust) terug'(ctx) {
    let fase = 0;
    const bw = bewaker((info) => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
      if (info.method === 'GET' && fase === 2) { fase = 3; serverWrite(info.state, db => { db.boodschappen = db.boodschappen.filter(b => b.text !== 'Toch terug'); }); }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Toch terug');
    await vraagBeantwoord(o.page, true);
    await until(async () => boodTexts(o.state.db).includes('Toch terug'), 5000, 'opnieuw toegepast');
    assert(boodTexts(o.state.db).filter(t => t === 'Toch terug').length === 1, 'Niet precies één keer');
    assert(bw.zonderIfMatch === 0, 'PUT zonder if-match');
    await o.ctx.close();
  },

  async 'Codex B2: antwoord kwijt + ander toestel wijzigt ons item — wijziging van de ander niet stil teruggedraaid'(ctx) {
    let fase = 0;
    const bw = bewaker((info) => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
      if (info.method === 'GET' && fase === 2) { fase = 3; serverWrite(info.state, db => { db.boodschappen.forEach(b => { if (b.text === 'Afgevinkt elders') b.done = true; }); }); }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Afgevinkt elders');
    assert(await vraagZichtbaar(o.page), 'Geen vraag');
    await wait(1000);
    const item = o.state.db.boodschappen.find(b => b.text === 'Afgevinkt elders');
    assert(item && item.done === true, 'Afvinken door het andere toestel automatisch teruggedraaid');
    await o.page.click('#confirmCancelBtn');
    await wait(1500);
    const na = o.state.db.boodschappen.find(b => b.text === 'Afgevinkt elders');
    assert(na && na.done === true, 'Na "laat staan" toch teruggedraaid');
    await o.ctx.close();
  },

  async 'Codex B2: antwoord kwijt + ander toestel wijzigt iets anders — eenduidig, geen vraag, niets dubbel'(ctx) {
    let fase = 0;
    const bw = bewaker((info) => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
      if (info.method === 'GET' && fase === 2) { fase = 3; serverWrite(info.state, db => { db.boodschappen.push({ id: 'ander-x', text: 'Van de ander', addedBy: 'Sanne', done: false }); }); }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Eigen B2d');
    await until(async () => boodTexts(o.state.db).includes('Van de ander') && boodTexts(o.state.db).includes('Eigen B2d'), 6000, 'beide op de server');
    assert(!(await vraagZichtbaar(o.page, 1500)), 'Onnodige vraag terwijl de uitkomst eenduidig is');
    assert(boodTexts(o.state.db).filter(t => t === 'Eigen B2d').length === 1, 'Eigen item dubbel');
    await o.ctx.close();
  },

  async 'Codex B2: onzekere toestand overleeft herladen (geen stille samenvoeging na heropenen)'(ctx) {
    let fase = 0;
    const bw = bewaker((info) => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
      if (info.method === 'GET' && fase === 2) { fase = 3; serverWrite(info.state, db => { db.boodschappen = db.boodschappen.filter(b => b.text !== 'Herlaad B2'); }); }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    const p0 = o.state.puts;
    await addBood(o.page, 'Herlaad B2');
    assert(await vraagZichtbaar(o.page), 'Geen vraag');
    await o.page.reload(); await wait(1500);
    assert(await vraagZichtbaar(o.page), 'Vraag verdwenen na herladen');
    assert(o.state.puts - p0 === 1 && !boodTexts(o.state.db).includes('Herlaad B2'), 'Na herladen toch automatisch samengevoegd en geschreven');
    await o.ctx.close();
  },

  async 'Codex: echte verouderde leesactie (momentopname) zet niets terug'(ctx) {
    let traag = false;
    const bw = bewaker(info => (info.method === 'GET' && traag ? { delay: 2000, snapshot: true } : undefined));
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o);
    traag = true; await refresh(o.page); await wait(100); traag = false; // oude momentopname onderweg
    serverWrite(o.state, db => { db.boodschappen.push({ id: 'nieuw-s', text: 'Nieuw na snapshot', addedBy: 'Sanne', done: false }); });
    await refresh(o.page); await wait(800);
    await addBood(o.page, 'Lokaal na snapshot');
    await until(async () => boodTexts(o.state.db).includes('Lokaal na snapshot'), 5000, 'opslaan');
    await wait(2500); // de verouderde momentopname is nu binnen
    const c = await readCacheOf(o.page);
    ['Nieuw na snapshot', 'Lokaal na snapshot'].forEach(t => assert(boodTexts(c.data).includes(t) && boodTexts(o.state.db).includes(t), 'Verouderde momentopname zette ' + t + ' terug'));
    await o.ctx.close();
  },

  async 'Codex: bewaking — een verouderd antwoord heft een nieuwere blokkade niet op'(ctx) {
    let traag = false;
    const bw = bewaker(info => (info.method === 'GET' && traag ? { delay: 2000, snapshot: true } : undefined));
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o);
    traag = true; await refresh(o.page); await wait(100); traag = false; // momentopname zonder blokkade
    serverWrite(o.state, db => { db.meta = Object.assign({}, db.meta, { migratedTo: { url: 'https://example.org/nieuw' } }); });
    await refresh(o.page);
    await until(() => o.page.isVisible('#writeGuardOverlay'), 3000, 'blokkade zichtbaar');
    await wait(2500); // het verouderde antwoord (zonder blokkade) komt binnen
    assert(await o.page.isVisible('#writeGuardOverlay'), 'Verouderd antwoord hief de blokkade op');
    const p0 = o.state.puts;
    await o.page.evaluate(() => { document.getElementById('writeGuardOverlay').hidden = true; });
    await addBood(o.page, 'Na blokkade'); await wait(1500);
    assert(o.state.puts === p0, 'Toch opgeslagen terwijl de planner verhuisd is');
    await o.ctx.close();
  },

  async 'Codex: bewaking — een verouderd antwoord met blokkade blokkeert niet na opheffing'(ctx) {
    const fx = readFixture('huishouden.json');
    let traag = false;
    const bw = bewaker(info => (info.method === 'GET' && traag ? { delay: 2000, snapshot: true } : undefined));
    const o = await open(ctx, { data: fx, onRequest: bw.onRequest });
    await rustig(o);
    serverWrite(o.state, db => { db.meta = Object.assign({}, db.meta, { minAppVersion: '99.0' }); });
    traag = true; await refresh(o.page); await wait(100); traag = false; // momentopname mét blokkade
    serverWrite(o.state, db => { delete db.meta.minAppVersion; });
    await refresh(o.page); await wait(800);
    await wait(2200); // verouderd antwoord met blokkade komt binnen
    assert(!(await o.page.isVisible('#writeGuardOverlay')), 'Verouderd antwoord zette een opgeheven blokkade terug');
    await addBood(o.page, 'Na opheffing');
    await until(async () => boodTexts(o.state.db).includes('Na opheffing'), 4000, 'opslaan na opheffing');
    await o.ctx.close();
  },

  async 'Codex: server verwerkt vóór een vertraagde bevestiging; ander toestel schrijft ertussen'(ctx) {
    let fase = 0;
    const bw = bewaker(info => {
      if (info.method === 'PUT' && fase === 1) {
        fase = 2;
        // Server verwerkt meteen; het andere toestel schrijft tijdens de vertraagde bevestiging.
        setTimeout(() => serverWrite(info.state, db => { db.boodschappen.push({ id: 'tussen', text: 'Ertussen', addedBy: 'Sanne', done: false }); }), 300);
        return { delay: 1200, commitFirst: true };
      }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Eerst verwerkt');
    await wait(1800);
    await addBood(o.page, 'Daarna');
    await until(async () => boodTexts(o.state.db).includes('Daarna'), 6000, 'volgende opslag');
    ['Eerst verwerkt', 'Ertussen', 'Daarna'].forEach(t => assert(boodTexts(o.state.db).filter(x => x === t).length === 1, t + ' niet precies één keer: ' + boodTexts(o.state.db).join(', ')));
    assert(bw.maxTegelijk === 1 && bw.zonderIfMatch === 0, 'Gelijktijdige of onvoorwaardelijke schrijfactie');
    await o.ctx.close();
  },

  async 'Codex: mislukte herstellezing — niet opnieuw schrijven vóór een geslaagde lezing'(ctx) {
    let fase = 0, getFouten = 0, putsTijdensFouten = 0;
    const bw = bewaker(info => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'abort'; }
      if (info.method === 'PUT' && fase === 2) putsTijdensFouten++;
      if (info.method === 'GET' && fase === 2 && getFouten < 2) { getFouten++; return 'abort'; }
      if (info.method === 'GET' && fase === 2) fase = 3;
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Na mislukte lezing');
    await until(async () => fase === 3, 9000, 'geslaagde herstellezing');
    assert(getFouten === 2 && putsTijdensFouten === 0, 'Schreef ' + putsTijdensFouten + 'x vóór een geslaagde herstellezing');
    await vraagBeantwoord(o.page, true);
    await until(async () => boodTexts(o.state.db).includes('Na mislukte lezing'), 5000, 'opslaan na de keuze');
    await o.ctx.close();
  },

  async 'Codex: hangende PUT en hangende herstellezing blokkeren de coördinator niet'(ctx) {
    let fase = 0, putsTijdensHangen = 0;
    const bw = bewaker(info => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'hang'; }
      if (info.method === 'GET' && fase === 2) { fase = 3; return 'hang'; }
      if (info.method === 'PUT' && (fase === 2 || fase === 3)) putsTijdensHangen++;
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest, timeouts: { put: 1500, get: 1500 } });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Hangt even');
    // PUT hangt (tijdslimiet 1,5 s), daarna hangt ook de herstellezing (1,5 s), daarna lukt lezen.
    assert(await vraagZichtbaar(o.page, 9000), 'Coördinator bleef hangen: geen voortgang na tijdslimieten');
    assert(putsTijdensHangen === 0, 'Schreef vóór een geslaagde herstellezing');
    await o.page.click('#confirmOkBtn');
    await until(async () => boodTexts(o.state.db).includes('Hangt even'), 5000, 'opslaan na de keuze');
    await addBood(o.page, 'Daarna gewoon');
    await until(async () => boodTexts(o.state.db).includes('Daarna gewoon'), 5000, 'volgende opslag werkt');
    await o.ctx.close();
  },

  async 'Codex: geslaagde PUT zonder ETag in het antwoord terwijl een nieuwere generatie wacht'(ctx) {
    let fase = 0;
    let tweedeTijdensEerste = false;
    const bw = bewaker(info => { if (info.method === 'PUT' && fase === 1) { fase = 2; return { delay: 2500, noETag: true }; } });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o);
    await until(async () => o.state.puts >= 1, 3000, 'terugschrijven na het laden'); await wait(500);
    fase = 1;
    await addBood(o.page, 'Zonder ETag 1');
    await until(async () => fase === 2, 3000, 'eerste PUT onderweg');
    await addBood(o.page, 'Zonder ETag 2'); // nieuwere generatie terwijl de eerste nog onderweg is
    tweedeTijdensEerste = bw.tegelijk === 1;
    assert(tweedeTijdensEerste, 'Testopzet: tweede wijziging kwam niet tijdens de eerste PUT');
    await until(async () => boodTexts(o.state.db).includes('Zonder ETag 2'), 5000, 'nieuwere generatie opgeslagen (niet blijven hangen op "niet veilig")');
    assert(boodTexts(o.state.db).includes('Zonder ETag 1'), 'Eerste wijziging kwijt');
    assert(bw.maxTegelijk === 1 && bw.zonderIfMatch === 0, 'Gelijktijdige of onvoorwaardelijke schrijfactie');
    await o.ctx.close();
  },

  async 'P1-11-grens: NW-03 vergroot het lijst-met-gaten-risico niet (zelfde gedrag als live)'(ctx) {
    // P1-11 wordt hier niet opgelost. Wel: de testversie schrijft bij een lijst die als object
    // binnenkomt niet vaker en niet anders dan de live-versie.
    const fx = readFixture('huishouden.json');
    const n = fx.boodschappen.length, obj = {}; obj[String(n + 3)] = fx.boodschappen[n - 1];
    fx.boodschappen = obj;
    const uit = {};
    for (const target of ['root', 'test']) {
      const o = await openApp(ctx.browser, ctx.base, { target, data: clone(fx) });
      await wait(2500);
      await refresh(o.page); await wait(1500);
      uit[target] = { puts: o.state.puts, db: JSON.stringify(o.state.db.boodschappen === undefined ? null : o.state.db.boodschappen) };
      await o.ctx.close();
    }
    assert(uit.test.puts <= uit.root.puts && uit.test.db === uit.root.db, 'Testversie wijkt af van live bij een lijst met gaten: ' + JSON.stringify(uit));
  }
};
