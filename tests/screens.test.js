// Stap 0.9: oudere schermen in het design system; de functies blijven werken.
'use strict';
const { openApp, readFixture, diffPaths, waitForPut, assert } = require('./lib');

async function openMeer(page, id) { await page.click('[data-view="meerView"]'); await page.click('#' + id); await page.waitForTimeout(350); }

module.exports = {
  async 'Wie is waar: tikken wisselt de status en bewaart die onder de naam'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await openMeer(page, 'openWieIsWaar');
    assert(await page.locator('#wiwWeek .wiw-dag').count() === 7, 'Niet zeven dagen');
    assert(!(await page.textContent('#wiwWeek')).match(/[🏠💼✈🏃🌙⭐]/u), 'Er staan nog emoji als icoon');
    const chip = page.locator('#wiwWeek .wiw-dag').nth(4).locator('.wiw-chip').first(); // vrijdag, Bas
    assert((await chip.getAttribute('aria-label')).startsWith('Bas, vrijdag: thuis'), 'Label klopt niet: ' + await chip.getAttribute('aria-label'));
    const b = state.puts;
    await chip.click();
    await waitForPut(state, b);
    assert(state.db.wieIsWaar['2026-10-02'] && state.db.wieIsWaar['2026-10-02'].Bas === 'werk', 'Status niet opgeslagen: ' + JSON.stringify(state.db.wieIsWaar));
    assert(diffPaths(fx, state.db).join() === 'wieIsWaar.2026-10-02', 'Onverwachte wijzigingen: ' + diffPaths(fx, state.db).join(', '));
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },
};
