import { expect, test, type Page } from '@playwright/test';

// W1 in de demo, op 360 px, 390 px en desktop: een bestaande afspraak of taak opent eerst een rustig overzicht. Eén
// onderdeel wijzigen, verwijderen met bevestiging, en een taak afronden. Vaste demo-klok: zaterdag 10 oktober 2026, 11:20.
const START = './?nu=2026-10-10T11:20';
const venster = (p: Page) => p.getByRole('dialog');
const sectie = (p: Page, naam: string) => p.locator('section', { has: p.getByRole('heading', { name: naam, exact: true }) });

async function geenHorizontaleScroll(p: Page) {
  const { breed, scherm } = await p.evaluate(() => ({ breed: document.documentElement.scrollWidth, scherm: window.innerWidth }));
  expect(breed, 'pagina is breder dan het scherm').toBeLessThanOrEqual(scherm);
}
const pizza = (p: Page) => p.getByRole('button', { name: /^Pizza bakken met de buren, 18:00\. Openen$/ });

test.beforeEach(async ({ page }) => {
  page.on('request', r => {
    const u = new URL(r.url());
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !['data:', 'file:'].includes(u.protocol)) throw new Error('Externe aanvraag: ' + r.url());
  });
  await page.goto(START);
});

test('eerst overzicht: titel, dag, tijd en wie; geen keuzes, geen Opslaan, verwijderen achter Meer…', async ({ page }) => {
  await pizza(page).click();
  await expect(venster(page).getByLabel('Wat?')).toHaveValue('Pizza bakken met de buren');
  await expect(venster(page).getByRole('button', { name: /^Dag Zaterdag 10 oktober/ })).toBeVisible();
  await expect(venster(page).getByRole('button', { name: /^Tijd 18:00/ })).toBeVisible();
  await expect(venster(page).getByRole('button', { name: /^Voor wie / })).toBeVisible();
  await expect(venster(page).getByRole('group', { name: 'Wanneer' })).toHaveCount(0);
  await expect(venster(page).getByRole('button', { name: 'Opslaan' })).toHaveCount(0);
  await expect(venster(page).getByRole('button', { name: /Verwijderen/ })).toHaveCount(0);
  await geenHorizontaleScroll(page);
});

test('één onderdeel wijzigen: een andere dag, en de afspraak verhuist', async ({ page }) => {
  await pizza(page).click();
  await venster(page).getByRole('button', { name: /^Dag / }).click();
  await venster(page).getByRole('group', { name: 'Wanneer' }).getByRole('button', { name: 'Morgen', exact: true }).click();
  await venster(page).getByRole('button', { name: 'Opslaan' }).click();
  await expect(venster(page)).toBeHidden();
  await expect(sectie(page, 'Agenda vandaag')).not.toContainText('Pizza bakken');
  await expect(page.getByRole('status')).toContainText('Pizza bakken met de buren aangepast (morgen 18:00)');
});

test('verwijderen met bevestiging; "Nee, terug" laat hem staan, en ongedaan maken zet hem terug', async ({ page }) => {
  await pizza(page).click();
  await venster(page).getByRole('button', { name: 'Meer…' }).click();
  await venster(page).getByRole('button', { name: 'Verwijderen' }).click();
  await venster(page).getByRole('button', { name: 'Nee, terug' }).click();
  await expect(venster(page)).toBeVisible();
  await venster(page).getByRole('button', { name: 'Meer…' }).click();
  await venster(page).getByRole('button', { name: 'Verwijderen' }).click();
  await venster(page).getByRole('button', { name: 'Ja, verwijderen' }).click();
  await expect(sectie(page, 'Agenda vandaag')).not.toContainText('Pizza bakken');
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(sectie(page, 'Agenda vandaag')).toContainText('Pizza bakken');
});

test('een taak: de status en "Afgerond" direct in het overzicht', async ({ page }) => {
  await page.getByRole('button', { name: 'Plantenbak water geven openen' }).click();
  await expect(venster(page)).toContainText('Nog te doen');
  await venster(page).getByRole('button', { name: 'Afgerond' }).click();
  await expect(venster(page)).toBeHidden();
  await expect(page.getByRole('checkbox', { name: 'Plantenbak water geven', checked: false })).toHaveCount(0);
});

test('wijzigingen weggooien zet alles terug', async ({ page }) => {
  await pizza(page).click();
  await venster(page).getByLabel('Wat?').fill('Pizza');
  await venster(page).getByRole('button', { name: 'Wijzigingen weggooien' }).click();
  await expect(venster(page).getByLabel('Wat?')).toHaveValue('Pizza bakken met de buren');
  await expect(venster(page).getByRole('button', { name: 'Opslaan' })).toHaveCount(0);
});
