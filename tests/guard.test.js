// Stap 0.2: bewaking van verhuizing (meta.migratedTo) en minimale app-versie (meta.minAppVersion).
'use strict';
const { openApp, readFixture, serverWrite, assert, diffPaths } = require('./lib');

async function addBood(page, text) {
  await page.evaluate(() => { const o = document.getElementById('writeGuardOverlay'); if (o) o.hidden = true; }); // overlay opzij om de UI te kunnen bedienen
  await page.click('[data-view="boodschappenView"]');
  await page.fill('#boodschapInput', text);
  await page.press('#boodschapInput', 'Enter');
  await page.waitForTimeout(1500);
}
const cacheHas = (page, text) => page.evaluate(t => Object.keys(localStorage).some(k => k.startsWith('plannerCache_') && localStorage.getItem(k).includes(t)), text);

module.exports = {
  async 'verhuisde planner: melding, niets opslaan, lokale wijziging blijft bewaard'(ctx) {
    const fx = readFixture('huishouden.json');
    fx.meta = { migratedTo: { householdId: 'h-123', at: '2026-10-02T09:00:00Z', url: 'https://example.org/app' } };
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    assert(await page.isVisible('#writeGuardOverlay'), 'Melding "verhuisd" niet zichtbaar');
    assert((await page.textContent('#writeGuardTitle')).includes('verhuisd'), 'Verkeerde titel');
    assert(await page.isVisible('#writeGuardBtn'), 'Knop naar de nieuwe Huisplan ontbreekt');
    assert(!(await page.isVisible('#writeGuardLocal')), 'Melding over lokale wijzigingen terwijl er geen zijn');
    await addBood(page, 'Pindakaas');
    assert(state.puts === 0, 'Er werd opgeslagen in een verhuisde planner (' + state.puts + 'x)');
    assert(await cacheHas(page, 'Pindakaas'), 'Lokale wijziging staat niet in de lokale cache');
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },

  async 'te oude app: melding verversen en niets opslaan'(ctx) {
    const fx = readFixture('huishouden.json');
    fx.meta = { minAppVersion: '99.0.0' };
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    assert(await page.isVisible('#writeGuardOverlay'), 'Melding "nieuwere versie" niet zichtbaar');
    assert((await page.textContent('#writeGuardBtn')).includes('verversen'), 'Knop verversen ontbreekt');
    await addBood(page, 'Pindakaas');
    assert(state.puts === 0, 'Te oude app sloeg toch op');
    await c.close();
  },

  async 'minimale versie gelijk of lager: app werkt gewoon'(ctx) {
    const fx = readFixture('huishouden.json');
    fx.meta = { minAppVersion: '1.0.0' };
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    assert(!(await page.isVisible('#writeGuardOverlay')), 'Melding verschijnt onterecht');
    const before = state.puts;
    await addBood(page, 'Pindakaas');
    assert(state.puts > before, 'Opslaan werkt niet meer');
    assert(state.db.meta && state.db.meta.minAppVersion === '1.0.0', 'meta is aangetast');
    await c.close();
  },

  async 'ander toestel verhuist tijdens gebruik: opslaan stopt na conflict'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    serverWrite(state, db => { db.meta = { migratedTo: { householdId: 'h-9', at: '2026-10-02T10:00:00Z' } }; });
    const snapshot = JSON.stringify(state.db);
    await addBood(page, 'Pindakaas');
    await page.waitForTimeout(1000);
    assert(JSON.stringify(state.db) === snapshot, 'Serverdata is na het verhuizen nog gewijzigd: ' + diffPaths(JSON.parse(snapshot), state.db).join(', '));
    assert(await page.isVisible('#writeGuardOverlay'), 'Melding "verhuisd" verschijnt niet na het conflict');
    assert(await page.isVisible('#writeGuardLocal'), 'Melding over de niet-opgeslagen boodschap ontbreekt');
    assert(await cacheHas(page, 'Pindakaas'), 'Lokale wijziging verloren');
    await c.close();
  },

  async 'markering weer weg: app gaat verder en slaat lokale wijziging alsnog op'(ctx) {
    const fx = readFixture('huishouden.json');
    fx.meta = { migratedTo: { householdId: 'h-1', at: '2026-10-02T09:00:00Z' } };
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await addBood(page, 'Pindakaas');
    assert(state.puts === 0, 'Opslaan terwijl verhuisd');
    serverWrite(state, db => { delete db.meta; });
    await page.reload(); await page.waitForTimeout(2500);
    assert(!(await page.isVisible('#writeGuardOverlay')), 'Melding blijft staan');
    assert(state.db.boodschappen.some(b => b.text === 'Pindakaas'), 'Lokale wijziging is na terugdraaien niet alsnog opgeslagen');
    await c.close();
  },
};
