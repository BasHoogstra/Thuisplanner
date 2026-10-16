// De stagingbuild op een telefoon (390 px), met de CSP van Cloudflare (dist-staging/_headers). Zie
// playwright.staging.config.ts: het projectadres is verzonnen en de test beantwoordt elk verzoek zelf.
import { expect, test } from '@playwright/test';
import { PROJECT, proef, sessie } from './hulp';

const EIGEN = '127.0.0.1:5182';
const PROJECTHOST = new URL(PROJECT).host;

test('testomgeving: duidelijke markering, geen demo-accounts of vooraf ingevuld wachtwoord, en de CSP laat niets anders toe', async ({ page }) => {
  const p = await proef(page, () => ({ status: 500, json: {} }));
  await page.goto('./');
  await expect(page).toHaveTitle('Thuisplanner (testomgeving)');
  await expect(page.getByRole('note')).toContainText('Testomgeving');
  await expect(page.getByRole('heading', { name: 'Inloggen' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Inloggen als/ })).toHaveCount(0);
  await expect(page.getByLabel('E-mailadres')).toHaveValue('');
  await expect(page.getByLabel('Wachtwoord')).toHaveValue('');
  await expect(page.getByText(/verzonnen gegevens/).first()).toBeVisible();
  // Eén actieve CSP met precies de eigen site en het stagingproject.
  const csp = await page.evaluate(async () => (await fetch('./')).headers.get('content-security-policy'));
  expect(csp).toContain(`connect-src 'self' ${PROJECT} wss://${PROJECTHOST}`);
  expect(p.overtredingen).toEqual([]);
  expect([...p.hosts].every(h => h === EIGEN || h === PROJECTHOST)).toBe(true);
});

test('de CSP blokkeert verkeer naar elk ander adres (ook een ander Supabase-project)', async ({ page }) => {
  const p = await proef(page, () => ({ status: 500, json: {} }));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Inloggen' })).toBeVisible();
  const uitkomst = await page.evaluate(async () => {
    const pogingen = ['https://zyxwvutsrqponmlkjihg.supabase.co/rest/v1/', 'https://voorbeeld.nl/'];
    return Promise.all(pogingen.map(u => fetch(u).then(() => 'gelukt', () => 'geblokkeerd')));
  });
  expect(uitkomst).toEqual(['geblokkeerd', 'geblokkeerd']);
  expect(p.overtredingen.join('\n')).toMatch(/connect-src/);
});

test('verkeerd wachtwoord: een nette melding, niets bewaard op het toestel', async ({ page }) => {
  await proef(page, (_m, pad) => (pad.startsWith('/auth/v1/token')
    ? { status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } }
    : { status: 404, json: {} }));
  await page.goto('./');
  await page.getByLabel('E-mailadres').fill('tester1@example.com');
  await page.getByLabel('Wachtwoord').fill('fout-wachtwoord');
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page.getByRole('alert')).toContainText('Klopt je e-mailadres en wachtwoord?');
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test('inloggen op de telefoon: blijft bewaard na sluiten en heropenen, zonder token in de adresbalk', async ({ context }) => {
  const antwoord = (m: string, pad: string) => {
    if (m === 'POST' && pad.startsWith('/auth/v1/token?grant_type=password')) return { status: 200, json: sessie('tester1@example.com') };
    if (m === 'POST' && pad === '/rest/v1/rpc/my_memberships') return { status: 200, json: [] };
    return { status: 404, json: {} };
  };
  const page = await context.newPage();
  const p1 = await proef(page, antwoord);
  await page.goto('./');
  await page.getByLabel('E-mailadres').fill('tester1@example.com');
  await page.getByLabel('Wachtwoord').fill('een-sterk-testwachtwoord');
  await page.getByRole('button', { name: 'Inloggen' }).click();
  // Nog geen huishouden: het welkomstscherm (KG-5H) met de markering, en de sessie staat in localStorage.
  await expect(page.getByRole('heading', { name: 'Welkom' })).toBeVisible();
  await expect(page.getByText('Je hoort nog bij geen huishouden.', { exact: false })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Testomgeving');
  expect(await page.evaluate(() => Object.keys(localStorage))).toContain('thuisplanner-auth');
  expect(page.url()).not.toMatch(/access_token|refresh_token/);
  expect(p1.naarProject.filter(x => x.startsWith('POST /auth/v1/token'))).toHaveLength(1);
  await page.close();

  // App gesloten en opnieuw geopend (zelfde telefoon): geen wachtwoord nodig, geen nieuwe inlog.
  const opnieuw = await context.newPage();
  const p2 = await proef(opnieuw, antwoord);
  await opnieuw.goto('./');
  await expect(opnieuw.getByRole('heading', { name: 'Welkom' })).toBeVisible();
  expect(p2.naarProject.filter(x => x.startsWith('POST /auth/v1/token'))).toHaveLength(0);
  expect(p1.overtredingen.concat(p2.overtredingen)).toEqual([]);
});

test('een sessie in de adresbalk wordt nooit overgenomen', async ({ page }) => {
  const p = await proef(page, () => ({ status: 404, json: {} }));
  const s = sessie('indringer@example.com');
  await page.goto(`./#access_token=${s.access_token}&refresh_token=${s.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`);
  await expect(page.getByRole('heading', { name: 'Inloggen' })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(p.naarProject).toEqual([]);
});
