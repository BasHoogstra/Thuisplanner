// Stap 0.5: oude taken worden zichtbaar in plaats van stil verplaatst; er verdwijnt niets.
'use strict';
const { openApp, readFixture, waitForPut, assert } = require('./lib');

const T = (id, text) => ({ id, text, done: false, category: 'huis', priority: 'normaal', assignedTo: null, author: 'Bas', orderStatus: null });
function fixture() {
  const fx = readFixture('huishouden.json');
  fx.tasks['2026-09-27'] = [T('o-5', 'Fietsband plakken')];          // 5 dagen oud: wordt doorgeschoven
  fx.tasks['2026-09-03'] = [T('o-29', 'Fotoboek bestellen')];        // 29 dagen: wordt doorgeschoven
  fx.tasks['2026-08-18'] = [T('o-45', 'Schilder bellen')];           // 45 dagen: blijft staan, melding
  return fx;
}
const countTasks = db => Object.values(db.tasks || {}).reduce((n, a) => n + (a || []).length, 0);
const findTask = (db, id) => { for (const k of Object.keys(db.tasks)) { const t = (db.tasks[k] || []).find(x => x.id === id); if (t) return { key: k, t }; } return null; };

module.exports = {
  async 'doorgeschoven taken krijgen hun oorspronkelijke datum; oude taken een melding'(ctx) {
    const fx = fixture();
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await page.waitForTimeout(800);
    assert(countTasks(state.db) === countTasks(fx), 'Aantal taken veranderd: ' + countTasks(fx) + ' → ' + countTasks(state.db));
    const t5 = findTask(state.db, 'o-5'), t29 = findTask(state.db, 'o-29'), t45 = findTask(state.db, 'o-45');
    assert(t5.key === '2026-10-02' && t5.t.movedFrom === '2026-09-27', '5 dagen oud: ' + JSON.stringify(t5));
    assert(t29.key === '2026-10-02' && t29.t.movedFrom === '2026-09-03', '29 dagen oud: ' + JSON.stringify(t29));
    assert(t45.key === '2026-08-18' && !t45.t.movedFrom, '45 dagen oud mag niet verplaatst zijn: ' + JSON.stringify(t45));
    const row = await page.textContent('#vandaagTasks .list-row:has-text("Fietsband")');
    assert(row.includes('oorspronkelijk'), 'Rij toont de oorspronkelijke datum niet: ' + row);
    assert(await page.isVisible('#overdueBanner'), 'Melding over oude taken ontbreekt');
    assert((await page.textContent('#overdueBannerText')).includes('1 oude taak'), 'Tekst van de melding klopt niet');
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },

  async 'oude taak naar vandaag, ongedaan maken, en klaar'(ctx) {
    const fx = fixture();
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    let b = state.puts;
    await page.click('#overdueBannerBtn');
    await page.click('#addSheet .action-row:has-text("Naar vandaag")');
    await waitForPut(state, b);
    let t = findTask(state.db, 'o-45');
    assert(t.key === '2026-10-02' && t.t.movedFrom === '2026-08-18', 'Niet naar vandaag: ' + JSON.stringify(t));
    assert(!(await page.isVisible('#overdueBanner')), 'Melding blijft staan');
    b = state.puts;
    await page.click('#toast button');
    await waitForPut(state, b);
    t = findTask(state.db, 'o-45');
    assert(t.key === '2026-08-18' && !t.t.movedFrom, 'Ongedaan maken herstelt niet: ' + JSON.stringify(t));
    await page.waitForTimeout(4200);
    b = state.puts;
    await page.click('#overdueBannerBtn');
    await page.click('#addSheet .action-row:has-text("Klaar")');
    await waitForPut(state, b);
    t = findTask(state.db, 'o-45');
    assert(t.key === '2026-08-18' && t.t.done === true, 'Niet afgevinkt: ' + JSON.stringify(t));
    assert(countTasks(state.db) === countTasks(fx), 'Aantal taken veranderd');
    await c.close();
  },
};
