import { expect, test, type Page } from '@playwright/test';

// W2 in de demo, op 360 px, 390 px en desktop: de week als rustige lijst (D5) of als zeven compacte kolommen (D6). Per
// rij alleen tijd, titel (hoogstens twee regels, zonder afbreekstreepjes) en één persoonsmarkering; de rest staat in het
// detailvenster (W1). Vaste demo-klok: zaterdag 10 oktober 2026, 11:20; week 41 heeft vier lege dagen achter elkaar.
const START = './?nu=2026-10-10T11:20';
const venster = (p: Page) => p.getByRole('dialog');
const isDesktop = (p: Page) => (p.viewportSize()?.width ?? 0) >= 960;

async function naarWeek(p: Page) {
  await p.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Agenda' }).click();
  await p.getByRole('tab', { name: 'Week', exact: true }).click();
  await expect(p.getByText('5 – 11 oktober · week 41')).toBeVisible();
}

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
  await naarWeek(page);
});

test('titels: hoogstens twee regels, zonder afbreekstreepjes, en de pagina scrollt niet opzij', async ({ page }) => {
  const titels = page.locator('.week-rij-titel');
  expect(await titels.count()).toBeGreaterThan(5);
  const metingen = await titels.evaluateAll(els => els.filter(e => (e as HTMLElement).offsetParent).map(e => {
    const s = getComputedStyle(e);
    return { regels: Math.round(e.getBoundingClientRect().height / parseFloat(s.lineHeight)), hyphens: s.hyphens, rechts: e.getBoundingClientRect().right, ouder: e.closest('li')!.getBoundingClientRect().right };
  }));
  for (const m of metingen) {
    expect(m.regels).toBeLessThanOrEqual(2);
    expect(m.hyphens).toBe('none');
    expect(m.rechts).toBeLessThanOrEqual(m.ouder + 0.5);
  }
  await geenHorizontaleScroll(page);
});

test('een rij toont tijd, titel en één persoonsmarkering; plek en eindtijd staan in het detailvenster', async ({ page }) => {
  const zwemles = page.getByRole('button', { name: /^Zwemles, 09:15/ });
  await expect(zwemles).toContainText('09:15');
  await expect(zwemles).toContainText('Daan');
  await expect(zwemles).not.toContainText('–');
  // Meer personen: de eerste met "+n" (de volledige lijst in het detailvenster).
  await page.getByRole('button', { name: 'Volgende week' }).click();
  await expect(page.getByRole('button', { name: /^Ouderavond groep 4, / })).toContainText(/\+1/);
  await page.getByRole('button', { name: /^Ouderavond groep 4, / }).click();
  await expect(venster(page).getByRole('button', { name: /^Voor wie / })).toBeVisible();
  await expect(venster(page).getByRole('textbox', { name: 'Wat?' })).toHaveValue('Ouderavond groep 4');
});

test('lege dagen achter elkaar: op mobiel samen op één regel, op desktop elk een eigen kolom', async ({ page }) => {
  const groep = page.locator('.week-leeg-groep');
  if (isDesktop(page)) {
    await expect(groep).toBeHidden();
    await expect(page.locator('section.week-dag:visible')).toHaveCount(7);
  } else {
    await expect(groep).toHaveCount(1);
    await expect(groep).toBeVisible();
    await expect(groep).toContainText('niets gepland');
    await expect(page.locator('section.week-dag:visible')).toHaveCount(3);
  }
  // In beide gevallen: elke dag is te openen en heeft een + (precies één zichtbare).
  for (const dag of ['maandag 5 oktober', 'donderdag 8 oktober', 'zondag 11 oktober']) {
    await expect(page.getByRole('button', { name: `Dagoverzicht ${dag}` })).toHaveCount(1);
    await expect(page.getByRole('button', { name: `Toevoegen op ${dag}` })).toHaveCount(1);
  }
  await page.getByRole('button', { name: 'Dagoverzicht dinsdag 6 oktober' }).click();
  await expect(page.getByRole('tab', { name: 'Dag', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('de + van een lege dag opent de zin met die dag', async ({ page }) => {
  await page.getByRole('button', { name: 'Toevoegen op woensdag 7 oktober' }).click();
  await expect(venster(page).getByLabel('Wat wil je regelen?')).toBeVisible();
  await venster(page).getByLabel('Wat wil je regelen?').fill('Fietsen ophalen');
  await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
  await expect(venster(page)).toBeHidden();
  await expect(page.locator('section.week-dag').and(page.getByRole('region', { name: /^woensdag 7 oktober$/ }))).toContainText('Fietsen ophalen');
  // Woensdag is niet meer leeg: maandag en dinsdag staan nog samen, donderdag staat alleen (geen groep van één).
  if (!isDesktop(page)) {
    await expect(page.locator('.week-leeg-groep')).toHaveCount(1);
    await expect(page.locator('.week-leeg-groep')).not.toContainText('Do');
  }
});

test('een taak afvinken in de week, en terug', async ({ page }) => {
  // Agenda A7: een afgevinkte taak gaat naar de ingeklapte groep "n afgerond" van die dag; openklappen en terugzetten.
  const vink = page.getByRole('checkbox', { name: 'Plantenbak water geven' });
  await expect(vink).toHaveAttribute('aria-checked', 'false');
  await vink.click();
  await expect(vink).toBeHidden();
  const afgerond = page.getByRole('button', { name: /^2 afgerond op zaterdag 10 oktober, tonen$/ });
  await afgerond.click();
  await expect(page.getByRole('button', { name: /^2 afgerond op zaterdag 10 oktober, verbergen$/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(vink).toHaveAttribute('aria-checked', 'true');
  await vink.click();
  await expect(vink).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('button', { name: /^1 afgerond op zaterdag 10 oktober/ })).toBeVisible();
});
