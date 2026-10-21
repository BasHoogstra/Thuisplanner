import { expect, test, type Page } from '@playwright/test';

// B2 en C1 in de demo, op 360 px, 390 px en desktop: de centrale + als één zin, en boodschappen per categorie.
// Vaste demo-klok: zaterdag 10 oktober 2026, 11:20.
const START = './?nu=2026-10-10T11:20';
const venster = (p: Page) => p.getByRole('dialog', { name: 'Toevoegen' });
const herkend = (p: Page) => venster(p).getByRole('group', { name: 'Wat Thuisplanner herkent' });
const sectie = (p: Page, naam: string) => p.locator('section', { has: p.getByRole('heading', { name: naam, exact: true }) });

async function geenHorizontaleScroll(p: Page) {
  const { breed, scherm } = await p.evaluate(() => ({ breed: document.documentElement.scrollWidth, scherm: window.innerWidth }));
  expect(breed, 'pagina is breder dan het scherm').toBeLessThanOrEqual(scherm);
}
async function zin(p: Page, tekst: string) {
  await p.locator('.nav-plus').click();
  await expect(venster(p).getByLabel('Wat wil je regelen?')).toBeFocused();
  await venster(p).getByLabel('Wat wil je regelen?').fill(tekst);
}

test.beforeEach(async ({ page }) => {
  // Geen netwerk tijdens het typen of bewaren: de herkenning gebeurt in de app zelf.
  page.on('request', r => {
    const u = new URL(r.url());
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !['data:', 'file:'].includes(u.protocol)) throw new Error('Externe aanvraag: ' + r.url());
  });
  await page.goto(START);
});

test('rustig: de + opent alleen het veld; pas na het typen verschijnt wat herkend is', async ({ page }) => {
  await page.locator('.nav-plus').click();
  await expect(venster(page).getByRole('tab')).toHaveCount(0);
  await expect(herkend(page)).toHaveCount(0);
  await expect(venster(page).getByRole('button', { name: 'Toevoegen' })).toBeDisabled();
  await venster(page).getByLabel('Wat wil je regelen?').fill('morgen om 15:00 met Lotte naar de tandarts');
  for (const n of ['Afspraak', 'Morgen', '15:00', 'Lotte', 'Gedeeld']) await expect(herkend(page).getByRole('button', { name: n, exact: true })).toBeVisible();
  await geenHorizontaleScroll(page);
});

test('een afspraak in één zin: op Binnenkort, met ongedaan maken', async ({ page }) => {
  await zin(page, 'morgen om 15:00 met Lotte naar de tandarts');
  await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
  await expect(venster(page)).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Naar de tandarts staat in de agenda (morgen 15:00)');
  await expect(sectie(page, 'Binnenkort')).toContainText('Naar de tandarts');
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(page.locator('body')).not.toContainText('Naar de tandarts');
});

test('een taak voor vandaag, met een correctie van de dag en de persoon', async ({ page }) => {
  await zin(page, 'container morgen aan de weg');
  await herkend(page).getByRole('button', { name: 'Morgen' }).click();
  await venster(page).getByRole('group', { name: 'Wanneer' }).getByRole('button', { name: 'Vandaag' }).click();
  await herkend(page).getByRole('button', { name: 'Voor wie?' }).click();
  await venster(page).getByRole('group', { name: 'Wie pakt het op' }).getByRole('button', { name: 'Thomas' }).click();
  await geenHorizontaleScroll(page);
  await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
  await expect(page.getByRole('checkbox', { name: 'Container aan de weg' })).toBeVisible();
});

test('vier boodschappen in één zin komen elk vanzelf in hun categorie', async ({ page }) => {
  await zin(page, 'melk, bananen, luiers en brood');
  await expect(venster(page)).toContainText('4 boodschappen');
  await expect(venster(page)).toContainText('Baby & kind');
  await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
  await page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Boodschappen' }).click();
  for (const [cat, naam] of [['Zuivel & eieren', 'Melk'], ['Groente & fruit', 'Bananen'], ['Baby & kind', 'Luiers'], ['Brood & bakkerij', 'Brood']]) {
    await expect(page.getByRole('region', { name: cat }).getByRole('checkbox', { name: naam })).toBeVisible();
  }
  // Afvinken blijft één tik; afgevinkt gaat naar het mandje.
  await page.getByRole('region', { name: 'Baby & kind' }).getByRole('checkbox', { name: 'Luiers' }).click();
  await expect(page.locator('section.afgevinkt')).toContainText('Luiers');
  await geenHorizontaleScroll(page);
});

test('privé staat bij een afspraak altijd in beeld; twijfel staat er zichtbaar bij', async ({ page }) => {
  await zin(page, 'kapper om 4');
  await expect(herkend(page).getByRole('button', { name: 'Gedeeld' })).toBeVisible();
  await expect(venster(page)).toContainText('gelezen als 16:00');
  await venster(page).getByLabel('Wat wil je regelen?').fill('luiers halen vanmiddag');
  await expect(venster(page)).toContainText('Een dag bij een boodschap kan nog niet');
});

test('Alles invullen opent het formulier met wat er al herkend is', async ({ page }) => {
  await zin(page, 'donderdag zwemles in het Sportfondsenbad');
  await venster(page).getByRole('button', { name: 'Alles invullen' }).click();
  await expect(venster(page).getByLabel('Wat?')).toHaveValue('Zwemles');
  await expect(venster(page).getByLabel(/Waar/)).toHaveValue('het Sportfondsenbad');
});
