// KG-5H deel 2 tegen de echte lokale Supabase: inloggen met een e-mailcode (K1), zoals een nieuwe gebruiker het doet.
// De code komt uit Mailpit (de lokale mailbox van de stack). Telt de handelingen (acceptatie: e-mailadres, code, en
// dan een huishouden aanmaken of een uitnodiging accepteren; samen hooguit 9). Zie docs/thuisplanner-deel2-bouwscope.md.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { nav, SYNC } from './hulp';

const env = Object.fromEntries(readFileSync('.env.lokaal.local', 'utf8').split('\n')
  .filter(r => r && !r.startsWith('#')).map(r => [r.slice(0, r.indexOf('=')), r.slice(r.indexOf('=') + 1).trim()]));
const api = new URL(env.VITE_SUPABASE_URL);
// Mailpit draait in de lokale stack op de API-poort + 3 (config.toml: [inbucket]).
const MAIL = process.env.MAILPIT_URL ?? `http://${api.hostname}:${Number(api.port) + 3}`;
const run = randomUUID().slice(0, 8);
const adres = (naam: string) => `${naam}-${run}@test.invalid`;

const contexten: BrowserContext[] = [];
test.beforeEach(() => { execFileSync('node', ['scripts/lokaal.mjs', 'seed'], { stdio: 'ignore' }); });
test.afterEach(async () => { for (const c of contexten.splice(0)) await c.close(); });
test.afterAll(async () => {
  // Opruimen alleen met de lokale service-role-sleutel uit de omgeving van de testrun (nooit in de app).
  if (!process.env.SERVICE_ROLE_KEY) return;
  const admin = createClient(env.VITE_SUPABASE_URL, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) if (u.email?.endsWith(`-${run}@test.invalid`)) await admin.auth.admin.deleteUser(u.id);
});

async function telefoon(browser: Browser, pad = './') {
  const ctx = await browser.newContext();
  contexten.push(ctx);
  const p = await ctx.newPage();
  await p.goto(pad);
  return p;
}

/** De nieuwste zescijferige code voor dit adres uit Mailpit, van na `sinds`. */
async function code(email: string, sinds: number): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const r = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent('to:' + email)}&limit=20`)).json();
    const m = (r.messages ?? []).filter((x: { Created: string }) => new Date(x.Created).getTime() >= sinds - 1500)
      .sort((a: { Created: string }, b: { Created: string }) => +new Date(b.Created) - +new Date(a.Created))[0];
    if (m) {
      const v = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
      expect(v.Subject).not.toMatch(/\d{6}/); // B3: nooit de code in het onderwerp
      const c = v.Text.match(/\b(\d{6})\b/)?.[1];
      if (c) return c;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Geen code ontvangen voor ' + email);
}

/** Handelingen tellen: elke tik of elk ingevuld veld van de gebruiker telt één. */
function teller(p: Page) {
  let n = 0;
  return {
    get aantal() { return n; },
    vul: async (label: string, waarde: string) => { n++; await p.getByLabel(label).fill(waarde); },
    tik: async (naam: string) => { n++; await p.getByRole('button', { name: naam, exact: true }).click(); },
  };
}

async function inloggenMetCode(p: Page, t: ReturnType<typeof teller>, email: string) {
  const sinds = Date.now();
  await t.vul('E-mailadres', email);
  await t.tik('Stuur code');
  await expect(p.getByText(email)).toBeVisible();
  // Zes cijfers gaan vanzelf verder: geen extra tik op Inloggen.
  await t.vul('Code uit de mail', await code(email, sinds));
}

test('nieuw adres: code, huishouden aanmaken, verbonden; binnen 9 handelingen', async ({ browser }) => {
  const p = await telefoon(browser);
  const t = teller(p);
  const email = adres('nieuw');
  await inloggenMetCode(p, t, email);
  await expect(p.getByRole('heading', { name: 'Welkom' })).toBeVisible(SYNC);
  await t.vul('Naam van het huishouden', 'Familie Code');
  await t.vul('Jouw naam', 'Noor');
  await t.tik('Huishouden aanmaken');
  await expect(p.locator('.sync-status')).toHaveText('Verbonden', SYNC);
  expect(t.aantal).toBeLessThanOrEqual(9);
  // Het toestel is onthouden (voor de pogingenteller), de code en de token_hash niet.
  const opslag = await p.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage));
  expect(opslag).toContain(`thuisplanner-toestel:${email}`);
  expect(opslag).not.toMatch(/thuisplanner-code-aanvraag/);
  await nav(p, 'Meer');
  await expect(p.getByRole('region', { name: 'Account' }).getByText(email)).toBeVisible();
  // Opnieuw openen: de sessie blijft (geen nieuwe code nodig).
  await p.reload();
  await expect(p.locator('.sync-status')).toHaveText('Verbonden', SYNC);
});

test('M1: na het aanvragen herladen (mail-app en terug) staat het codescherm er nog; een foute code geeft een melding', async ({ browser }) => {
  const p = await telefoon(browser);
  const email = adres('herlaad');
  const sinds = Date.now();
  await p.getByLabel('E-mailadres', { exact: true }).fill(email);
  await p.getByRole('button', { name: 'Stuur code' }).click();
  const goed = await code(email, sinds);
  await p.reload();
  await expect(p.getByLabel('Code uit de mail')).toBeVisible();
  await expect(p.getByText(email)).toBeVisible();
  const fout = goed === '000000' ? '111111' : '000000';
  await p.getByLabel('Code uit de mail').fill(fout);
  await expect(p.getByRole('alert')).toHaveText(/Deze code klopt niet/);
  await expect(p.getByLabel('Code uit de mail')).toHaveValue('');
  await p.getByLabel('Code uit de mail').fill(goed);
  await expect(p.getByRole('heading', { name: 'Welkom' })).toBeVisible(SYNC);
});

test('uitnodiging op e-mailadres accepteren met een code: link openen, code, naam, accepteren; binnen 9 handelingen', async ({ browser }) => {
  const sanne = await telefoon(browser);
  await sanne.getByRole('button', { name: 'Inloggen als Sanne' }).click();
  await expect(sanne.getByRole('heading', { name: 'Welkom' })).toBeVisible(SYNC);
  await sanne.getByLabel('Naam van het huishouden').fill('Familie Uitnodiging');
  await sanne.getByLabel('Jouw naam').fill('Sanne');
  await sanne.getByRole('button', { name: 'Huishouden aanmaken' }).click();
  await expect(sanne.locator('.sync-status')).toHaveText('Verbonden', SYNC);
  await nav(sanne, 'Meer');
  const email = adres('gast');
  await sanne.getByLabel('Voor wie').selectOption({ label: 'Iemand nieuw' });
  await sanne.getByLabel('E-mailadres (optioneel)').fill(email);
  await sanne.getByRole('button', { name: 'Uitnodiging maken' }).click();
  const link = await sanne.getByLabel('Uitnodigingslink', { exact: true }).inputValue();

  const gast = await telefoon(browser, link);
  const t = teller(gast);
  await inloggenMetCode(gast, t, email);
  await expect(gast.getByRole('heading', { name: 'Uitnodiging' })).toBeVisible(SYNC);
  await t.vul('Jouw naam', 'Gijs');
  await t.tik('Accepteren');
  await expect(gast.getByRole('heading', { name: 'Welkom bij Familie Uitnodiging' })).toBeVisible(SYNC);
  expect(t.aantal + 1 /* de link openen */).toBeLessThanOrEqual(9);
});
