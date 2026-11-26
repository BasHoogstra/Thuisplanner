// @vitest-environment node
// scripts/vapid-maak.mjs (PR P0, stap A): het VAPID-paar voor staging. De tests schrijven alleen in een tijdelijke map
// buiten de repository, met een paar dat na de test weg is; ze maken nooit .env.pushproef.local in de app.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error: los Node-script zonder typen
import * as maak from '../scripts/vapid-maak.mjs';
// @ts-expect-error: los Node-script zonder typen
import { vapidSleutel } from '../scripts/pushproef-stuur.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let map = '';
afterEach(() => { if (map) rmSync(map, { recursive: true, force: true }); map = ''; });
const tijdelijk = () => { map = mkdtempSync(path.join(tmpdir(), 'vapid-proef-')); return path.join(map, '.env.pushproef.local'); };

describe('VAPID-paar maken (scripts/vapid-maak.mjs)', () => {
  it('maakt een geldig paar: publiek 65 bytes (0x04), privaat altijd 32 bytes, en ze horen bij elkaar', () => {
    for (let i = 0; i < 300; i++) {
      const { publiek, privaat } = maak.maakPaar();
      const pub = Buffer.from(publiek, 'base64url');
      expect([pub.length, pub[0], Buffer.from(privaat, 'base64url').length]).toEqual([65, 4, 32]);
      expect(vapidSleutel(publiek, privaat).publiek).toBe(publiek);
    }
  });

  it('schrijft UTF-8 zonder BOM, leesbaar voor node --env-file, en toont alleen de publieke sleutel', () => {
    const bestand = tijdelijk();
    const meldingen: string[] = [];
    const { publiek } = maak.maakSleutelbestand({ bestand, isGenegeerd: () => true, meld: (r: string) => meldingen.push(r) });
    const ruw = readFileSync(bestand);
    expect(ruw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    const env = parseEnv(ruw.toString('utf8'));
    expect(env.PUSHPROEF_VAPID_PUBLIC).toBe(publiek);
    expect(vapidSleutel(env.PUSHPROEF_VAPID_PUBLIC, env.PUSHPROEF_VAPID_PRIVATE).publiek).toBe(publiek);
    // De private sleutel komt nooit in de uitvoer; de publieke wel.
    const uitvoer = meldingen.join('\n');
    expect(uitvoer).toContain(publiek);
    expect(uitvoer).not.toContain(env.PUSHPROEF_VAPID_PRIVATE);
  });

  it('overschrijft nooit een bestaand bestand', () => {
    const bestand = tijdelijk();
    writeFileSync(bestand, 'BESTAAND=1\n');
    expect(() => maak.maakSleutelbestand({ bestand, isGenegeerd: () => true, meld: () => undefined })).toThrow(/bestaat al/);
    expect(readFileSync(bestand, 'utf8')).toBe('BESTAAND=1\n');
  });

  it('stopt zonder iets te schrijven als git het bestand niet negeert', () => {
    const bestand = tijdelijk();
    expect(() => maak.maakSleutelbestand({ bestand, isGenegeerd: () => false, meld: () => undefined })).toThrow(/niet door git genegeerd/);
    expect(existsSync(bestand)).toBe(false);
  });

  it('het echte doel (.env.pushproef.local in de app) wordt door git genegeerd', () => {
    expect(maak.STANDAARD_BESTAND).toBe(path.join(APP, '.env.pushproef.local'));
    expect(maak.doorGitGenegeerd(maak.STANDAARD_BESTAND)).toBe(true);
    expect(maak.doorGitGenegeerd(path.join(APP, 'package.json'))).toBe(false);
  });

  it('het script zelf: alleen node:crypto en lokale bestanden, geen netwerk en nooit de private sleutel in een melding', () => {
    const bron = readFileSync(path.join(APP, 'scripts/vapid-maak.mjs'), 'utf8');
    expect([...bron.matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]).sort())
      .toEqual(['./lokaal-platform.mjs', './pushproef-stuur.mjs', 'node:child_process', 'node:crypto', 'node:fs', 'node:path', 'node:url']);
    expect(bron).not.toMatch(/fetch\(|https?:\/\/|meld\([^)]*privaat/);
  });
});
