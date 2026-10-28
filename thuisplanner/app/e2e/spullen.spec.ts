import { expect, test, type Page } from '@playwright/test';

// Mijn spullen & Documenten in de demo (docs/thuisplanner-spullen-documenten.md §9), op 360 px, 390 px en desktop (de
// projecten), plus 320 px en donker. De demoflow: Meer → Spullen & documenten → de vaatwasser → de factuur → via de + een
// voorbeeldbon toevoegen met nagespeelde herkenning → bevestigen → terugvinden met een vraag in de +.
// Vaste demo-klok: woensdag 28 oktober 2026, 10:00.
const START = './?nu=2026-10-28T10:00';
const plus = (p: Page) => p.getByRole('dialog', { name: 'Toevoegen' });
const veld = (p: Page) => plus(p).getByLabel('Wat wil je regelen?');
const verstuur = (p: Page) => plus(p).getByRole('button', { name: 'Toevoegen', exact: true });

async function geenHorizontaleScroll(p: Page) {
  const { breed, scherm } = await p.evaluate(() => ({ breed: document.documentElement.scrollWidth, scherm: window.innerWidth }));
  expect(breed, 'pagina is breder dan het scherm').toBeLessThanOrEqual(scherm);
}
async function vraag(p: Page, tekst: string) {
  await p.locator('.nav-plus').click();
  await expect(veld(p)).toBeFocused();
  await veld(p).fill(tekst);
}

test.beforeEach(async ({ page }) => {
  // De demo gebruikt geen netwerk buiten de eigen pagina: geen Storage, geen herkenningsdienst.
  page.on('request', r => {
    const u = new URL(r.url());
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !['data:', 'blob:', 'file:'].includes(u.protocol)) throw new Error('Externe aanvraag: ' + r.url());
    if (u.pathname.includes('/storage/')) throw new Error('Storage-aanvraag in de demo: ' + r.url());
  });
  await page.goto(START);
});

test('Meer → Spullen & documenten: één rij, twee tabbladen, het dossier met garantie-uitleg', async ({ page }) => {
  await page.getByRole('link', { name: 'Meer' }).click();
  await page.getByRole('button', { name: /^Spullen & documenten:/ }).click();
  await expect(page.getByRole('heading', { name: 'Spullen & documenten', level: 1 })).toBeVisible();
  await expect(page.getByText('Voorbeeldgegevens. Er wordt niets echt bewaard, ook geen bestanden.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Spullen' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: /Afwasser 3000/ }).click();
  await expect(page.getByRole('heading', { name: 'Afwasser 3000 (voorbeeld)' })).toBeVisible();
  await expect(page.getByText('28 oktober 2026')).toBeVisible();
  await expect(page.getByText('€549,00')).toBeVisible();
  await expect(page.getByText('28 oktober 2028')).toBeVisible();
  await expect(page.getByText('Ook na deze datum kun je recht hebben op herstel of vervanging (wettelijke garantie).')).toBeVisible();
  // Eén document, op twee plekken (Documenten en het dossier).
  await expect(page.getByRole('button', { name: /Factuur Afwasser 3000/ })).toBeVisible();
  await geenHorizontaleScroll(page);

  await page.getByRole('button', { name: /Factuur Afwasser 3000/ }).click();
  await expect(page.getByRole('link', { name: 'PDF openen' })).toBeVisible();
  await expect(page.getByText('Een PDF opent buiten de app, in de viewer van je toestel.')).toBeVisible();
  // Openen gebeurt buiten de app: een gewone link (nieuw tabblad) naar een blob-adres in het geheugen, met een echte PDF.
  const open = page.getByRole('link', { name: 'PDF openen' });
  await expect(open).toHaveAttribute('href', /^blob:/);
  await expect(open).toHaveAttribute('target', '_blank');
  await expect(open).toHaveAttribute('rel', /noopener/);
  const kop = await open.evaluate(async a => new TextDecoder().decode((await (await fetch((a as HTMLAnchorElement).href)).arrayBuffer()).slice(0, 5)));
  expect(kop).toBe('%PDF-');
  await page.getByRole('button', { name: 'Documenten' }).first().click();
  await expect(page.getByRole('tab', { name: 'Documenten' })).toHaveAttribute('aria-selected', 'true');
  // De persoonlijke polis van Thomas bestaat voor Eva niet: geen rij, geen aanwijzing.
  await expect(page.getByText(/Polis/)).toHaveCount(0);
});

test('vragen in de +: antwoord uit het dossier met bron, geen nieuw item', async ({ page }) => {
  await vraag(page, 'Welk modelnummer heeft onze vaatwasser?');
  await expect(plus(page).locator('.kaart-titel')).toHaveText('Model: AW-3000-VB');
  await expect(verstuur(page)).toBeDisabled();
  await veld(page).press('Enter');
  await expect(plus(page)).toBeVisible();
  // De bron opent het dossier.
  await plus(page).getByRole('button', { name: 'Afwasser 3000 (voorbeeld)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Afwasser 3000 (voorbeeld)' })).toBeVisible();

  await vraag(page, 'Wanneer hebben we de vaatwasser gekocht?');
  await expect(plus(page).locator('.kaart-titel')).toHaveText('Gekocht op 28 oktober 2026 bij Voorbeeldwinkel');
  await page.keyboard.press('Escape');

  await vraag(page, 'Laat de factuur van de vaatwasser zien');
  await plus(page).getByRole('button', { name: /Factuur Afwasser 3000/ }).click();
  await expect(page.getByRole('link', { name: 'PDF openen' })).toBeVisible();
});

test('vraag en actie: de herinnering wordt een voorgestelde taak, pas na een tik', async ({ page }) => {
  await vraag(page, 'Wanneer verloopt de garantie van de vaatwasser? Herinner me een maand van tevoren');
  await expect(plus(page).locator('.kaart-titel')).toHaveText('Garantie tot 28 oktober 2028');
  await expect(plus(page)).toContainText('Garantie Afwasser 3000 loopt af op 28 oktober 2028');
  await plus(page).getByRole('button', { name: 'Taak toevoegen' }).click();
  await expect(page.getByRole('status')).toContainText('staat op de takenlijst');
  // Nog een keer: de taak staat er al, er komt geen tweede.
  await vraag(page, 'Wanneer verloopt de garantie van de vaatwasser? Herinner me een maand van tevoren');
  await expect(plus(page)).toContainText('staat er al');
  await expect(plus(page).getByRole('button', { name: 'Taak toevoegen' })).toHaveCount(0);
});

test('onduidelijk en niets gevonden: één vraag of een eerlijk antwoord, en Toch toevoegen', async ({ page }) => {
  await vraag(page, 'Wanneer is het?');
  await expect(plus(page)).toContainText('Waar gaat je vraag over?');
  await veld(page).fill('Wanneer verloopt de garantie?');
  await expect(plus(page)).toContainText('Over welk spul gaat het?');
  await plus(page).getByRole('button', { name: 'Afwasser 3000 (voorbeeld)', exact: true }).click();
  await expect(plus(page).locator('.kaart-titel')).toHaveText('Garantie tot 28 oktober 2028');
  await veld(page).fill('Wanneer hebben we de wasmachine gekocht?');
  await expect(plus(page)).toContainText('Ik vind geen spul dat past bij "wasmachine".');
  await plus(page).getByRole('button', { name: 'Toch toevoegen' }).click();
  await expect(verstuur(page)).toBeEnabled();
});

test('acties blijven acties: de bestaande + is ongewijzigd', async ({ page }) => {
  await vraag(page, 'morgen om 15:00 met Lotte naar de tandarts');
  await expect(plus(page).locator('.kaart-regel')).toHaveText('Morgen om 15:00 · met Lotte');
  await expect(verstuur(page)).toBeEnabled();
  await veld(page).fill('Factuur betalen');
  await expect(plus(page).locator('.kaart-titel')).toHaveText('Factuur betalen');
  await expect(verstuur(page)).toBeEnabled();
});

test('demoflow: via de + een voorbeeldbon toevoegen, nagespeelde herkenning controleren, koppelen, terugvinden', async ({ page }) => {
  await page.locator('.nav-plus').click();
  await plus(page).getByRole('button', { name: 'Bijlage: foto of PDF' }).click();
  await expect(plus(page).getByRole('button', { name: 'Foto maken' })).toBeVisible();
  await plus(page).getByRole('button', { name: /Voorbeeldbon gebruiken/ }).click();
  const venster = page.getByRole('dialog', { name: 'Document bewaren' });
  await expect(venster.getByText('Deze herkenning is nagespeeld.', { exact: false })).toBeVisible();
  // Herkende velden zijn een voorstel ("controleer"); wat de bon niet noemt, ontbreekt.
  await expect(venster.getByText('controleer').first()).toBeVisible();
  await expect(venster.getByText('ontbreekt').first()).toBeVisible();
  await expect(venster.getByText('Hoort dit bij Afwasser 3000 (voorbeeld)?')).toBeVisible();
  await venster.getByRole('button', { name: 'Ja, koppelen' }).click();
  await expect(venster.getByRole('button', { name: 'Bestaand spul' })).toHaveAttribute('aria-pressed', 'true');
  await venster.getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Bewaard (in de demo alleen in dit tabblad)');
  await expect(page.getByRole('heading', { name: 'Afwasser 3000 (voorbeeld)' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Kassabon Voorbeeldwinkel/ })).toHaveCount(2);
  await geenHorizontaleScroll(page);
});

test('een nieuw spul uit de voorbeeldfactuur: velden controleren en bevestigen', async ({ page }) => {
  await page.locator('.nav-plus').click();
  await plus(page).getByRole('button', { name: 'Bijlage: foto of PDF' }).click();
  await plus(page).getByRole('button', { name: /Voorbeeldfactuur gebruiken/ }).click();
  const venster = page.getByRole('dialog', { name: 'Document bewaren' });
  await venster.getByRole('button', { name: 'Nieuw spul' }).click();
  await venster.getByRole('textbox', { name: 'Naam' }).fill('Afwasser 3000 boven (voorbeeld)');
  const klopt = venster.getByRole('button', { name: 'Klopt' });
  const voor = await klopt.count();
  await klopt.first().click();
  await expect(klopt).toHaveCount(voor - 1);
  await venster.getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Afwasser 3000 boven (voorbeeld)' })).toBeVisible();
  // Niet bevestigde voorstellen blijven zichtbaar als "controleer".
  await expect(page.getByText('controleer').first()).toBeVisible();
});

test('een eigen bestand in de demo: gecontroleerd, maar niet bewaard; een vermomd bestand wordt geweigerd', async ({ page }) => {
  await page.goto(`${START}#/spullen/documenten`);
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
  await page.getByTestId('bestand-kiezen').setInputFiles({ name: 'mijn-factuur.pdf', mimeType: 'application/pdf', buffer: pdf });
  const venster = page.getByRole('dialog', { name: 'Document bewaren' });
  await expect(venster.getByText('ook je bestand niet', { exact: false })).toBeVisible();
  await venster.getByRole('button', { name: 'Alleen bewaren' }).click();
  await venster.getByRole('button', { name: 'Bewaren', exact: true }).click();
  await page.getByRole('button', { name: 'PDF openen' }).click();
  await expect(page.getByRole('status')).toContainText('In de demo wordt je eigen bestand niet bewaard');
  // Niets in de browseropslag.
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);

  await page.goto(`${START}#/spullen/documenten`);
  await page.getByTestId('bestand-kiezen').setInputFiles({ name: 'factuur.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html><script>alert(1)</script></html>') });
  await expect(page.getByRole('dialog', { name: 'Document bewaren' }).getByRole('alert')).toContainText('Dit soort bestand kan Thuisplanner niet bewaren');
});

test('verwijderen gaat naar de prullenbak en is terug te zetten', async ({ page }) => {
  await page.goto(`${START}#/spullen/spul/s-fiets`);
  await page.getByRole('button', { name: 'Verwijderen' }).click();
  await page.getByRole('button', { name: 'Alleen het spul' }).click();
  await expect(page.getByRole('button', { name: /Stadsfiets/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Prullenbak/ }).click();
  await expect(page.getByText('Terug te zetten tot 27 november 2026')).toBeVisible();
  await page.getByRole('button', { name: 'Terugzetten' }).click();
  await expect(page.getByRole('button', { name: /Stadsfiets/ })).toBeVisible();
});

test('op 320 px en in donker: overzicht, dossier en de + met bijlageknop passen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const schema of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: schema });
    await page.goto(`${START}#/spullen`);
    await expect(page.getByRole('heading', { name: 'Spullen & documenten', level: 1 })).toBeVisible();
    await geenHorizontaleScroll(page);
    await page.goto(`${START}#/spullen/spul/s-afwasser`);
    await geenHorizontaleScroll(page);
    await vraag(page, 'Welk modelnummer heeft onze vaatwasser?');
    const knop = plus(page).getByRole('button', { name: 'Bijlage: foto of PDF' });
    const vak = await knop.boundingBox();
    expect(vak!.x + vak!.width).toBeLessThanOrEqual(320);
    const vs = await verstuur(page).boundingBox();
    expect(vs!.x + vs!.width).toBeLessThanOrEqual(320);
    await geenHorizontaleScroll(page);
    await page.keyboard.press('Escape');
  }
});
