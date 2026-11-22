import { expect, test, type Page } from '@playwright/test';

// Plannen, stap A (besluit 18), op 360 px, 390 px en desktop. Vaste demo-klok: woensdag 21 oktober 2026.
const START = './?nu=2026-10-21T10:00';

async function geenHorizontaleScroll(p: Page, wat: string) {
  const { breed, scherm } = await p.evaluate(() => ({ breed: document.documentElement.scrollWidth, scherm: window.innerWidth }));
  expect(breed, `${wat}: pagina is breder dan het scherm`).toBeLessThanOrEqual(scherm);
}
async function naarPlannen(p: Page) {
  await p.goto(START);
  await p.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Meer' }).click();
  await p.getByRole('button', { name: /^Plannen:/ }).click();
  await expect(p.getByRole('heading', { level: 1, name: 'Plannen' })).toBeVisible();
}

test('van Vandaag afvinken naar de voortgang in het plan, en terugdraaien', async ({ page }) => {
  await page.goto(START);
  await page.getByRole('checkbox', { name: 'Spullen naar de kringloop' }).click();
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await page.getByRole('checkbox', { name: 'Spullen naar de kringloop' }).click();
  await page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Meer' }).click();
  await page.getByRole('button', { name: /^Plannen:/ }).click();
  await page.getByRole('button', { name: /^Schuur opruimen, Bezig, 2 van 5 klaar/ }).click();
  await expect(page.getByRole('progressbar', { name: 'Taken klaar' })).toHaveAttribute('aria-valuenow', '2');
  await page.getByRole('button', { name: /afgerond · tonen/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Spullen naar de kringloop' })).toBeChecked();
  await geenHorizontaleScroll(page, 'plan');
});

test('een klein plan maken: alleen een naam, dan taken met Enter, en herladen zet de demo terug', async ({ page }) => {
  await naarPlannen(page);
  await page.getByRole('button', { name: 'Nieuw plan' }).click();
  await page.getByLabel('Naam').fill('Een heel lang plan met een naam die op een smal scherm netjes moet afbreken');
  await page.getByRole('button', { name: 'Plan maken' }).click();
  const veld = page.getByLabel('Taak toevoegen');
  await expect(veld).toBeFocused();
  await veld.fill('Slingers kopen');
  await veld.press('Enter');
  await expect(page.getByRole('checkbox', { name: 'Slingers kopen' })).toBeVisible();
  await geenHorizontaleScroll(page, 'nieuw plan');
  await page.getByRole('button', { name: 'Plannen' }).click();
  await geenHorizontaleScroll(page, 'overzicht');
  await page.reload();
  await expect(page.getByRole('button', { name: /^Een heel lang plan/ })).toHaveCount(0);
});

test('de tikvlakken zijn groot genoeg en het vel past op het scherm', async ({ page }) => {
  await naarPlannen(page);
  const kaart = (await page.getByRole('button', { name: /^Schuur opruimen,/ }).boundingBox())!;
  expect(kaart.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: /^Schuur opruimen,/ }).click();
  const vink = (await page.getByRole('checkbox', { name: 'Vegen' }).boundingBox())!;
  expect(vink.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Schuur opruimen aanpassen' }).click();
  const dialoog = page.getByRole('dialog', { name: 'Plan aanpassen' });
  await dialoog.getByRole('button', { name: 'Plan verwijderen' }).click();
  await dialoog.getByRole('button', { name: 'Plan en taken' }).scrollIntoViewIfNeeded();
  await expect(dialoog.getByRole('button', { name: 'Plan en taken' })).toBeVisible();
  await geenHorizontaleScroll(page, 'venster');
});
