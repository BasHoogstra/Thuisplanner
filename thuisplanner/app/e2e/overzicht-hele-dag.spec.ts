import { expect, test, type Page } from '@playwright/test';

// Review PR #56 (P2): afspraken van de hele dag staan op het Overzicht op één compacte regel: de eerste titel (afgekapt
// als die lang is), een telling, en een tik of Enter opent de hele dag in de Agenda. Ook met veel afspraken en lange
// titels wordt het scherm niet breder of veel hoger. Vaste demo-klok: zaterdag 10 oktober 2026, 11:20.
const START = './?nu=2026-10-10T11:20';
const venster = (p: Page) => p.getByRole('dialog');
const LANG = [
  'Studiedag Lotte met een heel lange titel die op een telefoon nooit op één regel past, ook niet op 430 pixels breed',
  'Koningsdagvrijmarkt in het park achter de school, met kleedjes, limonade en de buurtvereniging',
  'Oma Ria logeert het hele weekend; logeerbed opmaken en handdoeken klaarleggen',
  'Zonder-spaties-ontzettend-lange-titelzonderafbreekpunteninhetmiddenomdebreedtetetesten',
  'Sinterklaasintocht',
];

async function heleDag(p: Page, titel: string) {
  await p.locator('.nav-plus').click();
  await venster(p).getByRole('button', { name: 'Formulier' }).click();
  await venster(p).getByLabel('Wat?').fill(titel);
  await venster(p).getByRole('button', { name: 'Hele dag', exact: true }).click();
  await venster(p).getByRole('button', { name: 'Toevoegen', exact: true }).click();
  await expect(venster(p)).toBeHidden();
}

test.beforeEach(async ({ page }) => { await page.goto(START); });

test('veel afspraken van de hele dag met lange titels: één regel, met telling, zonder horizontaal scrollen', async ({ page }) => {
  const voor = await page.evaluate(() => document.documentElement.scrollHeight);
  for (const t of LANG) await heleDag(page, t);
  const regel = page.getByRole('button', { name: /^Hele dag, / });
  await expect(regel).toHaveCount(1);
  await expect(regel).toHaveAccessibleName(new RegExp(`^Hele dag, ${LANG.length} afspraken: .*\\. Naar de dag in de Agenda$`));
  await expect(regel).toContainText(`+${LANG.length - 1}`);
  // Eén regel: niet hoger dan een gewoon tikvlak, en de titel wordt afgekapt in plaats van te breken.
  const vak = (await regel.boundingBox())!;
  expect(vak.height).toBeLessThanOrEqual(52);
  expect(vak.height).toBeGreaterThanOrEqual(44);
  const titel = regel.locator('.hele-dag-titel');
  expect(await titel.evaluate(e => e.scrollWidth > e.clientWidth), 'de lange titel is afgekapt').toBe(true);
  const { breed, scherm } = await page.evaluate(() => ({ breed: document.documentElement.scrollWidth, scherm: window.innerWidth }));
  expect(breed, 'pagina is breder dan het scherm').toBeLessThanOrEqual(scherm);
  // Vijf afspraken erbij maken de pagina niet langer dan die ene regel.
  const na = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(na - voor).toBeLessThanOrEqual(60);
});

test('de regel "Hele dag" werkt met het toetsenbord en opent de hele dag in de Agenda', async ({ page }) => {
  await heleDag(page, LANG[0]);
  const regel = page.getByRole('button', { name: /^Hele dag, 1 afspraak: / });
  await regel.focus();
  await expect(regel).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Dag', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('main')).toContainText('Studiedag Lotte met een heel lange titel');
});

test('privacy: de privé-afspraak van een ander blijft "Bezet" en lekt nergens op het Overzicht', async ({ page }) => {
  // De demo kent een privé-reeks van Thomas (15:00): op het Overzicht alleen "Bezet", met wie en wanneer.
  await expect(page.getByRole('button', { name: /^Bezet, 15:00 – 16:00/ })).toHaveCount(1);
  const tekst = await page.locator('main').innerText();
  expect(tekst).not.toMatch(/privé-afspraak van Thomas|Fysio/i);
});
