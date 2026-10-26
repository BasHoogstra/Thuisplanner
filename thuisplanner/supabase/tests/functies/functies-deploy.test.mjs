// Thuisplanner-staging, stap 5: de controles rond het deployen van de Edge Functions (staging/functies.mjs). Zonder
// netwerk. De Huisplan-kenmerken komen uit de Huisplan-README (ze staan nergens in thuisplanner/).
//   node --test thuisplanner/supabase/tests/functies/functies-deploy.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { configFouten, FUNCTIES, gitFouten, kenmerkFouten, lijstFouten, mapFouten } from '../../staging/functies.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const STAGING = JSON.parse(readFileSync(path.join(HIER, '../../../omgevingen.json'), 'utf8')).staging.supabaseRef;
const HUISPLAN = [...readFileSync(path.join(HIER, '../../../../supabase/README.md'), 'utf8').matchAll(/`([a-z]{20})`/g)].map(m => m[1]);
const CONFIG = readFileSync(path.join(HIER, '../../config.toml'), 'utf8').replace(/\r\n/g, '\n');

test('kenmerk: alleen het vastgelegde stagingproject; nooit Huisplan, een ander project of een andere omgeving', () => {
  assert.deepEqual(kenmerkFouten(STAGING), []);
  assert.ok(HUISPLAN.length > 0);
  for (const r of HUISPLAN) assert.match(kenmerkFouten(r).join(), /Huisplan/);
  assert.match(kenmerkFouten('abcdefghijklmnopqrst').join(), /wijkt af/);
  assert.match(kenmerkFouten(STAGING, 'beta').join(), /hoort bij de omgeving staging/);
  for (const r of ['', undefined, 'KORT', STAGING.toUpperCase(), STAGING + 'x']) assert.ok(kenmerkFouten(r).length, String(r));
});

test('functiemappen: precies de vier functies (gedeelde code telt niet mee)', () => {
  assert.deepEqual(mapFouten(['_gedeeld', ...FUNCTIES]), []);
  assert.match(mapFouten(['_gedeeld', ...FUNCTIES, 'proef']).join(), /functiemappen/);
  assert.match(mapFouten(['_gedeeld', 'stuur-code']).join(), /functiemappen/);
});

test('config.toml: elke functie met verify_jwt = false; de echte config klopt', () => {
  assert.deepEqual(configFouten(CONFIG), []);
  assert.match(configFouten(CONFIG.replace(/(\[functions\.mail-bezorging\]\n)verify_jwt = false/, '$1verify_jwt = true')).join(), /mail-bezorging zonder verify_jwt/);
  assert.match(configFouten(CONFIG.replace('[functions.stuur-code]', '[functions.iets-anders]')).join(), /mist \[functions\.stuur-code\]/);
});

test('git: niets ongecommit in functions/ of config.toml', () => {
  assert.deepEqual(gitFouten(''), []);
  assert.match(gitFouten(' M thuisplanner/supabase/functions/stuur-code/index.ts\n').join(), /niet-gecommitte/);
});

test('na het deployen: precies de vier, actief, verify_jwt uit; elke afwijking gemeld', () => {
  const goed = FUNCTIES.map((slug, i) => ({ slug, name: slug, status: 'ACTIVE', version: i + 1, verify_jwt: false }));
  assert.deepEqual(lijstFouten(goed), []);
  assert.match(lijstFouten(goed.slice(1)).join(), /functies online/);
  assert.match(lijstFouten([...goed, { slug: 'oud', status: 'ACTIVE', verify_jwt: false }]).join(), /functies online/);
  assert.match(lijstFouten(goed.map((x, i) => (i ? x : { ...x, verify_jwt: true }))).join(), /verify_jwt staat niet uit/);
  assert.match(lijstFouten(goed.map((x, i) => (i ? x : { ...x, verify_jwt: undefined }))).join(), /verify_jwt staat niet uit/);
  assert.match(lijstFouten(goed.map((x, i) => (i ? x : { ...x, status: 'THROTTLED' }))).join(), /status THROTTLED/);
  assert.match(lijstFouten({}).join(), /geen lijst/);
});
