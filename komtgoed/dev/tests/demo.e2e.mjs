// Thuisplanner KG-5D: e2e-test van de syncdemo met twee echte browsersessies (Playwright, Chromium) tegen
// de lokale Supabase-stack. Elk account heeft een eigen browsercontext (eigen opslag, eigen verbinding).
//   cd komtgoed/dev && npm test          (SCHERMAFDRUKKEN=1 bewaart afbeeldingen in docs/afbeeldingen/)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { zetDemoKlaar } from '../seed.mjs';
import { startServer } from '../server.mjs';
import { lokaleSupabase } from '../omgeving.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const AFDRUKKEN = path.resolve(HIER, '../../../docs/afbeeldingen');
const GEHEIM = ['Tandarts (privé van Anna)', 'Tandartspraktijk Zuid', 'Privénotitie van Anna'];
let server, browser, basis, demo;
const ctx = {}, pagina = {};
const binnenB = [];   // alles wat Brams browser van de server ontving (HTTP-antwoorden en websocketframes)

const status = p => p.locator('[data-testid=status]');
// Wachten tot de server een bepaald aantal heeft (het label "niet bevestigd" verdwijnt al zodra het verzoek
// vertrekt; de rij staat er pas als het antwoord binnen is).
async function wachtOpAantal(aantal, naam, verwacht, ms = 15000) {
  const eind = Date.now() + ms;
  let n;
  while (Date.now() < eind) { n = await aantal(naam); if (n === verwacht) return n; await new Promise(r => setTimeout(r, 100)); }
  return n;
}
const namen = p => p.locator('[data-testid=boodschap]').evaluateAll(els => els.map(e => e.dataset.naam));
async function afdruk(naam, p) {
  if (!process.env.SCHERMAFDRUKKEN) return;
  mkdirSync(AFDRUKKEN, { recursive: true });
  await p.screenshot({ path: path.join(AFDRUKKEN, `thuisplanner-sync-${naam}.png`) });
}

before(async () => {
  demo = await zetDemoKlaar({ stil: true });
  server = await startServer({ poort: 0 });
  basis = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch(process.env.CHROMIUM_PAD ? { executablePath: process.env.CHROMIUM_PAD } : {});
  for (const als of ['anna', 'bram']) {
    ctx[als] = await browser.newContext({ viewport: { width: 640, height: 900 } });
    pagina[als] = await ctx[als].newPage();
    pagina[als].on('pageerror', e => { throw e; });
  }
  pagina.bram.on('response', async r => { try { binnenB.push(await r.text()); } catch { /* geen tekst */ } });
  pagina.bram.on('websocket', ws => ws.on('framereceived', f => binnenB.push(String(f.payload))));
  for (const als of ['anna', 'bram']) await pagina[als].goto(`${basis}/paneel.html?als=${als}`);
  for (const als of ['anna', 'bram']) await status(pagina[als]).filter({ hasText: 'Live verbonden' }).waitFor({ timeout: 30000 });
});

after(async () => {
  await browser?.close();
  server?.close();
});

test('Een wijziging op account A verschijnt op account B zonder te verversen (en andersom)', async () => {
  const a = pagina.anna, b = pagina.bram;
  await afdruk('1-start-bram', b);
  await a.fill('[data-testid=nieuw]', 'Hagelslag');
  await a.press('[data-testid=nieuw]', 'Enter');
  await b.locator('[data-testid=boodschap][data-naam="Hagelslag"]').waitFor({ timeout: 10000 });
  // B vinkt af; A ziet het.
  await b.locator('[data-testid=boodschap][data-naam="Brood"] [data-testid=vink]').check();
  await a.locator('[data-testid=boodschap][data-naam="Brood"].af').waitFor({ timeout: 10000 });
  // A verwijdert; B ziet het verdwijnen.
  await a.locator('[data-testid=boodschap][data-naam="Pindakaas"] [data-testid=verwijder]').click();
  await b.locator('[data-testid=boodschap][data-naam="Pindakaas"]').waitFor({ state: 'detached', timeout: 10000 });
  assert.equal((await namen(b)).filter(n => n === 'Hagelslag').length, 1, 'Hagelslag dubbel bij B');
  await afdruk('2-live-bram', b);
});

test('Verbinding weg en terug: status "Geen verbinding", daarna de gemiste wijziging alsnog', async () => {
  const a = pagina.anna, b = pagina.bram;
  await ctx.bram.setOffline(true);
  await status(b).filter({ hasText: 'Geen verbinding' }).waitFor({ timeout: 20000 });
  await a.fill('[data-testid=nieuw]', 'Tijdens storing');
  await a.press('[data-testid=nieuw]', 'Enter');
  await a.locator('[data-testid=boodschap][data-naam="Tijdens storing"]').waitFor();
  await b.waitForTimeout(1500);
  assert.ok(!(await namen(b)).includes('Tijdens storing'));
  await afdruk('3-offline-bram', b);
  await ctx.bram.setOffline(false);
  await b.locator('[data-testid=boodschap][data-naam="Tijdens storing"]').waitFor({ timeout: 45000 });
  await status(b).filter({ hasText: 'Live verbonden' }).waitFor({ timeout: 45000 });
});

test('Tegelijk dezelfde boodschap wijzigen: conflictmelding, de nieuwste versie blijft staan', async () => {
  const a = pagina.anna, b = pagina.bram;
  await b.locator('[data-testid=boodschap][data-naam="Melk"] [data-testid=wijzig]').click();   // B begint
  await a.locator('[data-testid=boodschap][data-naam="Melk"] [data-testid=wijzig]').click();   // A ook
  await a.fill('[data-testid=bewerk-invoer]', 'Melk (vol)');
  await a.click('[data-testid=bewaar]');                                                       // A bewaart eerst
  await a.locator('[data-testid=boodschap][data-naam="Melk (vol)"]').waitFor();
  await b.fill('[data-testid=bewerk-invoer]', 'Melk (half)');
  await b.click('[data-testid=bewaar]');                                                       // B met de oude versie
  const melding = b.locator('[data-testid=melding][data-soort=conflict]');
  await melding.waitFor({ timeout: 10000 });
  assert.match(await melding.textContent(), /Iemand anders heeft dit net aangepast/);
  await b.locator('[data-testid=boodschap][data-naam="Melk (vol)"]').waitFor({ timeout: 10000 });
  assert.ok(!(await namen(b)).includes('Melk (half)'));
  await afdruk('4-conflict-bram', b);
});

test('Privacy: privé-afspraak volledig bij Anna, bij Bram alleen "Bezet" (scherm, API, realtime en geheugen)', async () => {
  const a = pagina.anna, b = pagina.bram;
  assert.ok((await a.locator('[data-testid=afspraak-titel]').allTextContents()).includes(GEHEIM[0]));
  const bijB = await b.locator('[data-testid=afspraak-titel]').allTextContents();
  assert.ok(bijB.includes('Bezet'));
  assert.equal(await b.locator('[data-testid=afspraak][data-bezet=true]').count(), 1);
  const html = await b.content();
  const cache = await b.evaluate(() => JSON.stringify(window.__thuisplannerDemo.toestand));
  for (const g of GEHEIM) {
    assert.ok(!html.includes(g), 'privé-tekst in de pagina van Bram: ' + g);
    assert.ok(!cache.includes(g), 'privé-tekst in de clientcache van Bram: ' + g);
    assert.ok(!binnenB.some(x => x.includes(g)), 'privé-tekst in een antwoord of websocketbericht aan Bram: ' + g);
  }
  assert.ok(binnenB.length > 10, 'opzet: er is verkeer naar Bram vastgelegd');
  await afdruk('5-privacy-anna', a);
  await afdruk('5-privacy-bram', b);
});

test('Antwoord verloren: "niet bevestigd" (nooit "niet opgeslagen"); na herladen bevestigd of opnieuw geprobeerd, nooit dubbel', async () => {
  const a = pagina.anna;
  const { API_URL, ANON_KEY } = lokaleSupabase();
  const controle = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ifError((await controle.auth.signInWithPassword({ email: 'anna.demo@test.invalid', password: 'thuisplanner-demo-lokaal' })).error);
  const aantal = async naam => (await controle.from('shopping_items').select('id').eq('household_id', demo.huishouden).eq('name', naam).is('deleted_at', null)).data.length;
  const rij = naam => a.locator(`[data-testid=boodschap][data-naam="${naam}"]`);
  const toevoegen = async naam => { await a.fill('[data-testid=nieuw]', naam); await a.press('[data-testid=nieuw]', 'Enter'); };
  // (1) De server slaat op, maar het antwoord gaat verloren.
  await a.route('**/rest/v1/rpc/add_shopping_items', async r => { await r.fetch(); await r.abort('connectionfailed'); }, { times: 1 });
  await toevoegen('Appelstroop');
  // De melding zegt "niet bevestigd"; het label bij het item kan heel kort zijn, want de volgende
  // ophaalronde bevestigt een item dat de server wel heeft meteen (CI-run 38283608135).
  await a.locator('[data-testid=melding][data-soort=onzeker]').waitFor({ timeout: 10000 });
  await rij('Appelstroop').waitFor();
  assert.doesNotMatch(await a.locator('[data-testid=melding]').textContent(), /niet opgeslagen/i);
  assert.equal(await aantal('Appelstroop'), 1);
  // (2) Het verzoek bereikt de server nooit.
  await a.route('**/rest/v1/rpc/add_shopping_items', r => r.abort('connectionfailed'), { times: 1 });
  await toevoegen('Rozijnen');
  await rij('Rozijnen').locator('[data-testid=onbevestigd]').waitFor({ timeout: 10000 });
  assert.equal(await aantal('Rozijnen'), 0);
  await afdruk('7-onbevestigd-anna', a);
  // Herladen (herstart van de app): (1) wordt bevestigd zonder nieuwe verzending, (2) blijft
  // "niet bevestigd" met dezelfde UUID en wordt met "Opnieuw proberen" precies één keer opgeslagen.
  const idVoor = await a.evaluate(() => window.__thuisplannerDemo.toestand.boodschappen.find(b => b.name === 'Rozijnen').id);
  await a.reload();
  await status(a).filter({ hasText: 'Live verbonden' }).waitFor({ timeout: 30000 });
  await rij('Appelstroop').waitFor();
  assert.equal(await rij('Appelstroop').locator('[data-testid=onbevestigd]').count(), 0);
  await rij('Rozijnen').locator('[data-testid=onbevestigd]').waitFor({ timeout: 10000 });
  assert.equal(await a.evaluate(() => window.__thuisplannerDemo.toestand.boodschappen.find(b => b.name === 'Rozijnen').id), idVoor);
  await rij('Rozijnen').locator('[data-testid=opnieuw]').click();
  await rij('Rozijnen').locator('[data-testid=onbevestigd]').waitFor({ state: 'detached', timeout: 10000 });
  assert.equal(await wachtOpAantal(aantal, 'Rozijnen', 1), 1);
  assert.equal(await aantal('Appelstroop'), 1);
  assert.deepEqual((await namen(a)).filter(n => n === 'Appelstroop' || n === 'Rozijnen').sort(), ['Appelstroop', 'Rozijnen']);
  controle.realtime.disconnect();
});

test('Herstelronde 2: sluiten en heropenen, keuze bij een mogelijk dubbele invoer, offline invoer terug, opslag geweigerd', async () => {
  const { API_URL, ANON_KEY } = lokaleSupabase();
  const controle = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ifError((await controle.auth.signInWithPassword({ email: 'anna.demo@test.invalid', password: 'thuisplanner-demo-lokaal' })).error);
  const aantal = async naam => (await controle.from('shopping_items').select('id').eq('household_id', demo.huishouden).eq('name', naam).is('deleted_at', null)).data.length;
  let a = pagina.anna;
  const rij = naam => a.locator(`[data-testid=boodschap][data-naam="${naam}"]`);
  const toevoegen = async naam => { await a.fill('[data-testid=nieuw]', naam); await a.press('[data-testid=nieuw]', 'Enter'); };
  // Een toevoeging die de server niet bereikt; daarna sluit het tabblad (localStorage blijft).
  await a.route('**/rest/v1/rpc/add_shopping_items', r => r.abort('connectionfailed'), { times: 1 });
  await toevoegen('Krentenbollen');
  await rij('Krentenbollen').locator('[data-testid=onbevestigd]').waitFor({ timeout: 10000 });
  const id = await a.evaluate(() => window.__thuisplannerDemo.toestand.boodschappen.find(b => b.name === 'Krentenbollen').id);
  await a.close();
  a = pagina.anna = await ctx.anna.newPage();
  a.on('pageerror', e => { throw e; });
  await a.goto(`${basis}/paneel.html?als=anna`);
  await status(a).filter({ hasText: 'Live verbonden' }).waitFor({ timeout: 30000 });
  await rij('Krentenbollen').locator('[data-testid=onbevestigd]').waitFor({ timeout: 10000 });
  assert.equal(await a.evaluate(() => window.__thuisplannerDemo.toestand.boodschappen.find(b => b.name === 'Krentenbollen').id), id);
  // Dezelfde tekst opnieuw invoeren: niets verstuurd, eerst een keuze. "Opnieuw proberen" = dezelfde UUID.
  await toevoegen('Krentenbollen');
  await a.locator('[data-testid=melding][data-soort=mogelijk-dubbel]').waitFor();
  assert.equal(await aantal('Krentenbollen'), 0);
  await afdruk('8-keuze-anna', a);
  await a.locator('[data-testid=keuze-opnieuw]').click();
  await rij('Krentenbollen').locator('[data-testid=onbevestigd]').waitFor({ state: 'detached', timeout: 10000 });
  assert.equal(await wachtOpAantal(aantal, 'Krentenbollen', 1), 1);
  assert.equal((await controle.from('shopping_items').select('id').eq('name', 'Krentenbollen')).data[0].id, id);
  // Aantoonbaar offline: niets verstuurd, melding "niet opgeslagen" en de invoer staat weer in het veld.
  await ctx.anna.setOffline(true);
  await toevoegen('Offline-invoer');
  await a.locator('[data-testid=melding][data-soort=offline]').waitFor({ timeout: 10000 });
  assert.equal(await a.inputValue('[data-testid=nieuw]'), 'Offline-invoer', 'invoer ongemerkt verloren');
  await ctx.anna.setOffline(false);
  await a.fill('[data-testid=nieuw]', '');
  await status(a).filter({ hasText: 'Live verbonden' }).waitFor({ timeout: 45000 });
  // Een browser die opslag weigert: duidelijke waarschuwing.
  const weiger = await browser.newContext({ viewport: { width: 640, height: 900 } });
  await weiger.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('geweigerd', 'QuotaExceededError'); }; });
  const w = await weiger.newPage();
  await w.goto(`${basis}/paneel.html?als=anna`);
  await w.locator('[data-testid=opslag-waarschuwing]').waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await a.locator('[data-testid=opslag-waarschuwing]').isVisible(), false, 'waarschuwing terwijl opslag werkt');
  await weiger.close();
  controle.realtime.disconnect();
});

test('Toegang ingetrokken tijdens de sessie: Bram ziet "Geen toegang" en de lijst is leeg', async () => {
  const { API_URL, ANON_KEY } = lokaleSupabase();
  // Anna archiveert Bram (via haar eigen account, zoals in de app).
  const anna = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ifError((await anna.auth.signInWithPassword({ email: 'anna.demo@test.invalid', password: 'thuisplanner-demo-lokaal' })).error);
  const { data: leden } = await anna.from('household_members').select('id,display_name').eq('household_id', demo.huishouden);
  assert.ifError((await anna.rpc('archive_member', { p_household: demo.huishouden, p_member: leden.find(l => l.display_name === 'Bram').id })).error);
  const b = pagina.bram;
  await status(b).filter({ hasText: 'Geen toegang' }).waitFor({ timeout: 20000 });
  assert.equal(await b.locator('[data-testid=boodschap]').count(), 0);
  assert.equal(await b.locator('[data-testid=afspraak]').count(), 0);
  const cache = await b.evaluate(() => JSON.stringify(window.__thuisplannerDemo.toestand));
  assert.ok(!cache.includes('Melk') && !cache.includes('Ouderavond'), 'oude gegevens in het geheugen na intrekken');
  await afdruk('6-geen-toegang-bram', b);
});
