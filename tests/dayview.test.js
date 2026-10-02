// Stap 0.6: dagvenster in het design system; alle functies blijven werken.
'use strict';
const { openApp, readFixture, diffPaths, waitForPut, assert } = require('./lib');

async function openToday(page) { await page.click('#openTodayBtn'); await page.waitForTimeout(400); }
const sheetRow = (page, text) => page.locator('#taskList .list-row', { hasText: text });
const find = (db, id) => { for (const k of Object.keys(db.tasks)) { const t = (db.tasks[k] || []).find(x => x.id === id); if (t) return { key: k, t }; } return null; };

module.exports = {
  async 'dagvenster toont taken, vaste taken, meerdaagse taken en notitie'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await openToday(page);
    for (const t of ['Vuilnis buiten zetten', 'Tandarts bellen voor Lynn', 'Cadeau oma kopen', 'Was ophangen'])
      assert(await sheetRow(page, t).count() === 1, 'Taak ontbreekt: ' + t);
    assert(await page.locator('#recTaskList .list-row', { hasText: 'Stofzuigen' }).count() === 1, 'Vaste taak ontbreekt');
    assert(await page.locator('#mdTaskList .list-row', { hasText: 'Opa en oma logeren' }).count() === 1, 'Meerdaagse taak ontbreekt');
    assert((await page.inputValue('#notesArea')).includes('Opa en oma'), 'Notitie ontbreekt');
    const meta = await sheetRow(page, 'Tandarts').textContent();
    assert(meta.includes('voor Sanne') && meta.includes('door Bas') && meta.includes('Belangrijk'), 'Gegevens van de taak ontbreken: ' + meta);
    assert(await sheetRow(page, 'Tandarts').locator('.reaction-btn').count() === 1, 'Reactie ontbreekt');
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },

  async 'taak met alle opties toevoegen geeft hetzelfde object als voorheen'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await openToday(page);
    assert(!(await page.isVisible('#newTaskCat')), 'Extra velden zouden ingeklapt moeten zijn');
    await page.click('#sheetMoreBtn');
    await page.fill('#newTaskInput', 'Gordijnen ophangen');
    await page.selectOption('#newTaskCat', 'regelen');
    await page.selectOption('#newTaskPrio', 'hoog');
    await page.selectOption('#newTaskAssignee', 'partner');
    await page.click('#periodRow [data-period="avond"]');
    await page.fill('#newTaskReminder', '18:30');
    const b = state.puts;
    await page.click('#addTaskBtn');
    await waitForPut(state, b);
    const t = state.db.tasks['2026-10-02'].find(x => x.text === 'Gordijnen ophangen');
    const { id, ...rest } = t;
    const expected = { text: 'Gordijnen ophangen', done: false, category: 'regelen', priority: 'hoog', assignedTo: 'Sanne', author: 'Bas', orderStatus: null, period: 'avond', reminder: { date: '2026-10-02', time: '18:30' } };
    assert(JSON.stringify(Object.keys(rest).sort().map(k => [k, rest[k]])) === JSON.stringify(Object.keys(expected).sort().map(k => [k, expected[k]])), 'Opgeslagen taak wijkt af: ' + JSON.stringify(rest));
    await c.close();
  },

  async 'menu: verplaatsen, bestelstatus, toewijzen, afvinken, verwijderen met ongedaan maken'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await openToday(page);
    const menu = async (text, action) => {
      const b = state.puts;
      await sheetRow(page, text).locator('.icon-btn[aria-label^="Opties"]').click();
      await page.click('#addSheet .action-row:has-text("' + action + '")');
      return b;
    };
    // bestelstatus: besteld → geleverd → weg
    for (const want of ['besteld', 'geleverd', null]) {
      const b = await menu('Cadeau oma kopen', want === 'besteld' ? 'Markeer als besteld' : want === 'geleverd' ? 'Markeer als geleverd' : 'Bestelstatus weghalen');
      await waitForPut(state, b);
      assert((find(state.db, 't-cadeau').t.orderStatus || null) === want, 'Bestelstatus zou ' + want + ' zijn');
    }
    // toewijzen aan Sanne
    let b = await menu('Cadeau oma kopen', 'Toewijzen');
    await page.waitForTimeout(300);
    await page.click('#addSheet .action-row:has-text("Sanne")');
    await waitForPut(state, b);
    assert(find(state.db, 't-cadeau').t.assignedTo === 'Sanne', 'Toewijzen werkt niet');
    // afvinken
    b = state.puts;
    await sheetRow(page, 'Cadeau oma kopen').locator('.check').click();
    await waitForPut(state, b);
    assert(find(state.db, 't-cadeau').t.done === true, 'Afvinken werkt niet');
    // verplaatsen
    b = await menu('Cadeau oma kopen', 'Verplaatsen');
    await page.waitForTimeout(300);
    await page.fill('#addSheet input[type=date]', '2026-10-09');
    await page.click('#addSheet .btn-primary');
    await waitForPut(state, b);
    assert(find(state.db, 't-cadeau').key === '2026-10-09', 'Verplaatsen werkt niet');
    // verwijderen en ongedaan maken
    b = await menu('Tandarts bellen', 'Verwijderen');
    await waitForPut(state, b);
    assert(!find(state.db, 't-tandarts'), 'Verwijderen werkt niet');
    b = state.puts;
    await page.click('#toast button');
    await waitForPut(state, b);
    const t = find(state.db, 't-tandarts');
    assert(t && t.key === '2026-10-02' && JSON.stringify(t.t) === JSON.stringify(fx.tasks['2026-10-02'].find(x => x.id === 't-tandarts')), 'Ongedaan maken herstelt de taak niet exact');
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },

  async 'vaste taak afvinken in het dagvenster'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await openToday(page);
    const b = state.puts;
    await page.locator('#recTaskList .list-row', { hasText: 'Stofzuigen' }).locator('.check').click();
    await waitForPut(state, b);
    assert(diffPaths(fx, state.db).join() === 'recurringDone.2026-10-02', 'Onverwachte wijziging: ' + diffPaths(fx, state.db).join(', '));
    await c.close();
  },
};
