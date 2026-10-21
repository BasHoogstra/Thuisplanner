import { expect, test, type Page } from '@playwright/test';

// F8 Vakanties (V1.3) in de demo, op 360 px, 390 px en desktop (de projecten), plus 320 px: het overzicht, de
// vakantiepagina, de persoonskeuze op smalle schermen, inpakken (ook vegen), en de koppelingen met Vandaag, Agenda en
// Boodschappen. Vaste demo-klok: woensdag 21 oktober 2026; Frankrijk vertrekt over negen dagen.
const START = './?nu=2026-10-21T10:00';
const isDesktop = (p: Page) => (p.viewportSize()?.width ?? 0) >= 960;

async function geenHorizontaleScroll(p: Page, wat: string) {
  const { breed, scherm } = await p.evaluate(() => ({ breed: document.documentElement.scrollWidth, scherm: window.innerWidth }));
  expect(breed, `${wat}: pagina is breder dan het scherm`).toBeLessThanOrEqual(scherm);
}
async function naarVakantie(p: Page, naam: string) {
  await p.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Meer' }).click();
  await p.getByRole('button', { name: /^Vakanties:/ }).click();
  await p.getByRole('button', { name: new RegExp(`^${naam},`) }).click();
  await expect(p.getByRole('heading', { level: 1, name: naam })).toBeVisible();
}
/** De persoonskeuze: alle groepen zichtbaar binnen het scherm (geen schuiven), elke knop minstens 44 px hoog. */
async function persoonskeuzeGoed(p: Page) {
  const groep = p.getByRole('radiogroup', { name: 'Paklijst van' });
  const knoppen = groep.getByRole('radio');
  await expect(knoppen).toHaveCount(5);
  const breedte = p.viewportSize()!.width;
  for (const b of await knoppen.all()) {
    await expect(b).toBeVisible();
    const box = (await b.boundingBox())!;
    expect(box.height, 'knop lager dan 44 px').toBeGreaterThanOrEqual(44);
    expect(box.x, 'knop links buiten beeld').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, 'knop rechts buiten beeld').toBeLessThanOrEqual(breedte);
  }
  const overloop = await groep.evaluate(e => e.scrollWidth > e.clientWidth);
  expect(overloop, 'persoonskeuze schuift horizontaal').toBe(false);
}

test.beforeEach(async ({ page }) => {
  page.on('request', r => {
    const u = new URL(r.url());
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !['data:', 'file:'].includes(u.protocol)) throw new Error('Externe aanvraag: ' + r.url());
  });
  await page.goto(START + '#/vandaag');
});

test('overzicht en vakantiepagina: rustig, in licht en donker, zonder horizontaal schuiven', async ({ page }) => {
  for (const schema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: schema });
    await page.goto(START + '#/vakanties');
    await expect(page.getByRole('heading', { name: 'Komend' })).toBeVisible();
    await geenHorizontaleScroll(page, `overzicht ${schema}`);
    await page.getByRole('button', { name: /^Frankrijk,/ }).click();
    for (const tab of ['Regelen', 'Inpakken', 'Notities']) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
      await geenHorizontaleScroll(page, `${tab} ${schema}`);
    }
  }
  // Donker is echt donker (de tokens, niet een vaste kleur).
  const achtergrond = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(achtergrond).not.toBe('rgb(242, 244, 241)');
});

test('persoonskeuze: alle personen zichtbaar en makkelijk te raken (en op 320 px)', async ({ page }) => {
  await naarVakantie(page, 'Frankrijk');
  await page.getByRole('tab', { name: 'Inpakken' }).click();
  await persoonskeuzeGoed(page);
  if (!isDesktop(page)) {
    await page.setViewportSize({ width: 320, height: 700 });
    await persoonskeuzeGoed(page);
    await geenHorizontaleScroll(page, 'inpakken 320 px');
    // Ook met een lange naam blijft alles binnen het scherm (de naam wordt afgekapt).
    await page.emulateMedia({ colorScheme: 'dark' });
    await persoonskeuzeGoed(page);
  }
});

test('inpakken: toevoegen, afvinken, dubbel, en de gekozen persoon staat in kop en invoerveld', async ({ page }) => {
  await naarVakantie(page, 'Frankrijk');
  await page.getByRole('tab', { name: 'Inpakken' }).click();
  await page.getByRole('radio', { name: /^Daan/ }).click();
  await expect(page.getByRole('heading', { name: 'Daan · 0 van 6 ingepakt' })).toBeVisible();
  const invoer = page.getByRole('textbox', { name: 'Toevoegen voor Daan' });
  await invoer.fill('Zonnehoed');
  await invoer.press('Enter');
  await invoer.fill('Slippers');
  await invoer.press('Enter');
  await expect(invoer).toBeFocused();
  await expect(page.getByRole('radio', { name: 'Daan, 0 van 8 ingepakt' })).toBeVisible();
  await invoer.fill('zonnehoed');
  await invoer.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Staat al op de lijst van Daan');
  await page.getByRole('checkbox', { name: 'Slippers' }).click();
  await expect(page.getByRole('radio', { name: 'Daan, 1 van 8 ingepakt' })).toBeVisible();
  await page.getByRole('button', { name: '1 ingepakt · tonen' }).click();
  await expect(page.getByRole('list', { name: 'Ingepakt voor Daan' }).getByRole('checkbox', { name: 'Slippers' })).toBeChecked();
  await geenHorizontaleScroll(page, 'na toevoegen');
});

test('vegen naar links verwijdert een pakitem, met ongedaan maken', async ({ page }) => {
  test.skip(isDesktop(page), 'vegen is voor aanraakschermen');
  await naarVakantie(page, 'Frankrijk');
  await page.getByRole('tab', { name: 'Inpakken' }).click();
  const rij = page.locator('li.pakitem', { has: page.getByRole('checkbox', { name: 'Vest' }) });
  const box = (await rij.boundingBox())!;
  const y = box.y + box.height / 2;
  await rij.evaluate((el, { x0, y0 }) => {
    const t = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y0 });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(x0)], bubbles: true }));
    for (const x of [x0 - 30, x0 - 70, x0 - 120, x0 - 160]) el.dispatchEvent(new TouchEvent('touchmove', { touches: [t(x)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
  }, { x0: box.x + box.width - 20, y0: y });
  await expect(page.getByRole('checkbox', { name: 'Vest' })).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Vest verwijderd');
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(page.getByRole('checkbox', { name: 'Vest' })).toBeVisible();
});

test('een nieuwe vakantie: de paklijst van de vorige vakantie overnemen, en ongedaan maken', async ({ page }) => {
  await page.goto(START + '#/vakanties');
  await page.getByRole('button', { name: 'Nieuwe vakantie' }).click();
  const v = page.getByRole('dialog', { name: 'Nieuwe vakantie' });
  await v.getByLabel('Naam').fill('Zweden');
  await v.getByRole('button', { name: 'Vakantie toevoegen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Zweden' })).toBeVisible();
  await page.getByRole('tab', { name: 'Inpakken' }).click();
  await expect(page.getByText('Begin met de paklijst van Italië?')).toBeVisible();
  await page.getByRole('button', { name: 'Overnemen', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('24 items overgenomen');
  await expect(page.getByRole('radio', { name: /^Eva, 0 van 6 ingepakt/ })).toBeVisible();
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(page.getByRole('radio', { name: /^Eva, 0 van 0 ingepakt/ })).toBeVisible();
});

test('koppelingen: de kaart op Vandaag, de vakantie in de Agenda, en het label bij Boodschappen', async ({ page }) => {
  // Vandaag: één kaart, die de vakantie opent.
  await page.getByRole('button', { name: /^Frankrijk, over 9 dagen/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Frankrijk' })).toBeVisible();
  // Een boodschap voor de vakantie (komt op de gewone lijst). Het blok staat standaard ingeklapt.
  await page.getByRole('button', { name: /^Boodschappen voor Frankrijk/ }).click();
  const kopen = page.getByRole('textbox', { name: 'Boodschap voor deze vakantie' });
  await kopen.fill('Zonnebrand factor 50');
  await kopen.press('Enter');
  await expect(page.getByRole('checkbox', { name: 'Zonnebrand factor 50' })).toBeVisible();
  // De Agenda: volgende week staat de vakantie op de dagen van de periode.
  await page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Agenda' }).click();
  await page.getByRole('tab', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: 'Volgende week' }).click();
  const regels = page.getByRole('button', { name: 'Vakantie Frankrijk. Openen' });
  await expect(regels.first()).toBeVisible();
  expect(await regels.count()).toBe(3);   // vrijdag 30 oktober t/m zondag 1 november
  await geenHorizontaleScroll(page, 'agenda met vakantie');
  // Boodschappen: het label bij Zonnebrand.
  await page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Boodschappen' }).click();
  await expect(page.getByRole('button', { name: 'Zonnebrand factor 50 aanpassen' })).toContainText('Frankrijk');
  await geenHorizontaleScroll(page, 'boodschappen met label');
});

test('compact: uitklappen, afvinken, terugzetten, persoon wisselen en navigeren (ook 320 px en donker)', async ({ page }) => {
  const breedtes = isDesktop(page) ? [null] : [null, 320];
  for (const breed of breedtes) {
    if (breed) { await page.setViewportSize({ width: breed, height: 700 }); await page.emulateMedia({ colorScheme: 'dark' }); }
    await page.evaluate(() => localStorage.clear());
    await page.goto(START + '#/vakanties/v-frankrijk');
    await page.reload();   // verse demo en geen onthouden keuzes
    await expect(page.getByRole('heading', { level: 1, name: 'Frankrijk' })).toBeVisible();
    const taken = page.getByRole('button', { name: /^Voorbereidingen/ });
    const kopen = page.getByRole('button', { name: /^Boodschappen voor Frankrijk/ });
    await expect(taken).toHaveAttribute('aria-expanded', 'true');
    await expect(kopen).toHaveAttribute('aria-expanded', 'false');
    for (const k of [taken, kopen]) expect((await k.boundingBox())!.height, 'kop lager dan 44 px').toBeGreaterThanOrEqual(44);
    // Afgerond compact: tonen, terugzetten, opnieuw afvinken.
    const meer = page.getByRole('button', { name: '1 afgerond · tonen' });
    expect((await meer.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await meer.click();
    await page.getByRole('list', { name: 'Afgeronde voorbereidingen' }).getByRole('checkbox').click();
    await expect(taken).toContainText('0 van 4 klaar');
    await page.getByRole('list', { name: 'Open voorbereidingen' }).getByRole('checkbox', { name: 'Kattenoppas vragen' }).click();
    await expect(taken).toContainText('1 van 4 klaar');
    // Boodschappen openen sluit Voorbereidingen; afvinken verbergt onder "gekocht".
    await kopen.click();
    await expect(taken).toHaveAttribute('aria-expanded', 'false');
    const veld = page.getByRole('textbox', { name: 'Boodschap voor deze vakantie' });
    await veld.fill('Zonnebrand, Muggenspray'); await veld.press('Enter');
    await page.getByRole('checkbox', { name: 'Muggenspray' }).click();
    await expect(kopen).toContainText('1 van 2 gekocht');
    await page.getByRole('button', { name: '1 gekocht · tonen' }).click();
    await page.getByRole('list', { name: 'Gekocht voor Frankrijk' }).getByRole('checkbox', { name: 'Muggenspray' }).click();
    await expect(kopen).toContainText('0 van 2 gekocht');
    await geenHorizontaleScroll(page, `regelen ${breed ?? ''}`);
    // Naar Boodschappen en terug: hetzelfde item, en Boodschappen staat nog open.
    await page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Boodschappen' }).click();
    await expect(page.getByRole('checkbox', { name: 'Muggenspray' })).toHaveAttribute('aria-checked', 'false');
    await page.goBack();
    await expect(page.getByRole('button', { name: /^Boodschappen voor Frankrijk/ })).toHaveAttribute('aria-expanded', 'true');
    // Inpakken: compacte persoonsknoppen, één grote balk, de lijst direct zichtbaar.
    await page.getByRole('tab', { name: 'Inpakken' }).click();
    await persoonskeuzeGoed(page);
    await expect(page.getByRole('progressbar')).toHaveCount(1);
    await page.getByRole('radio', { name: /^Lotte/ }).click();
    await expect(page.getByRole('radio', { name: /^Lotte/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('list', { name: 'Nog in te pakken voor Lotte' })).toBeVisible();
    await page.getByRole('button', { name: '2 ingepakt · tonen' }).click();
    await page.getByRole('list', { name: 'Ingepakt voor Lotte' }).getByRole('checkbox').first().click();
    await expect(page.getByRole('radio', { name: 'Lotte, 1 van 7 ingepakt' })).toBeVisible();
    await geenHorizontaleScroll(page, `inpakken ${breed ?? ''}`);
    // De tabbladen blijven bereikbaar na scrollen.
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(200);
    await expect(page.getByRole('tab', { name: 'Notities' })).toBeInViewport();
  }
});
