// Thuisplanner-staging, stap 5, en de bèta: de controles rond het deployen van de Edge Functions (staging/functies.mjs). Zonder
// netwerk. De Huisplan-kenmerken komen uit de Huisplan-README (ze staan nergens in thuisplanner/).
//   node --test thuisplanner/supabase/tests/functies/functies-deploy.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { configFouten, FUNCTIES, gitFouten, kenmerkFouten, lijstFouten, mapFouten, OMGEVINGEN } from '../../staging/functies.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const STAGING = JSON.parse(readFileSync(path.join(HIER, '../../../omgevingen.json'), 'utf8')).staging.supabaseRef;
const HUISPLAN = [...readFileSync(path.join(HIER, '../../../../supabase/README.md'), 'utf8').matchAll(/`([a-z]{20})`/g)].map(m => m[1]);
// Een verzonnen bètakenmerk (staat bij geen enkele omgeving).
const BETA = 'bbbbbbbbbbbbbbbbbbbb';
const CONFIG = readFileSync(path.join(HIER, '../../config.toml'), 'utf8').replace(/\r\n/g, '\n');

test('kenmerk: alleen het vastgelegde stagingproject; nooit Huisplan, een ander project of een andere omgeving', () => {
  assert.deepEqual(kenmerkFouten(STAGING), []);
  assert.ok(HUISPLAN.length > 0);
  for (const r of HUISPLAN) assert.match(kenmerkFouten(r).join(), /Huisplan/);
  assert.match(kenmerkFouten('abcdefghijklmnopqrst').join(), /wijkt af/);
  assert.match(kenmerkFouten(STAGING, 'beta').join(), /hoort bij de omgeving staging/);
  for (const r of ['', undefined, 'KORT', STAGING.toUpperCase(), STAGING + 'x']) assert.ok(kenmerkFouten(r).length, String(r));
});

test('bèta (-Omgeving beta): alleen het vastgelegde bètaproject; zolang dat ontbreekt, geweigerd', () => {
  const O = JSON.parse(readFileSync(path.join(HIER, '../../../omgevingen.json'), 'utf8'));
  assert.equal(O.beta.supabaseRef, null);
  // Nu: geen bètaproject vastgelegd, dus elk kenmerk geweigerd (ook het verzonnen bètakenmerk hieronder).
  assert.match(kenmerkFouten(BETA, 'beta').join(), /Voor beta staat nog geen projectkenmerk/);
  assert.match(kenmerkFouten(STAGING, 'beta').join(), /hoort bij de omgeving staging/);
  // Straks (zoals na stap C3), met een verzonnen bètakenmerk: alleen dat project, staging en bèta nooit door elkaar.
  const MET_BETA = { ...O, beta: { ...O.beta, supabaseRef: BETA } };
  assert.deepEqual(kenmerkFouten(BETA, 'beta', MET_BETA), []);
  assert.match(kenmerkFouten(STAGING, 'beta', MET_BETA).join(), /hoort bij de omgeving staging/);
  assert.match(kenmerkFouten(BETA, 'staging', MET_BETA).join(), /hoort bij de omgeving beta/);
  assert.match(kenmerkFouten('abcdefghijklmnopqrst', 'beta', MET_BETA).join(), /wijkt af/);
  for (const r of HUISPLAN) assert.match(kenmerkFouten(r, 'beta', MET_BETA).join(), /Huisplan/);
  // Tegenproef: productie of een onbekende omgeving kan hier niet (zelfde lijst als -Omgeving in functies.ps1).
  assert.deepEqual(OMGEVINGEN, ['staging', 'beta']);
  for (const o of ['productie', 'acceptatie', '']) assert.match(kenmerkFouten(STAGING, o).join(), /omgeving moet staging of beta zijn/);
  assert.match(readFileSync(path.join(HIER, '../../staging/functies.ps1'), 'utf8'), /\[ValidateSet\('staging', 'beta'\)\]\[string\]\$Omgeving = 'staging'/);
});

test('de opdracht zelf: geweigerd vóór er iets gebeurt (bèta zonder kenmerk, productie, een Huisplan-project)', () => {
  const draai = (...a) => spawnSync(process.execPath, [path.join(HIER, '../../staging/functies.mjs'), ...a], { encoding: 'utf8' });
  for (const [args, tekst] of [[['vooraf', BETA, 'beta'], /Voor beta staat nog geen projectkenmerk/], [['vooraf', STAGING, 'beta'], /hoort bij de omgeving staging/],
    [['vooraf', STAGING, 'productie'], /omgeving moet staging of beta zijn/], [['na', BETA, 'beta'], /Voor beta staat nog geen projectkenmerk/],
    ...HUISPLAN.map(r => [['vooraf', r, 'beta'], /Huisplan/])]) {
    const r = draai(...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stdout, /GEWEIGERD/);
    assert.match(r.stdout, tekst);
  }
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

test('na het deployen: precies de functies van FUNCTIES, actief, verify_jwt uit; elke afwijking gemeld', () => {
  const goed = FUNCTIES.map((slug, i) => ({ slug, name: slug, status: 'ACTIVE', version: i + 1, verify_jwt: false }));
  assert.deepEqual(lijstFouten(goed), []);
  assert.match(lijstFouten(goed.slice(1)).join(), /functies online/);
  assert.match(lijstFouten([...goed, { slug: 'oud', status: 'ACTIVE', verify_jwt: false }]).join(), /functies online/);
  assert.match(lijstFouten(goed.map((x, i) => (i ? x : { ...x, verify_jwt: true }))).join(), /verify_jwt staat niet uit/);
  assert.match(lijstFouten(goed.map((x, i) => (i ? x : { ...x, verify_jwt: undefined }))).join(), /verify_jwt staat niet uit/);
  assert.match(lijstFouten(goed.map((x, i) => (i ? x : { ...x, status: 'THROTTLED' }))).join(), /status THROTTLED/);
  assert.match(lijstFouten({}).join(), /geen lijst/);
});
