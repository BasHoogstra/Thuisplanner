// De gedeelde ontwerpbasis (thuisplanner/ontwerp): één bron voor app en website. Deze tests bewaken dat de app alleen
// variabelen gebruikt die er bestaan, dat licht en donker dezelfde set hebben, en dat het pictogram een geldige SVG is.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pictogramDataUri } from '../scripts/ontwerp';

const ONTWERP = path.resolve(__dirname, '../../ontwerp');
const tokens = readFileSync(path.join(ONTWERP, 'tokens.css'), 'utf8');
const app = readFileSync(path.resolve(__dirname, '../src/styles/app.css'), 'utf8');
const gedefinieerd = (css: string) => new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
const blok = (begin: string) => {
  const i = tokens.indexOf(begin);
  return tokens.slice(i, tokens.indexOf('}', i));
};

describe('ontwerpbasis', () => {
  it('de app laadt de ontwerpbasis en gebruikt alleen variabelen die bestaan', () => {
    expect(app.startsWith("@import '../../../ontwerp/tokens.css';")).toBe(true);
    const bekend = new Set([...gedefinieerd(tokens), ...gedefinieerd(app)]);
    const gebruikt = new Set([...app.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]));
    expect([...gebruikt].filter(v => !bekend.has(v))).toEqual([]);
    // Geen kleurwaarden van de ontwerpbasis meer in de app zelf.
    expect(app).not.toMatch(/--accent\s*:/);
  });
  it('licht, donker (systeem) en donker (handmatig) hebben dezelfde kleuren', () => {
    const licht = [...gedefinieerd(blok(':root {'))].filter(v => !['--radius', '--radius-klein', '--font', '--font-kop'].includes(v)).sort();
    expect([...gedefinieerd(blok(':root:not([data-theme="light"]) {'))].sort()).toEqual(licht);
    expect([...gedefinieerd(blok(':root[data-theme="dark"] {'))].sort()).toEqual(licht);
  });
  it('het pictogram is een geldige SVG en komt als data-URI in de app', () => {
    const uri = pictogramDataUri();
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(uri.slice('data:image/svg+xml,'.length))).toMatch(/^<svg [^>]*viewBox="0 0 64 64"[\s\S]*<\/svg>$/);
    expect(readFileSync(path.resolve(__dirname, '../index.html'), 'utf8')).toContain('href="%THUISPLANNER_PICTOGRAM%"');
  });
});
