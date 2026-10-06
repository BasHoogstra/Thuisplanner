// NW-01 / P1-3: de emulatorproef (tools/emulator/p1-3-proef.js).
// Deze tests hebben geen browser nodig. De proef zelf draait als apart proces, zodat de globale
// netwerkallowlist van de proef dit testproces niet raakt. Zonder emulator-jar (zie
// tools/emulator/README.md) worden alleen de statische controles gedaan.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { assert } = require('./lib');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'tools', 'emulator');
const PROEF = path.join(DIR, 'p1-3-proef.js');

function jarAanwezig() {
  if (process.env.HUISPLAN_EMULATOR_JAR) return fs.existsSync(process.env.HUISPLAN_EMULATOR_JAR);
  try { return fs.readdirSync(path.join(os.homedir(), '.cache', 'firebase', 'emulators')).some(f => /^firebase-database-emulator-v[\d.]+\.jar$/.test(f)); } catch (e) { return false; }
}
function netnsBeschikbaar() {
  const r = spawnSync('unshare', ['-rn', 'python3', '-I', path.join(DIR, 'zonder-netwerk.py'), 'true'], { timeout: 10000 });
  return !r.error && r.status === 0;
}
function draai(env) {
  const args = [PROEF, '--json'];
  if (netnsBeschikbaar()) args.push('--netns');
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 180000, env: Object.assign({}, process.env, env || {}) });
  const regel = String(r.stdout || '').trim().split('\n').filter(l => l.charAt(0) === '{').pop();
  assert(regel, 'Geen JSON-uitvoer van de proef:\n' + r.stdout + '\n' + r.stderr);
  return { code: r.status, uit: JSON.parse(regel) };
}
const VERWACHT = []
  .concat(['N1', 'N2', 'N3', 'N4', 'N5', 'N6'])
  .concat(Array.from({ length: 14 }, (_, i) => 'E' + (i + 1)))
  .concat(['L1', 'L1b', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8'])
  .concat(Array.from({ length: 10 }, (_, i) => 'R' + (i + 1)))
  .concat(['S0', 'S0b', 'S0c', 'S1', 'S1b']).concat(Array.from({ length: 30 }, (_, i) => 'S' + (i + 2)));

module.exports = {
  async 'emulatorproef: alleen lokaal, geen productieadressen, geen regels om te publiceren'() {
    const bestanden = fs.readdirSync(DIR).filter(f => /\.(js|py|md|json)$/.test(f));
    for (const f of bestanden) {
      const t = fs.readFileSync(path.join(DIR, f), 'utf8');
      assert(!/firebaseio\.com|firebasedatabase\.app|googleapis\.com/.test(t), f + ' bevat een Firebase-productieadres');
      assert(!/plannerDbUrl|plannerKey/.test(t), f + ' leest de koppeling van een echte planner');
    }
    // Geen Firebase-projectconfiguratie of regelbestand in de repo dat per ongeluk te deployen is.
    for (const f of ['firebase.json', '.firebaserc', 'database.rules.json']) {
      assert(!fs.existsSync(path.join(ROOT, f)), f + ' hoort niet in de repo');
    }
    const t = fs.readFileSync(PROEF, 'utf8');
    assert(/net\.Socket\.prototype\.connect = function/.test(t), 'De globale netwerkallowlist ontbreekt');
    assert(/'--host', '127\.0\.0\.1'/.test(t), 'De emulator moet alleen op loopback luisteren');
  },

  async 'emulatorproef: alle harde controles geslaagd en geen afwijking van bekend productiegedrag'() {
    if (!jarAanwezig()) { console.log('    (overgeslagen: geen emulator-jar; zie tools/emulator/README.md)'); return; }
    const { code, uit } = draai();
    assert(!uit.fout, 'Proef liep vast: ' + uit.fout);
    const slecht = uit.resultaten.filter(r => r.oordeel === 'mislukt' || r.oordeel === 'afwijkend');
    assert(!slecht.length, 'Niet geslaagd:\n' + slecht.map(r => r.id + ' ' + r.titel + ' — ' + r.waargenomen).join('\n'));
    assert(code === 0, 'Exitcode ' + code);
    const ids = uit.resultaten.map(r => r.id);
    const mist = VERWACHT.filter(i => !ids.includes(i));
    assert(!mist.length, 'Controles ontbreken: ' + mist.join(', '));
    // Zonder netwerknamespace is N6 'niet-uitgevoerd'; met namespace moet hij geslaagd zijn.
    const n6 = uit.resultaten.find(r => r.id === 'N6');
    assert(uit.meta.netns ? n6.oordeel === 'geslaagd' : n6.oordeel === 'niet-uitgevoerd', 'N6: ' + n6.oordeel);
  },

  async 'emulatorproef: betrapt een te ruime bronregel (mutatietest)'() {
    if (!jarAanwezig()) { console.log('    (overgeslagen: geen emulator-jar)'); return; }
    const { code, uit } = draai({ P13_MUTATIE: 'open-bron' });
    assert(code !== 0, 'Met een open bronregel moet de proef mislukken');
    const mislukt = uit.resultaten.filter(r => r.oordeel === 'mislukt').map(r => r.id);
    for (const id of ['S11', 'S12', 'S14', 'S16', 'S18', 'S21', 'S22', 'S25', 'S30']) {
      assert(mislukt.includes(id), id + ' had moeten mislukken met een open bronregel; mislukt: ' + mislukt.join(', '));
    }
  }
};
