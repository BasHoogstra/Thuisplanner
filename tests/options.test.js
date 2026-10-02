// Stap 0.11: briefing, seizoenstips en weekscore zijn per toestel uit te zetten; standaard aan.
'use strict';
const { openApp, readFixture, assert } = require('./lib');

module.exports = {
  async 'standaard staat alles aan zoals voorheen'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx, settle: 2300, localStorage: { briefingShown: null } });
    assert(await page.isVisible('#briefingOverlay'), 'Briefing opent niet meer vanzelf');
    await page.click('#briefingStartBtn');
    assert(await page.isVisible('#seasonBanner'), 'Seizoenstip ontbreekt');
    assert(await page.isVisible('#weekScoreBanner'), 'Weekscore ontbreekt');
    await page.click('[data-view="meerView"]'); await page.click('#settingsBtn'); await page.waitForTimeout(300);
    for (const id of ['optBriefing', 'optSeason', 'optWeekScore']) assert(await page.isChecked('#' + id), id + ' staat niet aan');
    await c.close();
  },

  async 'uitgezet: niets verschijnt, briefing blijft met de knop te openen'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx, settle: 2300, localStorage: { briefingShown: null, plannerOptBriefing: '0', plannerOptSeason: '0', plannerOptWeekScore: '0' } });
    assert(!(await page.isVisible('#briefingOverlay')), 'Briefing opent toch');
    assert(!(await page.isVisible('#seasonBanner')), 'Seizoenstip verschijnt toch');
    assert(!(await page.isVisible('#weekScoreBanner')), 'Weekscore verschijnt toch');
    await page.click('#openBriefingBtn'); await page.waitForTimeout(300);
    assert(await page.isVisible('#briefingOverlay'), 'Briefing is niet meer met de knop te openen');
    await c.close();
  },

  async 'schakelaar in Instellingen werkt direct en blijft bewaard'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx, settle: 2300 });
    await page.click('[data-view="meerView"]'); await page.click('#settingsBtn'); await page.waitForTimeout(300);
    await page.click('label[for="optSeason"]');
    assert(await page.evaluate(() => localStorage.getItem('plannerOptSeason')) === '0', 'Keuze niet bewaard');
    assert(!(await page.isVisible('#seasonBanner')), 'Seizoenstip verdwijnt niet direct');
    await page.reload(); await page.waitForTimeout(2300);
    assert(!(await page.isVisible('#seasonBanner')), 'Na herladen staat de seizoenstip er weer');
    await c.close();
  },
};
