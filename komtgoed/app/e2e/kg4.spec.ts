import { expect, test, type Page } from '@playwright/test';

// KG-4: maand- en dagweergave, herhalende afspraken, gezinsfilter.
// Vaste demo-klok: zaterdag 10 oktober 2026, 11:20.
const START = './?nu=2026-10-10T11:20';

const venster = (p: Page) => p.getByRole('dialog');
const nav = (p: Page, naam: string) => p.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: naam }).click();
const weergave = (p: Page, naam: 'Dag' | 'Week' | 'Maand') => p.getByRole('tab', { name: naam, exact: true }).click();
const filter = (p: Page, naam: string) => p.getByRole('group', { name: 'Wiens agenda' }).getByRole('button', { name: naam }).click();
const titel = (p: Page) => p.locator('.week-titel');
const dagLijst = (p: Page) => p.getByRole('region', { name: /^Dagoverzicht/ });
const weekDag = (p: Page, label: RegExp) => p.locator('section.week-dag').and(p.getByRole('region', { name: label }));
const maandDag = (p: Page, begin: string) => p.getByRole('gridcell').getByRole('button', { name: new RegExp('^' + begin) });

async function geenHorizontaleScroll(p: Page) {
  const { breed, scherm } = await p.evaluate(() => ({ breed: document.documentElement.scrollWidth, scherm: window.innerWidth }));
  expect(breed, 'pagina is breder dan het scherm').toBeLessThanOrEqual(scherm);
}

test.beforeEach(async ({ page }) => {
  page.on('request', r => {
    const u = new URL(r.url());
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !['data:', 'file:'].includes(u.protocol)) throw new Error('Externe aanvraag: ' + r.url());
  });
  await page.goto(START);
  await nav(page, 'Agenda');
});

test.describe('Maandweergave', () => {
  test('toont de maand, per dag subtiel afspraken en taken, en bladert over maanden', async ({ page }) => {
    await weergave(page, 'Maand');
    await expect(titel(page)).toContainText('Oktober 2026');
    await expect(page.getByRole('gridcell')).toHaveCount(35);
    await expect(maandDag(page, 'zaterdag 10 oktober \\(vandaag\\): 4 afspraken, 2 taken')).toBeVisible();
    await expect(maandDag(page, 'maandag 12 oktober: 1 taak')).toBeVisible();
    await expect(maandDag(page, 'woensdag 7 oktober: niets gepland')).toBeVisible();
    await geenHorizontaleScroll(page);

    await page.getByRole('button', { name: 'Volgende maand' }).click();
    await expect(titel(page)).toContainText('November 2026');
    await expect(maandDag(page, 'maandag 2 november: 1 afspraak')).toBeVisible(); // Oma Ria jarig (jaarlijks)
    await page.getByRole('button', { name: 'Vorige maand' }).click();
    await page.getByRole('button', { name: 'Vorige maand' }).click();
    await expect(titel(page)).toContainText('September 2026');
    await page.getByRole('button', { name: 'Naar vandaag' }).click();
    await expect(titel(page)).toContainText('Oktober 2026');
    await expect(page.getByRole('button', { name: 'Naar vandaag' })).toHaveCount(0);
  });

  test('een dag aantikken opent het dagoverzicht van die dag', async ({ page }) => {
    await weergave(page, 'Maand');
    await maandDag(page, 'zaterdag 17 oktober').click();
    await expect(page.getByRole('tab', { name: 'Dag', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(titel(page)).toContainText('Zaterdag 17 oktober');
    await expect(dagLijst(page)).toContainText('Zwemles');
    await expect(dagLijst(page)).toContainText('Bezet');
    await geenHorizontaleScroll(page);
  });
});

test.describe('Dagoverzicht', () => {
  test('afspraken op tijdsvolgorde, taken van die dag, vorige/volgende dag', async ({ page }) => {
    await weergave(page, 'Dag');
    await expect(titel(page)).toContainText('Vandaag');
    const tijden = await dagLijst(page).locator('.rij-tijd').evaluateAll(els => els.map(e => e.firstChild?.textContent?.trim()));
    expect(tijden).toEqual(['09:15', '13:00', '15:00', '18:00']);
    await expect(dagLijst(page)).toContainText('Plantenbak water geven');
    await page.getByRole('button', { name: 'Volgende dag' }).click();
    await expect(titel(page)).toContainText('Morgen');
    await expect(dagLijst(page)).toContainText('Gym');
    await page.getByRole('button', { name: 'Vorige dag' }).click();
    await page.getByRole('button', { name: 'Vorige dag' }).click();
    await expect(titel(page)).toContainText('Gisteren');
    await expect(dagLijst(page)).toContainText('Toestemmingsformulier schoolreis');
  });

  test('direct iets toevoegen op de gekozen datum', async ({ page }) => {
    await weergave(page, 'Maand');
    await maandDag(page, 'donderdag 22 oktober').click();
    await page.getByRole('button', { name: 'Afspraak toevoegen op donderdag 22 oktober' }).click();
    await venster(page).getByLabel('Wat?').fill('Kinderfeestje');
    await venster(page).getByLabel('Van', { exact: true }).fill('14:00');
    await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
    await expect(dagLijst(page)).toContainText('Kinderfeestje');
    await page.getByRole('button', { name: 'Taak toevoegen op donderdag 22 oktober' }).click();
    await venster(page).getByLabel('Wat?').fill('Cadeau inpakken');
    await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
    await expect(dagLijst(page).getByRole('checkbox', { name: 'Cadeau inpakken' })).toBeVisible();
  });

  test('de weekkop opent het dagoverzicht', async ({ page }) => {
    await page.getByRole('button', { name: 'Dagoverzicht zondag 11 oktober' }).click();
    await expect(titel(page)).toContainText('Morgen');
    await expect(dagLijst(page)).toContainText('Eten bij oma');
  });
});

test.describe('Herhalende afspraken', () => {
  test('nieuwe wekelijkse afspraak met einddatum staat op elke juiste dag, en niet daarna', async ({ page }) => {
    await page.locator('.nav-plus').click();
    await venster(page).getByLabel('Wat?').fill('Pianoles');
    await venster(page).getByRole('button', { name: 'Andere dag' }).click();
    await venster(page).getByLabel('Datum').fill('2026-10-14');
    await venster(page).getByLabel('Van', { exact: true }).fill('16:00');
    await venster(page).getByRole('button', { name: 'Elke week' }).click();
    await venster(page).getByLabel('Tot en met').fill('2026-11-04');
    await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
    await expect(page.getByRole('status')).toContainText('elke week op woensdag');
    await weergave(page, 'Maand');
    for (const d of ['woensdag 14 oktober', 'woensdag 21 oktober', 'woensdag 28 oktober']) {
      await expect(maandDag(page, `${d}: 1 afspraak`)).toBeVisible();
    }
    await page.getByRole('button', { name: 'Volgende maand' }).click();
    await expect(maandDag(page, 'woensdag 4 november: 1 afspraak')).toBeVisible();
    await expect(maandDag(page, 'woensdag 11 november: niets gepland')).toBeVisible();
  });

  test('een einddatum vóór de eerste keer wordt geweigerd', async ({ page }) => {
    await page.locator('.nav-plus').click();
    await venster(page).getByLabel('Wat?').fill('Fout');
    await venster(page).getByRole('button', { name: 'Elke dag' }).click();
    await venster(page).getByLabel('Tot en met').fill('2026-10-01');
    await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
    await expect(venster(page)).toContainText('De laatste keer ligt vóór de eerste keer.');
  });

  test('alleen deze wijzigen: precies één afspraak op die dag, de rest van de reeks blijft gelijk', async ({ page }) => {
    await page.getByRole('button', { name: 'Volgende week' }).click();
    const zaterdag = weekDag(page, /^zaterdag 17 oktober$/);
    await zaterdag.getByRole('button', { name: /^Zwemles, 09:15/ }).click();
    await expect(venster(page)).toContainText('Elke week op zaterdag');
    await expect(venster(page).getByRole('radio', { name: 'Alleen deze' })).toHaveAttribute('aria-checked', 'true');
    await venster(page).getByLabel('Van', { exact: true }).fill('10:30');
    await venster(page).getByLabel('Tot', { exact: true }).fill('11:15');
    await venster(page).getByRole('button', { name: 'Alleen deze opslaan' }).click();
    await expect(zaterdag.getByRole('button', { name: /^Zwemles/ })).toHaveCount(1);
    await expect(zaterdag.getByRole('button', { name: /^Zwemles, 10:30 – 11:15/ })).toBeVisible();
    await page.getByRole('button', { name: 'Volgende week' }).click();
    await expect(weekDag(page, /^zaterdag 24 oktober$/).getByRole('button', { name: /^Zwemles, 09:15/ })).toBeVisible();
    await nav(page, 'Vandaag');
    await expect(page.getByRole('button', { name: /^Zwemles, 09:15 – 10:00/ })).toBeVisible();
  });

  test('hele reeks wijzigen past elke week aan', async ({ page }) => {
    await page.getByRole('button', { name: /^Zwemles, 09:15/ }).click();
    await venster(page).getByRole('radio', { name: 'Hele reeks' }).click();
    await expect(venster(page).getByText('Eerste keer')).toBeVisible();
    await venster(page).getByLabel('Wat?').fill('Zwemles diploma B');
    await venster(page).getByRole('button', { name: 'Hele reeks opslaan' }).click();
    await expect(page.getByRole('status')).toContainText('Hele reeks Zwemles diploma B aangepast');
    await weergave(page, 'Maand');
    await maandDag(page, 'zaterdag 31 oktober').click();
    await expect(dagLijst(page)).toContainText('Zwemles diploma B');
    await nav(page, 'Vandaag');
    await expect(page.locator('main')).toContainText('Zwemles diploma B');
  });

  test('alleen deze verwijderen, ongedaan maken, en de hele reeks verwijderen', async ({ page }) => {
    await page.getByRole('button', { name: 'Volgende week' }).click();
    await weekDag(page, /^zaterdag 17 oktober$/).getByRole('button', { name: /^Zwemles/ }).click();
    await venster(page).getByRole('button', { name: 'Alleen deze verwijderen' }).click();
    await expect(page.getByRole('status')).toContainText('Zwemles op zaterdag 17 oktober verwijderd');
    await expect(weekDag(page, /^zaterdag 17 oktober$/)).not.toContainText('Zwemles');
    await page.getByRole('button', { name: 'Ongedaan maken' }).click();
    await expect(weekDag(page, /^zaterdag 17 oktober$/)).toContainText('Zwemles');

    await weekDag(page, /^zaterdag 17 oktober$/).getByRole('button', { name: /^Zwemles/ }).click();
    await venster(page).getByRole('radio', { name: 'Hele reeks' }).click();
    await venster(page).getByRole('button', { name: 'Hele reeks verwijderen' }).click();
    await expect(page.getByRole('status')).toContainText('Hele reeks Zwemles verwijderd');
    await weergave(page, 'Maand');
    // Alleen de privé-reeks van Thomas blijft over op zaterdag.
    await expect(maandDag(page, 'zaterdag 24 oktober: 1 afspraak')).toBeVisible();
    await maandDag(page, 'zaterdag 24 oktober').click();
    await expect(dagLijst(page)).not.toContainText('Zwemles');
    await nav(page, 'Vandaag');
    await expect(page.getByText('Vandaag: 3 afspraken en 3 taken.')).toBeVisible();
  });
});

test.describe('Gezinsfilter en privacy', () => {
  test('één lid: alleen diens afspraken, die voor iedereen en diens taken', async ({ page }) => {
    await filter(page, 'Lotte');
    const vandaag = weekDag(page, /vandaag$/);
    await expect(vandaag).toContainText('Voetbal');
    await expect(vandaag).toContainText('Pizza bakken met de buren');
    await expect(vandaag).not.toContainText('Zwemles');
    await expect(vandaag).not.toContainText('Bezet');
    await expect(vandaag).toContainText('Plantenbak water geven');
    await expect(vandaag).not.toContainText('Cadeautje voor Noor');
    await geenHorizontaleScroll(page);
  });

  test('privé blijft afgeschermd in dag, week en maand, ook met het filter op de eigenaar', async ({ page }) => {
    await filter(page, 'Thomas');
    await expect(weekDag(page, /vandaag$/)).toContainText('Bezet');
    await weergave(page, 'Maand');
    await expect(maandDag(page, 'zaterdag 10 oktober \\(vandaag\\): 2 afspraken')).toBeVisible();
    await maandDag(page, 'zaterdag 10 oktober').click();
    await dagLijst(page).getByRole('button', { name: /^Bezet, 15:00 – 16:00/ }).click();
    await expect(venster(page).getByRole('heading', { name: 'Bezet' })).toBeVisible();
    await expect(venster(page).getByRole('radio')).toHaveCount(0);
    await expect(venster(page).getByRole('textbox')).toHaveCount(0);
    await expect(venster(page).getByRole('button', { name: /verwijderen/i })).toHaveCount(0);
  });

  test('het filter blijft staan als je even naar Vandaag gaat; Vandaag zelf blijft ongefilterd', async ({ page }) => {
    await filter(page, 'Daan');
    await weergave(page, 'Maand');
    await nav(page, 'Vandaag');
    await expect(page.getByText('Vandaag: 4 afspraken en 3 taken.')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Wiens agenda' })).toHaveCount(0);
    await nav(page, 'Agenda');
    await expect(page.getByRole('tab', { name: 'Maand', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('group', { name: 'Wiens agenda' }).getByRole('button', { name: 'Daan' })).toHaveAttribute('aria-pressed', 'true');
  });
});
