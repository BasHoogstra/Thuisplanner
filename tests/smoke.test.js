// Rooktest: elk scherm opent zonder JavaScript-fouten, past op een telefoon,
// en alleen openen en bekijken verandert geen data.
'use strict';
const { openApp, readFixture, diffPaths, assert, shotPath } = require('./lib');

const MEER = ['openOnderhoud', 'openGaranties', 'openBestellingen', 'openVakanties', 'openWieIsWaar', 'openBudget',
  'openMaaltijdplanner', 'openRecepten', 'openVasteTaken', 'openGewoonten', 'openNotitieboek', 'openBacklog',
  'openVerjaardagen', 'openVerlanglijst', 'openWeekOverzicht', 'openStatistieken', 'openGezinsDNA', 'openHuisgeheugen',
  'openKluis', 'openZoeken', 'settingsBtn'];

async function noHorizontalScroll(page, label) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  assert(w <= 391, label + ': pagina is ' + w + ' px breed (horizontaal scrollen)');
}
async function closeAll(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.full-overlay.open,.overlay.open').forEach(o => o.classList.remove('open'));
    const s = document.getElementById('addSheet'); if (s) s.classList.remove('open');
    const bd = document.getElementById('addSheetBackdrop'); if (bd) bd.classList.remove('open');
  });
}

module.exports = {
  async 'alle schermen openen zonder fouten en zonder dataverandering'(ctx) {
    const fx = readFixture('huishouden.json');
    const target = process.env.TARGET || 'test';
    for (const scheme of ['light', 'dark']) {
      const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx, colorScheme: scheme });
      const shot = n => page.screenshot({ path: shotPath(target, scheme + '-' + n), fullPage: false });
      await shot('01-vandaag'); await noHorizontalScroll(page, 'Vandaag');
      await page.click('#vandaagSeg [data-mode="week"]'); await page.waitForTimeout(200); await shot('02-week'); await noHorizontalScroll(page, 'Week');
      await page.click('#vandaagSeg [data-mode="maand"]'); await page.waitForTimeout(200); await shot('03-maand'); await noHorizontalScroll(page, 'Maand');
      await page.click('#vandaagSeg [data-mode="dag"]');
      await page.click('#openTodayBtn'); await page.waitForTimeout(400);
      assert(await page.$('#sheetOverlay.open'), 'Dagvenster opent niet');
      await shot('04-dagvenster'); await page.click('#closeSheetBtn'); await page.waitForTimeout(300);
      await page.click('#vandaagTasks .list-row:has-text("Tandarts") .icon-btn'); await page.waitForTimeout(300);
      assert(await page.$('#addSheet.open'), 'Taakmenu opent niet');
      await shot('05-taakmenu'); await closeAll(page);
      for (const v of ['bakjeView', 'boodschappenView', 'meerView']) {
        await page.click('[data-view="' + v + '"]'); await page.waitForTimeout(250);
        await shot('06-' + v); await noHorizontalScroll(page, v);
      }
      let i = 10;
      for (const id of MEER) {
        await page.click('[data-view="meerView"]'); await page.waitForTimeout(150);
        await page.click('#' + id); await page.waitForTimeout(400);
        const open = await page.evaluate(() => !!document.querySelector('.full-overlay.open,.overlay.open'));
        assert(open, id + ' opent geen scherm');
        await shot((i++) + '-' + id);
        await noHorizontalScroll(page, id);
        await closeAll(page);
      }
      await page.click('[data-view="vandaagView"]');
      await page.click('#openBriefingBtn'); await page.waitForTimeout(400);
      await shot('40-briefing');
      await page.click('#briefingStartBtn');
      await page.waitForTimeout(800);
      assert(state.errors.length === 0, scheme + ': fouten: ' + state.errors.join(' | '));
      // Alleen kijken mag geen data veranderen. Bekend: Vakanties onthoudt het actieve tabblad (_tab) in de data.
      if (state.puts) {
        const diff = diffPaths(fx, state.db).filter(p => !/^vakanties\[[^\]]+\]\._tab$/.test(p));
        assert(diff.length === 0, scheme + ': bekijken veranderde data: ' + diff.join(', '));
      }
      await c.close();
    }
  },
};
