// KomtGoed KG-1: het lokale databasefundament in komtgoed/supabase. Geen browser of netwerk nodig.
// De statische controles staan in komtgoed/supabase/tests/statisch.js (ook los en in CI te draaien).
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { assert } = require('./lib');
const statisch = require('../komtgoed/supabase/tests/statisch.js');

const ROOT = path.resolve(__dirname, '..');
const out = {};
for (const [naam, fn] of Object.entries(statisch)) {
  out['statisch: ' + naam] = async () => { const r = fn(); if (r) console.log('    (' + r + ')'); };
}

out['RLS-matrix (22 scenario\'s) en tegenproeven, lokaal (alleen als PostgreSQL aanwezig is)'] = async () => {
  const bin = process.env.PGBIN || '/usr/lib/postgresql/16/bin';
  if (!fs.existsSync(path.join(bin, 'initdb'))) { console.log('    (overgeslagen: geen PostgreSQL in ' + bin + ')'); return; }
  let uit;
  try {
    uit = execSync(path.join(ROOT, 'komtgoed', 'supabase', 'tests', 'run.sh') + ' --tegenproef 2>&1', { cwd: ROOT, timeout: 600000 }).toString();
  } catch (e) {
    throw new Error('KomtGoed-databasetests faalden:\n' + String(e.stdout || e.message).split('\n').filter(l => /ERROR|KG-T|TEGENPROEF|MISLUKT|migratie/.test(l)).join('\n'));
  }
  assert(/KG-RLS-tests geslaagd: 22 van 22/.test(uit), 'Niet alle KG-1-scenario\'s geslaagd:\n' + uit.slice(-800));
  const m = /Tegenproeven gevangen: (\d+) van (\d+)/.exec(uit);
  assert(m && m[1] === m[2], 'Niet elke tegenproef is gevangen:\n' + uit.slice(-800));
};

module.exports = out;
