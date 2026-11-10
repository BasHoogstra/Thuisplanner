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
  // 30 dagen na het verwijderen (met de echte klok van het toestel; de demo-klok ?nu= geldt alleen voor de agenda).
  const tot = new Date(Date.now() + 30 * 86400000);
  const maand = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  await expect(page.getByText(`Terug te zetten tot ${tot.getUTCDate()} ${maand[tot.getUTCMonth()]} ${tot.getUTCFullYear()}`)).toBeVisible();
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

// ---------------------------------------------------------------- Nieuw spul compact en de leesbare documenttitel
// De velden achter "Meer details" en de titel die de soort en het spul volgt tot je hem zelf aanpast.

test('nieuw spul compact: Meer details klapt uit, waarden blijven ingeklapt bewaard, een prijsfout klapt het open', async ({ page }) => {
  await page.goto(`${START}#/spullen`);
  await page.getByRole('button', { name: 'Spul toevoegen' }).first().click();
  const venster = page.getByRole('dialog', { name: 'Nieuw spul' });
  const meer = venster.getByRole('button', { name: /^Meer details/ });
  // Direct zichtbaar: de naam en wie het ziet; de rest is ingeklapt en niet bereikbaar.
  await expect(venster.getByRole('textbox', { name: 'Naam' })).toBeVisible();
  await expect(venster.getByText('Wie ziet dit?')).toBeVisible();
  await expect(meer).toHaveAttribute('aria-expanded', 'false');
  await expect(venster.getByRole('textbox', { name: /^Merk/ })).toBeHidden();
  const paneel = venster.locator(`#${await meer.getAttribute('aria-controls')}`);
  await expect(paneel).toBeHidden();
  // Met het toetsenbord uitklappen.
  await meer.focus();
  await page.keyboard.press('Enter');
  await expect(meer).toHaveAttribute('aria-expanded', 'true');
  await expect(paneel).toBeVisible();
  await venster.getByRole('textbox', { name: /^Merk/ }).fill('Voorbeeldmerk');
  await venster.getByRole('textbox', { name: /^Prijs/ }).fill('veel');
  await meer.click();
  await expect(meer).toHaveText('Meer details (2 ingevuld)');
  // Zonder naam: de fout bij de naam; met een naam maar een onleesbare prijs klapt het paneel open.
  await venster.getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(venster.getByRole('alert')).toHaveText('Geef het spul een naam.');
  await venster.getByRole('textbox', { name: 'Naam' }).fill('Koffiezetter (voorbeeld)');
  await venster.getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(venster.getByRole('alert')).toContainText('De prijs is geen bedrag');
  await expect(meer).toHaveAttribute('aria-expanded', 'true');
  await venster.getByRole('textbox', { name: /^Prijs/ }).fill('12,50');
  await meer.click();
  await venster.getByRole('button', { name: 'Bewaren', exact: true }).click();
  // Ingeklapt bewaard: merk en prijs staan in het dossier.
  await expect(page.getByRole('heading', { name: 'Koffiezetter (voorbeeld)' })).toBeVisible();
  await expect(page.getByText('Voorbeeldmerk')).toBeVisible();
  await expect(page.getByText('€12,50')).toBeVisible();
  await geenHorizontaleScroll(page);
});

test('spul aanpassen: Meer details staat open met de bestaande gegevens, inklappen verliest niets', async ({ page }) => {
  await page.goto(`${START}#/spullen/spul/s-afwasser`);
  await page.getByRole('button', { name: 'Aanpassen' }).click();
  const venster = page.getByRole('dialog', { name: 'Spul aanpassen' });
  const meer = venster.getByRole('button', { name: /^Meer details/ });
  await expect(meer).toHaveAttribute('aria-expanded', 'true');
  await expect(venster.getByRole('textbox', { name: /^Model/ })).toHaveValue('AW-3000-VB');
  await meer.click();
  await expect(meer).toHaveText(/^Meer details \(\d+ ingevuld\)$/);
  await venster.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Afwasser 3000 (voorbeeld)' })).toBeVisible();
  await expect(page.getByText('AW-3000-VB')).toBeVisible();
  await expect(page.getByText('€549,00')).toBeVisible();
});

test('documenttitel: volgt soort en spul, een eigen titel blijft staan, leeg wordt de terugvalnaam', async ({ page }) => {
  await page.goto(`${START}#/spullen/spul/s-afwasser`);
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
  await page.getByTestId('bestand-kiezen').setInputFiles({ name: '970A712A-0D3D-4C53-A600-6A38586D060F.pdf', mimeType: 'application/pdf', buffer: pdf });
  const venster = page.getByRole('dialog', { name: 'Document bewaren' });
  const titel = venster.getByRole('textbox', { name: 'Titel' });
  const soort = (naam: string) => venster.getByRole('group', { name: 'Soort document' }).getByRole('button', { name: naam, exact: true });
  // Vooraf gekoppeld aan het spul; een code als bestandsnaam wordt de soort met het spul; de bestandsnaam blijft zichtbaar.
  await expect(venster.getByRole('button', { name: 'Bestaand spul' })).toHaveAttribute('aria-pressed', 'true');
  await expect(titel).toHaveValue('Factuur Afwasser 3000 (voorbeeld)');
  await expect(venster.getByText('Bestand: 970A712A-0D3D-4C53-A600-6A38586D060F.pdf')).toBeVisible();
  await soort('Garantiebewijs').click();
  await expect(titel).toHaveValue('Garantiebewijs Afwasser 3000 (voorbeeld)');
  // Een eigen titel volgt de soort niet meer.
  await titel.fill('Garantie via de winkel');
  await soort('Handleiding').click();
  await expect(titel).toHaveValue('Garantie via de winkel');
  // Leegmaken en verlaten: weer de automatische naam (met de huidige soort).
  await titel.fill('');
  await titel.blur();
  await expect(titel).toHaveValue('Handleiding Afwasser 3000 (voorbeeld)');
  // Een eigen titel wordt precies zo bewaard (alleen de spaties eromheen gaan weg).
  await titel.fill('  Handleiding met schema  ');
  await venster.getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(page.getByRole('button', { name: /Handleiding met schema/ })).toBeVisible();
});

test('document aanpassen: de titel blijft ongewijzigd, een lege titel wordt de terugvalnaam', async ({ page }) => {
  await page.goto(`${START}#/spullen/spul/s-afwasser`);
  await page.getByRole('button', { name: /Factuur Afwasser 3000/ }).click();
  await page.getByRole('button', { name: 'Aanpassen' }).click();
  const venster = page.getByRole('dialog', { name: 'Document aanpassen' });
  const titel = venster.getByRole('textbox', { name: 'Titel' });
  const oud = await titel.inputValue();
  expect(oud).toMatch(/^Factuur Afwasser 3000/);
  await venster.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(page.getByRole('heading', { name: oud })).toBeVisible();
  await page.getByRole('button', { name: 'Aanpassen' }).click();
  await titel.fill('');
  await expect(titel).toHaveAttribute('placeholder', 'Factuur Afwasser 3000 (voorbeeld)');
  await venster.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Factuur Afwasser 3000 (voorbeeld)' })).toBeVisible();
});

// ---- Privacy: de naam van een persoonlijk spul komt nooit vanzelf in iets wat het huishouden ziet ----
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
async function persoonlijkSpul(page: Page, naam: string) {
  await page.goto(`${START}#/spullen`);
  await page.getByRole('button', { name: 'Spul toevoegen' }).first().click();
  const v = page.getByRole('dialog', { name: 'Nieuw spul' });
  await v.getByRole('textbox', { name: 'Naam' }).fill(naam);
  await v.getByRole('button', { name: 'Alleen ik' }).click();
  await v.getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(page.getByRole('heading', { name: naam })).toBeVisible();
}
const invoer = (page: Page) => page.getByRole('dialog', { name: 'Document bewaren' });

test('privacy: document bij een persoonlijk spul is standaard persoonlijk; delen haalt de spulnaam uit de automatische titel', async ({ page }) => {
  await persoonlijkSpul(page, 'Trouwring');
  await page.getByTestId('bestand-kiezen').setInputFiles({ name: 'IMG_4821.pdf', mimeType: 'application/pdf', buffer: PDF });
  const v = invoer(page);
  const titel = v.getByRole('textbox', { name: 'Titel' });
  await expect(v.getByRole('button', { name: 'Alleen ik' })).toHaveAttribute('aria-pressed', 'true');
  await expect(titel).toHaveValue('Factuur Trouwring');
  // Een andere soort zet het niet terug naar gedeeld.
  await v.getByRole('group', { name: 'Soort document' }).getByRole('button', { name: 'Bon', exact: true }).click();
  await expect(v.getByRole('button', { name: 'Alleen ik' })).toHaveAttribute('aria-pressed', 'true');
  await expect(titel).toHaveValue('Bon Trouwring');
  // Bewust delen: de naam verdwijnt uit de titel, en het scherm zegt wat het huishouden ziet.
  await v.getByRole('button', { name: 'Het huishouden' }).click();
  await expect(titel).toHaveValue('Bon van 28 oktober 2026');
  await expect(v.getByText(/ziet het document, maar niet bij welk spul/)).toBeVisible();
  await v.getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(page.getByRole('button', { name: /Bon van 28 oktober 2026/ })).toBeVisible();
});

test('privacy: een bestandsnaam of eigen titel die het persoonlijke spul noemt, vraagt eerst om een keuze', async ({ page }) => {
  await persoonlijkSpul(page, 'Trouwring');
  await page.getByTestId('bestand-kiezen').setInputFiles({ name: 'Bon Trouwring juwelier.pdf', mimeType: 'application/pdf', buffer: PDF });
  const v = invoer(page);
  const titel = v.getByRole('textbox', { name: 'Titel' });
  const bewaar = v.getByRole('button', { name: 'Bewaren', exact: true });
  await v.getByRole('button', { name: 'Het huishouden' }).click();
  await expect(v.getByText(/iedereen in het huishouden/)).toBeVisible();
  await expect(bewaar).toBeDisabled();
  // De veilige titel lost het op.
  await v.getByRole('button', { name: 'Veilige titel gebruiken' }).click();
  await expect(titel).not.toHaveValue(/Trouwring/);
  await expect(bewaar).toBeEnabled();
  // Een eigen, bewuste keuze blijft mogelijk.
  await titel.fill('Trouwring: bon van de juwelier');
  await expect(bewaar).toBeDisabled();
  await v.getByRole('button', { name: 'Toch zo laten' }).click();
  await expect(bewaar).toBeEnabled();
  // Een andere titel vraagt opnieuw; terug naar Alleen ik: geen vraag meer.
  await titel.fill('Bon Trouwring');
  await expect(bewaar).toBeDisabled();
  await v.getByRole('button', { name: 'Alleen ik' }).click();
  await expect(v.getByText(/iedereen in het huishouden/)).toHaveCount(0);
  await expect(bewaar).toBeEnabled();
});

test('privacy: een persoonlijk document delen met de spulnaam in de titel vraagt eerst om een keuze', async ({ page }) => {
  await persoonlijkSpul(page, 'Trouwring');
  await page.getByTestId('bestand-kiezen').setInputFiles({ name: 'IMG_4821.pdf', mimeType: 'application/pdf', buffer: PDF });
  await invoer(page).getByRole('button', { name: 'Bewaren', exact: true }).click();
  await page.getByRole('button', { name: /Factuur Trouwring/ }).click();
  await page.getByRole('button', { name: 'Aanpassen' }).click();
  const v = page.getByRole('dialog', { name: 'Document aanpassen' });
  const titel = v.getByRole('textbox', { name: 'Titel' });
  const opslaan = v.getByRole('button', { name: 'Opslaan', exact: true });
  await expect(opslaan).toBeEnabled();
  await v.getByRole('button', { name: 'Het huishouden' }).click();
  await expect(opslaan).toBeDisabled();
  // Ook de terugvalnaam van een leeg veld noemt het persoonlijke spul nu niet.
  await titel.fill('');
  await expect(titel).toHaveAttribute('placeholder', 'Factuur van 28 oktober 2026');
  await titel.fill('Factuur Trouwring');
  await v.getByRole('button', { name: 'Veilige titel gebruiken' }).click();
  await expect(titel).toHaveValue('Factuur van 28 oktober 2026');
  await opslaan.click();
  await expect(page.getByRole('heading', { name: 'Factuur van 28 oktober 2026' })).toBeVisible();
});

test('privacy: een gedeeld spul persoonlijk maken meldt welke gedeelde documenten het nog noemen', async ({ page }) => {
  await page.goto(`${START}#/spullen/spul/s-afwasser`);
  await page.getByRole('button', { name: 'Aanpassen' }).click();
  const v = page.getByRole('dialog', { name: 'Spul aanpassen' });
  await expect(v.getByText(/noemen dit spul in de titel/)).toHaveCount(0);
  await v.getByRole('button', { name: 'Alleen ik' }).click();
  await expect(v.getByRole('note').filter({ hasText: /noemen dit spul in de titel/ })).toContainText('Factuur Afwasser 3000');
  // De melding houdt niets tegen: bewaren kan gewoon.
  await v.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(page.getByText('Alleen voor jou')).toBeVisible();
});
