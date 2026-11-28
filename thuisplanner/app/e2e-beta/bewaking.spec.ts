// Tegenproeven van de buildbewaking (T20, L8, N4; docs/thuisplanner-beta-voorbereiding.md §2.2): de echte opdrachten,
// zonder netwerk. Elke poging hieronder moet stoppen vóór er iets gebouwd is; de bètabuild van de andere tests in deze
// map (playwright.beta.config.ts) slaagt alleen met het verzonnen project en de uitzondering voor de offline e2e.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { NEP_REF } from '../scripts/staging-build';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OMGEVINGEN = JSON.parse(readFileSync(path.resolve(APP, '../omgevingen.json'), 'utf8'));
const STAGING_REF: string = OMGEVINGEN.staging.supabaseRef;
const VITE = path.join(APP, 'node_modules/vite/bin/vite.js');
const jwt = (payload: object) => ['{"alg":"HS256","typ":"JWT"}', JSON.stringify(payload)]
  .map(d => Buffer.from(d).toString('base64url')).join('.') + '.handtekening-fictief';

test.describe.configure({ timeout: 240_000 });

/** Draait een opdracht met alleen deze VITE_/KG_-variabelen (niets uit de omgeving van de test zelf). */
function draai(args: string[], vars: Record<string, string>) {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(VITE_|KG_)/.test(k)) env[k] = v;
  return spawnSync(process.execPath, args, { cwd: APP, env: { ...env, ...vars }, encoding: 'utf8' });
}

/** `vite build --mode <modus>` in een lege, tijdelijke map; geeft de uitkomst en of er iets gebouwd is. */
function bouw(modus: string, vars: Record<string, string>) {
  const uit = mkdtempSync(path.join(tmpdir(), 'tp-bewaking-'));
  try {
    const r = draai([VITE, 'build', '--mode', modus, '--outDir', uit, '--emptyOutDir'], vars);
    return { status: r.status, tekst: r.stdout + r.stderr, gebouwd: existsSync(path.join(uit, 'index.html')) };
  } finally { rmSync(uit, { recursive: true, force: true }); }
}
const project = (ref: string) => ({ VITE_SUPABASE_URL: `https://${ref}.supabase.co`, VITE_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref }) });

test('npm run build:beta: zolang beta.supabaseRef null is, stopt het kenmerkscript met een duidelijke melding', () => {
  expect(OMGEVINGEN.beta.supabaseRef).toBeNull();
  for (const ref of [STAGING_REF, NEP_REF]) {
    const r = draai(['scripts/staging-kenmerk.mjs', 'beta'], project(ref));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Bètabuild geweigerd');
    expect(r.stderr).toContain('beta.supabaseRef');
  }
});

test('L8: ook een losse vite build --mode beta weigert het stagingproject (T20), zonder iets te bouwen', () => {
  const b = bouw('beta', project(STAGING_REF));
  expect(b.status).not.toBe(0);
  expect(b.tekst).toContain('Bètabuild geweigerd');
  expect(b.gebouwd).toBe(false);
});

test('de uitzondering voor de offline e2e: zonder KG_E2E_NEPPROJECT geen verzonnen project, en met de uitzondering geen echt project', () => {
  const zonder = bouw('beta', project(NEP_REF));
  expect(zonder.status).not.toBe(0);
  expect(zonder.tekst).toContain('Bètabuild geweigerd');
  expect(zonder.gebouwd).toBe(false);
  const echt = bouw('staging', { ...project(STAGING_REF.split('').reverse().join('')), KG_E2E_NEPPROJECT: '1' });
  expect(echt.status).not.toBe(0);
  expect(echt.tekst).toContain('alleen voor de offline e2e');
  expect(echt.gebouwd).toBe(false);
});

test('N4: een bètabuild zonder configuratie bouwt niet (en wordt dus nooit een demo)', () => {
  const b = bouw('beta', {});
  expect(b.status).not.toBe(0);
  expect(b.tekst).toMatch(/Bètabuild geweigerd[\s\S]*VITE_SUPABASE_URL/);
  expect(b.gebouwd).toBe(false);
});

test('een gewone build met VITE_OMGEVING=beta wordt geweigerd: bèta alleen via npm run build:beta', () => {
  const b = bouw('production', { VITE_OMGEVING: 'beta', ...project(NEP_REF), KG_E2E_NEPPROJECT: '1' });
  expect(b.status).not.toBe(0);
  expect(b.tekst).toContain('npm run build:beta');
  expect(b.gebouwd).toBe(false);
});
