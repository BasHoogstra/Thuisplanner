import { expect, test, type Page } from '@playwright/test';

// KG-3: weekagenda, openen/bewerken/verwijderen, afvinken en heropenen, boodschappen zonder dubbelingen.
// Vaste demo-klok: zaterdag 10 oktober 2026, 11:20 (week 41: maandag 5 t/m zondag 11 oktober).
const START = './?nu=2026-10-10T11:20';

const venster = (p: Page) => p.getByRole('dialog');
const sectie = (p: Page, naam: string | RegExp) => p.locator('section', { has: p.getByRole('heading', { name: naam, exact: true }) });
const dag = (p: Page, label: RegExp) => p.locator('section.week-dag').and(p.getByRole('region', { name: label }));
const nav = (p: Page, naam: string) => p.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: naam }).click();
const melding = (p: Page) => p.getByRole('status');

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
});

test.describe('Agenda: weekweergave', () => {
  test('toont maandag t/m zondag, bladert naar volgende week en terug', async ({ page }) => {
    await nav(page, 'Agenda');
    await expect(page.getByText('5 – 11 oktober · week 41')).toBeVisible();
    await expect(page.locator('section.week-dag')).toHaveCount(7);
    await expect(dag(page, /^zaterdag 10 oktober, vandaag$/)).toContainText('Voetbal');
    await expect(dag(page, /^maandag 5 oktober$/)).toContainText('Niets gepland');
    await geenHorizontaleScroll(page);

    await page.getByRole('button', { name: 'Volgende week' }).click();
    await expect(page.getByText('12 – 18 oktober · week 42')).toBeVisible();
    await expect(dag(page, /^maandag 12 oktober$/)).toContainText('Fietsband Lotte plakken');
    await expect(dag(page, /^dinsdag 13 oktober$/)).toContainText('Ouderavond groep 4');
    await page.getByRole('button', { name: 'Naar vandaag' }).click();
    await expect(page.getByText('5 – 11 oktober · week 41')).toBeVisible();
  });

  test('toevoegen op een bepaalde dag via de + van die dag', async ({ page }) => {
    await nav(page, 'Agenda');
    await page.getByRole('button', { name: 'Volgende week' }).click();
    await page.getByRole('button', { name: 'Toevoegen op woensdag 14 oktober' }).click();
    await venster(page).getByLabel('Wat?').fill('Oudergesprek');
    await venster(page).getByLabel('Van', { exact: true }).fill('15:45');
    await venster(page).getByRole('button', { name: 'Toevoegen' }).click();
    await expect(dag(page, /^woensdag 14 oktober$/)).toContainText('Oudergesprek');
    await expect(dag(page, /^woensdag 14 oktober$/)).toContainText('15:45');
  });

  test('taken zonder datum staan in de agenda, niet op Vandaag', async ({ page }) => {
    await expect(page.getByText('Aanslag gemeentebelasting nakijken')).toHaveCount(0);
    await nav(page, 'Agenda');
    await expect(sectie(page, 'Taken zonder datum')).toContainText('Aanslag gemeentebelasting nakijken');
  });
});

test.describe('Afspraken openen, bewerken en verwijderen', () => {
  test('bewerken vanuit de agenda komt direct terug op Vandaag', async ({ page }) => {
    await nav(page, 'Agenda');
    await page.getByRole('button', { name: /^Zwemles, 09:15 – 10:00, herhaalt\. Openen$/ }).click();
    await expect(venster(page).getByRole('heading', { name: 'Afspraak' })).toBeVisible();
    await expect(venster(page).getByLabel('Wat?')).toHaveValue('Zwemles');
    await venster(page).getByLabel('Wat?').fill('Zwemles diploma B');
    await venster(page).getByLabel('Van', { exact: true }).fill('09:30');
    await venster(page).getByRole('button', { name: 'Opslaan' }).click();
    await expect(melding(page)).toContainText('Zwemles diploma B aangepast (vandaag 09:30)');
    await expect(dag(page, /vandaag$/)).toContainText('Zwemles diploma B');
    await nav(page, 'Vandaag');
    await expect(sectie(page, 'Agenda vandaag')).toContainText('Zwemles diploma B');
    await expect(sectie(page, 'Agenda vandaag')).toContainText('09:30');
  });

  test('naar een andere dag verplaatsen haalt hem van Vandaag af', async ({ page }) => {
    await page.locator('.straks').getByRole('button').click(); // Voetbal, de eerstvolgende
    await venster(page).getByRole('button', { name: 'Andere dag' }).click();
    await venster(page).getByLabel('Datum').fill('2026-10-14');
    await venster(page).getByRole('button', { name: 'Opslaan' }).click();
    await expect(page.locator('.straks')).not.toContainText('Voetbal');
    await expect(page.getByText('Vandaag: 3 afspraken en 3 taken.')).toBeVisible();
    await nav(page, 'Agenda');
    await page.getByRole('button', { name: 'Volgende week' }).click();
    await expect(dag(page, /^woensdag 14 oktober$/)).toContainText('Voetbal');
  });

  test('verwijderen met ongedaan maken', async ({ page }) => {
    await page.getByRole('button', { name: /^Pizza bakken met de buren, 18:00\. Openen$/ }).click();
    await venster(page).getByRole('button', { name: 'Verwijderen' }).click();
    await expect(melding(page)).toContainText('Pizza bakken met de buren verwijderd');
    await expect(sectie(page, 'Agenda vandaag')).not.toContainText('Pizza bakken');
    await melding(page).getByRole('button', { name: 'Ongedaan maken' }).click();
    await expect(sectie(page, 'Agenda vandaag')).toContainText('Pizza bakken');
  });

  test('een eindtijd vóór de begintijd wordt niet opgeslagen', async ({ page }) => {
    await page.getByRole('button', { name: /^Pizza bakken met de buren, 18:00\. Openen$/ }).click();
    await venster(page).getByLabel('Tot', { exact: true }).fill('17:00');
    await venster(page).getByRole('button', { name: 'Opslaan' }).click();
    await expect(venster(page)).toContainText('De eindtijd ligt vóór of op de begintijd.');
    await page.keyboard.press('Escape');
    await expect(sectie(page, 'Agenda vandaag')).toContainText('18:00');
  });

  test('privé van een ander: alleen "bezet", geen details en niets te wijzigen', async ({ page }) => {
    await page.getByRole('button', { name: /^Bezet, 15:00 – 16:00, herhaalt\. Openen$/ }).click();
    const v = venster(page);
    await expect(v.getByRole('heading', { name: 'Bezet' })).toBeVisible();
    await expect(v).toContainText('privé-afspraak van Thomas');
    await expect(v.getByRole('textbox')).toHaveCount(0);
    await expect(v.getByRole('button', { name: 'Opslaan' })).toHaveCount(0);
    await expect(v.getByRole('button', { name: 'Verwijderen' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await nav(page, 'Agenda');
    await expect(dag(page, /vandaag$/)).toContainText('Bezet');
  });

  test('gedeelde afspraak van een ander: wel aanpassen, maar niet privé maken', async ({ page }) => {
    await nav(page, 'Agenda');
    await page.getByRole('button', { name: /^Eten bij oma, 17:30\. Openen$/ }).click();
    await expect(venster(page).getByLabel('Wat?')).toHaveValue('Eten bij oma');
    await expect(venster(page).getByLabel(/Privé/)).toHaveCount(0);
  });

  test('eigen afspraak privé maken toont een slotje', async ({ page }) => {
    await page.getByRole('button', { name: /^Pizza bakken met de buren, 18:00\. Openen$/ }).click();
    await venster(page).getByLabel(/Privé/).check();
    await venster(page).getByRole('button', { name: 'Opslaan' }).click();
    await expect(sectie(page, 'Agenda vandaag').locator('li', { hasText: 'Pizza bakken' })).toContainText('alleen voor jou');
  });
});

test.describe('Taken', () => {
  test('afvinken, "afgerond vandaag" openklappen en weer openzetten', async ({ page }) => {
    const teDoen = sectie(page, 'Te doen');
    await teDoen.getByRole('checkbox', { name: 'Plantenbak water geven' }).click();
    await expect(teDoen.getByRole('button', { name: '2 afgerond vandaag · tonen' })).toBeVisible();
    await expect(page.getByText('Vandaag: 4 afspraken en 2 taken.')).toBeVisible();
    await teDoen.getByRole('button', { name: /afgerond vandaag/ }).click();
    const afgerond = page.getByRole('list', { name: 'Afgerond vandaag' });
    await expect(afgerond).toContainText('Plantenbak water geven');
    await afgerond.getByRole('checkbox', { name: 'Plantenbak water geven' }).click();
    await expect(page.getByText('Vandaag: 4 afspraken en 3 taken.')).toBeVisible();
    await expect(teDoen.getByRole('button', { name: /1 afgerond vandaag/ })).toBeVisible();
  });

  test('bewerken: andere dag en andere persoon; blijft aan de juiste dag en persoon hangen', async ({ page }) => {
    await page.getByRole('button', { name: 'Cadeautje voor Noor kopen openen' }).click();
    await expect(venster(page).getByRole('heading', { name: 'Taak' })).toBeVisible();
    await expect(venster(page).getByRole('button', { name: 'Eva' })).toHaveAttribute('aria-pressed', 'true');
    await venster(page).getByRole('button', { name: 'Daan' }).click();
    await expect(venster(page).getByRole('button', { name: 'Eva' })).toHaveAttribute('aria-pressed', 'false');
    await venster(page).getByRole('button', { name: 'Morgen', exact: true }).click();
    await venster(page).getByRole('button', { name: 'Opslaan' }).click();
    await expect(sectie(page, 'Te doen')).not.toContainText('Cadeautje');
    await nav(page, 'Agenda');
    const zondag = dag(page, /^zondag 11 oktober$/);
    await expect(zondag.locator('li', { hasText: 'Cadeautje voor Noor kopen' })).toContainText('Daan');
  });

  test('verwijderen met ongedaan maken', async ({ page }) => {
    await page.getByRole('button', { name: 'Toestemmingsformulier schoolreis openen' }).click();
    await venster(page).getByRole('button', { name: 'Verwijderen' }).click();
    await expect(sectie(page, 'Te doen')).not.toContainText('Toestemmingsformulier');
    await melding(page).getByRole('button', { name: 'Ongedaan maken' }).click();
    await expect(sectie(page, 'Te doen')).toContainText('Toestemmingsformulier');
  });

  test('alles van vandaag af: rustige melding, afgerond blijft ingeklapt', async ({ page }) => {
    const teDoen = sectie(page, 'Te doen');
    for (const naam of ['Toestemmingsformulier schoolreis', 'Plantenbak water geven', 'Cadeautje voor Noor kopen']) {
      await teDoen.getByRole('checkbox', { name: naam }).click();
    }
    await expect(teDoen).toContainText('Alles van vandaag is gedaan.');
    await expect(page.getByRole('list', { name: 'Afgerond vandaag' })).toHaveCount(0);
  });
});

test.describe('Boodschappen', () => {
  test('meerdere tegelijk, zonder dubbelingen; een afgevinkt artikel komt terug', async ({ page }) => {
    await nav(page, 'Boodschappen');
    const invoer = page.getByLabel('Boodschappen toevoegen');
    await invoer.fill('melk, Kaas, kaas, wc-papier');
    await invoer.press('Enter');
    await expect(melding(page)).toContainText('Kaas op de lijst · Wc-papier weer nodig · Melk stond er al op');
    await expect(sectie(page, /^Nog nodig \d+$/).getByRole('checkbox')).toHaveCount(7);
    await expect(sectie(page, /^Nog nodig \d+$/).getByRole('checkbox', { name: 'Kaas' })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: /In het mandje/ })).toHaveCount(0);
  });

  test('duidelijk onderscheid tussen nog nodig en in het mandje', async ({ page }) => {
    await nav(page, 'Boodschappen');
    await sectie(page, /^Nog nodig \d+$/).getByRole('checkbox', { name: 'Melk' }).click();
    await expect(page.getByRole('heading', { name: 'Nog nodig 4' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'In het mandje 2' })).toBeVisible();
    const mandje = page.locator('section.afgevinkt');
    await expect(mandje.getByRole('checkbox', { name: 'Melk' })).toHaveAttribute('aria-checked', 'true');
    await mandje.getByRole('checkbox', { name: 'Melk' }).click();
    await expect(sectie(page, /^Nog nodig \d+$/).getByRole('checkbox', { name: 'Melk' })).toBeVisible();
  });

  test('aanpassen en verwijderen; Vandaag volgt direct', async ({ page }) => {
    await nav(page, 'Boodschappen');
    await page.getByRole('button', { name: 'Melk aanpassen' }).click();
    await expect(venster(page).getByRole('heading', { name: 'Boodschap' })).toBeVisible();
    await venster(page).getByLabel('Naam').fill('Halfvolle melk');
    await venster(page).getByRole('button', { name: 'Opslaan' }).click();
    await page.getByRole('button', { name: 'Bananen aanpassen' }).click();
    await venster(page).getByRole('button', { name: 'Verwijderen' }).click();
    await expect(melding(page)).toContainText('Bananen verwijderd');
    await nav(page, 'Vandaag');
    await expect(sectie(page, 'Boodschappen')).toContainText('Halfvolle melk, Pizzadeeg, Mozzarella, Tomaten');
    await expect(sectie(page, 'Boodschappen')).not.toContainText('en nog');
  });
});

test('"Ongedaan maken" hoort altijd bij de laatste wijziging', async ({ page }) => {
  await sectie(page, 'Te doen').getByRole('checkbox', { name: 'Plantenbak water geven' }).click();
  await expect(melding(page).getByRole('button', { name: 'Ongedaan maken' })).toBeVisible();
  await nav(page, 'Boodschappen');
  await sectie(page, /^Nog nodig \d+$/).getByRole('checkbox', { name: 'Melk' }).click();
  // Afvinken van een boodschap heeft geen eigen melding; de oude knop mag nu niet de boodschap terugdraaien.
  await expect(page.getByRole('button', { name: 'Ongedaan maken' })).toHaveCount(0);
});

test('bewerkvenster en weekagenda passen op het scherm', async ({ page }) => {
  await page.getByRole('button', { name: /^Pizza bakken met de buren, 18:00\. Openen$/ }).click();
  await venster(page).getByRole('button', { name: 'Andere dag' }).click();
  await geenHorizontaleScroll(page);
  await page.keyboard.press('Escape');
  await nav(page, 'Agenda');
  await geenHorizontaleScroll(page);
});

test('navigatielabels passen ook met een breed systeemlettertype', async ({ page }) => {
  // Op de CI-runner (Ubuntu) is het systeemlettertype breder dan lokaal; dat brak de 360-weergave.
  await page.addStyleTag({ content: '.nav, .nav * { font-family: "DejaVu Sans", Verdana, sans-serif !important; }' });
  for (const naam of ['Vandaag', 'Agenda', 'Boodschappen', 'Meer']) {
    const span = page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: naam }).locator('span');
    expect(await span.evaluate(e => e.scrollWidth > e.clientWidth), `label ${naam} is afgekapt`).toBe(false);
  }
});
