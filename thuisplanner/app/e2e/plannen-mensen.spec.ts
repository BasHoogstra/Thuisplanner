import { expect, test, type Page } from '@playwright/test';

// Plannen, stap C (besluit 18, gate "Meerdere verantwoordelijken"), op 360 px, 390 px en desktop.
// De proef uit docs/thuisplanner-plannen.md §5.1: één taak, achter elkaar door plan, venster, formulier en Agenda.
const START = './?nu=2026-10-21T10:00';

// UITGESCHAKELD voor Plannen v1 (besluit Bas, 10 november 2026): één verantwoordelijke per taak, in de demo én online.
// Deze proeven horen bij stap C en komen terug als die na de gezinsbèta alsnog wordt gekozen.
test.skip(true, 'Plannen v1: één verantwoordelijke per taak (stap C staat uit)');

async function geenHorizontaleScroll(p: Page, wat: string) {
  const { breed, scherm } = await p.evaluate(() => ({ breed: document.documentElement.scrollWidth, scherm: window.innerWidth }));
  expect(breed, `${wat}: pagina is breder dan het scherm`).toBeLessThanOrEqual(scherm);
}

test('één taak met twee personen: titel, formulier en Agenda laten niemand vallen', async ({ page }) => {
  await page.goto(`${START}#/plannen/plan-zolder`);
  await page.getByRole('button', { name: /^Afwerking/ }).click();
  const rij = (naam: string) => page.locator('li', { has: page.getByRole('checkbox', { name: naam }) });

  await page.getByRole('button', { name: 'Muren schilderen openen' }).click();
  await page.getByRole('dialog').getByLabel('Wat?').fill('Muren verven');
  await page.getByRole('dialog').getByRole('button', { name: 'Opslaan' }).click();
  await expect(rij('Muren verven')).toContainText('Eva');
  await expect(rij('Muren verven')).toContainText('Lotte');

  await page.getByRole('button', { name: 'Muren verven openen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Meer…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Alles bewerken' }).click();
  await page.getByRole('dialog').getByLabel(/^Wat/).fill('Muren schilderen');
  await page.getByRole('dialog').getByRole('button', { name: 'Opslaan' }).click();
  await expect(rij('Muren schilderen')).toContainText('Eva');
  await expect(rij('Muren schilderen')).toContainText('Lotte');
  await expect(page.getByRole('button', { name: /^Afwerking.*0 van 3/ })).toBeVisible();

  // In de Agenda, gefilterd op de tweede persoon, is het dezelfde taak.
  await page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Agenda' }).click();
  const filter = page.getByRole('button', { name: /Filter|Iedereen/ }).first();
  if (await filter.isVisible()) await filter.click();
  await page.getByRole('button', { name: 'Lotte', exact: true }).first().click();
  const kop = page.getByRole('button', { name: /^Zonder datum/ });
  if (await kop.isVisible() && await kop.getAttribute('aria-expanded') === 'false') await kop.click();
  await page.getByRole('button', { name: /Taken uit plannen/ }).first().click();
  const vink = page.getByRole('checkbox', { name: 'Muren schilderen' });
  await expect(vink).toBeVisible();
  await vink.click();
  await page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Meer' }).click();
  await page.getByRole('button', { name: /^Plannen:/ }).click();
  await expect(page.getByRole('button', { name: /^Zolder verbouwen, Bezig, 3 van 10 klaar/ })).toBeVisible();
});

test('wie doet wat: de keuzes passen op het scherm, en elke keuze is groot genoeg om te tikken', async ({ page }) => {
  await page.goto(`${START}#/plannen/plan-zolder`);
  const groep = page.getByRole('group', { name: 'Wie doet wat' });
  const breedte = page.viewportSize()!.width;
  for (const b of await groep.getByRole('button').all()) {
    const box = (await b.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(box.x + box.width).toBeLessThanOrEqual(breedte);
  }
  await groep.getByRole('button', { name: 'Nog niemand' }).click();
  await expect(page.getByRole('checkbox', { name: 'Elektra leggen' })).toBeVisible();
  await geenHorizontaleScroll(page, 'filter');
  await groep.getByRole('button', { name: 'Iedereen' }).click();
  await expect(page.getByLabel('Taak toevoegen')).toBeVisible();
});

test('meer personen kiezen: het paneel blijft open, en de rij blijft binnen het scherm', async ({ page }) => {
  await page.goto(`${START}#/plannen/plan-schuur`);
  await page.getByRole('button', { name: 'Planken ophangen openen' }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: /^Wie pakt het op / }).click();
  const groep = d.getByRole('group', { name: 'Wie pakt het op' });
  await groep.getByRole('button', { name: 'Eva' }).click();
  await groep.getByRole('button', { name: 'Thomas' }).click();
  await groep.getByRole('button', { name: 'Lotte' }).click();
  await groep.getByRole('button', { name: 'Daan' }).click();
  await d.getByRole('button', { name: 'Opslaan' }).click();
  const rij = page.locator('li', { has: page.getByRole('checkbox', { name: 'Planken ophangen' }) });
  for (const naam of ['Eva', 'Thomas', 'Lotte', 'Daan']) await expect(rij).toContainText(naam);
  await geenHorizontaleScroll(page, 'rij met vier personen');
});
