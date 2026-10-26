import { expect, test, type Page } from '@playwright/test';

// De centrale + (snelinvoer §10) en C1 in de demo, op 360 px, 390 px en desktop: een invoerbalk boven het toetsenbord met de
// verzendknop, een kaart in gewone taal, Aanpassen op verzoek; en boodschappen per categorie.
// Vaste demo-klok: zaterdag 10 oktober 2026, 11:20.
const START = './?nu=2026-10-10T11:20';
const venster = (p: Page) => p.getByRole('dialog', { name: 'Toevoegen' });
const regel = (p: Page) => venster(p).locator('.kaart-regel');
const verstuur = (p: Page) => venster(p).getByRole('button', { name: 'Toevoegen' });
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

/**
 * Een nagebootst iPhone-toetsenbord: zoals in Safari blijft de pagina even hoog, maar het zichtbare deel
 * (visualViewport) krimpt. Vóór het laden zetten; daarna met toetsenbord(p, px) openen of sluiten.
 */
async function metToetsenbord(p: Page) {
  await p.addInitScript(() => {
    const doel = new EventTarget() as EventTarget & { height: number; width: number; offsetTop: number; offsetLeft: number; scale: number; pageTop: number; pageLeft: number };
    let tb = 0;
    Object.defineProperties(doel, {
      height: { get: () => window.innerHeight - tb }, width: { get: () => window.innerWidth },
      offsetTop: { get: () => 0 }, offsetLeft: { get: () => 0 }, scale: { get: () => 1 }, pageTop: { get: () => window.scrollY }, pageLeft: { get: () => 0 },
    });
    Object.defineProperty(window, 'visualViewport', { get: () => doel });
    (window as unknown as { __toetsenbord: (px: number) => void }).__toetsenbord = px => { tb = px; doel.dispatchEvent(new Event('resize')); };
  });
  await p.reload();
}
const toetsenbord = (p: Page, px: number) => p.evaluate(n => (window as unknown as { __toetsenbord: (px: number) => void }).__toetsenbord(n), px);

test('openen en direct typen: het veld heeft de focus, de verzendknop staat uit, geen kaart', async ({ page }) => {
  await page.locator('.nav-plus').click();
  await expect(venster(page).getByLabel('Wat wil je regelen?')).toBeFocused();
  await expect(venster(page).getByRole('tab')).toHaveCount(0);
  await expect(venster(page).locator('.snel-kaart')).toHaveCount(0);
  await expect(verstuur(page)).toBeDisabled();
  await venster(page).getByLabel('Wat wil je regelen?').fill('morgen om 15:00 met Lotte naar de tandarts');
  await expect(venster(page)).toContainText('Naar de tandarts');
  await expect(regel(page)).toHaveText('Morgen om 15:00 · met Lotte');
  await expect(venster(page).getByRole('button', { name: 'Gedeeld met het huishouden' })).toBeVisible();
  await expect(verstuur(page)).toBeEnabled();
  await geenHorizontaleScroll(page);
});

test('met het toetsenbord open staat de balk (met verzendknop) erboven, ook met een lange zin en op 320 px', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 960, 'het toetsenbord is voor de telefoon');
  await metToetsenbord(page);
  for (const [breedte, hoogte, tb] of [[390, 844, 336], [320, 568, 260]] as const) {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await page.locator('.nav-plus').click();
    await toetsenbord(page, tb);
    const veld = venster(page).getByLabel('Wat wil je regelen?');
    await veld.fill('Morgen om 15:00 met Lotte naar de tandarts en daarna nog even langs de apotheek voor de recepten van oma');
    const rand = hoogte - tb;
    const knop = (await verstuur(page).boundingBox())!;
    const balk = (await veld.boundingBox())!;
    expect(knop.y + knop.height, 'verzendknop achter het toetsenbord').toBeLessThanOrEqual(rand);
    expect(balk.y + balk.height, 'invoerveld achter het toetsenbord').toBeLessThanOrEqual(rand);
    expect(knop.height, 'verzendknop te klein').toBeGreaterThanOrEqual(44);
    expect(knop.x + knop.width, 'verzendknop niet rechts (duim)').toBeGreaterThan(breedte - 70);
    // De kaart blijft binnen het zichtbare deel; het vel is niet hoger dan wat er zichtbaar is.
    const vel = (await venster(page).boundingBox())!;
    expect(vel.y, 'vel boven de rand van het scherm').toBeGreaterThanOrEqual(-1);
    await expect(verstuur(page)).toBeEnabled();
    await geenHorizontaleScroll(page);
    await toetsenbord(page, 0);
    await page.keyboard.press('Escape');
    await expect(venster(page)).toBeHidden();
  }
});

test('de eerste weergave: alleen de balk, de groene verzendknop meteen zichtbaar; vanuit Vandaag en Agenda gelijk', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 960, 'het toetsenbord is voor de telefoon');
  await metToetsenbord(page);
  const posities: string[] = [];
  for (const van of ['vandaag', 'agenda'] as const) {
    await page.goto(START + `#/${van}`);
    if (van === 'agenda') await page.getByRole('button', { name: /^Toevoegen op/ }).first().click();
    else await page.locator('.nav-plus').click();
    await toetsenbord(page, 336);
    // Niets boven het veld: geen titel, geen "Formulier"-regel, geen kaart.
    await expect(venster(page).getByText('Formulier', { exact: true })).toHaveCount(0);
    await expect(venster(page).locator('.snel-kaart')).toHaveCount(0);
    const veld = (await venster(page).getByLabel('Wat wil je regelen?').boundingBox())!;
    expect((await venster(page).boundingBox())!.y, 'iets boven de balk').toBeGreaterThan(veld.y - 20);
    // De verzendknop is de groene knop, ook leeg (alleen lichter), en staat boven het toetsenbord.
    const knop = verstuur(page);
    await expect(knop).toBeVisible();
    await expect(knop).toBeDisabled();
    const stijl = await knop.evaluate(e => { const c = getComputedStyle(e); return { kleur: c.backgroundColor, dicht: Number(c.opacity) }; });
    const accent = await page.locator('.nav-plus').evaluate(e => getComputedStyle(e).backgroundColor);
    expect(stijl.kleur).toBe(accent);
    expect(stijl.dicht).toBeGreaterThanOrEqual(0.4);
    const k = (await knop.boundingBox())!;
    expect(k.y + k.height).toBeLessThanOrEqual(page.viewportSize()!.height - 336);
    posities.push(`${Math.round(k.x)},${Math.round(k.y)}`);
    await toetsenbord(page, 0);
    await page.keyboard.press('Escape');
  }
  expect(posities[0], 'de + vanuit Vandaag en Agenda staat anders').toBe(posities[1]);
});

test('een afspraak in één zin: op Binnenkort, met ongedaan maken; de melding hindert een volgende invoer niet', async ({ page }) => {
  await zin(page, 'morgen om 15:00 met Lotte naar de tandarts');
  await verstuur(page).click();
  await expect(venster(page)).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Naar de tandarts staat in de agenda (morgen 15:00)');
  await expect(sectie(page, 'Binnenkort')).toContainText('Naar de tandarts');
  // Meteen weer de +: de melding gaat weg en de verzendknop is direct te raken.
  await zin(page, 'band plakken');
  await expect(page.locator('.melding')).toHaveCount(0);
  await verstuur(page).click();
  await expect(page.getByRole('status')).toContainText('Band plakken');
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(page.locator('body')).not.toContainText('Band plakken');
});

test('een taak, met een correctie van de dag en de persoon via Aanpassen', async ({ page }) => {
  await zin(page, 'container morgen aan de weg');
  await venster(page).getByRole('button', { name: 'Aanpassen' }).click();
  await venster(page).getByRole('button', { name: 'Wanneer: Morgen' }).click();
  await venster(page).getByRole('group', { name: 'Wanneer' }).getByRole('button', { name: 'Vandaag' }).click();
  await venster(page).getByRole('button', { name: /^Wie:/ }).click();
  await venster(page).getByRole('group', { name: 'Wie pakt het op' }).getByRole('button', { name: 'Thomas' }).click();
  await expect(regel(page)).toHaveText('Vandaag · voor Thomas');
  await geenHorizontaleScroll(page);
  await verstuur(page).click();
  await expect(page.getByRole('checkbox', { name: 'Container aan de weg' })).toBeVisible();
});

test('vier boodschappen in één zin: één regel op de kaart; op de lijst elk in hun categorie', async ({ page }) => {
  await zin(page, 'melk, bananen, luiers en brood');
  await expect(venster(page)).toContainText('Melk, Bananen en 2 meer');
  await expect(regel(page)).toHaveText('Op de boodschappenlijst');
  await verstuur(page).click();
  await page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Boodschappen' }).click();
  for (const [cat, naam] of [['Zuivel & eieren', 'Melk'], ['Groente & fruit', 'Bananen'], ['Baby & kind', 'Luiers'], ['Brood & bakkerij', 'Brood']]) {
    await expect(page.getByRole('region', { name: cat }).getByRole('checkbox', { name: naam })).toBeVisible();
  }
  // Afvinken blijft één tik; afgevinkt gaat naar het mandje.
  await page.getByRole('region', { name: 'Baby & kind' }).getByRole('checkbox', { name: 'Luiers' }).click();
  await expect(page.locator('section.afgevinkt')).toContainText('Luiers');
  await geenHorizontaleScroll(page);
});

test('privé staat bij een afspraak altijd in beeld en is met één tik te wisselen; twijfel als één vraag', async ({ page }) => {
  await zin(page, 'kapper om 4');
  const delen = venster(page).getByRole('button', { name: 'Gedeeld met het huishouden' });
  await expect(delen).toBeVisible();
  await delen.click();
  await expect(venster(page).getByRole('button', { name: 'Alleen voor jou (privé)' })).toHaveAttribute('aria-pressed', 'true');
  await expect(venster(page).getByRole('group', { name: 'Bedoel je 16:00?' })).toBeVisible();
  await venster(page).getByLabel('Wat wil je regelen?').fill('luiers halen vanmiddag');
  await expect(venster(page)).toContainText('Een dag bij een boodschap kan nog niet');
});

test('in donker en licht: de kaart en de balk zijn leesbaar en raakbaar (op 320 px)', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 960, 'smal scherm');
  await page.setViewportSize({ width: 320, height: 568 });
  for (const schema of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: schema });
    await zin(page, 'Zonnebrand en muggenspray kopen voor Frankrijk');
    await venster(page).getByRole('button', { name: 'Aanpassen' }).click();
    for (const n of [/^Soort:/, /^Lijst:/]) expect((await venster(page).getByRole('button', { name: n }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await geenHorizontaleScroll(page);
    const kleur = await venster(page).locator('.kaart-titel').evaluate(e => getComputedStyle(e).color);
    const achter = await venster(page).locator('.snel-kaart').evaluate(e => getComputedStyle(e).backgroundColor);
    expect(kleur).not.toBe(achter);
    await page.keyboard.press('Escape');
  }
});

test('Formulier opent het formulier met wat er al herkend is', async ({ page }) => {
  await zin(page, 'donderdag zwemles in het Sportfondsenbad');
  await venster(page).getByRole('button', { name: 'Formulier' }).click();
  await expect(venster(page).getByLabel('Wat?')).toHaveValue('Zwemles');
  await expect(venster(page).getByLabel(/Waar/)).toHaveValue('het Sportfondsenbad');
});
