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
function diffPaths(a, b, base = '') {
  a = firebaseCanon(a); b = firebaseCanon(b);
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
  const state = { db: opts.data === undefined ? null : clone(opts.data), puts: 0, gets: 0, etag: 1, errors: [], putBodies: [] };
  page.on('pageerror', e => state.errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|net::ERR_|ERR_FAILED|blocked/i.test(t)) return; // afgebroken externe verzoeken
    state.errors.push('console: ' + t);
  });
  await ctx.route(DB_URL + '/**', async route => {
    const req = route.request();
    if (req.method() === 'PUT') {
      // Zoals Firebase: een voorwaardelijke PUT met een verouderde ETag geeft 412.
      const ifMatch = req.headers()['if-match'];
      if (ifMatch && ifMatch !== 'e' + state.etag) { state.conflicts = (state.conflicts || 0) + 1; return route.fulfill({ status: 412, headers: { ETag: 'e' + state.etag }, body: '' }); }
      const body = JSON.parse(req.postData());
      if (opts.onPut) opts.onPut(body);
      state.db = body; state.puts++; state.etag++; state.putBodies.push(body);
      return route.fulfill({ status: 200, headers: { ETag: 'e' + state.etag, 'content-type': 'application/json' }, body: req.postData() });
    }
    state.gets++;
    return route.fulfill({ status: 200, headers: { ETag: 'e' + state.etag, 'content-type': 'application/json' }, body: JSON.stringify(state.db) });
  });
  // Al het andere verkeer naar buiten (weer, kaarten, QR-bibliotheek) wordt geblokkeerd.
  await ctx.route(u => !u.href.startsWith(base) && !u.href.startsWith(DB_URL), r => r.abort());
  await page.clock.setFixedTime(opts.now || FIXED_NOW);
  const ls = Object.assign({
    plannerDbUrl: DB_URL, plannerKey: PLANNER_KEY, plannerMyName: 'Bas', plannerPartnerName: 'Sanne',
    briefingShown: '2026-10-02', plannerCity: ''
  }, opts.localStorage || {});
  await ctx.addInitScript(items => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    Object.keys(items).forEach(k => { if (items[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, items[k]); });
  }, ls);
  await page.goto(url);
  await page.waitForTimeout(opts.settle || 1500);
  return { ctx, page, state, url };
}

// Simuleert een ander toestel dat de serverdata wijzigt.
function serverWrite(state, mutate) { mutate(state.db); state.etag++; }

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

module.exports = { serverWrite, startServer, launch, openApp, readFixture, clone, firebaseCanon, diffPaths, waitForPut, assert, assertSameSet, shotPath, FIXED_NOW, DB_URL };
