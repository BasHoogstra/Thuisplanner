// Gedeelde hulp voor de lokale e2e-tests (twee fictieve accounts tegen de lokale Supabase-stack).
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const venster = (p: Page) => p.getByRole('dialog');
export const nav = (p: Page, naam: string) => p.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: naam }).click();
export const SYNC = { timeout: 15_000 };

/** Een "telefoon": eigen browsercontext, ingelogd als een fictief gezinslid. */
export async function telefoon(browser: Browser, naam: 'Eva' | 'Thomas', { basis = './', hosts = ['127.0.0.1', 'localhost'], bijPagina }:
  { basis?: string; hosts?: string[]; bijPagina?: (p: Page) => void } = {}): Promise<{ ctx: BrowserContext; p: Page }> {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  bijPagina?.(p);
  // Via de proxy (KG_VIA_PROXY=1, zoals de telefoons): alles, ook de Realtime-websocket, gaat naar de app zelf.
  const appPoort = process.env.KG_VIA_PROXY === '1' ? '5182' : null;
  const controleer = (url: string) => {
    const u = new URL(url);
    if (!hosts.includes(u.hostname) && !['data:', 'file:'].includes(u.protocol)) throw new Error('Externe aanvraag: ' + url);
    if (appPoort && u.port && u.port !== appPoort) throw new Error('Niet via de proxy: ' + url);
  };
  p.on('request', r => controleer(r.url()));
  p.on('websocket', ws => controleer(ws.url()));
  await p.goto(basis);
  await p.getByRole('button', { name: `Inloggen als ${naam}` }).click();
  await expect(p.locator('.sync-status')).toHaveText('Verbonden', SYNC);
  return { ctx, p };
}

export async function toevoegen(p: Page, soort: 'Afspraak' | 'Taak' | 'Boodschap', titel: string) {
  await p.getByRole('button', { name: 'Toevoegen' }).first().click();
  await venster(p).getByRole('tab', { name: soort }).click();
  await venster(p).locator('#item-titel').fill(titel);
  await venster(p).getByRole('button', { name: 'Toevoegen', exact: true }).click();
  await expect(venster(p)).toHaveCount(0);
}

/**
 * Rechtstreeks in de lokale database kijken, als Eva (anon-sleutel + RLS, geen service-role-sleutel): zo
 * toetsen de tests wat er werkelijk is opgeslagen, niet alleen wat het scherm toont.
 */
export async function alsEva() {
  const env = Object.fromEntries(readFileSync('.env.lokaal.local', 'utf8').split('\n')
    .filter(r => r && !r.startsWith('#')).map(r => [r.slice(0, r.indexOf('=')), r.slice(r.indexOf('=') + 1)]));
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: 'eva.demo@test.invalid', password: env.VITE_DEMO_WACHTWOORD });
  if (error) throw error;
  return c;
}
