import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { NEP_REF } from '../playwright.staging.config';

export const PROJECT = `https://${NEP_REF}.supabase.co`;

/** De headers uit dist-staging/_headers voor alle paden (blok "/*"), zoals Cloudflare Pages ze meestuurt. */
function headersVoorAlles(): Record<string, string> {
  const tekst = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist-staging/_headers'), 'utf8');
  const uit: Record<string, string> = {};
  let inBlok = false;
  for (const regel of tekst.split('\n')) {
    if (!regel.startsWith(' ')) { inBlok = regel.trim() === '/*'; continue; }
    if (!inBlok) continue;
    const i = regel.indexOf(':');
    uit[regel.slice(0, i).trim().toLowerCase()] = regel.slice(i + 1).trim();
  }
  return uit;
}

export interface Proef {
  /** Elke host waar de pagina iets naartoe probeerde te sturen. */
  hosts: Set<string>;
  /** CSP-overtredingen (richtlijn en geblokkeerd adres). */
  overtredingen: string[];
  /** Verzoeken naar het (nep)project, als "METHODE pad". */
  naarProject: string[];
}

/**
 * Zet de pagina klaar: de eigen site krijgt de headers uit _headers (zoals op Cloudflare), en het nepproject
 * beantwoordt de test zelf. `antwoord` krijgt methode en pad, en geeft status en JSON terug.
 */
export async function proef(page: Page, antwoord: (methode: string, pad: string, body: string) => { status: number; json: unknown }): Promise<Proef> {
  const p: Proef = { hosts: new Set(), overtredingen: [], naarProject: [] };
  const headers = headersVoorAlles();
  page.on('request', r => p.hosts.add(new URL(r.url()).host));
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) p.overtredingen.push(m.text()); });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error('Content Security Policy: ' + e.violatedDirective + ' ' + e.blockedURI));
  });
  await page.route('http://127.0.0.1:5182/**', async route => {
    const r = await route.fetch();
    await route.fulfill({ response: r, headers: { ...r.headers(), ...headers } });
  });
  await page.route(`${PROJECT}/**`, async route => {
    const req = route.request();
    const cors = {
      'access-control-allow-origin': 'http://127.0.0.1:5182',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    };
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: cors }); return; }
    const u = new URL(req.url());
    p.naarProject.push(`${req.method()} ${u.pathname}`);
    const a = antwoord(req.method(), u.pathname + u.search, req.postData() ?? '');
    await route.fulfill({ status: a.status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(a.json) });
  });
  return p;
}

/** Een sessie zoals Supabase Auth die na inloggen teruggeeft (verzonnen account). */
export function sessie(email: string) {
  const nu = Math.floor(Date.now() / 1000);
  const sub = '00000000-0000-4000-8000-000000000001';
  const deel = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return {
    access_token: `${deel({ alg: 'HS256', typ: 'JWT' })}.${deel({ sub, role: 'authenticated', aud: 'authenticated', exp: nu + 3600, email })}.handtekening-fictief`,
    token_type: 'bearer', expires_in: 3600, expires_at: nu + 3600, refresh_token: 'verversing-fictief',
    user: { id: sub, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() },
  };
}
