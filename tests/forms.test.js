// Stap 0.8: formulieren achter 'Nieuw …'. Zelfde velden en hetzelfde opgeslagen object als voorheen.
'use strict';
const { openApp, readFixture, waitForPut, assert } = require('./lib');

// [menu-id, overlay-id, kaart, datapad, vulfunctie, verwachte velden van het nieuwe item]
const CASES = [
  ['openOnderhoud', 'onderhoudOverlay', '.add-card', 'onderhoud', async p => { await p.fill('#ondNewText', 'Filter afzuigkap'); },
    ['id', 'text', 'lastDone', 'intervalDays', 'intervalLabel', 'category', 'note', 'foto', 'log']],
  ['openGaranties', 'garantiesOverlay', '.add-card', 'garanties', async p => { await p.fill('#garNewText', 'Stofzuiger'); await p.fill('#garVerloopt', '2028-01-01'); },
    ['id', 'text', 'gekocht', 'verloopt', 'winkel', 'serienummer', 'note', 'foto']],
  ['openKluis', 'kluisOverlay', '.add-card', 'vervaldata', async p => { await p.fill('#kluisNaam', 'Rijbewijs Sanne'); await p.fill('#kluisVervaldatum', '2030-05-01'); },
    ['id', 'naam', 'categorie', 'vervaldatum', 'herinnering', 'notitie']],
  ['openBestellingen', 'bestellingenOverlay', '.best-add-card', 'bestellingen', async p => { await p.fill('#bestNewText', 'Schoenen'); },
    ['id', 'text', 'status', 'category', 'assignedTo', 'addedDate', 'expectedDate', 'note', 'tracking']],
  ['openRecepten', 'receptenOverlay', '.add-card', 'recepten', async p => { await p.fill('#receptNaam', 'Stamppot'); },
    ['id', 'naam', 'categorie', 'link', 'notitie', 'ingredienten']],
  ['openVerjaardagen', 'verjaardagenOverlay', '.add-card', 'verjaardagen', async p => { await p.fill('#verjNaam', 'Freya'); await p.fill('#verjDatum', '2019-07-21'); },
    null],
  ['openBacklog', 'backlogOverlay', '.add-card', 'backlog', async p => { await p.fill('#backlogNewText', 'Zolder isoleren'); },
    ['id', 'text', 'category', 'priority', 'addedDate']],
  ['openVasteTaken', 'recurringOverlay', '.rec-add-card', 'recurring', async p => { await p.fill('#recNewText', 'Badkamer poetsen'); await p.click('#dayPicker [data-day="5"]'); },
    ['id', 'text', 'interval', 'category', 'priority', 'createdAt', 'days']],
];

module.exports = {
  async 'formulieren openen achter een knop, sluiten na toevoegen en slaan hetzelfde op'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    for (const [menu, ov, card, key, fill, keys] of CASES) {
      await page.click('[data-view="meerView"]');
      await page.click('#' + menu); await page.waitForTimeout(350);
      const cardSel = '#' + ov + ' ' + card;
      assert(!(await page.isVisible(cardSel)), key + ': formulier staat al open');
      assert(await page.evaluate(() => document.activeElement === document.body || !document.activeElement.closest('.form-sheet')), key + ': focus springt naar het verborgen formulier');
      // fout: leeg toevoegen houdt het formulier open
      await page.click('#' + ov + ' .form-sheet-open'); await page.waitForTimeout(250);
      assert(await page.isVisible(cardSel), key + ': formulier opent niet');
      await page.click(cardSel + ' .add-card-btn, ' + cardSel + ' button[id$="AddBtn"]');
      await page.waitForTimeout(200);
      assert(await page.isVisible(cardSel), key + ': formulier sluit bij een fout');
      // geldig toevoegen
      const n0 = (state.db[key] || []).length, b = state.puts;
      await fill(page);
      await page.click(cardSel + ' button[id$="AddBtn"]');
      await waitForPut(state, b);
      assert(state.db[key].length === n0 + 1, key + ': item niet toegevoegd');
      assert(!(await page.isVisible(cardSel)), key + ': formulier sluit niet na toevoegen');
      if (keys) {
        const added = state.db[key].find(x => !(fx[key] || []).some(y => y.id === x.id));
        const got = Object.keys(added).sort().join(','), want = keys.slice().sort().join(',');
        assert(got === want, key + ': velden wijken af\n  verwacht ' + want + '\n  kreeg    ' + got);
      }
      await page.evaluate(() => document.querySelectorAll('.full-overlay.open').forEach(o => o.classList.remove('open')));
    }
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },
};
