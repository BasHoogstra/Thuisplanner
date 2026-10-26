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
async function persoonskeuzeGoed(p: Page, aantal = 6) {
  const groep = p.getByRole('radiogroup', { name: 'Paklijst van' });
  const knoppen = groep.getByRole('radio');
  await expect(knoppen).toHaveCount(aantal);   // vier leden, Gezamenlijk en de extra lijst Oma (demo)
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
  // Met de extra lijst Strandspullen van Italië (standaard mee): 24 + 3.
  await expect(page.getByRole('status')).toContainText('27 items overgenomen');
  await expect(page.getByRole('radio', { name: /^Eva, 0 van 6 ingepakt/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Strandspullen, 0 van 3 ingepakt/ })).toBeVisible();
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(page.getByRole('radio', { name: /^Eva, 0 van 0 ingepakt/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Strandspullen/ })).toHaveCount(0);
});

test('extra inpaklijsten: toevoegen, items, hernoemen, verwijderen met bevestiging en ongedaan maken (ook 320 px en donker)', async ({ page }) => {
  // Twee rondes (normaal, 320 px donker) en meldingen van 6 s waar Playwright op wacht: onder belasting meer tijd.
  test.slow();
  const breedtes = isDesktop(page) ? [null] : [null, 320];
  for (const breed of breedtes) {
    if (breed) { await page.setViewportSize({ width: breed, height: 568 }); await page.emulateMedia({ colorScheme: 'dark' }); }
    await page.goto(START + '#/vakanties/v-frankrijk');
    await page.reload();   // verse demo, geen bewaarde keuzes
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('tab', { name: 'Inpakken' }).click();
    // Oma (demo) staat na Gezamenlijk; "+ Inpaklijst" is een gewone knop, geen persoon.
    await expect(page.getByRole('radio', { name: /^Oma, 0 van 3 ingepakt/ })).toBeVisible();
    await persoonskeuzeGoed(page, 6);
    const plus = page.getByRole('button', { name: 'Inpaklijst toevoegen' });
    expect((await plus.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await plus.click();
    const v = page.getByRole('dialog', { name: 'Nieuwe inpaklijst' });
    const knop = v.getByRole('button', { name: 'Lijst toevoegen' });
    // Op een kleine iPhone: naamveld en knop bovenaan, binnen beeld.
    const box = (await knop.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await v.getByLabel('Naam').fill('eva');
    await knop.click();
    await expect(v.getByText('Die naam hoort al bij iemand uit het huishouden of bij Gezamenlijk.')).toBeVisible();
    await v.getByLabel('Naam').fill('Paard');
    await knop.click();
    // De nieuwe lijst is meteen gekozen.
    await expect(page.getByRole('radio', { name: /^Paard, 0 van 0 ingepakt/ })).toHaveAttribute('aria-checked', 'true');
    const invoer = page.getByRole('textbox', { name: 'Toevoegen voor Paard' });
    for (const n of ['Zadel', 'Hoefkrabber']) { await invoer.fill(n); await invoer.press('Enter'); }
    await page.getByRole('checkbox', { name: 'Zadel' }).click();
    await expect(page.getByRole('radio', { name: 'Paard, 1 van 2 ingepakt' })).toBeVisible();
    await geenHorizontaleScroll(page, `extra lijst ${breed ?? ''}`);
    // Verplaatsen naar Gezamenlijk en terug.
    await page.getByRole('button', { name: 'Hoefkrabber aanpassen' }).click();
    const pv = page.getByRole('dialog', { name: 'Pakitem' });
    await pv.getByRole('button', { name: 'Gezamenlijk' }).click();
    await pv.getByRole('button', { name: 'Opslaan' }).click();
    await expect(page.getByRole('status')).toContainText('Hoefkrabber staat nu bij Gezamenlijk');
    await expect(page.getByRole('radio', { name: 'Paard, 1 van 1 ingepakt' })).toBeVisible();
    // Hernoemen en verwijderen (met items: eerst bevestigen), daarna ongedaan maken.
    await page.getByRole('button', { name: 'Lijst Paard aanpassen' }).click();
    const lv = page.getByRole('dialog', { name: 'Inpaklijst' });
    await lv.getByLabel('Naam').fill('Pony');
    await lv.getByRole('button', { name: 'Opslaan' }).click();
    await expect(page.getByRole('radio', { name: /^Pony, 1 van 1 ingepakt/ })).toBeVisible();
    await page.getByRole('button', { name: 'Lijst Pony aanpassen' }).click();
    // De melding ("Lijst heet nu Pony") verdwijnt bij het openen, zodat hij geen knop van het venster bedekt.
    await expect(page.getByRole('button', { name: 'Ongedaan maken' })).toHaveCount(0);
    await page.getByRole('dialog', { name: 'Inpaklijst' }).getByRole('button', { name: 'Lijst verwijderen' }).click();
    await expect(page.getByText('Pony met 1 item verwijderen?')).toBeVisible();
    await page.getByRole('button', { name: 'Ja, verwijderen' }).click();
    await expect(page.getByRole('radio', { name: /^Pony/ })).toHaveCount(0);
    // Na verwijderen terug naar jezelf (Eva), zichtbaar gekozen.
    await expect(page.getByRole('radio', { name: /^Eva,/ })).toHaveAttribute('aria-checked', 'true');
    const ongedaan = page.getByRole('button', { name: 'Ongedaan maken' });
    // De melding staat helemaal in beeld en bedekt de persoonsknoppen en "+ Inpaklijst" niet.
    await page.getByRole('radiogroup', { name: 'Paklijst van' }).scrollIntoViewIfNeeded();
    const m = (await ongedaan.boundingBox())!;
    expect(m.y + m.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    for (const k of [page.getByRole('button', { name: 'Inpaklijst toevoegen' }), page.getByRole('radio', { name: /^Eva,/ })]) {
      const b = (await k.boundingBox())!;
      expect(b.y + b.height <= m.y || b.y >= m.y + m.height, 'melding bedekt een knop').toBe(true);
    }
    await ongedaan.click();
    await expect(page.getByRole('radio', { name: /^Pony, 1 van 1 ingepakt/ })).toBeVisible();
  }
});

test('koppelingen: de kaart op Vandaag, de vakantie in de Agenda, en het label bij Boodschappen', async ({ page }) => {
  // Vandaag: één kaart, die de vakantie opent.
  await page.getByRole('button', { name: /^Frankrijk, over 9 dagen/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Frankrijk' })).toBeVisible();
  // Een boodschap voor de vakantie (komt op de gewone lijst). Het blok staat standaard ingeklapt.
  await page.getByRole('button', { name: /^Boodschappen voor Frankrijk/ }).click();
  const kopen = page.getByRole('textbox', { name: 'Boodschap voor deze vakantie' });
  await kopen.fill('Adapterstekker');
  await kopen.press('Enter');
  await expect(page.getByRole('checkbox', { name: 'Adapterstekker' })).toBeVisible();
  // De Agenda: volgende week staat de vakantie op de dagen van de periode.
  await page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Agenda' }).click();
  await page.getByRole('tab', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: 'Volgende week' }).click();
  const regels = page.getByRole('button', { name: 'Vakantie Frankrijk. Openen' });
  await expect(regels.first()).toBeVisible();
  expect(await regels.count()).toBe(3);   // vrijdag 30 oktober t/m zondag 1 november
  await geenHorizontaleScroll(page, 'agenda met vakantie');
  // Boodschappen: bij Later nodig (ingeklapt), met het label.
  await page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Boodschappen' }).click();
  await page.getByRole('button', { name: /^Later nodig/ }).click();
  await expect(page.getByRole('list', { name: 'Later nodig' }).getByRole('button', { name: 'Adapterstekker aanpassen' })).toContainText('Frankrijk');
  await geenHorizontaleScroll(page, 'boodschappen met label');
});

test('Later nodig: ingeklapt, één tik naar Nu te kopen, gelijk bij de vakantie (ook 320 px en donker)', async ({ page }) => {
  const breedtes = isDesktop(page) ? [null] : [null, 320];
  for (const breed of breedtes) {
    if (breed) { await page.setViewportSize({ width: breed, height: 700 }); await page.emulateMedia({ colorScheme: 'dark' }); }
    await page.goto(START + '#/boodschappen');
    await page.reload();   // verse demo
    const nu = page.locator('section', { has: page.getByRole('heading', { name: /^Nu te kopen \d+$/ }) });
    const aantal = await nu.getByRole('checkbox').count();
    const knop = page.getByRole('button', { name: /^Later nodig 4/ });
    await expect(knop).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('list', { name: 'Later nodig' })).toHaveCount(0);
    await knop.click();
    const later = page.getByRole('list', { name: 'Later nodig' });
    await expect(later.getByRole('checkbox')).toHaveCount(4);
    const nuKopen = later.getByRole('button', { name: 'Zonnebrand factor 50 nu kopen' });
    expect((await nuKopen.boundingBox())!.height, 'Nu kopen lager dan 44 px').toBeGreaterThanOrEqual(44);
    await geenHorizontaleScroll(page, `later nodig ${breed ?? ''}`);
    await nuKopen.click();
    await expect(nu.getByRole('checkbox')).toHaveCount(aantal + 1);
    await expect(nu.getByRole('checkbox', { name: 'Zonnebrand factor 50' })).toBeVisible();
    // Afvinken op de gewone lijst geldt ook bij de vakantie (één boodschap).
    await nu.getByRole('checkbox', { name: 'Zonnebrand factor 50' }).click();
    await page.goto(START + '#/vakanties/v-frankrijk');
    await page.getByRole('tab', { name: 'Regelen' }).click();
    const blok = page.getByRole('button', { name: /^Boodschappen voor Frankrijk/ });
    if ((await blok.getAttribute('aria-expanded')) === 'false') await blok.click();
    await expect(blok).toContainText('1 van 3 gekocht');
    await expect(page.getByRole('button', { name: 'Muggenspray. Meer' })).toContainText('later nodig');
    await geenHorizontaleScroll(page, `regelen later ${breed ?? ''}`);
  }
});

test('compact: uitklappen, afvinken, terugzetten, persoon wisselen en navigeren (ook 320 px en donker)', async ({ page }) => {
  // Twee rondes (normaal, 320 px donker) en meldingen van 6 s waar Playwright op wacht: onder belasting meer tijd.
  test.slow();
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
    // De demo heeft al drie boodschappen voor Frankrijk (Later nodig); Muggenspray staat er al en komt er niet dubbel bij.
    await veld.fill('Pleisters, Muggenspray'); await veld.press('Enter');
    await expect(kopen).toContainText('0 van 4 gekocht');
    await page.getByRole('checkbox', { name: 'Pleisters' }).click();
    await expect(kopen).toContainText('1 van 4 gekocht');
    await page.getByRole('button', { name: '1 gekocht · tonen' }).click();
    await page.getByRole('list', { name: 'Gekocht voor Frankrijk' }).getByRole('checkbox', { name: 'Pleisters' }).click();
    await expect(kopen).toContainText('0 van 4 gekocht');
    await geenHorizontaleScroll(page, `regelen ${breed ?? ''}`);
    // Naar Boodschappen en terug: hetzelfde item (bij Later nodig), en Boodschappen staat nog open.
    await page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Boodschappen' }).click();
    await page.getByRole('button', { name: /^Later nodig/ }).click();
    await expect(page.getByRole('list', { name: 'Later nodig' }).getByRole('checkbox', { name: 'Pleisters' })).toHaveAttribute('aria-checked', 'false');
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

test('slimme +: "voor Frankrijk" koppelt een boodschap (Later nodig) en een taak; vóór opslaan te corrigeren (ook 320 px en donker)', async ({ page }) => {
  const breedtes = isDesktop(page) ? [null] : [null, 320];
  for (const breed of breedtes) {
    if (breed) { await page.setViewportSize({ width: breed, height: 700 }); await page.emulateMedia({ colorScheme: 'dark' }); }
    await page.goto(START + '#/vandaag');
    await page.reload();   // verse demo
    const venster = page.getByRole('dialog');
    const zin = async (tekst: string) => {
      await page.locator('.nav-plus').click();
      await venster.getByLabel('Wat wil je regelen?').fill(tekst);
    };
    // De verzendknop in de invoerbalk; een melding van de vorige toevoeging verdwijnt zodra de + opent.
    const verstuur = () => venster.getByRole('button', { name: 'Toevoegen' }).click();
    const regel = venster.locator('.kaart-regel');
    // Een boodschap: gekoppeld en bij Later nodig; de knopjes zijn goed te raken.
    await zin('Zonnebrand kopen voor Frankrijk');
    await expect(regel).toHaveText('Voor Frankrijk · bij Later nodig');
    await geenHorizontaleScroll(page, `slimme + ${breed ?? ''}`);
    await verstuur();
    await expect(page.getByRole('status')).toContainText('Zonnebrand bij Later nodig');
    // Corrigeren vóór opslaan: andere vakantie en Nu te kopen.
    await zin('Pleisters kopen voor Frankrijk');
    await venster.getByRole('button', { name: 'Aanpassen' }).click();
    const vak = venster.getByRole('button', { name: 'Vakantie: Frankrijk' });
    expect((await vak.boundingBox())!.height, 'regel te klein').toBeGreaterThanOrEqual(44);
    await vak.click();
    await venster.getByRole('group', { name: 'Vakantie' }).getByRole('button', { name: 'Kerst op Texel' }).click();
    await venster.getByRole('button', { name: 'Lijst: Later nodig' }).click();
    await venster.getByRole('group', { name: 'Lijst' }).getByRole('button', { name: 'Nu te kopen' }).click();
    await expect(regel).toHaveText('Voor Kerst op Texel · nu te kopen');
    await geenHorizontaleScroll(page, `slimme + paneel ${breed ?? ''}`);
    await verstuur();
    // Een taak: een voorbereiding van Frankrijk.
    await zin('Paspoorten controleren voor Frankrijk');
    await expect(regel).toHaveText('Voorbereiding voor Frankrijk');
    await verstuur();
    await expect(page.getByRole('status')).toContainText('Paspoorten controleren staat bij de voorbereidingen van Frankrijk');
    // Boodschappen: Zonnebrand bij Later nodig (Frankrijk), Pleisters bij Nu te kopen (Kerst op Texel); geen "voor Frankrijk".
    await page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Boodschappen' }).click();
    const nu = page.locator('section', { has: page.getByRole('heading', { name: /^Nu te kopen \d+$/ }) });
    await expect(nu.getByRole('button', { name: 'Pleisters aanpassen' })).toContainText('Kerst op Texel');
    await page.getByRole('button', { name: /^Later nodig/ }).click();
    await expect(page.getByRole('list', { name: 'Later nodig' }).getByRole('button', { name: 'Zonnebrand aanpassen' })).toContainText('Frankrijk');
    await expect(page.getByText('Zonnebrand voor Frankrijk')).toHaveCount(0);
    await geenHorizontaleScroll(page, `boodschappen ${breed ?? ''}`);
    // Regelen bij Frankrijk: de taak en de boodschap.
    await page.goto(START + '#/vakanties/v-frankrijk');
    await page.getByRole('tab', { name: 'Regelen' }).click();
    const taken = page.getByRole('button', { name: /^Voorbereidingen/ });
    if ((await taken.getAttribute('aria-expanded')) === 'false') await taken.click();
    await expect(page.getByRole('list', { name: 'Open voorbereidingen' }).getByRole('checkbox', { name: 'Paspoorten controleren' })).toBeVisible();
    await page.getByRole('button', { name: /^Boodschappen voor Frankrijk/ }).click();
    await expect(page.getByRole('button', { name: 'Zonnebrand. Meer' })).toContainText('later nodig');
    await geenHorizontaleScroll(page, `regelen ${breed ?? ''}`);
  }
});
