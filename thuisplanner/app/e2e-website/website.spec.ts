// De publieke website van Thuisplanner (thuisplanner/website) in een echte browser. De voorbeeldbouw: zonder
// bedrijfsgegevens (die staan als "nog in te vullen"), maar verder gelijk aan wat online komt.
import { expect, test, type Page } from '@playwright/test';

const PAGINAS = ['/', '/privacy', '/mails', '/bedrijfsgegevens'];

/** Houdt bij of de pagina iets van buiten probeert te laden, of de CSP iets tegenhoudt. */
function bewaak(page: Page) {
  const buiten: string[] = [];
  const csp: string[] = [];
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:5185/') && !r.url().startsWith('data:')) buiten.push(r.url()); });
  page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()); });
  return { buiten, csp };
}

test('elke pagina: past op het scherm, laadt niets van buiten, geen CSP-melding, geen JavaScript en geen cookies', async ({ page, context }) => {
  const b = bewaak(page);
  for (const pad of PAGINAS) {
    const r = await page.goto(pad);
    expect(r?.status(), pad).toBe(200);
    expect(r?.headers()['content-security-policy'], pad).toContain("default-src 'none'");
    await expect(page.locator('h1')).toHaveCount(1);
    const breed = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(breed, `${pad}: horizontaal scrollen`).toBeLessThanOrEqual(0);
    expect(await page.locator('script').count(), pad).toBe(0);
  }
  expect(b.buiten).toEqual([]);
  expect(b.csp).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});

test('de knop gaat naar "Meedoen met de bèta", met de uitleg over de uitnodiging', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Meedoen met de bèta' }).first().click();
  await expect(page).toHaveURL(/#meedoen$/);
  const blok = page.locator('#meedoen');
  await expect(blok.getByRole('heading', { name: 'Meedoen met de bèta' })).toBeInViewport();
  await expect(blok).toContainText('voorlopig op uitnodiging');
  await expect(blok).toContainText('Tijdens de bèta gebruik je Thuisplanner gratis. Over abonnementen en prijzen informeren we je ruim van tevoren.');
});

test('veelgestelde vragen openen zonder JavaScript; de prijsvraag geeft precies de afgesproken tekst', async ({ page }) => {
  await page.goto('/');
  const vraag = page.locator('details', { hasText: 'Wat kost Thuisplanner?' });
  await expect(vraag.locator('p')).toBeHidden();
  await vraag.locator('summary').click();
  await expect(vraag.locator('p')).toHaveText('Tijdens de bèta gebruik je Thuisplanner gratis. Over abonnementen en prijzen informeren we je ruim van tevoren.');
});

test('de voet linkt naar privacy, mails en bedrijfsgegevens; lege bedrijfsgegevens staan zichtbaar als "nog in te vullen"', async ({ page }) => {
  await page.goto('/');
  for (const [naam, kop] of [['Privacy', 'Privacyverklaring van deze website'], ['Welke mails sturen wij?', 'Welke mails sturen wij?'], ['Bedrijfsgegevens', 'Bedrijfsgegevens']]) {
    await page.getByRole('contentinfo').getByRole('link', { name: naam }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(kop);
    await page.goto('/');
  }
  await page.goto('/bedrijfsgegevens');
  await expect(page.locator('.nog-invullen').first()).toBeVisible();
});

test('een onbekend adres geeft de 404-pagina met status 404', async ({ page }) => {
  const r = await page.goto('/bestaat-niet');
  expect(r?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Deze pagina bestaat niet');
});

test('donker: de kleuren van de ontwerpbasis volgen het systeem', async ({ browser }) => {
  const licht = await browser.newPage({ colorScheme: 'light' });
  const donker = await browser.newPage({ colorScheme: 'dark' });
  await licht.goto('/'); await donker.goto('/');
  const achtergrond = (p: Page) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await achtergrond(licht)).toBe('rgb(242, 244, 241)');
  expect(await achtergrond(donker)).toBe('rgb(18, 22, 20)');
  await licht.close(); await donker.close();
});

test('toetsenbord: "Naar de inhoud" is de eerste stop en zichtbaar bij focus', async ({ page, isMobile }) => {
  test.skip(isMobile, 'alleen met een toetsenbord');
  await page.goto('/');
  await page.keyboard.press('Tab');
  const link = page.getByRole('link', { name: 'Naar de inhoud' });
  await expect(link).toBeFocused();
  await expect(link).toBeInViewport();
});
