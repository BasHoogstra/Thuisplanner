// Stap 0.10: teksten, toon en eerlijke herinneringen.
'use strict';
const { openApp, readFixture, assert } = require('./lib');

module.exports = {
  async 'weekscore zonder percentage of oordeel'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx, settle: 2200 }); // 2 oktober is een vrijdag
    assert(await page.isVisible('#weekScoreBanner'), 'Weekscore verschijnt niet op vrijdag');
    const t = await page.textContent('#weekScoreText');
    assert(t === 'Deze week samen 1 taak afgerond', 'Tekst: ' + t);
    await c.close();
  },

  async 'Gezins-DNA kiest geen winnaar'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await page.click('[data-view="meerView"]'); await page.click('#openGezinsDNA'); await page.waitForTimeout(300);
    const t = await page.textContent('#dnaGrid');
    assert(!t.includes('Meeste taken afgerond'), 'Er staat nog een winnaar');
    assert(t.includes('Samen afgerond'), '"Samen afgerond" ontbreekt');
    await c.close();
  },

  async 'herinnering legt uit wanneer de melding komt; overal "Verwijderen"'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await page.click('#openTodayBtn'); await page.waitForTimeout(300);
    await page.click('#sheetMoreBtn');
    assert((await page.textContent('#reminderNote')).includes('open is of op de achtergrond'), 'Uitleg bij herinnering ontbreekt');
    await page.click('#closeSheetBtn'); await page.waitForTimeout(300);
    await page.click('[data-view="bakjeView"]');
    await page.click('#bakjeList .bakje-row'); await page.waitForTimeout(300);
    const menu = await page.textContent('#addSheet');
    assert(menu.includes('Verwijderen') && !menu.includes('Weggooien'), 'Menu gebruikt nog "Weggooien"');
    await c.close();
  },
};
