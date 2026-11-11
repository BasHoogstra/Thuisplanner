import { expect, test } from '@playwright/test';
import { kiesFilter } from './hulp-agenda';

// Taken als weergave binnen de Agenda (besluit Bas, 10 november 2026): geen eigen hoofdknop en geen eigen lijst. Dezelfde
// taken als op Vandaag en in plannen, met hetzelfde vinkje. Vaste demo-klok: zaterdag 10 oktober 2026, 11:20.
const START = './?nu=2026-10-10T11:20';

test.beforeEach(async ({ page }) => {
  await page.goto(`${START}#/agenda`);
  await page.getByRole('tab', { name: 'Taken', exact: true }).click();
});

test('Taken in de Agenda: te laat, vandaag en komende dagen; geen hoofdknop en geen datumnavigatie; past op het scherm', async ({ page }) => {
  await expect(page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Taken' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Taken', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('list', { name: 'Te laat' })).toContainText('Toestemmingsformulier schoolreis');
  await expect(page.getByRole('list', { name: 'Vandaag' })).toContainText('Plantenbak water geven');
  await expect(page.getByRole('list', { name: 'Komende dagen' })).toContainText('Fietsband Lotte plakken');
  await expect(page.getByRole('button', { name: /^Volgende (dag|week|maand)$/ })).toHaveCount(0);
  const { breed, scherm } = await page.evaluate(() => ({ breed: document.documentElement.scrollWidth, scherm: window.innerWidth }));
  expect(breed, 'pagina is breder dan het scherm').toBeLessThanOrEqual(scherm);
});

test('één vinkje: afvinken in Taken is ook afgerond in de Dag van de Agenda, en terugzetten werkt overal', async ({ page }) => {
  await page.getByRole('list', { name: 'Vandaag' }).getByRole('checkbox', { name: /Plantenbak water geven/ }).click();
  await expect(page.getByRole('list', { name: 'Vandaag' })).not.toContainText('Plantenbak water geven');
  await page.getByRole('tab', { name: 'Dag', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Plantenbak water geven/ })).toHaveCount(0);   // afgerond staat ingeklapt
  await page.getByRole('button', { name: /afgerond · tonen/ }).first().click();
  const vink = page.getByRole('checkbox', { name: /Plantenbak water geven/ });
  await expect(vink).toBeChecked();
  await vink.click();
  await page.getByRole('tab', { name: 'Taken', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Vandaag' })).toContainText('Plantenbak water geven');
});

test('het gezinsfilter geldt ook in Taken', async ({ page }) => {
  await kiesFilter(page, 'Thomas');
  await expect(page.getByRole('list', { name: 'Komende dagen' })).toContainText('Fietsband Lotte plakken');
  await expect(page.getByText('Plantenbak water geven')).toHaveCount(0);
});
