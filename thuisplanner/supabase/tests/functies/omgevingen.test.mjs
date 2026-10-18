// Thuisplanner: de omgevingen (thuisplanner/omgevingen.json) en de weigering in de verbindingscontrole
// (staging/verbinding-controle.mjs): staging, bèta en productie nooit door elkaar. Zonder netwerk.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leesOmgevingen, omgevingFouten } from '../../staging/verbinding-controle.mjs';

const O = leesOmgevingen();
const REF_A = 'aaaaaaaaaaaaaaaaaaaa', REF_B = 'bbbbbbbbbbbbbbbbbbbb';

test('omgevingen.json: drie app-omgevingen en de website, elk met een eigen doel; geen geheimen', () => {
  assert.deepEqual(Object.keys(O).filter(k => !k.startsWith('_')).sort(), ['beta', 'productie', 'staging', 'website']);
  for (const naam of ['staging', 'beta', 'productie']) {
    const o = O[naam];
    assert.match(o.appUrl, /^https:\/\//, naam);
    assert.match(o.mailAfzender, /<noreply@mail\.mijnthuisplanner\.nl>$/, naam);
    assert.equal(o.mailAdapter, 'lettermint', naam);
    assert.ok(o.supabaseRef === null || /^[a-z]{20}$/.test(o.supabaseRef), naam);
  }
  // Staging blijft intern achter Cloudflare Access en deelt geen Pages-project met de bèta of de website.
  assert.equal(O.staging.toegang, 'cloudflare-access');
  assert.notEqual(O.staging.pagesProject, O.beta.pagesProject);
  assert.notEqual(O.website.pagesProject, O.beta.pagesProject);
  assert.notEqual(O.website.pagesProject, O.staging.pagesProject);
  assert.equal(O.website.url, 'https://mijnthuisplanner.nl/');
  assert.doesNotMatch(JSON.stringify(O), /eyJ|whsec_|sk_|password|wachtwoord=|token/i);
  // Twee omgevingen met hetzelfde kenmerk mag niet.
  const refs = Object.values(O).map(o => o?.supabaseRef).filter(Boolean);
  assert.equal(new Set(refs).size, refs.length);
});

test('verbindingscontrole: alleen een bekende omgeving; een kenmerk van een andere omgeving wordt geweigerd', () => {
  const metRefs = { ...O, staging: { ...O.staging, supabaseRef: REF_A }, beta: { ...O.beta, supabaseRef: null } };
  assert.deepEqual(omgevingFouten('staging', REF_A, metRefs), []);
  assert.match(omgevingFouten('beta', REF_A, metRefs).join(), /hoort bij de omgeving staging/);
  assert.match(omgevingFouten('staging', REF_B, metRefs).join(), /wijkt af van het kenmerk van staging/);
  assert.deepEqual(omgevingFouten('beta', REF_B, metRefs), []);
  assert.match(omgevingFouten('website', REF_B, metRefs).join(), /staging, beta of productie/);
  assert.match(omgevingFouten('test', REF_B, metRefs).join(), /staging, beta of productie/);
  assert.match(omgevingFouten(undefined, REF_B, metRefs).join(), /staging, beta of productie/);
});
