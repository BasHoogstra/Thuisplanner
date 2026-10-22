// De echte stagingbuild (`npm run build:staging`) bouwt alleen tegen het vastgelegde stagingproject uit
// thuisplanner/omgevingen.json (scripts/staging-kenmerk.mjs). Zonder netwerk; de Huisplan-kenmerken komen uit de
// Huisplan-README, net als in omgeving.test.ts.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const omgevingen = JSON.parse(readFileSync(path.resolve(__dirname, '../../omgevingen.json'), 'utf8'));
const VAST: string = omgevingen.staging.supabaseRef;
const huisplanRefs = [...readFileSync(path.resolve(__dirname, '../../../supabase/README.md'), 'utf8')
  .matchAll(/`([a-z]{20})`/g)].map(m => m[1]);

function draai(url: string | undefined) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.VITE_SUPABASE_URL;
  if (url !== undefined) env.VITE_SUPABASE_URL = url;
  return spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/staging-kenmerk.mjs')],
    { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8' });
}

describe('stagingbuild: alleen het vastgelegde stagingproject', () => {
  it('het vastgelegde kenmerk is een kenmerk en geen Huisplan-project', () => {
    expect(VAST).toMatch(/^[a-z]{20}$/);
    expect(huisplanRefs.length).toBeGreaterThan(0);
    expect(huisplanRefs).not.toContain(VAST);
  });

  it('bouwt met het vastgelegde project', () => {
    const r = draai(`https://${VAST}.supabase.co`);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('vastgelegde kenmerk');
  });

  it('weigert een ander project, een Huisplan-project, een andere schrijfwijze of geen adres', () => {
    for (const url of ['https://abcdefghijklmnopqrst.supabase.co', ...huisplanRefs.map(r => `https://${r}.supabase.co`),
      `http://${VAST}.supabase.co`, `https://${VAST}.supabase.co/`, `https://${VAST}.supabase.co.evil.nl`, '', undefined]) {
      const r = draai(url);
      expect(r.status, String(url)).toBe(1);
      expect(r.stderr).toContain('Stagingbuild geweigerd');
    }
  });
});
