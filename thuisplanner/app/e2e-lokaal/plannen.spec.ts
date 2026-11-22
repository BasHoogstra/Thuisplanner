import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { nav, SYNC, telefoon } from './hulp';

// Plannen online (besluit 18, migratie 20261111120000), alleen met VITE_PLANNEN=aan in de build: Eva maakt op haar telefoon
// een plan met een taak; Thomas ziet het op zijn eigen telefoon en vinkt de taak af; Eva ziet dat vanzelf (één vinkje,
// via de server en de seintjes). Fictief gezin (scripts/lokaal.mjs).
test.skip(process.env.VITE_PLANNEN !== 'aan', 'Plannen staat uit (VITE_PLANNEN)');
test.beforeAll(() => { execFileSync('node', ['scripts/lokaal.mjs', 'seed'], { stdio: 'ignore' }); });

test('twee telefoons: een plan met een taak, afvinken bij de ander, en de één ziet het meteen', async ({ browser }) => {
  const naam = `Zolder ${Date.now().toString(36)}`;
  const eva = await telefoon(browser, 'Eva');
  const thomas = await telefoon(browser, 'Thomas');

  await nav(eva.p, 'Meer');
  await eva.p.getByRole('button', { name: /^Plannen:/ }).click();
  await eva.p.getByRole('button', { name: 'Nieuw plan' }).click();
  await eva.p.getByLabel('Naam').fill(naam);
  await eva.p.getByRole('dialog').getByRole('button', { name: 'Plan maken' }).click();
  await expect(eva.p.getByRole('heading', { level: 1, name: naam })).toBeVisible(SYNC);
  const veld = eva.p.getByLabel('Taak toevoegen');
  await veld.fill('Isolatie bestellen');
  await veld.press('Enter');
  const bijEva = eva.p.getByRole('checkbox', { name: /Isolatie bestellen/ });
  await expect(bijEva).toBeVisible(SYNC);
  await expect(bijEva).not.toBeChecked();

  await nav(thomas.p, 'Meer');
  await thomas.p.getByRole('button', { name: /^Plannen:/ }).click();
  await thomas.p.getByRole('button', { name: new RegExp(`^${naam},`) }).click();
  const bijThomas = thomas.p.getByRole('checkbox', { name: /Isolatie bestellen/ });
  await expect(bijThomas).toBeVisible(SYNC);
  await bijThomas.click();
  // Afgevinkt gaat naar de ingeklapte groep "afgerond"; de voortgang telt mee.
  await expect(thomas.p.getByText('1 van 1 klaar')).toBeVisible(SYNC);

  // Bij Eva vanzelf (seintje van de server): dezelfde taak is afgerond.
  await expect(eva.p.getByText('1 van 1 klaar')).toBeVisible(SYNC);
  await expect(bijEva).toHaveCount(0);
  await eva.ctx.close();
  await thomas.ctx.close();
});
