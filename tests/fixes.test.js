// Stap 0.3: losse bugs uit de audit.
'use strict';
const { openApp, readFixture, assert } = require('./lib');

module.exports = {
  async 'onderhoud zonder datum: "Nog niet ingepland" en niet dringend'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await page.click('[data-view="meerView"]');
    // Dringend: dakgoot (3 dagen te laat) en cv-ketel (over 8 dagen). Rookmelders zijn nog
    // nooit gedaan en tellen niet meer mee (de oude versie telde hier 3).
    const badge = await page.textContent('#openOnderhoud .badge').catch(() => null);
    assert(badge === '2', 'Teller bij Onderhoud zou 2 moeten zijn, is ' + badge);
    await page.click('#openOnderhoud'); await page.waitForTimeout(300);
    const labels = await page.$$eval('#onderhoudList .ond-section-label', els => els.map(e => e.textContent));
    assert(labels.some(l => l.includes('Nog niet ingepland')), 'Sectie "Nog niet ingepland" ontbreekt: ' + labels.join(' / '));
    // De rookmelders moeten onder "Nog niet ingepland" staan, niet onder "Actie vereist".
    const sectionOfRook = await page.evaluate(() => {
      let label = null;
      for (const el of document.getElementById('onderhoudList').children) {
        if (el.classList.contains('ond-section-label')) label = el.textContent;
        else if (el.textContent.includes('Rookmelders')) return label;
      }
    });
    assert(sectionOfRook && sectionOfRook.includes('Nog niet ingepland'), 'Rookmelders staan onder: ' + sectionOfRook);
    const rook = await page.textContent('#onderhoudList .ond-item:has-text("Rookmelders")');
    assert(rook.includes('Nog nooit gedaan'), 'Rookmelders tonen geen "Nog nooit gedaan"');
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },

  async 'signalen bovenaan Vandaag staan op urgentie'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    // Weer staat aan, dus twee plekken: onderhoud (dakgoot is al te laat) en de bestelling
    // (over 2 d) gaan voor Oma (4 d), wasmachine-garantie (30 d) en vakantie (79 d).
    const pills = await page.$$eval('#statChips .chip', els => els.map(e => e.textContent.trim()));
    assert(pills.length === 2, 'Verwacht 2 signalen, kreeg ' + pills.length + ': ' + pills.join(' | '));
    assert(pills[0].includes('onderhoudstaken'), 'Eerste signaal zou onderhoud zijn: ' + pills.join(' | '));
    assert(pills[1].includes('1 bestelling'), 'Tweede signaal zou de bestelling zijn: ' + pills.join(' | '));
    await c.close();
  },

  async 'Gezins-DNA past binnen het scherm'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await page.click('[data-view="meerView"]');
    await page.click('#openGezinsDNA'); await page.waitForTimeout(400);
    const over = await page.$$eval('#gezinsDnaOverlay .dna-card', els => els.filter(e => { const r = e.getBoundingClientRect(); return r.left < 8 || r.right > window.innerWidth - 8; }).length);
    assert(over === 0, over + ' kaarten raken de rand of lopen buiten beeld');
    await c.close();
  },

  async 'Instellingen verwijst naar de deelknop'(ctx) {
    const fx = readFixture('huishouden.json');
    const { page, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    const txt = await page.textContent('#qrCard');
    assert(!txt.includes('Vandaag → Kopieer link'), 'Verouderde verwijzing staat er nog');
    assert(txt.includes('deelknop'), 'Nieuwe verwijzing ontbreekt');
    await c.close();
  },
};
