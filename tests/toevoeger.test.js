// Bestaand gedrag (vastgelegd na stap 1.3): wie iets toevoegde, en wanneer "door <naam>" verschijnt.
// - Boodschappen en eigen lijsten bewaren de toevoeger in `addedBy` (de naam van dit toestel, of null
//   zonder ingestelde naam) en tonen "door <naam>" alleen als iemand ánders het toevoegde.
// - Taken bewaren de maker in `author` en tonen "door <naam>" altijd, ook bij je eigen taken.
// Dit is geen nieuw gedrag maar een regressietest (de regel bestaat sinds "Restyle stap 2b").
'use strict';
const { openApp, readFixture, sharedDb, waitForPut, assert } = require('./lib');

const BAS = { plannerMyName: 'Bas', plannerPartnerName: 'Sanne' };
const SANNE = { plannerMyName: 'Sanne', plannerPartnerName: 'Bas' };
const NO_NAME = { plannerMyName: null, plannerPartnerName: null };

const open = (ctx, db, ls) => openApp(ctx.browser, ctx.base, { state: db, exposeETag: true, localStorage: ls });
const boodRow = (page, text) => page.locator('#boodschappenList .list-row', { hasText: text });
const lijstRow = (page, text) => page.locator('#extraLijsten .list-row', { hasText: text });
const taskRow = (page, text) => page.locator('#taskList .list-row', { hasText: text });
const rowText = async loc => { assert(await loc.count() === 1, 'Rij niet (precies één keer) gevonden'); return (await loc.textContent()).replace(/\s+/g, ' '); };

async function showBood(page) {
  await page.evaluate(() => { const nb = document.getElementById('nameBanner'); if (nb) nb.style.display = 'none'; });
  if (await page.isVisible('#closeSheetBtn')) { await page.click('#closeSheetBtn'); await page.waitForTimeout(400); } // dagvenster dicht
  await page.click('[data-view="boodschappenView"]');
}
async function addBood(o, text) {
  await showBood(o.page);
  const b = o.state.puts;
  await o.page.fill('#boodschapInput', text);
  await o.page.press('#boodschapInput', 'Enter');
  await waitForPut(o.state, b);
}
async function addLijstItem(o, lijstId, text) {
  await showBood(o.page);
  const b = o.state.puts;
  const inp = o.page.locator('[data-lijst-input="' + lijstId + '"]');
  await inp.fill(text);
  await inp.press('Enter');
  await waitForPut(o.state, b);
}
async function openToday(page) {
  await page.evaluate(() => { const nb = document.getElementById('nameBanner'); if (nb) nb.style.display = 'none'; });
  if (!(await page.isVisible('#openTodayBtn'))) await page.click('[data-view="vandaagView"]');
  await page.click('#openTodayBtn'); await page.waitForTimeout(400);
}
async function addTask(o, text) {
  await openToday(o.page);
  const b = o.state.puts;
  await o.page.fill('#newTaskInput', text);
  await o.page.click('#addTaskBtn');
  await waitForPut(o.state, b);
}
const findLijstItem = (db, lijstId, text) => db.lijsten.find(l => l.id === lijstId).items.find(i => i.text === text);
const findTask = (db, text) => (db.tasks['2026-10-02'] || []).find(t => t.text === text);

module.exports = {
  async 'toevoeger: boodschappen bewaren addedBy en tonen "door" alleen bij een ander'(ctx) {
    const db = sharedDb(readFixture('huishouden.json'));
    const bas = await open(ctx, db, BAS);
    await addBood(bas, 'Test Bas');
    const saved = db.db.boodschappen.find(b => b.text === 'Test Bas');
    assert(saved && saved.addedBy === 'Bas', 'addedBy niet "Bas": ' + JSON.stringify(saved));
    const eigen = await rowText(boodRow(bas.page, 'Test Bas'));
    assert(!/door /.test(eigen), 'Bas ziet bij zijn eigen boodschap toch "door": ' + eigen);
    const vanSanne = await rowText(boodRow(bas.page, 'Melk'));
    assert(vanSanne.includes('door Sanne'), 'Bas ziet bij het item van Sanne geen "door Sanne": ' + vanSanne);

    const sanne = await open(ctx, db, SANNE);
    await showBood(sanne.page);
    const bijSanne = await rowText(boodRow(sanne.page, 'Test Bas'));
    assert(bijSanne.includes('door Bas'), 'Sanne ziet bij het item van Bas geen "door Bas": ' + bijSanne);
    const sanneEigen = await rowText(boodRow(sanne.page, 'Melk'));
    assert(!/door /.test(sanneEigen), 'Sanne ziet bij haar eigen boodschap toch "door": ' + sanneEigen);
    assert(!db.errors.length, 'Fouten: ' + db.errors.join(' | '));
    await bas.ctx.close(); await sanne.ctx.close();
  },

  async 'toevoeger: eigen lijsten volgen hetzelfde gedrag als boodschappen'(ctx) {
    const db = sharedDb(readFixture('huishouden.json'));
    const bas = await open(ctx, db, BAS);
    await addLijstItem(bas, 'l-bouwmarkt', 'Schroeven');
    const saved = findLijstItem(db.db, 'l-bouwmarkt', 'Schroeven');
    assert(saved && saved.addedBy === 'Bas', 'addedBy niet "Bas": ' + JSON.stringify(saved));
    const eigen = await rowText(lijstRow(bas.page, 'Schroeven'));
    assert(!/door /.test(eigen), 'Bas ziet bij zijn eigen lijstitem toch "door": ' + eigen);
    const vanSanne = await rowText(lijstRow(bas.page, 'Siliconenkit'));
    assert(vanSanne.includes('door Sanne'), 'Bas ziet bij het lijstitem van Sanne geen "door Sanne": ' + vanSanne);

    const sanne = await open(ctx, db, SANNE);
    await showBood(sanne.page);
    const bijSanne = await rowText(lijstRow(sanne.page, 'Schroeven'));
    assert(bijSanne.includes('door Bas'), 'Sanne ziet bij het lijstitem van Bas geen "door Bas": ' + bijSanne);
    assert(!db.errors.length, 'Fouten: ' + db.errors.join(' | '));
    await bas.ctx.close(); await sanne.ctx.close();
  },

  async 'toevoeger: taken tonen de auteur altijd, ook bij je eigen taak'(ctx) {
    const db = sharedDb(readFixture('huishouden.json'));
    const bas = await open(ctx, db, BAS);
    await addTask(bas, 'Taak van Bas');
    const saved = findTask(db.db, 'Taak van Bas');
    assert(saved && saved.author === 'Bas', 'author niet "Bas": ' + JSON.stringify(saved));
    const eigen = await rowText(taskRow(bas.page, 'Taak van Bas'));
    assert(eigen.includes('door Bas'), 'Bas ziet bij zijn eigen taak geen "door Bas": ' + eigen);
    const vanSanne = await rowText(taskRow(bas.page, 'Vuilnis buiten zetten'));
    assert(vanSanne.includes('door Sanne'), 'Bas ziet bij de taak van Sanne geen "door Sanne": ' + vanSanne);

    const sanne = await open(ctx, db, SANNE);
    await openToday(sanne.page);
    const bijSanne = await rowText(taskRow(sanne.page, 'Taak van Bas'));
    assert(bijSanne.includes('door Bas'), 'Sanne ziet bij de taak van Bas geen "door Bas": ' + bijSanne);
    assert(!db.errors.length, 'Fouten: ' + db.errors.join(' | '));
    await bas.ctx.close(); await sanne.ctx.close();
  },

  async 'toevoeger: zonder ingestelde toestelnaam wordt niemand opgeslagen en geen "door" getoond'(ctx) {
    const db = sharedDb(readFixture('huishouden.json'));
    const anon = await open(ctx, db, NO_NAME);
    await addBood(anon, 'Zonder naam');
    await addLijstItem(anon, 'l-bouwmarkt', 'Lijst zonder naam');
    await addTask(anon, 'Taak zonder naam');
    const bood = db.db.boodschappen.find(b => b.text === 'Zonder naam');
    const item = findLijstItem(db.db, 'l-bouwmarkt', 'Lijst zonder naam');
    const task = findTask(db.db, 'Taak zonder naam');
    // Firebase bewaart geen null: het veld is dan leeg of ontbreekt.
    assert(bood && bood.addedBy == null, 'Boodschap kreeg toch een toevoeger: ' + JSON.stringify(bood));
    assert(item && item.addedBy == null, 'Lijstitem kreeg toch een toevoeger: ' + JSON.stringify(item));
    assert(task && task.author == null, 'Taak kreeg toch een auteur: ' + JSON.stringify(task));
    assert(!/door /.test(await rowText(taskRow(anon.page, 'Taak zonder naam'))), 'Taak zonder auteur toont toch "door"');
    // Zonder eigen naam zijn alle bekende toevoegers "iemand anders".
    await showBood(anon.page);
    assert((await rowText(boodRow(anon.page, 'Melk'))).includes('door Sanne'), 'Zonder naam ontbreekt "door Sanne"');

    const bas = await open(ctx, db, BAS);
    await showBood(bas.page);
    assert(!/door /.test(await rowText(boodRow(bas.page, 'Zonder naam'))), 'Boodschap zonder toevoeger toont toch "door"');
    assert(!/door /.test(await rowText(lijstRow(bas.page, 'Lijst zonder naam'))), 'Lijstitem zonder toevoeger toont toch "door"');
    assert(!db.errors.length, 'Fouten: ' + db.errors.join(' | '));
    await anon.ctx.close(); await bas.ctx.close();
  },
};
