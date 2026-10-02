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

  async 'Vakanties: wisselen, subtabbladen en menu (resetten, kopiëren, verwijderen)'(ctx) {
    const fx = readFixture('huishouden.json');
    fx.vakanties.push({ id: 'va-zomer', naam: 'Zomer Frankrijk', startDatum: '2027-07-10', paklijst: { Bas: [], Sanne: [], Lynn: [], Freya: [] }, todos: [], notes: '' });
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await openMeer(page, 'openVakanties');
    const body = () => page.textContent('#vakantiesContent');
    assert((await body()).includes('Nog 79 dagen'), 'Aftelling ontbreekt');
    for (const t of ['To-do', 'Notities', 'Budget', 'Paklijsten']) {
      await page.click('#vakantiesContent .vak-subtabs .chip:has-text("' + t + '")'); await page.waitForTimeout(150);
      assert(await page.getAttribute('#vakantiesContent .vak-subtabs .chip.is-active', 'aria-selected') === 'true' && (await page.textContent('#vakantiesContent .vak-subtabs .chip.is-active')) === t, 'Subtabblad ' + t + ' niet actief');
    }
    // afvinkjes resetten (Badtas van Sanne staat afgevinkt)
    let b = state.puts;
    await page.click('#vakantiesContent .vak-head .icon-btn');
    await page.click('#addSheet .action-row:has-text("Afvinkjes resetten")');
    await waitForPut(state, b);
    assert(state.db.vakanties[0].paklijst.Sanne[0].done === false, 'Afvinkjes niet gereset');
    // wisselen naar Zomer en kopiëren van Kerst
    await page.click('#vakantiesContent .vak-chips .chip:has-text("Zomer Frankrijk")'); await page.waitForTimeout(200);
    assert((await page.textContent('#vakantiesContent .vak-head h2')) === 'Zomer Frankrijk', 'Niet gewisseld');
    await page.click('#vakantiesContent .vak-head .icon-btn');
    await page.click('#addSheet .action-row:has-text("Kopieer van")');
    await page.waitForTimeout(300);
    await page.click('#addSheet .action-row:has-text("Kerst in Oostenrijk")');
    await page.waitForTimeout(300);
    assert(await page.isVisible('#confirmOverlay.open'), 'Bevestiging verschijnt niet');
    b = state.puts;
    await page.click('#confirmOkBtn');
    await waitForPut(state, b);
    const zomer = state.db.vakanties.find(v => v.id === 'va-zomer');
    assert(zomer.paklijst.Bas.length === 1 && zomer.paklijst.Bas[0].text === 'Skibril' && zomer.todos[0].text === 'Skipassen boeken' && zomer.notes === 'Appartement 3B', 'Kopiëren werkte niet: ' + JSON.stringify(zomer));
    // verwijderen met bevestiging en ongedaan maken
    b = state.puts;
    await page.click('#vakantiesContent .vak-head .icon-btn');
    await page.click('#addSheet .action-row:has-text("Vakantie verwijderen")');
    await page.waitForTimeout(300);
    await page.click('#confirmOkBtn');
    await waitForPut(state, b);
    assert(!state.db.vakanties.some(v => v.id === 'va-zomer'), 'Niet verwijderd');
    b = state.puts;
    await page.click('#toast button');
    await waitForPut(state, b);
    assert(state.db.vakanties.some(v => v.id === 'va-zomer'), 'Ongedaan maken werkte niet');
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },

  async 'Gewoonten: afvinken, toevoegen en verwijderen'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await openMeer(page, 'openGewoonten');
    let b = state.puts;
    await page.locator('#gewoontenList .list-row', { hasText: 'Water drinken' }).locator('.check').click();
    await waitForPut(state, b);
    assert(diffPaths(fx, state.db).join() === 'gewoontenDone.2026-10-02', 'Afvinken: ' + diffPaths(fx, state.db).join(', '));
    b = state.puts;
    await page.fill('#gewoonteInput', 'Wandelen');
    await page.click('#addGewoonteBtn');
    await waitForPut(state, b);
    const nieuw = state.db.gewoonten.find(g => g.text === 'Wandelen');
    assert(nieuw && nieuw.icon && nieuw.createdDate === '2026-10-02' && Object.keys(nieuw).sort().join() === 'createdDate,icon,id,text', 'Nieuwe gewoonte klopt niet: ' + JSON.stringify(nieuw));
    b = state.puts;
    await page.locator('#gewoontenList .list-row', { hasText: 'Wandelen' }).locator('.icon-btn').click();
    await waitForPut(state, b);
    assert(!state.db.gewoonten.some(g => g.text === 'Wandelen'), 'Niet verwijderd');
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },

  async 'Kluis, Huisgeheugen, Recepten en Maaltijdplanner: zonder emoji-iconen, functies werken'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await openMeer(page, 'openKluis');
    assert(await page.locator('#kluisList .icon-sq').count() === 2, 'Kluis: iconen ontbreken');
    await page.evaluate(() => document.querySelectorAll('.full-overlay.open').forEach(o => o.classList.remove('open')));
    await openMeer(page, 'openHuisgeheugen');
    await page.fill('#geheugenZoek', 'gras'); await page.waitForTimeout(300);
    assert((await page.textContent('#geheugenList')).includes('Gras maaien'), 'Huisgeheugen: zoeken werkt niet');
    await page.evaluate(() => document.querySelectorAll('.full-overlay.open').forEach(o => o.classList.remove('open')));
    await openMeer(page, 'openRecepten');
    const kaart = await page.textContent('#receptGrid .recept-card:has-text("Pasta pesto")');
    assert(kaart.includes('Pasta') && kaart.includes('3 ingrediënten naar lijst'), 'Receptkaart onvolledig: ' + kaart);
    const b = state.puts;
    await page.click('#receptGrid .recept-card:has-text("Pasta pesto") .recept-bood-btn');
    await waitForPut(state, b);
    assert(['pasta', 'pesto', 'pijnboompitten'].every(i => state.db.boodschappen.some(x => x.text === i)), 'Ingrediënten niet op de lijst');
    await page.evaluate(() => document.querySelectorAll('.full-overlay.open').forEach(o => o.classList.remove('open')));
    await openMeer(page, 'openMaaltijdplanner');
    const opts = await page.$$eval('#maaltijdWeek select >> nth=0', s => [...s[0].options].map(o => o.textContent));
    assert(opts.includes('Pasta pesto'), 'Maaltijdplanner: recepten ontbreken in de keuzelijst: ' + opts.join(' | '));
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },

  async 'Gezins-DNA en Statistieken: lijn-iconen i.p.v. emoji, inhoud blijft'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    await openMeer(page, 'openGezinsDNA');
    assert(await page.locator('#dnaGrid .dna-ic').count() >= 4, 'DNA: iconen ontbreken');
    // Alleen de iconen van kaarten en inzichten; een gewoonte-icoon in de tekst is data en blijft.
    assert(await page.locator('#dnaGrid .dna-card-emoji, #dnaGrid .dna-insight-icon').count() === 0, 'DNA: nog emoji-iconen');
    assert(!emoji.test((await page.$$eval('#dnaGrid .dna-card-label', els => els.map(e => e.textContent).join(' ')))), 'DNA: emoji in de labels');
    assert((await page.textContent('#dnaGrid')).includes('Taken afgerond'), 'DNA: inhoud ontbreekt');
    await page.evaluate(() => document.querySelectorAll('.full-overlay.open').forEach(o => o.classList.remove('open')));
    await openMeer(page, 'openStatistieken');
    const st = await page.textContent('#statistiekenBody');
    assert(st.includes('Taken per categorie') && st.includes('Financiën') && !emoji.test(st), 'Statistieken: ' + st.slice(0, 160));
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },

  async 'Vaste lasten: categorie openklappen toont de posten'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await openMeer(page, 'openBudget');
    assert((await page.textContent('#budgetSummary')).includes('1330'), 'Totaal klopt niet');
    await page.click('#budgetCatList >> text=Wonen'); await page.waitForTimeout(250);
    const vals = await page.$$eval('#budgetCatList input', els => els.map(e => e.value));
    assert(vals.includes('Hypotheek'), 'Posten verschijnen niet: ' + vals.join(', '));
    assert(await page.locator('#budgetCatList .vl-cat-arrow.open svg').count() === 1, 'Pijl draait niet mee');
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },
};
