// Thuisplanner-website: de bouw (bouw.mjs). Zonder afhankelijkheden: node --test tests/
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bouw, instellingFouten } from '../bouw.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ECHT = JSON.parse(readFileSync(path.resolve(HIER, '../gegevens.json'), 'utf8'));
const TOKENS = readFileSync(path.resolve(HIER, '../../ontwerp/tokens.css'), 'utf8');
// Alleen voor de test: duidelijk verzonnen gegevens, nooit in gegevens.json.
const PROEF = { ...ECHT, bedrijf: { naam: 'Proefbedrijf & Zonen', kvk: '12345678', adres: 'Proefstraat 1, 1234 AB Proefstad', adresAfgeschermd: false, email: 'contact@test.invalid', btw: '' } };
const tijdelijk = () => mkdtempSync(path.join(tmpdir(), 'tp-website-'));
const lees = (map, f) => readFileSync(path.join(map, f), 'utf8');
const paginas = map => readdirSync(map).filter(f => f.endsWith('.html'));

test('de echte gegevens.json bevat nog geen bedrijfsgegevens, en de publicatiebouw weigert dat', () => {
  assert.throws(() => bouw({ publicatie: true, uit: tijdelijk() }), /bedrijf\.naam is leeg[\s\S]*bedrijf\.email is leeg[\s\S]*bedrijf\.kvk is leeg/);
  // Wat er staat, is niet verzonnen: leeg.
  for (const k of ['naam', 'kvk', 'adres', 'email', 'btw']) assert.equal(ECHT.bedrijf[k], '', k);
});

test('voorbeeldbouw: lege gegevens zichtbaar als "nog in te vullen", niet vindbaar, en herkenbaar als voorbeeld', () => {
  const uit = tijdelijk();
  bouw({ uit });
  assert.match(lees(uit, 'bedrijfsgegevens.html'), /nog in te vullen/);
  assert.match(lees(uit, 'index.html'), /<meta name="robots" content="noindex, nofollow">/);
  assert.match(lees(uit, '_headers'), /X-Robots-Tag: noindex/);
  assert.match(lees(uit, 'robots.txt'), /Disallow: \//);
  assert.ok(existsSync(path.join(uit, 'VOORBEELD-NIET-PUBLICEREN.txt')));
});

test('publicatiebouw met volledige gegevens: vindbaar, geen plaatshouders, geen voorbeeldmarkering, gegevens ontsnapt', () => {
  const uit = tijdelijk();
  bouw({ publicatie: true, gegevens: PROEF, uit });
  for (const p of paginas(uit)) assert.doesNotMatch(lees(uit, p), /nog in te vullen|\{\{/, p);
  assert.match(lees(uit, 'index.html'), /content="index, follow"/);
  assert.doesNotMatch(lees(uit, '_headers'), /X-Robots-Tag/);
  assert.match(lees(uit, 'robots.txt'), /Sitemap: https:\/\/mijnthuisplanner\.nl\/sitemap\.xml/);
  assert.ok(!existsSync(path.join(uit, 'VOORBEELD-NIET-PUBLICEREN.txt')));
  assert.match(lees(uit, 'bedrijfsgegevens.html'), /Proefbedrijf &amp; Zonen/);
  assert.match(lees(uit, 'bedrijfsgegevens.html'), /<dd>12345678<\/dd>/);
  assert.match(lees(uit, 'bedrijfsgegevens.html'), /Niet van toepassing/);
  const sitemap = lees(uit, 'sitemap.xml');
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).sort(),
    ['https://mijnthuisplanner.nl/', 'https://mijnthuisplanner.nl/bedrijfsgegevens', 'https://mijnthuisplanner.nl/mails', 'https://mijnthuisplanner.nl/privacy']);
});

test('ongeldige instellingen worden geweigerd', () => {
  const met = (aanpassing) => ({ ...PROEF, ...aanpassing, bedrijf: { ...PROEF.bedrijf, ...(aanpassing.bedrijf ?? {}) } });
  assert.match(instellingFouten(met({ basisUrl: 'https://voorbeeld.nl' }), { publicatie: false }).join(), /basisUrl/);
  assert.match(instellingFouten(met({ start: { modus: 'app', appUrl: 'https://app.voorbeeld.nl' } }), { publicatie: false }).join(), /appUrl/);
  assert.match(instellingFouten(met({ bedrijf: { kvk: '1234' } }), { publicatie: false }).join(), /kvk/);
  assert.match(instellingFouten(met({ bedrijf: { email: 'geen-adres' } }), { publicatie: false }).join(), /email/);
  assert.match(instellingFouten(met({ bedrijf: { naam: '<script>' } }), { publicatie: false }).join(), /< of >/);
  assert.match(instellingFouten(met({ bedrijf: { btw: 'NL123' } }), { publicatie: false }).join(), /btw/);
  assert.match(instellingFouten(met({ bedrijf: { adresAfgeschermd: true } }), { publicatie: false }).join(), /afgeschermd/);
  assert.deepEqual(instellingFouten(met({ bedrijf: { adres: '', adresAfgeschermd: true } }), { publicatie: true }), []);
});

test('de knop: nu naar "meedoen met de bèta", later met één instelling naar de app', () => {
  const nu = tijdelijk();
  bouw({ uit: nu });
  assert.match(lees(nu, 'index.html'), /<a class="knop" href="\/#meedoen">Meedoen met de bèta<\/a>/);
  assert.match(lees(nu, 'index.html'), /id="meedoen"[\s\S]*voorlopig op uitnodiging/);
  const later = tijdelijk();
  bouw({ uit: later, gegevens: { ...PROEF, start: { modus: 'app', appUrl: 'https://app.mijnthuisplanner.nl' } } });
  assert.match(lees(later, 'index.html'), /<a class="knop" href="https:\/\/app\.mijnthuisplanner\.nl">Naar de app<\/a>/);
});

test('geen scripts, geen event-handlers, geen bronnen van buiten; alleen links naar onze eigen adressen en mailto', () => {
  const uit = tijdelijk();
  bouw({ publicatie: true, gegevens: PROEF, uit });
  for (const p of paginas(uit)) {
    const html = lees(uit, p);
    assert.doesNotMatch(html, /<script|<iframe|<form|<input|\son[a-z]+=|javascript:/i, p);
    for (const [, attr, url] of html.matchAll(/\s(src|href|content)="(https?:\/\/[^"]+)"/g)) {
      assert.match(url, /^https:\/\/(app\.)?mijnthuisplanner\.nl(\/|$)/, `${p}: ${attr}=${url}`);
    }
    for (const [, url] of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
      if (/^(https:|mailto:|#)/.test(url)) continue;
      const [pad, anker] = url.split('#');
      const bestand = pad === '/' || pad === '' ? 'index.html' : pad.replace(/^\//, '').replace(/^(?!.*\.[a-z]+$)(.+)$/, '$1.html');
      assert.ok(existsSync(path.join(uit, bestand)), `${p}: ${url} bestaat niet`);
      if (anker) assert.match(lees(uit, bestand), new RegExp(`id="${anker}"`), `${p}: anker #${anker} ontbreekt`);
    }
    for (const [, anker] of html.matchAll(/\shref="#([^"]+)"/g)) assert.match(html, new RegExp(`id="${anker}"`), `${p}: #${anker}`);
  }
});

test('beveiligingsheaders: een CSP zonder scripts en zonder bronnen van buiten; de stijl met de inhoud in de naam', () => {
  const uit = tijdelijk();
  bouw({ uit });
  const h = lees(uit, '_headers');
  assert.match(h, /Content-Security-Policy: default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests/);
  for (const k of ['X-Content-Type-Options: nosniff', 'Referrer-Policy: strict-origin-when-cross-origin', 'Cross-Origin-Opener-Policy: same-origin', 'Strict-Transport-Security: max-age=15552000']) assert.ok(h.includes(k), k);
  assert.doesNotMatch(h, /includeSubDomains|preload/, 'HSTS geldt (nog) niet voor subdomeinen');
  const stijl = readdirSync(uit).find(f => /^stijl\.[0-9a-f]{10}\.css$/.test(f));
  assert.ok(stijl);
  assert.match(lees(uit, 'index.html'), new RegExp(`href="/${stijl.replace('.', '\\.')}"`));
  // De ontwerpbasis staat er letterlijk in, en de eigen stijl gebruikt geen eigen kleurwaarden.
  assert.ok(lees(uit, stijl).startsWith(TOKENS));
  assert.doesNotMatch(readFileSync(path.resolve(HIER, '../src/stijl.css'), 'utf8'), /#[0-9a-f]{3,8}\b|rgba?\(/i);
});

// Contrast (WCAG 2.1): relatieve luminantie van een hexkleur.
const lum = hex => {
  const [r, g, b] = hex.match(/[0-9a-f]{2}/gi).map(x => parseInt(x, 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const thema = kop => Object.fromEntries([...TOKENS.slice(TOKENS.indexOf(kop)).split('}')[0].matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]));

test('contrast van de gebruikte tekstkleuren, licht en donker, minstens 4,5:1 (WCAG AA)', () => {
  const PAREN = [['--inkt', '--bg'], ['--inkt-2', '--bg'], ['--inkt-2', '--vlak'], ['--inkt-2', '--vlak-2'], ['--inkt', '--vlak-2'],
    ['--accent', '--bg'], ['--accent', '--vlak'], ['--accent', '--accent-zacht'], ['--accent-inkt', '--accent'], ['--demo', '--demo-zacht']];
  for (const kop of [':root {', ':root[data-theme="dark"] {']) {
    const k = thema(kop);
    for (const [v, a] of PAREN) {
      const c = contrast(k[v], k[a]);
      assert.ok(c >= 4.5, `${kop} ${v} op ${a}: ${c.toFixed(2)}`);
    }
  }
  // Wat in de eigen stijl als tekst kleurt, staat in de lijst hierboven.
  const tekstkleuren = new Set([...readFileSync(path.resolve(HIER, '../src/stijl.css'), 'utf8').matchAll(/(?:^|[;{\s])color:\s*var\((--[a-z0-9-]+)\)/g)].map(m => m[1]));
  assert.deepEqual([...tekstkleuren].filter(v => !PAREN.some(([t]) => t === v)), []);
});
