import { expect, test, type Page } from '@playwright/test';
import { kiesFilter } from './hulp-agenda';

// Review PR #55 (P2): een doorklik vanaf Vandaag ("Alle taken", "Naar Agenda") toont het hele gezin, ook als er in de Agenda
// eerder een persoon gekozen was. Gewone navigatie via de navigatiebalk laat dat filter staan. Vaste demo-klok:
// zaterdag 10 oktober 2026, 11:20.
const START = './?nu=2026-10-10T11:20';
const navLink = (p: Page, naam: string) => p.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: naam });

/** Welk filter staat aan: op de telefoon via de naam van de knop, op de laptop via de ingedrukte keuze. */
async function filterIs(p: Page, naam: string) {
  const knop = p.getByRole('button', { name: /^Wiens agenda/ });
  if (await knop.isVisible()) await expect(knop).toHaveAccessibleName(`Wiens agenda: ${naam}`);
  else await expect(p.getByRole('group', { name: 'Wiens agenda' }).getByRole('button', { name: naam, exact: true })).toHaveAttribute('aria-pressed', 'true');
}

async function kiesInAgenda(p: Page, naam: string) {
  await navLink(p, 'Agenda').click();
  await kiesFilter(p, naam);
  await filterIs(p, naam);
}

test.beforeEach(async ({ page }) => { await page.goto(START); });

for (const lid of ['Daan', 'Lotte', 'Thomas']) {
  test(`"Alle taken" na een filter op ${lid}: het hele gezin, ook de taken van anderen`, async ({ page }) => {
    await kiesInAgenda(page, lid);
    await navLink(page, 'Vandaag').click();
    await page.getByRole('button', { name: 'Alle taken' }).click();
    await expect(page.getByRole('tab', { name: 'Taken', exact: true })).toHaveAttribute('aria-selected', 'true');
    await filterIs(page, 'Iedereen');
    // Taken van verschillende gezinsleden en zonder persoon staan er weer allemaal.
    await expect(page.getByRole('list', { name: 'Vandaag' })).toContainText('Plantenbak water geven');   // Lotte
    await expect(page.getByRole('list', { name: 'Vandaag' })).toContainText('Cadeautje voor Noor kopen');   // Eva
    await expect(page.getByRole('list', { name: 'Komende dagen' })).toContainText('Fietsband Lotte plakken');   // Thomas
    await expect(page.getByRole('list', { name: 'Te laat' })).toContainText('Toestemmingsformulier schoolreis');   // niemand
  });

  test(`"Naar Agenda" na een filter op ${lid}: de dag van vandaag voor het hele gezin`, async ({ page }) => {
    await kiesInAgenda(page, lid);
    await navLink(page, 'Vandaag').click();
    await page.getByRole('button', { name: 'Naar Agenda' }).click();
    await expect(page.getByRole('tab', { name: 'Dag', exact: true })).toHaveAttribute('aria-selected', 'true');
    await filterIs(page, 'Iedereen');
    await expect(page.getByRole('button', { name: /^Voetbal, 13:00/ })).toBeVisible();   // Lotte
    await expect(page.getByRole('button', { name: /^Bezet, 15:00/ })).toBeVisible();   // Thomas, privé: alleen "Bezet"
    await expect(page.getByRole('button', { name: /^Pizza bakken met de buren, 18:00/ })).toBeVisible();   // iedereen
  });
}

test('gewone navigatie via de navigatiebalk laat het filter staan', async ({ page }) => {
  await kiesInAgenda(page, 'Daan');
  await navLink(page, 'Vandaag').click();
  await navLink(page, 'Agenda').click();
  await filterIs(page, 'Daan');
});

test('toetsenbord: "Alle taken" is met Tab te bereiken en met Enter te gebruiken', async ({ page }) => {
  await kiesInAgenda(page, 'Lotte');
  await navLink(page, 'Vandaag').click();
  const knop = page.getByRole('button', { name: 'Alle taken' });
  await knop.focus();
  await expect(knop).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Taken', exact: true })).toHaveAttribute('aria-selected', 'true');
  await filterIs(page, 'Iedereen');
});
