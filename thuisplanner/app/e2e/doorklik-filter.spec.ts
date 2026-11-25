import { expect, test, type Locator, type Page } from '@playwright/test';
import { kiesFilter } from './hulp-agenda';

// Review PR #55/#56 (P2): elke doorklik vanaf het Overzicht (de koppen "Agenda" en "Alle taken", de telregel van de taken
// en de regel "Hele dag") toont het hele gezin, ook als er in de Agenda eerder een persoon gekozen was. Gewone navigatie
// via de navigatiebalk laat dat filter staan. Vaste demo-klok: zaterdag 10 oktober 2026, 11:20.
const START = './?nu=2026-10-10T11:20';
const navLink = (p: Page, naam: string) => p.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: naam });
const venster = (p: Page) => p.getByRole('dialog');

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
  await navLink(p, 'Overzicht').click();
}

/** Een afspraak voor vandaag die de hele dag duurt, via het formulier achter de +. */
async function heleDag(p: Page, titel: string) {
  await p.locator('.nav-plus').click();
  await venster(p).getByRole('button', { name: 'Formulier' }).click();
  await venster(p).getByLabel('Wat?').fill(titel);
  await venster(p).getByRole('button', { name: 'Hele dag', exact: true }).click();
  await venster(p).getByRole('button', { name: 'Toevoegen', exact: true }).click();
  await expect(venster(p)).toBeHidden();
}

test.beforeEach(async ({ page }) => { await page.goto(START); });

const DOORKLIKKEN: { naam: string; knop: (p: Page) => Locator; weergave: 'Week' | 'Dag' | 'Taken' }[] = [
  { naam: 'de kop "Agenda"', knop: p => p.getByRole('button', { name: 'Agenda', exact: true }), weergave: 'Week' },
  { naam: 'de kop "Alle taken"', knop: p => p.getByRole('button', { name: 'Alle taken', exact: true }), weergave: 'Taken' },
  { naam: 'de telregel van de taken', knop: p => p.getByRole('button', { name: /^Nog .* · alle taken$/ }), weergave: 'Taken' },
  { naam: 'de regel "Hele dag"', knop: p => p.getByRole('button', { name: /^Hele dag, / }), weergave: 'Dag' },
];

for (const lid of ['Daan', 'Lotte', 'Thomas']) {
  for (const d of DOORKLIKKEN) {
    test(`${d.naam} na een filter op ${lid}: het hele gezin`, async ({ page }) => {
      if (d.weergave === 'Dag') await heleDag(page, 'Koningsdag');
      await kiesInAgenda(page, lid);
      await d.knop(page).click();
      await expect(page.getByRole('tab', { name: d.weergave, exact: true })).toHaveAttribute('aria-selected', 'true');
      await filterIs(page, 'Iedereen');
      if (d.weergave === 'Taken') {
        // Taken van verschillende gezinsleden en zonder persoon staan er weer allemaal.
        await expect(page.getByRole('list', { name: 'Vandaag' })).toContainText('Plantenbak water geven');   // Lotte
        await expect(page.getByRole('list', { name: 'Vandaag' })).toContainText('Cadeautje voor Noor kopen');   // Eva
        await expect(page.getByRole('list', { name: 'Komende dagen' })).toContainText('Fietsband Lotte plakken');   // Thomas
        await expect(page.getByRole('list', { name: 'Te laat' })).toContainText('Toestemmingsformulier schoolreis');   // niemand
      } else {
        await expect(page.getByRole('button', { name: /^Voetbal, 13:00/ }).first()).toBeVisible();   // Lotte
        await expect(page.getByRole('button', { name: /^Bezet, 15:00/ }).first()).toBeVisible();   // Thomas, privé: alleen "Bezet"
      }
    });
  }
}

test('gewone navigatie via de navigatiebalk laat het filter staan', async ({ page }) => {
  await kiesInAgenda(page, 'Daan');
  await navLink(page, 'Agenda').click();
  await filterIs(page, 'Daan');
});

test('toetsenbord: de doorklikken zijn te bereiken en met Enter te gebruiken', async ({ page }) => {
  await kiesInAgenda(page, 'Lotte');
  const knop = page.getByRole('button', { name: 'Alle taken', exact: true });
  await knop.focus();
  await expect(knop).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Taken', exact: true })).toHaveAttribute('aria-selected', 'true');
  await filterIs(page, 'Iedereen');
});
