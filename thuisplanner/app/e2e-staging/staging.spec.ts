// De stagingbuild op een telefoon (390 px), met de CSP van Cloudflare (dist-staging/_headers). Zie
// playwright.staging.config.ts: het projectadres is verzonnen en de test beantwoordt elk verzoek zelf.
import { expect, test } from '@playwright/test';
import { PROJECT, proef, sessie } from './hulp';

const EIGEN = '127.0.0.1:5182';
const PROJECTHOST = new URL(PROJECT).host;

test('testomgeving: duidelijke markering, geen demo-accounts, geen wachtwoordveld, en de CSP laat niets anders toe', async ({ page }) => {
  const p = await proef(page, () => ({ status: 500, json: {} }));
  await page.goto('./');
  await expect(page).toHaveTitle('Thuisplanner (testomgeving)');
  await expect(page.getByRole('note')).toContainText('Testomgeving');
  await expect(page.getByRole('heading', { name: 'Inloggen' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Inloggen als/ })).toHaveCount(0);
  await expect(page.getByLabel('E-mailadres')).toHaveValue('');
  await expect(page.getByLabel('Wachtwoord')).toHaveCount(0);
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

// De codelaag (K1) nagebootst: een code aanvragen gaat via Supabase Auth (/otp), de controle via de Edge Function
// controleer-code, en de sessie komt van Supabase zelf (/verify met de token_hash).
const TOESTEL = 'c0'.repeat(32);
function codeProject(email: string, { goed = '123456' } = {}) {
  return (m: string, pad: string, body: string) => {
    if (m === 'POST' && pad.startsWith('/auth/v1/otp')) return { status: 200, json: {} };
    if (m === 'POST' && pad === '/functions/v1/controleer-code') {
      return JSON.parse(body).code === goed
        ? { status: 200, json: { token_hash: 'a'.repeat(56), type: 'signup', toestel: TOESTEL } }
        : { status: 400, json: { code: 'TPK01' } };
    }
    if (m === 'POST' && pad.startsWith('/auth/v1/verify')) return { status: 200, json: sessie(email) };
    if (m === 'POST' && pad === '/rest/v1/rpc/mijn_toegang') return { status: 200, json: 'ok' };
    if (m === 'POST' && pad === '/rest/v1/rpc/mag_huishouden_maken') return { status: 200, json: true };
    if (m === 'POST' && ['/rest/v1/rpc/my_memberships', '/rest/v1/rpc/my_invites'].includes(pad)) return { status: 200, json: [] };
    if (m === 'GET' && pad.startsWith('/rest/v1/profiles')) return { status: 200, json: [] };
    return { status: 404, json: {} };
  };
}

test('een foute code: een nette melding, geen sessie op het toestel; alleen de aanvraag (adres en tijd) blijft staan', async ({ page }) => {
  const p = await proef(page, codeProject('tester1@example.com'));
  await page.goto('./');
  await page.getByLabel('E-mailadres').fill('tester1@example.com');
  await page.getByRole('button', { name: 'Stuur code' }).click();
  await page.getByLabel('Code uit de mail').fill('000000');
  await expect(page.getByRole('alert')).toContainText('Deze code klopt niet');
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['thuisplanner-code-aanvraag']);
  // De code gaat in de body, nooit in een adres.
  expect(p.naarProject.join('\n')).not.toMatch(/000000|tester1/);
  expect(p.naarProject.filter(x => x.startsWith('POST /auth/v1/verify'))).toHaveLength(0);
});

test('inloggen met een code op de telefoon: blijft bewaard na sluiten en heropenen, zonder token in de adresbalk', async ({ context }) => {
  const antwoord = codeProject('tester1@example.com');
  const page = await context.newPage();
  const p1 = await proef(page, antwoord);
  await page.goto('./');
  await page.getByLabel('E-mailadres').fill('tester1@example.com');
  await page.getByRole('button', { name: 'Stuur code' }).click();
  await page.getByLabel('Code uit de mail').fill('123456');
  // Nog geen huishouden: het welkomstscherm (KG-5H) met de markering, en de sessie staat in localStorage.
  await expect(page.getByRole('heading', { name: 'Welkom' })).toBeVisible();
  await expect(page.getByText('Je hoort nog bij geen huishouden.', { exact: false })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Testomgeving');
  const sleutels = await page.evaluate(() => Object.keys(localStorage));
  expect(sleutels).toContain('thuisplanner-auth');
  expect(sleutels).toContain('thuisplanner-toestel:tester1@example.com');
  expect(sleutels).not.toContain('thuisplanner-code-aanvraag');
  expect(page.url()).not.toMatch(/access_token|refresh_token|token_hash/);
  expect(p1.naarProject.filter(x => x.startsWith('POST /auth/v1/verify'))).toHaveLength(1);
  expect(p1.naarProject.filter(x => x.startsWith('POST /auth/v1/token'))).toHaveLength(0);
  await page.close();

  // App gesloten en opnieuw geopend (zelfde telefoon): geen nieuwe code nodig.
  const opnieuw = await context.newPage();
  const p2 = await proef(opnieuw, antwoord);
  await opnieuw.goto('./');
  await expect(opnieuw.getByRole('heading', { name: 'Welkom' })).toBeVisible();
  expect(p2.naarProject.filter(x => /^POST \/auth\/v1\/(verify|otp|token)/.test(x))).toHaveLength(0);
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
