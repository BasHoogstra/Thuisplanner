import { expect, test, type Page } from '@playwright/test';

// Vaste demo-klok: zaterdag 10 oktober 2026, 11:20 (zie useKlok in App.tsx).
const START = './?nu=2026-10-10T11:20';

const plus = (p: Page) => p.locator('.nav-plus');
const venster = (p: Page) => p.getByRole('dialog', { name: 'Toevoegen' });
const sectie = (p: Page, naam: string) => p.locator('section', { has: p.getByRole('heading', { name: naam, exact: true }) });

async function geenHorizontaleScroll(p: Page) {
  const { breed, venster } = await p.evaluate(() => ({ breed: document.documentElement.scrollWidth, venster: window.innerWidth }));
  expect(breed, 'pagina is breder dan het scherm').toBeLessThanOrEqual(venster);
}

test.beforeEach(async ({ page }) => {
  // Privacy: de demo mag niets buiten de eigen herkomst ophalen of versturen.
  page.on('request', r => {
    const u = new URL(r.url());
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !['data:', 'file:'].includes(u.protocol)) throw new Error('Externe aanvraag: ' + r.url());
  });
  await page.goto(START);
});

test('Vandaag: begroeting, samenvatting, één nadrukkaart, demo-markering, geen horizontale scroll', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Goedemorgen, Eva');
  await expect(page.getByText('Zaterdag 10 oktober', { exact: false })).toBeVisible();
  await expect(page.getByText('Vandaag: 4 afspraken en 3 taken.')).toBeVisible();
  await expect(page.locator('.straks')).toHaveCount(1);
  await expect(page.locator('.straks')).toContainText('Voetbal');
  await expect(page.locator('.demobalk')).toContainText('Demo');
  await expect(page.getByText('Gymtas inpakken vanavond?')).toBeVisible();
  await expect(sectie(page, 'Binnenkort')).toContainText('Ouderavond groep 4');
  await geenHorizontaleScroll(page);
});

test('navigatie: vier bestemmingen, labels passen, adres volgt', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Hoofdnavigatie' });
  for (const naam of ['Vandaag', 'Agenda', 'Boodschappen', 'Meer']) {
    const link = nav.getByRole('link', { name: naam });
    const afgekapt = await link.locator('span').evaluate(e => e.scrollWidth > e.clientWidth);
    expect(afgekapt, `label ${naam} is afgekapt`).toBe(false);
  }
  await nav.getByRole('link', { name: 'Agenda' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agenda');
  await expect(page).toHaveURL(/#\/agenda$/);
  await geenHorizontaleScroll(page);
  await nav.getByRole('link', { name: 'Boodschappen' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Boodschappen');
  await geenHorizontaleScroll(page);
  await nav.getByRole('link', { name: 'Meer' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Meer');
  await geenHorizontaleScroll(page);
  await nav.getByRole('link', { name: 'Vandaag' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Goedemorgen, Eva');
});

test('afspraak toevoegen verschijnt op Vandaag en in de Agenda; ongedaan maken haalt hem weg', async ({ page }) => {
  await plus(page).click();
  await expect(venster(page)).toBeVisible();
  await expect(venster(page).getByLabel('Wat?')).toBeFocused();
  await venster(page).getByLabel('Wat?').fill('Kapper');
  await venster(page).getByLabel('Van', { exact: true }).fill('16:30');
  await venster(page).getByRole('button', { name: 'Eva' }).click();
  await geenHorizontaleScroll(page);
  await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
  await expect(venster(page)).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Kapper staat in de agenda (vandaag 16:30)');
  await expect(sectie(page, 'Agenda vandaag')).toContainText('Kapper');
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(sectie(page, 'Agenda vandaag')).not.toContainText('Kapper');
});

test('afspraak voor morgen staat onder Binnenkort', async ({ page }) => {
  await plus(page).click();
  await venster(page).getByLabel('Wat?').fill('Fietsenmaker');
  await venster(page).getByRole('button', { name: 'Morgen', exact: true }).click();
  await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
  await expect(sectie(page, 'Binnenkort')).toContainText('Fietsenmaker');
});

test('taak toevoegen, afvinken en weer terughalen', async ({ page }) => {
  await plus(page).click();
  await venster(page).getByRole('tab', { name: 'Taak' }).click();
  await venster(page).getByLabel('Wat?').fill('Fietsband plakken');
  await venster(page).getByRole('button', { name: 'Thomas' }).click();
  await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
  const taak = sectie(page, 'Te doen').getByRole('checkbox', { name: /Fietsband plakken/ });
  await expect(taak).toBeVisible();
  await taak.click();
  await expect(sectie(page, 'Te doen').getByText('Fietsband plakken')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(sectie(page, 'Te doen').getByText('Fietsband plakken')).toBeVisible();
});

test('boodschappen: meerdere tegelijk via het invoervenster, afvinken en opruimen', async ({ page }) => {
  await plus(page).click();
  await venster(page).getByRole('tab', { name: 'Boodschap' }).click();
  await venster(page).getByLabel('Wat is er nodig?').fill('eieren, kaas en appels');
  await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
  await expect(page.getByRole('status')).toContainText('3 boodschappen toegevoegd');
  await expect(sectie(page, 'Boodschappen')).toContainText('en nog 4');
  await page.getByRole('navigation').getByRole('link', { name: 'Boodschappen' }).click();
  await expect(page.getByText('8 dingen nog nodig.')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Kaas' }).click();
  await expect(page.getByText('7 dingen nog nodig.')).toBeVisible();
  await page.getByRole('button', { name: 'Mandje leegmaken' }).click();
  await expect(page.getByRole('checkbox', { name: 'Kaas' })).toHaveCount(0);
  await page.getByLabel('Boodschappen toevoegen').fill('Koffie');
  await page.getByLabel('Boodschappen toevoegen').press('Enter');
  await expect(page.getByRole('checkbox', { name: 'Koffie' })).toBeVisible();
});

test('invoervenster: lege invoer geeft een rustige foutmelding; Escape en sluitknop sluiten', async ({ page }) => {
  await plus(page).click();
  await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
  await expect(venster(page).getByText('Geef het even een naam.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(venster(page)).toBeHidden();
  await expect(plus(page)).toBeFocused();
  await plus(page).click();
  await venster(page).getByRole('button', { name: 'Sluiten' }).click();
  await expect(venster(page)).toBeHidden();
});

test('privé: van een ander alleen "bezet"; eigen privé-afspraak met slotje', async ({ page }) => {
  const agenda = sectie(page, 'Agenda vandaag');
  await expect(agenda).toContainText('Bezet');
  await expect(agenda).toContainText('privé-afspraak');
  await plus(page).click();
  await venster(page).getByLabel('Wat?').fill('Huisarts');
  await venster(page).getByLabel('Van', { exact: true }).fill('17:00');
  await venster(page).getByLabel(/Privé/).check();
  await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
  await expect(agenda.locator('li', { hasText: 'Huisarts' })).toContainText('alleen voor jou');
});

test('meedenken: accepteren zet één taak op de lijst; daarna verdwijnt het signaal', async ({ page }) => {
  await page.getByRole('button', { name: 'Zet op mijn lijst' }).click();
  await expect(sectie(page, 'Te doen')).toContainText('Gymtas inpakken');
  await expect(page.getByText('Gymtas inpakken vanavond?')).toHaveCount(0);
});

test('meedenken: "Niet nodig" laat het signaal verdwijnen zonder iets toe te voegen', async ({ page }) => {
  await page.getByRole('button', { name: 'Niet nodig' }).click();
  await expect(page.getByText('Gymtas inpakken vanavond?')).toHaveCount(0);
  await expect(sectie(page, 'Te doen')).not.toContainText('Gymtas');
});

test('een rustige dag oogt rustig', async ({ page }) => {
  await page.getByRole('navigation').getByRole('link', { name: 'Meer' }).click();
  await page.getByRole('button', { name: 'Rustige dag' }).click();
  await expect(page.getByText('Niets dat vandaag van je vraagt.')).toBeVisible();
  await expect(page.getByText('Een rustige dag. Er staat niets voor je klaar.')).toBeVisible();
  await expect(page.locator('.straks')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Te doen' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Agenda vandaag' })).toHaveCount(0);
  await geenHorizontaleScroll(page);
});

test('screenshots @screenshot', async ({ page }, info) => {
  test.skip(!process.env.KG_SCREENSHOTS, 'alleen via npm run screenshots');
  const naam = info.project.name;
  const pad = (s: string) => `screenshots/${naam}-${s}.png`;
  await page.screenshot({ path: pad('1-vandaag') });
  if (naam !== 'desktop') {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(100);
    await page.screenshot({ path: pad('2-vandaag-verder') });
    await page.mouse.wheel(0, -2000);
  }
  await plus(page).click();
  await venster(page).getByLabel('Wat?').fill('Kapper');
  await page.screenshot({ path: pad('3-toevoegen') });
  await page.keyboard.press('Escape');
  await page.getByRole('navigation').getByRole('link', { name: 'Meer' }).click();
  await page.getByRole('button', { name: 'Rustige dag' }).click();
  await page.waitForTimeout(5200); // melding laten verdwijnen
  await page.screenshot({ path: pad('4-rustige-dag') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(START);
  await page.screenshot({ path: pad('5-vandaag-donker') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('navigation').getByRole('link', { name: 'Agenda' }).click();
  await page.screenshot({ path: pad('6-agenda-week'), fullPage: naam === 'desktop' });
  await page.getByRole('button', { name: /^Zwemles, 09:15/ }).click();
  await page.screenshot({ path: pad('7-afspraak-bewerken') });
  await page.keyboard.press('Escape');
  await page.getByRole('navigation').getByRole('link', { name: 'Boodschappen' }).click();
  await page.getByRole('checkbox', { name: 'Melk' }).click();
  await page.screenshot({ path: pad('8-boodschappen') });
  await page.getByRole('navigation').getByRole('link', { name: 'Agenda' }).click();
  await page.getByRole('tab', { name: 'Maand', exact: true }).click();
  await page.screenshot({ path: pad('9-agenda-maand') });
  await page.getByRole('cell').getByRole('button', { name: /^zaterdag 17 oktober/ }).click();
  await page.screenshot({ path: pad('10-agenda-dag') });
  await page.getByRole('button', { name: /^Zwemles/ }).first().click();
  await page.screenshot({ path: pad('11-herhaling-bewerken') });
});

test('los bestand (dist-los/komtgoed-demo.html) werkt zonder server', async ({ page }) => {
  test.skip(!process.env.KG_LOSBESTAND, 'alleen na npm run losbestand');
  const pad = new URL('../dist-los/komtgoed-demo.html', import.meta.url).href;
  await page.goto(pad);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Eva');
  await plus(page).click();
  await venster(page).getByLabel('Wat?').fill('Kapper');
  await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
  await expect(page.getByRole('status')).toContainText('Kapper');
});

test('los bestand werkt ook in een streng afgeschermd frame (zoals de gedeelde demo)', async ({ page }) => {
  test.skip(!process.env.KG_LOSBESTAND, 'alleen na npm run losbestand');
  const { readFileSync } = await import('node:fs');
  const fragment = readFileSync(new URL('../dist-los/komtgoed-demo.fragment.html', import.meta.url), 'utf8');
  const doc = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${fragment}</body></html>`;
  await page.setContent('<iframe id="demo" sandbox="allow-scripts" style="border:0;width:100vw;height:100vh"></iframe>');
  await page.locator('#demo').evaluate((f, html) => { (f as HTMLIFrameElement).srcdoc = html; }, doc);
  const demo = page.frameLocator('#demo');
  await expect(demo.getByRole('heading', { level: 1 })).toContainText('Eva');
  await demo.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Agenda' }).click();
  await demo.getByRole('tab', { name: 'Maand', exact: true }).click();
  await expect(demo.getByRole('table', { name: 'Maandkalender' })).toBeVisible();
  await demo.locator('.nav-plus').click();
  await demo.getByRole('dialog').getByLabel('Wat?').fill('Kapper');
  await demo.getByRole('dialog').getByRole('button', { name: 'Toevoegen' }).click();
  await expect(demo.getByRole('status')).toContainText('Kapper');
  // Enter in een veld werkt ook zonder toestemming om formulieren te verzenden.
  await demo.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Boodschappen' }).click();
  await demo.getByLabel('Boodschappen toevoegen').fill('Koffie');
  await demo.getByLabel('Boodschappen toevoegen').press('Enter');
  await expect(demo.getByRole('checkbox', { name: 'Koffie' })).toBeVisible();
});

