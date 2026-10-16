// KG-5H deel 1 tegen de echte lokale Supabase (docs/thuisplanner-onboarding.md): het eerste huishouden aanmaken,
// iemand uitnodigen, de uitnodiging accepteren (ook na inloggen), en de regels die de database afdwingt: eenmalig,
// intrekken, scheiding tussen huishoudens. Fictieve accounts: Sanne en Joris (zonder huishouden), Thomas (De Boer).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { nav, SYNC, toevoegen } from './hulp';

const contexten: BrowserContext[] = [];
test.beforeEach(() => { execFileSync('node', ['scripts/lokaal.mjs', 'seed'], { stdio: 'ignore' }); });
test.afterEach(async () => { for (const c of contexten.splice(0)) await c.close(); });

const TOKEN_IN_URL = /[0-9a-f]{64}/;

/** Een nieuwe "telefoon" (eigen browsercontext); optioneel meteen een pad openen en inloggen. */
async function telefoon(browser: Browser, { pad = './', naam }: { pad?: string; naam?: string } = {}) {
  const ctx = await browser.newContext();
  contexten.push(ctx);
  const p = await ctx.newPage();
  await p.goto(pad);
  if (naam) await p.getByRole('button', { name: `Inloggen als ${naam}` }).click();
  return p;
}

async function maakHuishouden(p: Page, naam: string, eigen: string) {
  await expect(p.getByRole('heading', { name: 'Welkom' })).toBeVisible(SYNC);
  await p.getByLabel('Naam van het huishouden').fill(naam);
  await p.getByLabel('Jouw naam').fill(eigen);
  await p.getByRole('button', { name: 'Huishouden aanmaken' }).click();
  await expect(p.locator('.sync-status')).toHaveText('Verbonden', SYNC);
}

async function uitnodiging(p: Page, { voor = 'Iemand nieuw', rol }: { voor?: string; rol?: 'Beheerder' | 'Lid' } = {}) {
  await nav(p, 'Meer');
  await p.getByLabel('Voor wie').selectOption({ label: voor });
  if (rol) await p.getByRole('radio', { name: rol }).click();
  await p.getByRole('button', { name: 'Uitnodiging maken' }).click();
  const link = await p.getByLabel('Uitnodigingslink', { exact: true }).inputValue();
  expect(link).toMatch(/#\/uitnodiging\/[0-9a-f]{64}$/);
  return link;
}

async function alsAccount(email: string) {
  const env = Object.fromEntries(readFileSync('.env.lokaal.local', 'utf8').split('\n')
    .filter(r => r && !r.startsWith('#')).map(r => [r.slice(0, r.indexOf('=')), r.slice(r.indexOf('=') + 1)]));
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: env.VITE_DEMO_WACHTWOORD });
  if (error) throw error;
  return c;
}

test('eerste huishouden: Sanne maakt het aan en is eigenaar; Joris accepteert na inloggen als beheerder; samen live', async ({ browser }) => {
  const sanne = await telefoon(browser, { naam: 'Sanne' });
  await maakHuishouden(sanne, 'Familie Test', 'Sanne');
  await nav(sanne, 'Meer');
  await expect(sanne.getByText('jij bent beheerder · eigenaar')).toBeVisible();
  // De eigenaar nodigt standaard uit als beheerder.
  await expect(sanne.getByRole('radio', { name: 'Beheerder' })).toHaveAttribute('aria-checked', 'true');
  const link = await uitnodiging(sanne);
  await expect(sanne.getByText(/één keer te gebruiken/)).toBeVisible();

  // Joris opent de link zonder ingelogd te zijn: het token gaat meteen uit de adresbalk en overleeft het inloggen.
  const joris = await telefoon(browser, { pad: link });
  await expect(joris.getByText('Je hebt een uitnodiging geopend. Log in om hem te bekijken.')).toBeVisible();
  expect(joris.url()).not.toMatch(TOKEN_IN_URL);
  await joris.getByRole('button', { name: 'Inloggen als Joris' }).click();
  await expect(joris.getByRole('heading', { name: 'Uitnodiging' })).toBeVisible(SYNC);
  await expect(joris.getByText('joris.demo@test.invalid')).toBeVisible();
  expect(joris.url()).not.toMatch(TOKEN_IN_URL);
  await joris.getByLabel('Jouw naam').fill('Joris');
  await joris.getByRole('button', { name: 'Accepteren', exact: true }).click();
  await expect(joris.getByRole('heading', { name: 'Welkom bij Familie Test' })).toBeVisible(SYNC);
  expect(await joris.evaluate(() => JSON.stringify(sessionStorage) + JSON.stringify(localStorage))).not.toMatch(TOKEN_IN_URL);
  await joris.getByRole('button', { name: 'Naar Vandaag' }).click();
  await expect(joris.locator('.sync-status')).toHaveText('Verbonden', SYNC);
  await nav(joris, 'Meer');
  await expect(joris.getByText('jij bent beheerder')).toBeVisible();

  // Samen: wat Sanne toevoegt, ziet Joris.
  await nav(sanne, 'Boodschappen');
  await toevoegen(sanne, 'Boodschap', 'Hagelslag');
  await nav(joris, 'Boodschappen');
  await expect(joris.getByText('Hagelslag')).toBeVisible(SYNC);

  // In de database: Joris is beheerder van precies dit huishouden; de uitnodiging is gebruikt.
  const db = await alsAccount('sanne.demo@test.invalid');
  const leden = (await db.from('household_members').select('display_name, role, has_account')).data ?? [];
  expect(leden.map(l => `${l.display_name}:${l.role}:${l.has_account}`).sort()).toEqual(['Joris:admin:true', 'Sanne:owner:true']);
  const open = (await db.from('household_invites').select('accepted_at')).data ?? [];
  expect(open).toHaveLength(1);
  expect(open[0].accepted_at).not.toBeNull();
});

test('eenmalig en ingetrokken: een gebruikte of ingetrokken link werkt niet, met een duidelijke melding', async ({ browser }) => {
  const sanne = await telefoon(browser, { naam: 'Sanne' });
  await maakHuishouden(sanne, 'Familie Test', 'Sanne');
  const eerste = await uitnodiging(sanne, { rol: 'Lid' });
  const joris = await telefoon(browser, { naam: 'Joris' });
  await expect(joris.getByRole('heading', { name: 'Welkom' })).toBeVisible(SYNC);
  await joris.goto(eerste);
  await joris.getByLabel('Jouw naam').fill('Joris');
  await joris.getByRole('button', { name: 'Accepteren', exact: true }).click();
  await expect(joris.getByRole('heading', { name: 'Welkom bij Familie Test' })).toBeVisible(SYNC);

  // Dezelfde link nog eens, door iemand anders (Thomas, lid van De Boer): al gebruikt.
  const thomas = await telefoon(browser, { naam: 'Thomas' });
  await expect(thomas.locator('.sync-status')).toHaveText('Verbonden', SYNC);
  await thomas.goto(eerste);
  await thomas.getByLabel('Jouw naam').fill('Thomas');
  await thomas.getByRole('button', { name: 'Accepteren', exact: true }).click();
  await expect(thomas.getByRole('alert')).toHaveText('Uitnodiging is al gebruikt', SYNC);

  // Een tweede uitnodiging, ingetrokken voordat iemand hem gebruikt.
  await nav(sanne, 'Vandaag');
  const tweede = await uitnodiging(sanne, { rol: 'Lid' });
  await sanne.getByRole('button', { name: 'Intrekken' }).click();
  await sanne.getByRole('button', { name: 'Zeker intrekken' }).click();
  await expect(sanne.getByText('Uitnodiging ingetrokken.')).toBeVisible(SYNC);
  await thomas.goto(tweede);
  await thomas.getByLabel('Jouw naam').fill('Thomas');
  await thomas.getByRole('button', { name: 'Accepteren', exact: true }).click();
  await expect(thomas.getByRole('alert')).toHaveText('Uitnodiging is ingetrokken', SYNC);
  // Thomas zit nog steeds alleen in De Boer; Sanne ziet De Boer niet.
  await thomas.getByRole('button', { name: 'Niet accepteren' }).click();
  await nav(thomas, 'Meer');
  await expect(thomas.getByRole('heading', { name: 'Wisselen' })).toHaveCount(0);
  const db = await alsAccount('sanne.demo@test.invalid');
  expect(((await db.from('households').select('name')).data ?? []).map(h => h.name)).toEqual(['Familie Test']);
});

test('twee huishoudens: Thomas accepteert een tweede, kan wisselen, en de huishoudens blijven gescheiden', async ({ browser }) => {
  const sanne = await telefoon(browser, { naam: 'Sanne' });
  await maakHuishouden(sanne, 'Familie Test', 'Sanne');
  await nav(sanne, 'Boodschappen');
  await toevoegen(sanne, 'Boodschap', 'Alleen-bij-Test');
  const link = await uitnodiging(sanne, { rol: 'Lid' });

  const thomas = await telefoon(browser, { naam: 'Thomas' });
  await expect(thomas.locator('.sync-status')).toHaveText('Verbonden', SYNC);
  // De link openen terwijl de app al draait.
  await thomas.evaluate(l => { window.location.href = l; }, link);
  await expect(thomas.getByRole('heading', { name: 'Uitnodiging' })).toBeVisible(SYNC);
  expect(thomas.url()).not.toMatch(TOKEN_IN_URL);
  await thomas.getByLabel('Jouw naam').fill('Thomas');
  await thomas.getByRole('button', { name: 'Accepteren', exact: true }).click();
  await thomas.getByRole('button', { name: 'Naar Vandaag' }).click();
  await nav(thomas, 'Boodschappen');
  await expect(thomas.getByText('Alleen-bij-Test')).toBeVisible(SYNC);

  // Wisselen naar De Boer: daar staat die boodschap niet.
  await nav(thomas, 'Meer');
  await thomas.getByRole('button', { name: 'Naar Familie De Boer' }).click();
  await expect(thomas.locator('.sync-status')).toHaveText('Verbonden', SYNC);
  // Meer toont nu het gekozen huishouden (blok Huishouden).
  await expect(thomas.locator('#h-huishouden + p strong')).toHaveText('Familie De Boer', SYNC);
  await nav(thomas, 'Boodschappen');
  await expect(thomas.getByText('Alleen-bij-Test')).toHaveCount(0);
  // En terug.
  await nav(thomas, 'Meer');
  await thomas.getByRole('button', { name: 'Naar Familie Test' }).click();
  await expect(thomas.locator('.sync-status')).toHaveText('Verbonden', SYNC);
  await nav(thomas, 'Boodschappen');
  await expect(thomas.getByText('Alleen-bij-Test')).toBeVisible(SYNC);
});
