// Stap 0.4: elke verwijderactie is direct ongedaan te maken, en ongedaan maken herstelt de
// data exact (zelfde id, zelfde plek).
'use strict';
const { openApp, readFixture, diffPaths, waitForPut, assert } = require('./lib');

// [menu-id in Meer, selector van de verwijderknop, pad in de data, id van het verwijderde item]
const CASES = [
  ['openVasteTaken', '#recList .rec-list-del', 'recurring', 'r-stofzuigen'],
  ['openBacklog', '#backlogList .backlog-del-btn', 'backlog', null],
  ['openGaranties', '#garantiesList .gar-del-btn', 'garanties', null],
  ['openKluis', '#kluisList .kluis-del', 'vervaldata', null],
  ['openRecepten', '#receptGrid .recept-del', 'recepten', null],
  ['openNotitieboek', '#notitieList .notitie-del', 'notities', 'n-wifi'],
  ['openVerjaardagen', '#verjList .kluis-del', 'verjaardagen', null],
  ['openOnderhoud', '#onderhoudList .ond-del-btn', 'onderhoud', null],
  ['openBestellingen', '#bestList .best-del', 'bestellingen', null],
];

module.exports = {
  async 'verwijderen en ongedaan maken herstelt de data exact'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    for (const [menu, sel, key] of CASES) {
      await page.click('[data-view="meerView"]');
      await page.click('#' + menu); await page.waitForTimeout(300);
      const before = state.puts;
      const n0 = (state.db[key] || fx[key]).length;
      await page.click(sel + ' >> nth=0');
      await waitForPut(state, before);
      assert(state.db[key].length === n0 - 1, key + ': item niet verwijderd');
      assert(await page.isVisible('#toast button'), key + ': geen "Ongedaan maken"');
      const b2 = state.puts;
      await page.click('#toast button');
      await waitForPut(state, b2);
      const diff = diffPaths(fx, state.db).filter(p => !/^vakanties\[[^\]]+\]\._tab$/.test(p));
      assert(diff.length === 0, key + ': na ongedaan maken verschilt de data: ' + diff.join(', '));
      assert(JSON.stringify(state.db[key].map(x => x.id)) === JSON.stringify(fx[key].map(x => x.id)), key + ': volgorde na ongedaan maken klopt niet');
      await page.evaluate(() => document.querySelectorAll('.full-overlay.open').forEach(o => o.classList.remove('open')));
      await page.waitForTimeout(4200); // melding laten verdwijnen
    }
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },

  async 'vaste taak overslaan kan ook via het menu'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    const before = state.puts;
    await page.click('#vandaagTasks .list-row:has-text("Stofzuigen") .icon-btn');
    await page.click('#addSheet .action-row:has-text("Overslaan")');
    await waitForPut(state, before);
    assert((state.db.recurringDone['2026-10-02'] || []).includes('r-stofzuigen'), 'Vaste taak niet overgeslagen');
    const diff = diffPaths(fx, state.db);
    assert(diff.length === 1 && diff[0] === 'recurringDone.2026-10-02', 'Onverwachte wijzigingen: ' + diff.join(', '));
    await c.close();
  },

  async 'verticaal scrollen over een rij verwijdert niets'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await page.click('[data-view="boodschappenView"]');
    const box = await page.locator('#boodschappenList .list-row:has-text("Melk")').boundingBox();
    // Schuine beweging die vooral omlaag gaat (meer dan genoeg zijwaarts om vroeger te vegen).
    await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y).closest('.list-row');
      const t = (cx, cy) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(x, y)], bubbles: true }));
      for (let i = 1; i <= 10; i++) el.dispatchEvent(new TouchEvent('touchmove', { touches: [t(x - i * 10, y + i * 25)], bubbles: true }));
      el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [t(x - 100, y + 250)], bubbles: true }));
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await page.waitForTimeout(1200);
    assert(state.db.boodschappen.some(b => b.id === 'b-melk'), 'Scrollen heeft de boodschap verwijderd');
    await c.close();
  },

  async 'ongedaan maken blijft beschikbaar na een eerdere melding'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await page.click('[data-view="boodschappenView"]');
    await page.fill('#boodschapInput', 'Pindakaas');          // geeft de melding "Onder … geplaatst"
    await page.press('#boodschapInput', 'Enter');
    await page.waitForTimeout(600);
    await page.click('#boodschappenList .list-row:has-text("Appels") .icon-btn[aria-label^="Opties"]');
    await page.click('#addSheet .action-row:has-text("Verwijderen")');
    await page.waitForTimeout(3000);                          // langer dan de eerste melding duurt
    assert(await page.isVisible('#toast.show button'), '"Ongedaan maken" is verdwenen door de eerdere melding');
    await page.click('#toast button');
    await page.waitForTimeout(800);
    assert(state.db.boodschappen.some(b => b.id === 'b-appels'), 'Ongedaan maken werkte niet');
    await c.close();
  },
};
