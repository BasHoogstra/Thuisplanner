#!/usr/bin/env node
// P1-3 emulatorproef (nachtwerkpakket NW-01, ontwerp 1.4.2 sectie 7.7 punt 4 en open vraag P1-3).
//
// Vraag: gedraagt de Firebase Realtime Database Emulator zich bij ETag/if-match, lege locaties,
// PUT/PATCH/DELETE/POST (subpad, ouder, meerdere paden) en regelevaluatie zoals productie?
//
// Isolatie (besluit 9.4):
//  - Harde lokale netwerkallowlist: elke socketverbinding van dit proces naar iets anders dan de
//    lokale emulator (127.0.0.1:<poort>) gooit een fout vóórdat er verbinding wordt gemaakt.
//  - Alleen fictieve data, in een eigen, willekeurige namespace per run.
//  - Geen productieconfiguratie, geen Firebase-project, geen CLI-login. De emulator-jar wordt lokaal
//    gestart. Er wordt niets gepubliceerd; de proefregels hieronder zijn GEEN voorstel voor productie.
//
// Gebruik:
//   node tools/emulator/p1-3-proef.js [--netns] [--jar=<pad>] [--out=<map>] [--json]
// --netns draait de proef én de emulator in een eigen netwerknamespace zonder route naar buiten
// (Linux, `unshare -rn` + python3). Aanbevolen waar beschikbaar.
// Zonder --jar zoekt het script HUISPLAN_EMULATOR_JAR, daarna
// ~/.cache/firebase/emulators/firebase-database-emulator-v*.jar (zie tools/emulator/README.md).
// Exitcode 0 = alle harde controles geslaagd en geen afwijking van een bekende productieverwachting.
'use strict';
const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

// ── 1. Harde lokale netwerkallowlist ─────────────────────────────────────────────────────────────
const LOKAAL = new Set(['127.0.0.1', 'localhost', '::1']);
let toegestanePoort = null;
class AllowlistFout extends Error {}
function controleerBestemming(host, port) {
  const h = String(host || '').replace(/^\[|\]$/g, '');
  if (!LOKAAL.has(h) || toegestanePoort === null || Number(port) !== toegestanePoort) {
    throw new AllowlistFout('Netwerk-allowlist: verbinding naar ' + h + ':' + port +
      ' geweigerd (alleen de lokale emulator op 127.0.0.1:' + toegestanePoort + ')');
  }
}
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let a = Array.isArray(args[0]) ? args[0] : args;
  let host, port;
  if (a[0] && typeof a[0] === 'object') {
    if (a[0].path != null) throw new AllowlistFout('Netwerk-allowlist: IPC-verbinding geweigerd');
    host = a[0].host || 'localhost'; port = a[0].port;
  } else { port = a[0]; host = typeof a[1] === 'string' ? a[1] : 'localhost'; }
  controleerBestemming(host, port);
  return origConnect.apply(this, args);
};

// ── 2. Emulator starten ──────────────────────────────────────────────────────────────────────────
function vindJar(arg) {
  if (arg) return arg;
  if (process.env.HUISPLAN_EMULATOR_JAR) return process.env.HUISPLAN_EMULATOR_JAR;
  const dir = path.join(os.homedir(), '.cache', 'firebase', 'emulators');
  let jars = [];
  try { jars = fs.readdirSync(dir).filter(f => /^firebase-database-emulator-v[\d.]+\.jar$/.test(f)); } catch (e) {}
  const v = f => f.match(/v([\d.]+)\.jar$/)[1].split('.').map(Number);
  jars.sort((x, y) => { const a = v(x), b = v(y); for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; });
  return jars.length ? path.join(dir, jars[jars.length - 1]) : null;
}
function vrijePoort() {
  return new Promise((res, rej) => {
    const s = net.createServer(); s.unref(); s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
async function startEmulator(jar) {
  const poort = await vrijePoort();
  toegestanePoort = poort;
  const env = Object.assign({}, process.env);
  delete env.JAVA_TOOL_OPTIONS; // geen proxyinstellingen meegeven: de emulator hoeft nergens heen
  const proc = spawn('java', ['-jar', jar, '--host', '127.0.0.1', '--port', String(poort)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', d => { log += d; }); proc.stderr.on('data', d => { log += d; });
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    if (proc.exitCode !== null) throw new Error('Emulator stopte direct:\n' + log.slice(-2000));
    if (/Listening at/.test(log)) return { proc, poort, log: () => log };
    await new Promise(r => setTimeout(r, 100));
  }
  proc.kill(); throw new Error('Emulator startte niet binnen 30 s:\n' + log.slice(-2000));
}

// ── 3. Verzoeken ─────────────────────────────────────────────────────────────────────────────────
let BASIS = null, NS = null;
function verzoek(method, pad, o) {
  o = o || {};
  const url = new URL(pad, BASIS);
  controleerBestemming(url.hostname, url.port || 80);
  if (NS && !o.zonderNs) url.searchParams.set('ns', NS);
  if (o.query) for (const k of Object.keys(o.query)) url.searchParams.set(k, o.query[k]);
  const headers = Object.assign({}, o.headers || {});
  if (o.admin) headers.Authorization = 'Bearer owner'; // alleen voor opzet en controle-lezingen
  let body = o.body === undefined ? undefined : (o.ruw ? o.body : JSON.stringify(o.body)); // ruw: tekst zoals sendBeacon die stuurt
  if (body !== undefined) headers['Content-Length'] = Buffer.byteLength(body);
  return new Promise((res, rej) => {
    const req = http.request(url, { method, headers }, r => {
      let t = ''; r.setEncoding('utf8'); r.on('data', d => { t += d; });
      r.on('end', () => { let j; try { j = t ? JSON.parse(t) : undefined; } catch (e) {} res({ status: r.statusCode, headers: r.headers, text: t, json: j }); });
    });
    req.on('error', rej);
    if (body !== undefined) req.write(body);
    req.end();
  });
}
const ETAG = { 'X-Firebase-ETag': 'true' };
// Controle-lezing (admin). Faalt hard bij elke niet-200, zodat een foutantwoord nooit als
// "ongewijzigde data" kan meetellen.
const lees = p => verzoek('GET', p + '.json', { admin: true }).then(r => {
  if (r.status !== 200 || r.json === undefined) throw new Error('controle-lezing ' + p + ': ' + r.status + ' ' + r.text);
  return r.json;
});
const zet = (p, v) => verzoek('PUT', p + '.json', { admin: true, body: v }).then(r => { if (r.status !== 200) throw new Error('opzet ' + p + ': ' + r.status + ' ' + r.text); });
// Canonieke hash (gesorteerde sleutels), zodat de volgorde van sleutels in een antwoord niet meetelt.
const sorteer = v => Array.isArray(v) ? v.map(sorteer) : (v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = sorteer(v[k]); return o; }, {}) : v);
const hash = v => crypto.createHash('sha256').update(JSON.stringify(sorteer(v === undefined ? null : v))).digest('hex').slice(0, 16);
const ok2xx = s => s >= 200 && s < 300;

// ── 4. Proefregels (alleen voor de emulator; GEEN voorstel voor productie) ───────────────────────
// Werknamen volgen ontwerp 1.4.2, 7.1: bron, doel, control-gedeelte (hier 'ctl') met een slot.
const PROEFREGELS = {
  rules: {
    vrij: { '.read': true, '.write': true },
    cascade: { '.read': true, ouder: { '.write': true, kind: { '.write': false } } },
    alleenKind: { '.read': true, kind: { '.write': true } },
    validate: { '.read': true, '.write': true, kind: { '.validate': 'newData.isNumber() && newData.val() > 0' } },
    geheim: { '.read': false, '.write': false },
    dicht: { '.read': true, '.write': false },
    ctl: { '.read': true, $p: { slot: { '.write': '!data.exists() && newData.exists()', '.validate': "newData.hasChildren(['door', 'sinds'])" } } },
    bron: { '.read': true, $p: { '.write': "!root.child('ctl').child($p).child('slot').exists()" } },
    doel: { '.read': true, $p: { '.write': "root.child('ctl').child($p).child('slot').exists()" } }
  }
};
const FICTIEF = {
  meta: { schemaVersion: 1, minAppVersion: '0.0.0' },
  boodschappen: [{ id: 'b1', naam: 'Melk (fictief)' }, { id: 'b2', naam: 'Brood (fictief)' }],
  taken: [{ id: 't1', titel: 'Fictieve taak', door: 'Testpersoon A' }]
};

// ── 5. Controles ─────────────────────────────────────────────────────────────────────────────────
// Elke controle legt vast: de verwachting in productie + de bron daarvan, de waarneming in de
// emulator, en een oordeel:
//   'gelijk'     emulator = bekende productieverwachting
//   'afwijkend'  emulator ≠ bekende productieverwachting (telt als mislukt)
//   'onbekend'   productiegedrag niet bekend; waarneming vastgelegd (open punt, telt niet als mislukt)
//   'emulator'   bewust emulator-eigen gedrag (bijv. admin-toegang); niet van toepassing op productie
// Harde controles (isolatie, "geweigerd = aantoonbaar ongewijzigd") mislukken met oordeel 'mislukt'.
const BRON = {
  P: 'productie, handmatig bevestigd 3 okt 2026 (docs/fase1-notities.md, 9)',
  D: 'Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten',
  O: 'productiegedrag onbekend',
  E: 'emulator-eigen'
};
const resultaten = [];
function leg(id, groep, titel, verwachting, bron, waargenomen, oordeel, extra) {
  resultaten.push(Object.assign({ id, groep, titel, verwachting, bron: BRON[bron] || bron, waargenomen, oordeel }, extra || {}));
}
function vergelijk(id, groep, titel, verwachting, bron, waargenomen, klopt, extra) {
  leg(id, groep, titel, verwachting, bron, waargenomen, bron === 'O' ? 'onbekend' : bron === 'E' ? 'emulator' : (klopt ? 'gelijk' : 'afwijkend'), extra);
}
function hard(id, groep, titel, verwachting, waargenomen, klopt) {
  leg(id, groep, titel, verwachting, 'harde controle van de proef', waargenomen, klopt ? 'geslaagd' : 'mislukt');
}
// Aantoonbare weigering: geen 2xx-status én de server (admin-lezing) is exact ongewijzigd.
// Bewust niet: specifiek HTTP 401 eisen (harnascorrectie A5.2).
async function weigering(id, groep, titel, pad, doe, controlePaden) {
  const paden = controlePaden || [pad];
  const voor = await Promise.all(paden.map(lees));
  const r = await doe();
  const na = await Promise.all(paden.map(lees));
  const ongewijzigd = paden.every((_, i) => hash(voor[i]) === hash(na[i]));
  hard(id, groep, titel, 'geweigerd (geen 2xx) en data ongewijzigd',
    'HTTP ' + r.status + (r.json && r.json.error ? ' "' + r.json.error + '"' : '') + '; data ' + (ongewijzigd ? 'ongewijzigd' : 'GEWIJZIGD'),
    !ok2xx(r.status) && ongewijzigd);
  return r;
}

async function controlesIsolatie() {
  const G = 'N · netwerkisolatie';
  let fout1 = null; try { await verzoek('GET', 'http://203.0.113.10/x.json', { zonderNs: true }); } catch (e) { fout1 = e; }
  hard('N1', G, 'Verzoek naar een niet-lokaal adres', 'AllowlistFout vóór verbinding', fout1 ? fout1.constructor.name : 'geen fout', fout1 instanceof AllowlistFout);
  let fout2 = null; try { net.connect(443, '203.0.113.10').destroy(); } catch (e) { fout2 = e; }
  hard('N2', G, 'Rechtstreekse socket naar een niet-lokaal adres (globale bewaking)', 'AllowlistFout', fout2 ? fout2.constructor.name : 'geen fout', fout2 instanceof AllowlistFout);
  let fout3 = null; try { net.connect(toegestanePoort + 1 > 65535 ? 1 : toegestanePoort + 1, '127.0.0.1').destroy(); } catch (e) { fout3 = e; }
  hard('N3', G, 'Lokaal, maar een andere poort dan de emulator', 'AllowlistFout', fout3 ? fout3.constructor.name : 'geen fout', fout3 instanceof AllowlistFout);
  hard('N4', G, 'Emulator luistert alleen op loopback', '127.0.0.1', new URL(BASIS).hostname, new URL(BASIS).hostname === '127.0.0.1');
  if (process.env.P13_NETNS === '1') {
    // Een los Node-proces zonder allowlist probeert naar buiten; in de lege namespace kan dat niet.
    const r = spawnSync(process.execPath, ['-e', "const s=require('net').connect(443,'203.0.113.10');s.setTimeout(4000,()=>{console.log('TIMEOUT');process.exit(0)});s.on('error',e=>{console.log(e.code);process.exit(0)});s.on('connect',()=>{console.log('VERBONDEN');process.exit(0)})"], { encoding: 'utf8', timeout: 10000 });
    const uit = String(r.stdout || '').trim();
    hard('N6', G, 'Eigen netwerknamespace: ook buiten de allowlist (en voor de JVM) geen route naar buiten', 'geen verbinding (bijv. ENETUNREACH)', uit || 'geen uitvoer', !!uit && uit !== 'VERBONDEN');
  } else {
    leg('N6', G, 'Eigen netwerknamespace (alleen met --netns)', 'geen route naar buiten', 'harde controle van de proef', 'niet uitgevoerd: gestart zonder --netns; alleen de allowlist van dit proces geldt', 'niet-uitgevoerd');
  }
  hard('N5', G, 'Eigen, willekeurige namespace voor deze run', 'huisplan-p13-<willekeurig>', NS.replace(/[0-9a-f]{8}$/, '<willekeurig>'), /^huisplan-p13-[0-9a-f]{8}$/.test(NS));
}

async function controlesETag() {
  const G = 'E · ETag en if-match';
  const leeg = await verzoek('GET', 'vrij/e/leeg.json', { headers: ETAG });
  vergelijk('E1', G, 'GET op lege locatie met X-Firebase-ETag', '200, body null, ETag "null_etag"', 'D',
    leeg.status + ', body ' + leeg.text + ', ETag ' + leeg.headers.etag, leeg.status === 200 && leeg.text === 'null' && leeg.headers.etag === 'null_etag');
  const zonder = await verzoek('GET', 'vrij/e/leeg.json');
  vergelijk('E2', G, 'GET zonder X-Firebase-ETag', 'geen ETag-header', 'D', zonder.headers.etag ? 'ETag aanwezig' : 'geen ETag-header', !zonder.headers.etag);
  const cors = await verzoek('GET', 'vrij/e/leeg.json', { headers: Object.assign({ Origin: 'http://localhost:8080' }, ETAG) });
  vergelijk('E3', G, 'CORS: ETag leesbaar voor de browser-app', 'Access-Control-Expose-Headers: ETag', 'P',
    String(cors.headers['access-control-expose-headers']), /etag/i.test(String(cors.headers['access-control-expose-headers'])));
  const pre = await verzoek('OPTIONS', 'vrij/e/x.json', { headers: { Origin: 'http://localhost:8080', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type,if-match,x-firebase-etag' } });
  vergelijk('E4', G, 'CORS-preflight voor PUT met if-match', 'toegestaan (anders kon de app in productie geen PUT met If-Match doen)', 'P',
    pre.status + ', methods ' + pre.headers['access-control-allow-methods'] + ', headers ' + pre.headers['access-control-allow-headers'],
    ok2xx(pre.status) && /PUT/.test(pre.headers['access-control-allow-methods'] || '') && /if-match/i.test(pre.headers['access-control-allow-headers'] || ''));

  const p1 = await verzoek('PUT', 'vrij/e/doc.json', { headers: ETAG, body: FICTIEF });
  const g1 = await verzoek('GET', 'vrij/e/doc.json', { headers: ETAG });
  vergelijk('E5', G, 'PUT-antwoord geeft de nieuwe ETag, gelijk aan die van een GET daarna', 'gelijk', 'D',
    p1.headers.etag === g1.headers.etag ? 'gelijk' : 'verschillend', p1.status === 200 && !!p1.headers.etag && p1.headers.etag === g1.headers.etag);
  const ok = await verzoek('PUT', 'vrij/e/doc.json', { headers: Object.assign({ 'if-match': g1.headers.etag }, ETAG), body: Object.assign({}, FICTIEF, { x: 1 }) });
  vergelijk('E6', G, 'PUT met actuele if-match', '200 en opgeslagen', 'P', String(ok.status), ok.status === 200);
  const voor = await lees('vrij/e/doc');
  const oud = await verzoek('PUT', 'vrij/e/doc.json', { headers: Object.assign({ 'if-match': g1.headers.etag }, ETAG), body: { overschreven: true } });
  const na = await lees('vrij/e/doc');
  const cur = await verzoek('GET', 'vrij/e/doc.json', { headers: ETAG });
  vergelijk('E7', G, 'PUT met verouderde if-match', '412, data ongewijzigd, antwoord bevat de actuele waarde en ETag', 'D',
    oud.status + ', data ' + (hash(voor) === hash(na) ? 'ongewijzigd' : 'GEWIJZIGD') + ', body = actuele waarde: ' + (hash(oud.json) === hash(na)) + (hash(oud.json) === hash(na) ? '' : ' (body: ' + oud.text.slice(0, 80) + ')') + ', ETag actueel: ' + (oud.headers.etag === cur.headers.etag),
    oud.status === 412 && hash(voor) === hash(na) && hash(oud.json) === hash(na) && oud.headers.etag === cur.headers.etag);
  const nieuw = await verzoek('PUT', 'vrij/e/nieuw.json', { headers: Object.assign({ 'if-match': 'null_etag' }, ETAG), body: { a: 1 } });
  const nogmaals = await verzoek('PUT', 'vrij/e/nieuw.json', { headers: Object.assign({ 'if-match': 'null_etag' }, ETAG), body: { a: 2 } });
  vergelijk('E8', G, 'PUT met if-match: null_etag ("alleen als leeg")', 'leeg: 200; daarna niet-leeg: 412', 'D',
    nieuw.status + ' / ' + nogmaals.status, nieuw.status === 200 && nogmaals.status === 412);
  // ETag is inhoudsgebonden: dezelfde inhoud geeft dezelfde ETag (ook op een ander pad, en na A→B→A).
  await zet('vrij/e/aba', { v: 'A' }); const eA = (await verzoek('GET', 'vrij/e/aba.json', { headers: ETAG })).headers.etag;
  await zet('vrij/e/aba', { v: 'B' }); await zet('vrij/e/aba', { v: 'A' });
  const eA2 = (await verzoek('GET', 'vrij/e/aba.json', { headers: ETAG })).headers.etag;
  await zet('vrij/e/ander', { v: 'A' }); const eAnder = (await verzoek('GET', 'vrij/e/ander.json', { headers: ETAG })).headers.etag;
  const aba = await verzoek('PUT', 'vrij/e/aba.json', { headers: Object.assign({ 'if-match': eA }, ETAG), body: { v: 'C' } });
  vergelijk('E9', G, 'ETag hangt alleen af van de inhoud (A→B→A; ander pad)', 'productie: onbekend', 'O',
    'A→B→A zelfde ETag: ' + (eA === eA2) + '; ander pad zelfde ETag: ' + (eA === eAnder) + '; PUT met de ETag van vóór A→B→A: ' + aba.status, true,
    { gevolg: 'If-match beschermt tegen inhoudsverschil, niet tegen tussentijdse schrijfacties die op dezelfde inhoud uitkomen. Een verhuisslot mag daarom nooit op een ETag leunen, alleen op regels.' });
  const patch = await verzoek('PATCH', 'vrij/e/doc.json', { headers: Object.assign({ 'if-match': cur.headers.etag }, ETAG), body: { y: 1 } });
  const post = await verzoek('POST', 'vrij/e/doc.json', { headers: Object.assign({ 'if-match': cur.headers.etag }, ETAG), body: { y: 1 } });
  vergelijk('E10', G, 'if-match bij PATCH en POST', 'productie: onbekend (emulatorfout noemt "not supported with GET, PATCH or POST")', 'O',
    'PATCH ' + patch.status + ', POST ' + post.status + (patch.json && patch.json.error ? ' "' + patch.json.error + '"' : ''), true,
    { gevolg: 'Er bestaat geen voorwaardelijke PATCH of POST. Alle voorwaardelijke schrijfacties (E2, migrator) moeten PUT (of DELETE) zijn.' });
  const cur2 = await verzoek('GET', 'vrij/e/doc.json', { headers: ETAG });
  const delOud = await verzoek('DELETE', 'vrij/e/doc.json', { headers: Object.assign({ 'if-match': 'verouderd' }, ETAG) });
  const naDel = await lees('vrij/e/doc');
  const delGoed = await verzoek('DELETE', 'vrij/e/doc.json', { headers: Object.assign({ 'if-match': cur2.headers.etag }, ETAG) });
  vergelijk('E11', G, 'DELETE met if-match (verouderd / actueel)', 'productie: onbekend', 'O',
    delOud.status + (naDel ? ' (data bleef staan)' : ' (data WEG)') + ' / ' + delGoed.status, true);
  const kapot = await verzoek('PUT', 'vrij/e/k.json', { headers: Object.assign({ 'if-match': '"' }, ETAG), body: 1 });
  vergelijk('E12', G, 'PUT met onzinnige if-match-waarde', 'productie: onbekend', 'O', String(kapot.status), true);
  // Volgorde van controles: verouderde ETag op een pad zonder schrijfrecht.
  await zet('dicht/d', 'fictief'); await zet('geheim/g', 'fictief-geheim');
  const d412 = await verzoek('PUT', 'dicht/d.json', { headers: Object.assign({ 'if-match': 'verouderd' }, ETAG), body: 'x' });
  const g412 = await verzoek('PUT', 'geheim/g.json', { headers: Object.assign({ 'if-match': 'verouderd' }, ETAG), body: 'x' });
  vergelijk('E13', G, 'Verouderde if-match op pad zonder schrijfrecht (leesbaar / niet leesbaar)', 'productie: onbekend', 'O',
    'leesbaar: ' + d412.status + '; niet leesbaar: ' + g412.status + (g412.text.indexOf('fictief-geheim') > -1 ? ' (LEKT DATA)' : ' (lekt geen data)'), true,
    { gevolg: 'Een weigering kan dus ook als 412 binnenkomen. De client (E2, regel 9) moet bij 412 én 401/403 opnieuw lezen en het slot controleren; de proef telt elke niet-2xx met ongewijzigde data als weigering.' });
  hard('E14', G, '412 op een niet-leesbaar pad lekt geen data', 'geen inhoud in antwoord', g412.text.indexOf('fictief-geheim') > -1 ? 'lekt' : 'lekt niet', g412.text.indexOf('fictief-geheim') === -1);
}

async function controlesLeeg() {
  const G = 'L · lege locaties';
  const r = await verzoek('PUT', 'vrij/l/obj.json', { headers: ETAG, body: {} });
  const g = await lees('vrij/l/obj');
  vergelijk('L1', G, 'PUT {} op een lege locatie', 'wordt niet opgeslagen (locatie blijft leeg)', 'D',
    r.status + ', ETag ' + r.headers.etag + ', daarna ' + JSON.stringify(g), g === null);
  hard('L1b', G, 'Leeg object is geen geldige persisted-control (harnascorrectie)', 'PUT {} geeft wel 2xx maar niets bestaat daarna; een proef mag {} nooit als gezet slot tellen',
    r.status + ' en daarna ' + JSON.stringify(g), ok2xx(r.status) && g === null);
  await zet('vrij/l/geneste', { a: { b: {} }, c: 1, d: [] });
  const gn = await lees('vrij/l/geneste');
  vergelijk('L2', G, 'Geneste lege objecten en lege lijsten', 'verdwijnen; alleen {c:1} blijft (zoals canonVal in de app)', 'D', JSON.stringify(gn), hash(gn) === hash({ c: 1 }));
  await zet('vrij/l/v', { x: 1, y: 2 });
  await verzoek('PATCH', 'vrij/l/v.json', { body: { x: null } });
  const gp = await lees('vrij/l/v');
  vergelijk('L3', G, 'PATCH met null wist dat kind', '{y:2}', 'D', JSON.stringify(gp), hash(gp) === hash({ y: 2 }));
  await zet('vrij/l/w', { x: 1 });
  const pn = await verzoek('PUT', 'vrij/l/w.json', { body: null });
  const gw = await lees('vrij/l/w');
  vergelijk('L4', G, 'PUT null wist de locatie', 'leeg', 'D', pn.status + ', daarna ' + JSON.stringify(gw), ok2xx(pn.status) && gw === null);
  // Lijsten: Firebase slaat ze op als objecten met sleutels 0..n en geeft ze terug als lijst als
  // "meer dan de helft" van de sleutels 0..max bestaat (documentatie).
  await zet('vrij/l/arr4', ['a', 'b', 'c', 'd']);
  await verzoek('DELETE', 'vrij/l/arr4/0.json');
  const ga4 = await lees('vrij/l/arr4');
  vergelijk('L5', G, 'Lijst met een gat, 3 van 4 sleutels over', 'lijst met null op de plek van het gat', 'D', JSON.stringify(ga4), hash(ga4) === hash([null, 'b', 'c', 'd']));
  await zet('vrij/l/arr3', ['a', 'b', 'c']);
  await verzoek('DELETE', 'vrij/l/arr3/0.json'); await verzoek('DELETE', 'vrij/l/arr3/1.json');
  const ga3 = await lees('vrij/l/arr3');
  vergelijk('L6', G, 'Lijst met een gat, 1 van 3 sleutels over', 'object {"2": …} in plaats van een lijst', 'D', JSON.stringify(ga3), hash(ga3) === hash({ 2: 'c' }));
  await zet('vrij/l/arr2', ['a', 'b']);
  await verzoek('DELETE', 'vrij/l/arr2/0.json');
  const ga2 = await lees('vrij/l/arr2');
  vergelijk('L7', G, 'Lijst met een gat, precies de helft over (1 van 2)', 'productie: onbekend (grensgeval van "meer dan de helft")', 'O', JSON.stringify(ga2), true,
    { gevolg: 'Of een lijst als lijst of als object terugkomt, hangt af van hoeveel sleutels er zijn (L5–L7). Let op: normalizeData in de app zet zo\'n object niet terug naar een lijst, maar vervangt een lijst op het hoogste niveau die als object binnenkomt door [] (index.html). Een lijst met gaten (bijv. door een DELETE op een element door een andere schrijver, of null-elementen vooraan) kan dus bij de volgende opslag leeg worden geschreven. Niet nagespeeld in de app; bevinding voor E2/E5. De migrator en de classificatie (E5) moeten beide vormen aankunnen.' });
  await zet('vrij/l/s', '');
  const gs = await lees('vrij/l/s');
  vergelijk('L8', G, 'Lege tekst ""', 'productie: onbekend', 'O', JSON.stringify(gs), true);
}

async function controlesRegels() {
  const G = 'R · regelevaluatie';
  const c = await verzoek('PUT', 'cascade/ouder/kind.json', { body: 1 });
  vergelijk('R1', G, 'Regels cascaderen: kind-.write:false kan een toestemming van de ouder niet intrekken', 'toegestaan', 'D', String(c.status), ok2xx(c.status),
    { gevolg: 'Staat in productie ergens boven de bron een .write die toestemming geeft (bijv. op planners/$key), dan kan een slotregel lager in de boom niets meer blokkeren. Daarom eerst P1-1 (werkelijke regels).' });
  const ak = await verzoek('PUT', 'alleenKind.json', { body: { kind: 1 } });
  vergelijk('R2', G, 'Schrijven op een ouder telt alleen regels op dat pad en erboven', 'geweigerd (kind-toestemming geldt niet voor een schrijfactie op de ouder)', 'D', String(ak.status), !ok2xx(ak.status));
  const v1 = await verzoek('PUT', 'validate/kind.json', { body: -1 });
  const v2 = await verzoek('PUT', 'validate.json', { body: { kind: -1 } });
  vergelijk('R3', G, '.validate van een kind telt ook bij schrijven op de ouder', 'beide geweigerd', 'D', v1.status + ' / ' + v2.status, !ok2xx(v1.status) && !ok2xx(v2.status));
  await zet('validate/kind', 5);
  const v3 = await verzoek('DELETE', 'validate/kind.json');
  await zet('validate/kind', 5);
  const v4 = await verzoek('PUT', 'validate.json', { body: { ander: 1 } });
  const v4na = await lees('validate/kind');
  vergelijk('R4', G, '.validate wordt niet uitgevoerd bij verwijderen (ook niet via een ouder-PUT)', 'beide toegestaan; kind weg', 'D',
    v3.status + ' / ' + v4.status + ', kind daarna ' + JSON.stringify(v4na), ok2xx(v3.status) && ok2xx(v4.status) && v4na === null,
    { gevolg: '.validate kan een slot dus niet beschermen tegen verwijderen; dat moet met .write.' });
  const voor = await lees('vrij/mp');
  const mp = await verzoek('PATCH', '.json', { body: { 'vrij/mp/a': 1, 'dicht/mp': 2 } });
  const na = await lees('vrij/mp');
  vergelijk('R5', G, 'PATCH op meerdere paden is atomair: één geweigerd pad weigert alles', 'geweigerd; ook het toegestane pad niet geschreven', 'D',
    mp.status + ', vrij/mp ' + (hash(voor) === hash(na) ? 'ongewijzigd' : 'GESCHREVEN'), !ok2xx(mp.status) && hash(voor) === hash(na));
  const mpOk = await verzoek('PATCH', '.json', { body: { 'vrij/mp/a': 1, 'vrij/mp/b': 2 } });
  vergelijk('R6', G, 'PATCH op meerdere paden: elk pad apart beoordeeld (geen root-.write nodig)', 'toegestaan', 'D', String(mpOk.status), ok2xx(mpOk.status));
  // root in een regel = de stand vóór de schrijfactie, ook binnen één PATCH met meerdere paden.
  const tegelijk = await verzoek('PATCH', '.json', { body: { 'ctl/q/slot': { door: 'proef', sinds: 1 }, 'doel/q/x': 1 } });
  const slotQ = await lees('ctl/q/slot');
  vergelijk('R7', G, '`root` in regels is de stand vóór de schrijfactie (slot + doel in één PATCH)', 'geweigerd: doel ziet het nog niet bestaande slot niet', 'D',
    tegelijk.status + (slotQ ? ' (slot WEL gezet)' : ' (slot niet gezet)'), !ok2xx(tegelijk.status) && slotQ === null);
  const reg = await verzoek('PUT', '.settings/rules.json', { body: { rules: { '.read': true, '.write': true } } });
  const regNa = await lees('.settings/rules');
  hard('R8', G, 'Een client zonder beheerdersrechten kan de regels niet wijzigen', 'geweigerd; proefregels ongewijzigd', reg.status + ', regels ' + (hash(regNa) === hash(PROEFREGELS) ? 'ongewijzigd' : 'GEWIJZIGD'), !ok2xx(reg.status) && hash(regNa) === hash(PROEFREGELS));
  const adm = await verzoek('PUT', 'dicht/adm.json', { admin: true, body: 1 });
  vergelijk('R9', G, '"Authorization: Bearer owner" omzeilt alle regels', 'alleen in de emulator; de proef gebruikt dit uitsluitend voor opzet en controle-lezingen, nooit voor de gesimuleerde clients', 'E', String(adm.status), true);
  const d = await verzoek('PUT', 'dicht/x.json', { body: 1 });
  vergelijk('R10', G, 'Statuscode en tekst bij weigering', 'productie (REST): 401 "Permission denied"', 'D', d.status + ' "' + (d.json && d.json.error) + '"', d.status === 401,
    { gevolg: 'De proef eist geen 401 maar een aantoonbare weigering (niet-2xx + data ongewijzigd), zie E13 en harnascorrectie A5.2.' });
}

async function controlesSlotmatrix() {
  const G = 'S · schrijfvormen tegen een proefslot';
  const P = 'p1';
  await zet('bron/' + P, FICTIEF); await zet('ctl/' + P, null); await zet('doel/' + P, null);
  // Nulmeting: zonder slot zijn de schrijfvormen op de bron toegestaan, zodat een latere weigering
  // aan het slot ligt en niet aan iets anders.
  const e0 = (await verzoek('GET', 'bron/' + P + '.json', { headers: ETAG })).headers.etag;
  const n = {
    put: await verzoek('PUT', 'bron/' + P + '.json', { headers: Object.assign({ 'if-match': e0 }, ETAG), body: FICTIEF }),
    patch: await verzoek('PATCH', 'bron/' + P + '.json', { body: { extra: 1 } }),
    sub: await verzoek('PUT', 'bron/' + P + '/meta/x.json', { body: 1 }),
    del: await verzoek('DELETE', 'bron/' + P + '/extra.json'),
    post: await verzoek('POST', 'bron/' + P + '.json', { headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, ruw: true, body: JSON.stringify(FICTIEF) })
  };
  const naPost = await lees('bron/' + P);
  const pushSleutels = Object.keys(naPost || {}).filter(k => k.charAt(0) === '-');
  hard('S0', G, 'Nulmeting zonder slot: PUT (if-match), PATCH, subpad, DELETE en POST op de bron', 'alle 2xx',
    Object.keys(n).map(k => k + ' ' + n[k].status).join(', '), Object.keys(n).every(k => ok2xx(n[k].status)));
  vergelijk('S0b', G, 'POST (historische sendBeacon-vorm, text/plain) op de planner', 'maakt een nieuw kind met een push-ID in plaats van te overschrijven', 'D',
    'nieuwe push-sleutels: ' + pushSleutels.length + ', antwoord {name: <push-ID>}: ' + !!(n.post.json && n.post.json.name), pushSleutels.length === 1 && !!(n.post.json && n.post.json.name),
    { gevolg: 'Een oude POST-schrijver vervuilt de bron met een volledige kopie onder een push-ID. Het slot moet POST op de bron en elk subpad dus net zo weigeren als PUT.' });
  await weigering('S0c', G, 'Doel vóór het slot (A5)', 'doel/' + P, () => verzoek('PUT', 'doel/' + P + '.json', { headers: Object.assign({ 'if-match': 'null_etag' }, ETAG), body: { v: 1 } }));
  await zet('bron/' + P, FICTIEF);

  // Slot zetten.
  await weigering('S1', G, 'Slot zetten met een leeg object {}', 'ctl/' + P, () => verzoek('PUT', 'ctl/' + P + '/slot.json', { body: {} }));
  const slotLeeg = await lees('ctl/' + P + '/slot');
  hard('S1b', G, 'Na {} bestaat er geen slot', 'slot bestaat niet', JSON.stringify(slotLeeg), slotLeeg === null);
  await weigering('S2', G, 'Slot zetten via de ouder (ctl/p)', 'ctl/' + P, () => verzoek('PUT', 'ctl/' + P + '.json', { body: { slot: { door: 'proef', sinds: 1 } } }));
  const zetSlot = await verzoek('PUT', 'ctl/' + P + '/slot.json', { body: { door: 'migrator-proef', sinds: 1 } });
  hard('S3', G, 'Slot zetten op ctl/p/slot', '2xx en slot bestaat', zetSlot.status + ', ' + JSON.stringify(await lees('ctl/' + P + '/slot')), ok2xx(zetSlot.status) && !!(await lees('ctl/' + P + '/slot')));
  await weigering('S4', G, 'Slot een tweede keer zetten (andere inhoud)', 'ctl/' + P, () => verzoek('PUT', 'ctl/' + P + '/slot.json', { body: { door: 'ander', sinds: 2 } }));
  await weigering('S5', G, 'Slot wissen met DELETE', 'ctl/' + P, () => verzoek('DELETE', 'ctl/' + P + '/slot.json'));
  await weigering('S6', G, 'Slot wissen met PUT null', 'ctl/' + P, () => verzoek('PUT', 'ctl/' + P + '/slot.json', { body: null }));
  await weigering('S7', G, 'Slot wissen via de ouder (PUT ctl/p {})', 'ctl/' + P, () => verzoek('PUT', 'ctl/' + P + '.json', { body: {} }));
  await weigering('S8', G, 'Slot wissen via PATCH op de ouder', 'ctl/' + P, () => verzoek('PATCH', 'ctl/' + P + '.json', { body: { slot: null } }));
  await weigering('S9', G, 'Slot wissen via PATCH op root (meerdere paden)', 'ctl/' + P, () => verzoek('PATCH', '.json', { body: { ['ctl/' + P + '/slot']: null, 'vrij/s9': 1 } }), ['ctl/' + P, 'vrij/s9']);
  await weigering('S10', G, 'Slot wijzigen via een subpad', 'ctl/' + P, () => verzoek('PUT', 'ctl/' + P + '/slot/door.json', { body: 'ander' }));

  // Na het slot: elke schrijfvorm op de bron.
  const B = 'bron/' + P;
  const et = (await verzoek('GET', B + '.json', { headers: ETAG })).headers.etag;
  const vormen = [
    ['S11', 'PUT op de bron met actuele if-match', () => verzoek('PUT', B + '.json', { headers: Object.assign({ 'if-match': et }, ETAG), body: Object.assign({}, FICTIEF, { x: 1 }) })],
    ['S12', 'PUT op de bron zonder if-match (oude terugval)', () => verzoek('PUT', B + '.json', { body: { x: 1 } })],
    ['S13', 'PUT op de bron met ?print=silent', () => verzoek('PUT', B + '.json', { query: { print: 'silent' }, body: { x: 1 } })],
    ['S14', 'PATCH op de bron', () => verzoek('PATCH', B + '.json', { body: { x: 1 } })],
    ['S15', 'PATCH op de bron met null (verwijderen via PATCH)', () => verzoek('PATCH', B + '.json', { body: { taken: null } })],
    ['S16', 'DELETE op de bron', () => verzoek('DELETE', B + '.json')],
    ['S17', 'DELETE op de bron met actuele if-match', () => verzoek('DELETE', B + '.json', { headers: Object.assign({ 'if-match': et }, ETAG) })],
    ['S18', 'PUT op een subpad', () => verzoek('PUT', B + '/meta/x.json', { body: 1 })],
    ['S19', 'PATCH op een subpad', () => verzoek('PATCH', B + '/meta.json', { body: { x: 1 } })],
    ['S20', 'DELETE op een subpad', () => verzoek('DELETE', B + '/taken.json')],
    ['S21', 'POST op de bron (sendBeacon-vorm, text/plain)', () => verzoek('POST', B + '.json', { headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, ruw: true, body: JSON.stringify(FICTIEF) })],
    ['S22', 'POST op een subpad', () => verzoek('POST', B + '/taken.json', { body: { id: 't2' } })],
    ['S23', 'PUT op de ouder (bron)', () => verzoek('PUT', 'bron.json', { body: { [P]: { x: 1 } } })],
    ['S24', 'PATCH op de ouder (bron) met het hele kind', () => verzoek('PATCH', 'bron.json', { body: { [P]: { x: 1 } } })],
    ['S25', 'PATCH op de ouder (bron) met een dieper pad', () => verzoek('PATCH', 'bron.json', { body: { [P + '/meta/x']: 1 } })],
    ['S26', 'PATCH op root met een pad in de bron', () => verzoek('PATCH', '.json', { body: { [B + '/meta/x']: 1 } })],
    ['S27', 'PUT op root', () => verzoek('PUT', '.json', { body: { bron: { [P]: { x: 1 } } } })],
    ['S28', 'DELETE op root', () => verzoek('DELETE', '.json')]
  ];
  for (const [id, titel, doe] of vormen) await weigering(id, G, 'Na het slot: ' + titel, B, doe, [B, 'ctl/' + P, 'doel/' + P]);
  await weigering('S29', G, 'Na het slot: PATCH op root, doel (mag) + bron (mag niet) samen', B,
    () => verzoek('PATCH', '.json', { body: { ['doel/' + P + '/x']: 1, [B + '/meta/x']: 2 } }), [B, 'doel/' + P]);
  const bronNa = await lees(B);
  hard('S30', G, 'Bron na alle pogingen gelijk aan de stand bij het zetten van het slot', 'zelfde hash', hash(bronNa) + ' vs ' + hash(FICTIEF), hash(bronNa) === hash(FICTIEF));

  // Doel na het slot (A5): veilig initialiseren met "alleen als leeg"; een tweede migrator krijgt 412.
  const d1 = await verzoek('PUT', 'doel/' + P + '.json', { headers: Object.assign({ 'if-match': 'null_etag' }, ETAG), body: { v: 1 } });
  const d2 = await verzoek('PUT', 'doel/' + P + '.json', { headers: Object.assign({ 'if-match': 'null_etag' }, ETAG), body: { v: 2 } });
  const dNa = await lees('doel/' + P);
  hard('S31', G, 'Doel na het slot: eerste init "alleen als leeg" slaagt, tweede krijgt 412', '2xx, daarna 412; doel = eerste', d1.status + ' / ' + d2.status + ', doel ' + JSON.stringify(dNa),
    ok2xx(d1.status) && d2.status === 412 && hash(dNa) === hash({ v: 1 }));
}

// ── 6. Rapport ───────────────────────────────────────────────────────────────────────────────────
function rapportMd(meta) {
  const tel = o => resultaten.filter(r => r.oordeel === o).length;
  const regels = [];
  regels.push('# P1-3 emulatorproef: rapport', '');
  regels.push('Gegenereerd door `node tools/emulator/p1-3-proef.js`. Alleen fictieve data; harde lokale netwerkallowlist.', '');
  regels.push('- Emulator: `' + meta.jar + '`', '- Node: ' + process.version, '- Namespace: willekeurig per run (`huisplan-p13-…`)', '- Eigen netwerknamespace (--netns): ' + (meta.netns ? 'ja' : 'nee'), '');
  regels.push('| Oordeel | Aantal |', '| --- | --- |');
  for (const o of ['geslaagd', 'gelijk', 'onbekend', 'emulator', 'niet-uitgevoerd', 'afwijkend', 'mislukt']) regels.push('| ' + o + ' | ' + tel(o) + ' |');
  regels.push('');
  let groep = null;
  for (const r of resultaten) {
    if (r.groep !== groep) { groep = r.groep; regels.push('', '## ' + groep, '', '| ID | Controle | Verwachting | Bron | Emulator | Oordeel |', '| --- | --- | --- | --- | --- | --- |'); }
    const esc = s => String(s).replace(/\|/g, '\\|');
    regels.push('| ' + [r.id, r.titel, r.verwachting, r.bron, r.waargenomen, r.oordeel].map(esc).join(' | ') + ' |');
  }
  const gevolgen = resultaten.filter(r => r.gevolg);
  if (gevolgen.length) { regels.push('', '## Gevolgen voor het ontwerp', ''); for (const r of gevolgen) regels.push('- **' + r.id + ':** ' + r.gevolg); }
  return regels.join('\n') + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  const arg = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : null; };
  if (args.includes('--netns') && process.env.P13_NETNS !== '1') {
    const rest = args.filter(a => a !== '--netns');
    const r = spawnSync('unshare', ['-rn', 'python3', '-I', path.join(__dirname, 'zonder-netwerk.py'), process.execPath, __filename, ...rest], { stdio: 'inherit' });
    if (r.error) { console.error('--netns niet beschikbaar: ' + r.error.message); process.exit(2); }
    process.exit(r.status === null ? 1 : r.status);
  }
  // Mutatietest: bewijst dat de proef een te ruime regel echt betrapt (tests/emulatorproef.test.js).
  if (process.env.P13_MUTATIE === 'open-bron') PROEFREGELS.rules.bron.$p['.write'] = 'true';
  const jar = vindJar(arg('jar'));
  if (!jar || !fs.existsSync(jar)) {
    console.error('Geen emulator-jar gevonden. Zie tools/emulator/README.md (eenmalig: npx firebase-tools setup:emulators:database).');
    process.exit(2);
  }
  const emu = await startEmulator(jar);
  BASIS = 'http://127.0.0.1:' + emu.poort + '/';
  NS = 'huisplan-p13-' + crypto.randomBytes(4).toString('hex');
  let fout = null;
  try {
    // Gereedheid: "Listening at" in de log is niet genoeg; wacht op een geslaagd verzoek.
    for (let i = 0; ; i++) {
      try { if ((await verzoek('GET', '.json', { admin: true })).status === 200) break; } catch (e) { if (i >= 100) throw e; }
      await new Promise(r => setTimeout(r, 100));
    }
    const r = await verzoek('PUT', '.settings/rules.json', { admin: true, body: PROEFREGELS });
    if (r.status !== 200) throw new Error('Proefregels laden mislukt: ' + r.status + ' ' + r.text);
    await controlesIsolatie();
    await controlesETag();
    await controlesLeeg();
    await controlesRegels();
    await controlesSlotmatrix();
  } catch (e) { fout = e; if (emu.proc.exitCode !== null) fout = new Error(String(e && e.message) + '\nEmulator gestopt (code ' + emu.proc.exitCode + '):\n' + emu.log().slice(-1500)); } finally { emu.proc.kill(); }
  const meta = { jar: path.basename(jar), netns: process.env.P13_NETNS === '1', mutatie: process.env.P13_MUTATIE || null };
  const out = arg('out');
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'p1-3-rapport.md'), rapportMd(meta));
    fs.writeFileSync(path.join(out, 'p1-3-rapport.json'), JSON.stringify({ meta, resultaten }, null, 2) + '\n');
  }
  if (args.includes('--json')) console.log(JSON.stringify({ meta, resultaten, fout: fout && String(fout.stack || fout) }));
  else {
    for (const r of resultaten) console.log((r.oordeel === 'mislukt' || r.oordeel === 'afwijkend' ? '✗ ' : '  ') + r.id.padEnd(5) + r.oordeel.padEnd(10) + r.titel + ' — ' + r.waargenomen);
    if (fout) console.error('FOUT: ' + (fout.stack || fout));
  }
  const slecht = resultaten.filter(r => r.oordeel === 'mislukt' || r.oordeel === 'afwijkend').length;
  process.exit(fout || slecht ? 1 : 0);
}

if (require.main === module) main();
module.exports = { controleerBestemming, AllowlistFout, PROEFREGELS };
