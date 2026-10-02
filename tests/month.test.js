// Stap 0.7: maandweergave met stippen en een daglijst; tik selecteert, nogmaals tikken opent de dag.
'use strict';
const { openApp, readFixture, diffPaths, waitForPut, assert } = require('./lib');

const cell = (page, day) => page.locator('#daysGrid .day:not(.other-month)').nth(day - 1);

module.exports = {
  async 'maand toont stippen en de lijst van vandaag'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await page.click('#vandaagSeg [data-mode="maand"]'); await page.waitForTimeout(300);
    const today = cell(page, 2);
    assert((await today.getAttribute('class')).includes('selected'), 'Vandaag is niet geselecteerd');
    assert((await today.getAttribute('aria-label')).startsWith('vrijdag 2 oktober'), 'Toegankelijk label klopt niet: ' + await today.getAttribute('aria-label'));
    assert(await today.locator('.mdot').count() >= 5, 'Te weinig stippen bij 2 oktober');
    assert(await today.locator('.day-chip').count() === 0, 'Oude tekstchips staan er nog');
    const list = await page.textContent('#monthDayList');
    assert(list.includes('vrijdag 2 oktober') && list.includes('Vuilnis buiten zetten') && list.includes('Stofzuigen') && list.includes('Opa en oma logeren'), 'Daglijst onvolledig: ' + list.slice(0, 200));
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },

  async 'tik selecteert, nogmaals tikken opent het dagvenster'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await page.click('#vandaagSeg [data-mode="maand"]'); await page.waitForTimeout(300);
    await cell(page, 3).click(); await page.waitForTimeout(200);
    assert((await cell(page, 3).getAttribute('class')).includes('selected'), '3 oktober niet geselecteerd');
    assert((await page.textContent('#monthDayList')).includes('Voetbal Lynn'), 'Daglijst toont 3 oktober niet');
    assert(!(await page.isVisible('#sheetOverlay.open')), 'Dagvenster opent al bij de eerste tik');
    await cell(page, 3).click(); await page.waitForTimeout(400);
    assert(await page.isVisible('#sheetOverlay.open'), 'Dagvenster opent niet bij de tweede tik');
    assert((await page.textContent('#sheetTitle')).includes('zaterdag 3 oktober'), 'Verkeerde dag geopend');
    await c.close();
  },

  async 'afvinken in de daglijst raakt alleen die taak'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await page.click('#vandaagSeg [data-mode="maand"]'); await page.waitForTimeout(300);
    const b = state.puts;
    await page.locator('#monthDayList .list-row', { hasText: 'Cadeau oma' }).locator('.check').click();
    await waitForPut(state, b);
    assert(diffPaths(fx, state.db).join() === 'tasks.2026-10-02[t-cadeau].done', 'Onverwachte wijzigingen: ' + diffPaths(fx, state.db).join(', '));
    await c.close();
  },
};
