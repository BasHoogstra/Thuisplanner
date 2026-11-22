import { expect, test, type Page } from '@playwright/test';

// Plannen, stap B (besluit 18), op 360 px, 390 px en desktop. Vaste demo-klok: woensdag 21 oktober 2026.
const START = './?nu=2026-10-21T10:00';

async function geenHorizontaleScroll(p: Page, wat: string) {
  const { breed, scherm } = await p.evaluate(() => ({ breed: document.documentElement.scrollWidth, scherm: window.innerWidth }));
  expect(breed, `${wat}: pagina is breder dan het scherm`).toBeLessThanOrEqual(scherm);
}
async function naarPlan(p: Page, naam: string) {
  await p.goto(START);
  await p.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Meer' }).click();
  await p.getByRole('button', { name: /^Plannen:/ }).click();
  await p.getByRole('button', { name: new RegExp(`^${naam},`) }).click();
  await expect(p.getByRole('heading', { level: 1, name: naam })).toBeVisible();
}

test('een groot plan: één onderdeel open, wisselen, en de koppen zijn groot genoeg om te tikken', async ({ page }) => {
  await naarPlan(page, 'Zolder verbouwen');
  const voor = page.getByRole('button', { name: /^Voorbereiding/ });
  const bouw = page.getByRole('button', { name: /^Verbouwing/ });
  await expect(voor).toHaveAttribute('aria-expanded', 'true');
  await expect(bouw).toHaveAttribute('aria-expanded', 'false');
  expect((await bouw.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await bouw.click();
  await expect(page.getByRole('checkbox', { name: 'Elektra leggen' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Vergunning nakijken' })).toHaveCount(0);
  await geenHorizontaleScroll(page, 'plan met onderdelen');
});

test('een taak uit een onderdeel staat met dezelfde stand op Vandaag en in het plan; ongedaan maken werkt', async ({ page }) => {
  await naarPlan(page, 'Zolder verbouwen');
  await page.getByRole('button', { name: 'Budget afspreken openen' }).click();
  const d = page.getByRole('dialog', { name: 'Taak' });
  await d.getByRole('button', { name: /^Dag / }).click();
  await d.getByRole('group', { name: 'Wanneer' }).getByRole('button', { name: 'Vandaag' }).click();
  await d.getByRole('button', { name: /^Status / }).click();
  await d.getByRole('group', { name: 'Status van de taak' }).getByRole('button', { name: 'Bezig' }).click();
  await d.getByRole('button', { name: 'Opslaan' }).click();
  await page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Vandaag' }).click();
  const vink = page.getByRole('checkbox', { name: 'Budget afspreken' });
  await expect(vink).toHaveAttribute('aria-checked', 'mixed');
  await vink.click();
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(vink).toHaveAttribute('aria-checked', 'mixed');
});

test('de Agenda: de groep staat dicht en blijft vindbaar; openen en doorklikken naar het plan', async ({ page }) => {
  await page.goto(`${START}#/agenda`);
  const kop = page.getByRole('button', { name: /^Zonder datum/ });
  if (await kop.isVisible()) {
    if (await kop.getAttribute('aria-expanded') === 'false') await kop.click();
  }
  const groep = page.getByRole('button', { name: /Taken uit plannen/ }).first();
  await expect(groep).toHaveAttribute('aria-expanded', 'false');
  await groep.click();
  await expect(page.getByRole('list', { name: 'Taken uit Zolder verbouwen' }).getByRole('checkbox')).toHaveCount(6);
  await geenHorizontaleScroll(page, 'groep in de agenda');
  await page.getByRole('button', { name: 'Naar Zolder verbouwen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Zolder verbouwen' })).toBeVisible();
});

test('een klein plan blijft één lijst, en het eerste onderdeel maak je zelf', async ({ page }) => {
  await naarPlan(page, 'Schuur opruimen');
  await expect(page.getByRole('list', { name: 'Open taken' })).toBeVisible();
  await page.getByRole('button', { name: 'Onderdeel toevoegen' }).click();
  const v = page.getByRole('dialog', { name: 'Nieuw onderdeel' });
  await v.getByLabel('Naam').fill('Afvoeren');
  await v.getByRole('button', { name: 'Onderdeel toevoegen' }).click();
  await expect(page.getByRole('button', { name: /^Afvoeren/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('checkbox', { name: 'Vegen' })).toBeVisible();
  await geenHorizontaleScroll(page, 'eerste onderdeel');
});
