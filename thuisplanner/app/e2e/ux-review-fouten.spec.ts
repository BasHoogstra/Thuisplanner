import { expect, test } from '@playwright/test';

// De fouten uit de UX-review van 4 november 2026, op 360 px, 390 px en desktop. Vaste demo-klok: woensdag 4 november 2026.
const op = (tijd: string) => `./?nu=2026-11-04T${tijd}`;

test('Vandaag: Zwemles staat één keer, en de kaart zegt Straks of Nu', async ({ page }) => {
  await page.goto(op('08:10'));
  await expect(page.locator('.straks .sectie-label')).toHaveText('Straks');
  await expect(page.locator('.straks-titel')).toHaveText('Zwemles');
  await expect(page.getByRole('button', { name: /^Zwemles, / })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Voetbal, / })).toHaveCount(1);
  await page.goto(op('13:30'));
  await expect(page.locator('.straks .sectie-label')).toHaveText('Nu');
  await expect(page.locator('.straks-titel')).toHaveText('Voetbal');
  await page.goto(op('10:30'));
  await expect(page.locator('.straks .sectie-label')).toHaveText('Straks');
  await expect(page.locator('.straks-titel')).toHaveText('Voetbal');
});

test('de +: een uitgeschreven datum met weekdag, en de kaart noemt een taak', async ({ page }) => {
  await page.goto(op('08:10'));
  await page.locator('.nav-plus').click();
  const veld = page.getByRole('dialog', { name: 'Toevoegen' }).getByLabel('Wat wil je regelen?');
  const regel = page.locator('.kaart-regel');
  await veld.fill('vrijdag 13 november schoolreis Lotte 8:30');
  await expect(page.locator('.kaart-titel')).toHaveText('Schoolreis');
  await expect(regel).toContainText('13 november');
  await veld.fill('vrijdag 14 november schoolreis');
  await expect(page.getByRole('dialog', { name: 'Toevoegen' })).toContainText('Je schreef vrijdag, maar dit is een zaterdag.');
  await veld.fill('melk, eieren en wc papier');
  await expect(regel).toHaveText('Op de boodschappenlijst');
  await veld.fill('bellen, mailen, opruimen');
  await expect(regel).toHaveText('Taak · Zonder datum');
});

test('een open venster gaat voor de melding, en de melding komt terug bij sluiten', async ({ page }, info) => {
  await page.goto(op('08:10'));
  await page.getByRole('checkbox', { name: /Cadeautje voor Noor/ }).click();
  const melding = page.locator('.melding');
  await expect(melding).toContainText('afgerond');
  // Onderaan op de telefoon: de knoppen van het venster mogen niet onder de melding vallen.
  await page.getByRole('button', { name: /^Voetbal, / }).click();
  const dialoog = page.getByRole('dialog');
  await expect(dialoog).toBeVisible();
  const vlak = (await melding.boundingBox())!;
  const bovenop = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.melding') !== null, { x: vlak.x + vlak.width / 2, y: vlak.y + vlak.height / 2 });
  expect(bovenop, 'de melding ligt boven het venster').toBe(false);
  await dialoog.getByRole('button', { name: 'Sluiten' }).click();
  await expect(page.getByRole('button', { name: 'Ongedaan maken' })).toBeVisible();
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(page.getByRole('checkbox', { name: /Cadeautje voor Noor/ })).not.toBeChecked();
  info.annotations.push({ type: 'scherm', description: String(page.viewportSize()?.width) });
});
