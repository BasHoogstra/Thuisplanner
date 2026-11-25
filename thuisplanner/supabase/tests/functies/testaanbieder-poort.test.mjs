// De nagebootste mailaanbieder op een vaste poort (testaanbieder.mjs): een poort die even bezet is, mag de mailtests niet
// meer laten vallen (EADDRINUSE in de CI van PR #56 en #60, 25 november 2026). Zonder stack of netwerk naar buiten.
//   node --test thuisplanner/supabase/tests/functies/testaanbieder-poort.test.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { luisterMetGeduld } from '../integratie/testaanbieder.mjs';

const vrijePoort = () => new Promise(ok => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const bezet = poort => new Promise(ok => { const s = createServer(); s.listen(poort, '127.0.0.1', () => ok(s)); });
const dicht = s => new Promise(ok => s.close(() => ok()));

test('de poort komt na even wachten vrij: de aanbieder luistert alsnog, en zegt één keer wie hem had', async () => {
  const poort = await vrijePoort();
  const bezetter = await bezet(poort);
  setTimeout(() => { void dicht(bezetter); }, 250);
  const meldingen = [];
  const server = createServer();
  await luisterMetGeduld(server, poort, '127.0.0.1', { pogingen: 20, wachtMs: 100, meld: m => meldingen.push(m) });
  assert.equal(server.address().port, poort);
  assert.match(meldingen[0], new RegExp(`poort ${poort} bezet`));
  assert.match(meldingen.at(-1), /vrij na \d+ pogingen/);
  await dicht(server);
});

test('blijft de poort bezet, dan een duidelijke fout na het maximum aantal pogingen (geen eindeloos wachten)', async () => {
  const poort = await vrijePoort();
  const bezetter = await bezet(poort);
  const server = createServer();
  await assert.rejects(luisterMetGeduld(server, poort, '127.0.0.1', { pogingen: 3, wachtMs: 50, meld: () => {} }),
    e => e.code === 'EADDRINUSE' && /na 3 pogingen nog bezet/.test(e.message));
  await dicht(bezetter);
});

test('een vrije poort: meteen, zonder meldingen', async () => {
  const poort = await vrijePoort();
  const meldingen = [];
  const server = createServer();
  await luisterMetGeduld(server, poort, '127.0.0.1', { meld: m => meldingen.push(m) });
  assert.deepEqual(meldingen, []);
  await dicht(server);
});

test('een andere fout dan EADDRINUSE: meteen doorgeven, niet opnieuw proberen', async () => {
  const server = createServer();
  let pogingen = 0;
  await assert.rejects(luisterMetGeduld(server, 0, 'dit-adres-bestaat-niet.invalid', { pogingen: 5, wachtMs: 10, meld: () => { pogingen++; } }),
    e => e.code !== 'EADDRINUSE');
  assert.equal(pogingen, 0);
});
