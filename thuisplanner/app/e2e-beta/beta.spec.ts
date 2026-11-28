// De bètabuild op een telefoon (390 px), met de CSP van Cloudflare (dist-beta/_headers). Zie playwright.beta.config.ts:
// het projectadres is verzonnen en de test beantwoordt elk verzoek zelf. Docs: thuisplanner-beta-voorbereiding.md §2.2.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { PROJECT, proef, sessie, type Site } from '../e2e-staging/hulp';

const SITE: Site = { map: 'dist-beta', poort: 5183 };
const EIGEN = `127.0.0.1:${SITE.poort}`;
const PROJECTHOST = new URL(PROJECT).host;
const HIER = path.dirname(fileURLToPath(import.meta.url));
const STAGING_REF: string = JSON.parse(readFileSync(path.resolve(HIER, '../../omgevingen.json'), 'utf8')).staging.supabaseRef;

test('bèta: een rustige "Bèta" op het inlogscherm, geen testomgeving of demo, en de CSP laat niets anders toe', async ({ page }) => {
  const p = await proef(page, () => ({ status: 500, json: {} }), SITE);
  await page.goto('./');
  await expect(page).toHaveTitle('Thuisplanner');
  await expect(page.getByRole('heading', { name: 'Inloggen' })).toBeVisible();
  await expect(page.getByRole('note')).toHaveText('Bèta Thuisplanner is nog in ontwikkeling.');
  await expect(page.getByText(/Testomgeving|verzonnen|Fictief|demo/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Inloggen als/ })).toHaveCount(0);
  await expect(page.getByLabel('Wachtwoord')).toHaveCount(0);
  // Eén actieve CSP met precies de eigen site en het bètaproject; noindex blijft.
  const kop = await page.evaluate(async () => {
    const h = (await fetch('./')).headers;
    return { csp: h.get('content-security-policy'), robots: h.get('x-robots-tag') };
  });
  expect(kop.csp).toContain(`connect-src 'self' ${PROJECT} wss://${PROJECTHOST};`);
  expect(kop.robots).toBe('noindex, nofollow');
  expect(p.overtredingen).toEqual([]);
  expect([...p.hosts].every(h => h === EIGEN || h === PROJECTHOST)).toBe(true);
});

test('de CSP blokkeert verkeer naar elk ander adres, ook het stagingproject', async ({ page }) => {
  const p = await proef(page, () => ({ status: 500, json: {} }), SITE);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Inloggen' })).toBeVisible();
  const uitkomst = await page.evaluate(async (staging) => {
    const pogingen = [`https://${staging}.supabase.co/rest/v1/`, 'https://zyxwvutsrqponmlkjihg.supabase.co/rest/v1/', 'https://voorbeeld.nl/'];
    return Promise.all(pogingen.map(u => fetch(u).then(() => 'gelukt', () => 'geblokkeerd')));
  }, STAGING_REF);
  expect(uitkomst).toEqual(['geblokkeerd', 'geblokkeerd', 'geblokkeerd']);
  expect(p.overtredingen.join('\n')).toMatch(/connect-src/);
});

// De codelaag nagebootst, zoals in e2e-staging/staging.spec.ts.
const TOESTEL = 'c0'.repeat(32);
function codeProject(email: string) {
  return (m: string, pad: string, body: string) => {
    if (m === 'POST' && pad.startsWith('/auth/v1/otp')) return { status: 200, json: {} };
    if (m === 'POST' && pad === '/functions/v1/controleer-code') {
      return JSON.parse(body).code === '123456'
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

test('inloggen met een code: blijft bewaard na heropenen, zonder markering bovenaan en zonder token in de adresbalk', async ({ context }) => {
  const antwoord = codeProject('tester1@example.com');
  const page = await context.newPage();
  const p1 = await proef(page, antwoord, SITE);
  await page.goto('./');
  await page.getByLabel('E-mailadres').fill('tester1@example.com');
  await page.getByRole('button', { name: 'Stuur code' }).click();
  await page.getByLabel('Code uit de mail').fill('123456');
  await expect(page.getByRole('heading', { name: 'Welkom' })).toBeVisible();
  // Besluit O7: de markering staat niet bovenaan elk scherm (alleen op het inlogscherm en in Meer).
  await expect(page.getByRole('note')).toHaveCount(0);
  await expect(page.getByText(/Bèta|Testomgeving|verzonnen/)).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage))).toContain('thuisplanner-auth');
  expect(page.url()).not.toMatch(/access_token|refresh_token|token_hash/);
  await page.close();

  const opnieuw = await context.newPage();
  const p2 = await proef(opnieuw, antwoord, SITE);
  await opnieuw.goto('./');
  await expect(opnieuw.getByRole('heading', { name: 'Welkom' })).toBeVisible();
  expect(p2.naarProject.filter(x => /^POST \/auth\/v1\/(verify|otp|token)/.test(x))).toHaveLength(0);
  expect(p1.overtredingen.concat(p2.overtredingen)).toEqual([]);
});

test('een sessie in de adresbalk wordt nooit overgenomen', async ({ page }) => {
  const p = await proef(page, () => ({ status: 404, json: {} }), SITE);
  const s = sessie('indringer@example.com');
  await page.goto(`./#access_token=${s.access_token}&refresh_token=${s.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`);
  await expect(page.getByRole('heading', { name: 'Inloggen' })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(p.naarProject).toEqual([]);
});
