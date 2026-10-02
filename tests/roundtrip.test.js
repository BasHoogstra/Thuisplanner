// Data-roundtrip: de app mag alleen veranderen wat de gebruiker verandert.
'use strict';
const { openApp, readFixture, diffPaths, waitForPut, assert, assertSameSet } = require('./lib');

module.exports = {
  async 'laden van een volledig huishouden verandert niets'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await page.waitForTimeout(1500);
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    // Bekend gedrag: op een toestel zonder lokale kopie slaat de eerste keer laden het document
    // één keer terug. De inhoud moet dan exact gelijk zijn.
    const diff = diffPaths(fx, state.db);
    assert(diff.length === 0, 'Eerste keer laden veranderde data: ' + diff.join(', '));
    // Daarna (met lokale kopie) mag herladen helemaal niet meer opslaan.
    const puts = state.puts;
    await page.reload(); await page.waitForTimeout(2500);
    assert(state.puts === puts, 'Herladen met lokale kopie sloeg op (' + (state.puts - puts) + 'x)');
    assert(state.errors.length === 0, 'Fouten na herladen: ' + state.errors.join(' | '));
    await c.close();
  },

  async 'boodschap toevoegen raakt alleen de boodschappen'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await page.click('[data-view="boodschappenView"]');
    const before = state.puts;
    await page.fill('#boodschapInput', 'Pindakaas');
    await page.press('#boodschapInput', 'Enter');
    await waitForPut(state, before);
    const diff = diffPaths(fx, state.db);
    assert(diff.length === 1 && /^boodschappen\[[^\]]+\]$/.test(diff[0]), 'Onverwachte wijzigingen: ' + diff.join(', '));
    const added = state.db.boodschappen.find(b => b.text === 'Pindakaas');
    assert(added && added.cat === 'Ontbijt & beleg' && added.addedBy === 'Bas', 'Nieuwe boodschap klopt niet: ' + JSON.stringify(added));
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },

  async 'taak afvinken raakt alleen die taak en het huisgeheugen'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    const before = state.puts;
    await page.click('#vandaagTasks .list-row:has-text("Cadeau oma kopen") .check');
    await waitForPut(state, before);
    const diff = diffPaths(fx, state.db);
    const other = diff.filter(p => p !== 'tasks.2026-10-02[t-cadeau].done' && !/^huisgeheugen\[[^\]]+\]$/.test(p));
    assert(other.length === 0, 'Onverwachte wijzigingen: ' + other.join(', '));
    assert(state.db.tasks['2026-10-02'].find(t => t.id === 't-cadeau').done === true, 'Taak niet afgevinkt');
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },

  async 'opnieuw laden na een wijziging verandert niets meer'(ctx) {
    const fx = readFixture('huishouden.json');
    const r = await openApp(ctx.browser, ctx.base, { data: fx });
    await r.page.click('[data-view="boodschappenView"]');
    const b0 = r.state.puts;
    await r.page.fill('#boodschapInput', 'Koffie');
    await r.page.press('#boodschapInput', 'Enter');
    await waitForPut(r.state, b0);
    const saved = JSON.stringify(r.state.db);
    const puts = r.state.puts;
    await r.page.reload(); await r.page.waitForTimeout(2500);
    assert(r.state.puts === puts, 'Opslaan na herladen; verschil: ' + diffPaths(JSON.parse(saved), r.state.db).join(', '));
    assert(r.state.errors.length === 0, 'Fouten: ' + r.state.errors.join(' | '));
    await r.ctx.close();
  },

  async 'oude toewijzingen ik/partner worden zoals voorheen omgezet naar namen'(ctx) {
    const fx = readFixture('legacy.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await page.waitForTimeout(1500);
    const diff = diffPaths(fx, state.db);
    assertSameSet(diff, ['tasks.2026-10-02[t-me].assignedTo', 'tasks.2026-10-02[t-partner].assignedTo', 'multiDayTasks[m-me].assignedTo', 'bestellingen[be-partner].assignedTo'], 'Migratie van oude toewijzingen');
    const t = state.db.tasks['2026-10-02'];
    assert(t.find(x => x.id === 't-me').assignedTo === 'Sanne', 'me door Sanne moet Sanne worden');
    assert(t.find(x => x.id === 't-partner').assignedTo === 'Sanne', 'partner door Bas moet Sanne worden');
    await c.close();
  },
};
