// Thuisplanner: de nacontrole eist dat het Vault-adres van de wachtrij online met https:// begint (stagingreview L5).
// Zonder database: vaultFouten en naFouten met een opgebouwde stand, en leesNa met een nagebootste verbinding die
// alleen bijhoudt welke vragen er gesteld worden. Er staat nergens een echt adres of geheim in.
//   node --experimental-strip-types --test tests/functies/nacontrole-vault.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leesNa, naFouten, repoVersies, vaultFouten } from '../../staging/verbinding-controle.mjs';

const BEIDE = ['thuisplanner_wachtrij_geheim', 'thuisplanner_wachtrij_url'];
const HTTPS_FOUT = /^Vault-adres thuisplanner_wachtrij_url begint niet met https:\/\//;

test('L5: een https-adres is in orde; http, een ander begin of "niet te lezen" is een afwijking (fail-closed)', () => {
  assert.deepEqual(vaultFouten(BEIDE, true), []);
  for (const stand of [false, null, undefined]) {
    const f = vaultFouten(BEIDE, stand);
    assert.equal(f.length, 1, `stand ${stand}`);
    assert.match(f[0], HTTPS_FOUT);
  }
});

test('L5: zonder adres in Vault alleen "Vault mist" (verwacht tot stap 6), geen dubbele https-melding', () => {
  const f = vaultFouten(['thuisplanner_wachtrij_geheim'], null);
  assert.deepEqual(f, ['Vault mist thuisplanner_wachtrij_url: uitnodigingsmails blijven wachten']);
  assert.equal(vaultFouten([], null).length, 2);
  assert.equal(vaultFouten(undefined, undefined).length, 2);
});

test('L5: naFouten neemt de https-eis mee; dat is het enige verschil tussen https en http', () => {
  const basis = { versies: repoVersies(), zonderRls: [], zonderPolicy: [], anonRechten: [], anonPrivate: false, definerPubliek: [],
    realtime: [], cron: [], schema: [], adressen: null, instellingen: null, opslag: null, pgNet: true, vaultNamen: BEIDE, wachtrij: null };
  const goed = naFouten({ ...basis, vaultUrlHttps: true }, repoVersies());
  const fout = naFouten({ ...basis, vaultUrlHttps: false }, repoVersies());
  assert.ok(!goed.some(x => HTTPS_FOUT.test(x)));
  assert.deepEqual(fout.filter(x => !goed.includes(x)).map(x => HTTPS_FOUT.test(x)), [true]);
  // Tegenproef: een stand zonder het veld (zoals een nacontrole van vóór L5 hem opleverde) wordt niet stilzwijgend goed.
  const oud = naFouten({ ...basis }, repoVersies());
  assert.ok(oud.some(x => HTTPS_FOUT.test(x)));
});

/** Een nagebootste verbinding: beantwoordt elke vraag met een plausibele rij en onthoudt de SQL. */
function nepClient(antwoordHttps) {
  const vragen = [];
  return {
    vragen,
    async query(sql) {
      vragen.push(sql);
      if (/from vault\.secrets/.test(sql)) return { rows: BEIDE.map(name => ({ name })) };
      if (/from vault\.decrypted_secrets/.test(sql)) return { rows: [{ ok: antwoordHttps }] };
      return { rows: [{ er: true, n: 1 }] };
    },
  };
}

test('L5: leesNa vraagt de database alleen om ja/nee, nooit om het adres zelf, en alleen lezend', async () => {
  for (const antwoord of [true, false, null]) {
    const c = nepClient(antwoord);
    const n = await leesNa(c);
    assert.equal(n.vaultUrlHttps, antwoord);
    assert.equal(c.vragen[0], 'begin transaction read only');
    assert.equal(c.vragen.at(-1), 'rollback');
    const ontsleuteld = c.vragen.filter(q => /decrypted_secret/.test(q) && !/to_regclass/.test(q));
    assert.equal(ontsleuteld.length, 1);
    // Het enige wat terugkomt, is één boolean: geen kolom decrypted_secret in het resultaat.
    assert.match(ontsleuteld[0], /^select bool_and\(coalesce\(left\(decrypted_secret, 8\) = 'https:\/\/', false\)\) as ok from vault\.decrypted_secrets\s+where name = 'thuisplanner_wachtrij_url'$/);
  }
});
