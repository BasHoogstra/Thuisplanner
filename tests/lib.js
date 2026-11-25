// Gedeelde hulpmiddelen voor de Huisplan-tests.
// - start een kleine webserver op de repo-map
// - laadt de app tegen een nagebootste Firebase-database (geen echte data, geen internet)
// - vergelijkt data zoals Firebase die bewaart (lege lijsten/objecten en null tellen niet)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {
    const root = require('child_process').execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright'));
  }
}
const { chromium } = loadPlaywright();

const ROOT = path.resolve(__dirname, '..');
const DB_URL = 'https://fake-huisplan.test';
const PLANNER_KEY = 'testplanner0123456789';
// Vaste "vandaag" zodat tests elke dag hetzelfde zien: vrijdag 2 oktober 2026, 10:00.
const FIXED_NOW = new Date(2026, 9, 2, 10, 0, 0);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.css': 'text/css' };

function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port }));
  });
}

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
}
const clone = o => JSON.parse(JSON.stringify(o));

// Zoals Firebase opslaat: null, lege lijsten en lege objecten verdwijnen. Een lege tekst
// telt ook als "niets", omdat de app een ontbrekend veld bij het laden als '' invult.
function firebaseCanon(v) {
  if (v === null || v === undefined || v === '') return undefined;
  if (Array.isArray(v)) {
    const a = v.map(firebaseCanon).filter(x => x !== undefined);
    return a.length ? a : undefined;
  }
  if (typeof v === 'object') {
    const o = {};
    Object.keys(v).sort().forEach(k => { const c = firebaseCanon(v[k]); if (c !== undefined) o[k] = c; });
    return Object.keys(o).length ? o : undefined;
  }
  return v;
}

// Lijst van paden waar a en b verschillen (na firebaseCanon). Lijsten met id's worden op id vergeleken.
// Vanaf stap 0.13 zet de app bij opslaan meta.schemaVersion = 1 als dat ontbreekt. Dat ene
// toegevoegde veld telt hier niet mee (tests/schema.test.js controleert het apart), tenzij
// { strictMeta: true } wordt meegegeven.
function diffPaths(a, b, base = '', opts = {}) {
  a = firebaseCanon(a); b = firebaseCanon(b);
  if (!opts.strictMeta && b && b.meta && b.meta.schemaVersion === 1 && !(a && a.meta && 'schemaVersion' in a.meta)) {
    b = clone(b); delete b.meta.schemaVersion;
    if (!Object.keys(b.meta).length) delete b.meta;
  }
  const out = [];
  (function walk(x, y, p) {
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (Array.isArray(x) && Array.isArray(y) && x.concat(y).every(e => e && typeof e === 'object' && e.id)) {
      const ids = new Set(x.map(e => e.id).concat(y.map(e => e.id)));
      ids.forEach(id => walk(x.find(e => e.id === id), y.find(e => e.id === id), p + '[' + id + ']'));
      return;
    }
    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) {
      new Set(Object.keys(x).concat(Object.keys(y))).forEach(k => walk(x[k], y[k], p ? p + '.' + k : k));
      return;
    }
    out.push(p || '(root)');
  })(a, b, base);
  return out;
}

async function launch() { return chromium.launch(); }

// Opent de app (target 'test' = test/index.html, 'root' = index.html) met een nagebootste database.
async function openApp(browser, base, opts = {}) {
  const target = opts.target || process.env.TARGET || 'test';
  const url = base + (target === 'root' ? '/index.html' : '/test/index.html');
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 }, colorScheme: opts.colorScheme || 'light', locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' });
  const page = await ctx.newPage();
  // opts.state: dezelfde nagebootste database delen met een ander toestel (twee browsers tegelijk).
  const state = opts.state || { db: opts.data === undefined ? null : clone(opts.data), puts: 0, gets: 0, etag: 1, errors: [], putBodies: [] };
  page.on('pageerror', e => state.errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|net::ERR_|ERR_FAILED|blocked/i.test(t)) return; // afgebroken externe verzoeken
    state.errors.push('console: ' + t);
  });
  // opts.dbOnbereikbaar: de database is vanaf de start onbereikbaar, tot state.onbereikbaar = false.
  if (opts.dbOnbereikbaar) state.onbereikbaar = true;
  await ctx.route(DB_URL + '/**', async route => {
    // Een verzoek dat de app zelf afbreekt (tijdslimiet) kan niet meer worden beantwoord; dat is geen fout.
    try { await behandel(route); } catch (e) { if (!/handled|closed|Target|aborted/i.test(String(e && e.message))) throw e; }
  });
  async function behandel(route) {
    const req = route.request();
    if (state.onbereikbaar) return route.abort('internetdisconnected');
    // opts.log: verloop van de verzoeken vastleggen (om oude en nieuwe opslaglaag te vergelijken).
    const log = m => { if (opts.log) opts.log.push(m + (req.headers()['if-match'] ? ' if-match' : '')); };
    // opts.exposeETag: de ETag is voor de app leesbaar (Access-Control-Expose-Headers), zodat de app
    // voorwaardelijk opslaat met if-match. Standaard aan: zo gedraagt de echte Firebase zich
    // (handmatig bevestigd op 3 okt 2026, docs/fase1-notities.md, 9). Met exposeETag: false kan de app
    // de ETag niet lezen; sinds 1.4.2 (besluit 9.1) schrijft de testversie dan niet.
    const h = o => (opts.exposeETag !== false ? Object.assign({ 'Access-Control-Expose-Headers': 'ETag' }, o) : o);
    // opts.onRequest({method, ifMatch, state}): per verzoek ingrijpen (1.4.2, E2-tests). Geeft terug:
    //  'abort'  verbinding weg vóór de server (er verandert niets);
    //  'lost'   alleen bij PUT: de server verwerkt het verzoek, maar het antwoord gaat verloren;
    //  'hang'   er komt nooit een antwoord (en bij PUT wordt niets verwerkt);
    //  { delay: ms, snapshot, commitFirst, noETag }  het antwoord komt pas na ms milliseconden.
    // opts.onDone({method}): een PUT is afgehandeld (antwoord verstuurd of afgebroken).
    //     snapshot (GET): de inhoud is die op het moment van het verzoek (een echt verouderd antwoord);
    //     commitFirst (PUT): de server verwerkt meteen, alleen het antwoord is vertraagd;
    //     noETag: het antwoord heeft geen ETag-header.
    const act = opts.onRequest ? await opts.onRequest({ method: req.method(), ifMatch: req.headers()['if-match'], url: req.url(), state }) : null;
    const klaar = () => { if (opts.onDone && req.method() === 'PUT') opts.onDone({ method: 'PUT' }); };
    if (act === 'abort') { log(req.method() + ' afgebroken'); klaar(); return route.abort('failed'); }
    if (act === 'hang') { log(req.method() + ' hangt'); await new Promise(r => setTimeout(r, 30000)); klaar(); return route.abort('failed'); }
    const o = act && typeof act === 'object' ? act : {};
    if (req.method() === 'PUT') {
      // Zoals Firebase: een voorwaardelijke PUT met een verouderde ETag geeft 412.
      const ifMatch = req.headers()['if-match'];
      const verwerk = () => {
        if (ifMatch && ifMatch !== 'e' + state.etag) { log('PUT 412'); state.conflicts = (state.conflicts || 0) + 1; return 412; }
        log('PUT');
        const body = JSON.parse(req.postData());
        if (opts.onPut) opts.onPut(body);
        state.db = body; state.puts++; state.etag++; state.putBodies.push(body);
        return 200;
      };
      let st = null, etagNa = null;
      if (o.commitFirst) { st = verwerk(); etagNa = state.etag; }
      if (o.delay) await new Promise(r => setTimeout(r, o.delay));
      if (st === null) { st = verwerk(); etagNa = state.etag; }
      if (opts.onDone) opts.onDone({ method: 'PUT' }); // het antwoord (of het wegvallen ervan) gaat nu de deur uit
      if (act === 'lost') return route.abort('failed');
      const etagH = o.noETag ? {} : { ETag: 'e' + etagNa };
      if (st === 412) return route.fulfill({ status: 412, headers: h(etagH), body: '' });
      return route.fulfill({ status: 200, headers: h(Object.assign(etagH, { 'content-type': 'application/json' })), body: req.postData() });
    }
    // De lijst met alle planners is bij goed ingestelde regels afgeschermd (zoals in Firebase).
    if (/\/planners\.json/.test(req.url())) { log('GET planners'); return route.fulfill({ status: 401, body: '{"error":"Permission denied"}' }); }
    log('GET');
    state.gets++;
    const vast = o.snapshot ? { body: JSON.stringify(state.db), etag: state.etag } : null;
    if (o.delay) await new Promise(r => setTimeout(r, o.delay));
    const body = vast ? vast.body : JSON.stringify(state.db), et = vast ? vast.etag : state.etag;
    return route.fulfill({ status: 200, headers: h(Object.assign(o.noETag ? {} : { ETag: 'e' + et }, { 'content-type': 'application/json' })), body });
  }
  // opts.timeouts: kortere tijdslimieten voor verzoeken van de app ({get, put} in ms), voor tests met
  // hangende verzoeken (zie createFirebaseStore, window.HUISPLAN_TIMEOUTS).
  if (opts.timeouts) await ctx.addInitScript(t => { window.HUISPLAN_TIMEOUTS = t; }, opts.timeouts);
  // opts.initScript: extra script (tekst) dat vóór de app draait, in elk venster van deze context.
  if (opts.initScript) await ctx.addInitScript({ content: opts.initScript });
  // Al het andere verkeer naar buiten (weer, kaarten, QR-bibliotheek) wordt geblokkeerd.
  // opts.allowUrl: een extra lokaal adres dat wél bereikbaar is (bv. tests/nepdb.js).
  await ctx.route(u => !u.href.startsWith(base) && !u.href.startsWith(DB_URL) && !(opts.allowUrl && u.href.startsWith(opts.allowUrl)), r => r.abort());
  // opts.realClock: de echte klok (nodig als tijd moet verstrijken, bv. een hartslag die veroudert).
  if (!opts.realClock) await page.clock.setFixedTime(opts.now || FIXED_NOW);
  const ls = Object.assign({
    plannerDbUrl: DB_URL, plannerKey: PLANNER_KEY, plannerMyName: 'Bas', plannerPartnerName: 'Sanne',
    briefingShown: '2026-10-02', plannerCity: ''
  }, opts.localStorage || {});
  // De testversie (E3) vertrouwt alleen het koppelrecord 'huisplanKoppeling' (database + planner in één
  // record). Het hoort bij dezelfde koppeling als de losse sleutels, tenzij een test het zelf zet.
  if (!('huisplanKoppeling' in (opts.localStorage || {})) && ls.plannerDbUrl && ls.plannerKey) ls.huisplanKoppeling = JSON.stringify({ v: 1, db: ls.plannerDbUrl, key: ls.plannerKey });
  await ctx.addInitScript(items => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    Object.keys(items).forEach(k => { if (items[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, items[k]); });
  }, ls);
  // Opslagfouten nabootsen (1.4.2, E3). De instelling staat in sessionStorage ('__opslagFout'), zodat
  // hij een herlaadactie overleeft en tijdens een test te wijzigen is (zie zetOpslagFout):
  //   { schrijven: '<regex>', lezen: '<regex>', verwijderen: '<regex>' } op de sleutelnaam.
  // Schrijven gooit QuotaExceededError, lezen en verwijderen een SecurityError.
  await ctx.addInitScript(start => {
    if (start && !sessionStorage.getItem('__opslagFout')) sessionStorage.setItem('__opslagFout', JSON.stringify(start));
    const P = Storage.prototype, set = P.setItem, get = P.getItem, rem = P.removeItem;
    const cfg = () => { try { return JSON.parse(get.call(sessionStorage, '__opslagFout') || '{}'); } catch (e) { return {}; } };
    const raakt = (soort, k, self) => self === localStorage && cfg()[soort] && new RegExp(cfg()[soort]).test(k);
    P.setItem = function (k, v) { if (raakt('schrijven', k, this)) throw new DOMException('vol', 'QuotaExceededError'); return set.call(this, k, v); };
    P.getItem = function (k) { if (raakt('lezen', k, this)) throw new DOMException('geblokkeerd', 'SecurityError'); return get.call(this, k); };
    P.removeItem = function (k) { if (raakt('verwijderen', k, this)) throw new DOMException('geblokkeerd', 'SecurityError'); return rem.call(this, k); };
  }, opts.opslagFout || null);
  await page.goto(url);
  await page.waitForTimeout(opts.settle || 1500);
  return { ctx, page, state, url };
}

// Simuleert een ander toestel dat de serverdata wijzigt.
function serverWrite(state, mutate) { mutate(state.db); state.etag++; }
// Lege nagebootste database om te delen tussen twee toestellen (openApp met { state }).
function sharedDb(data) { return { db: data === undefined ? null : clone(data), puts: 0, gets: 0, etag: 1, errors: [], putBodies: [] }; }

// Opslagfouten tijdens een test aan- of uitzetten (zie openApp, opts.opslagFout).
function zetOpslagFout(page, cfg) { return page.evaluate(c => sessionStorage.setItem('__opslagFout', JSON.stringify(c || {})), cfg); }

async function waitForPut(state, before, timeout = 4000) {
  const t0 = Date.now();
  while (state.puts <= before) {
    if (Date.now() - t0 > timeout) throw new Error('Geen opslaan binnen ' + timeout + ' ms');
    await new Promise(r => setTimeout(r, 50));
  }
  await new Promise(r => setTimeout(r, 300));
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertSameSet(actual, expected, label) {
  const a = [...new Set(actual)].sort(), e = [...new Set(expected)].sort();
  assert(JSON.stringify(a) === JSON.stringify(e), label + '\n  verwacht: ' + JSON.stringify(e) + '\n  kreeg:    ' + JSON.stringify(a));
}

const OUT = path.join(__dirname, 'output');
function shotPath(target, name) {
  const dir = path.join(OUT, target);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name + '.png');
}

module.exports = { PLANNER_KEY, zetOpslagFout, serverWrite, sharedDb, startServer, launch, openApp, readFixture, clone, firebaseCanon, diffPaths, waitForPut, assert, assertSameSet, shotPath, FIXED_NOW, DB_URL };
