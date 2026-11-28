// Thuisplanner-website: de bouw (bouw.mjs). Zonder afhankelijkheden: node --test tests/
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bouw, concepten, instellingFouten } from '../bouw.mjs';

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
    ['https://mijnthuisplanner.nl/', 'https://mijnthuisplanner.nl/bedrijfsgegevens', 'https://mijnthuisplanner.nl/beta',
      'https://mijnthuisplanner.nl/mails', 'https://mijnthuisplanner.nl/privacy', 'https://mijnthuisplanner.nl/privacy-app']);
});

test('conceptnotities: zichtbaar in de voorbeeldbouw, weg in de publicatiebouw; een open blok wordt geweigerd', () => {
  const voorbeeld = tijdelijk();
  bouw({ uit: voorbeeld });
  for (const p of ['privacy-app.html', 'beta.html']) {
    assert.match(lees(voorbeeld, p), /class="concept-noot"[\s\S]*Concept: nog niet publiceren/, p);
    assert.doesNotMatch(lees(voorbeeld, p), /<!--\s*\/?concept/, `${p}: markeringen horen niet in de uitvoer`);
  }
  // Wat de producteigenaar nog moet aanleveren en beslissen, staat bovenaan de verklaring, vóór de kop.
  const app = lees(voorbeeld, 'privacy-app.html');
  assert.ok(app.indexOf('Nog aanleveren') < app.indexOf('Nog beslissen'));
  assert.ok(app.indexOf('Nog beslissen') < app.indexOf('<h1>Privacyverklaring van de app</h1>'));
  const publicatie = tijdelijk();
  bouw({ publicatie: true, gegevens: PROEF, uit: publicatie });
  for (const p of paginas(publicatie)) {
    assert.doesNotMatch(lees(publicatie, p), /concept-noot|Concept: nog niet publiceren|Nog aanleveren|Nog beslissen|<!--\s*\/?concept/, p);
  }
  // De rest van de pagina blijft staan.
  assert.match(lees(publicatie, 'privacy-app.html'), /<h1>Privacyverklaring van de app<\/h1>/);
  // Tegenproef: een blok zonder afsluiting gaat nooit stil mee, ook niet in de voorbeeldbouw.
  for (const pub of [true, false]) {
    assert.throws(() => concepten('<p>a</p><!-- concept --><p>open</p>', { publicatie: pub, pagina: 'x.html' }), /x\.html: een conceptblok is niet goed afgesloten/);
    assert.throws(() => concepten('<p>a</p><!-- /concept -->', { publicatie: pub, pagina: 'x.html' }), /niet goed afgesloten/);
  }
  assert.equal(concepten('a<!-- concept -->b<!-- /concept -->c<!-- concept -->d<!-- /concept -->e', { publicatie: true }), 'ace');
  assert.equal(concepten('a<!-- concept -->b<!-- /concept -->c', { publicatie: false }), 'abc');
});

test('privacyverklaring van de app: verantwoordelijke uit gegevens.json, verwerkers, bewaartermijnen, rechten en de bèta', () => {
  const uit = tijdelijk();
  bouw({ publicatie: true, gegevens: PROEF, uit });
  const html = lees(uit, 'privacy-app.html');
  assert.match(html, /Proefbedrijf &amp; Zonen/);
  assert.match(html, /<a href="mailto:contact@test\.invalid">/);
  for (const kop of ['Wie is verantwoordelijk?', 'Welke gegevens verwerkt de app?', 'Wat staat er op je eigen toestel?', 'Wie in je huishouden ziet wat?',
    'Waarvoor gebruiken we je gegevens, en op welke grond?', 'Wat we niet doen', 'Hoe lang bewaren we gegevens?', 'Wie verwerkt gegevens voor ons?',
    'Je rechten', 'Kinderen', 'Beveiliging', 'Wat de bèta voor je gegevens betekent', 'Wijzigingen']) assert.ok(html.includes(`<h2>${kop}</h2>`), kop);
  for (const v of ['Supabase', 'Cloudflare', 'Lettermint', 'Frankfurt', 'Turnstile', 'Autoriteit Persoonsgegevens']) assert.ok(html.includes(v), v);
  // De functies die nu gebouwd zijn, en de termijnen uit de code (migraties en sync).
  for (const v of ['Mijn spullen &amp; Documenten', 'vakanties', 'plannen', '"bezet"', '60 seconden', '30 dagen', '180 dagen', '24 uur',
    '7 dagen', '28 dagen', '4 weken']) assert.ok(html.includes(v), v);
  assert.doesNotMatch(html, /Firebase|Google Analytics|nog in te vullen/);
  // De websiteverklaring en de appverklaring verwijzen naar elkaar; de voet linkt op elke pagina naar beide.
  assert.match(lees(uit, 'privacy.html'), /href="\/privacy-app"/);
  assert.match(html, /href="\/privacy"/);
  for (const p of paginas(uit)) assert.match(lees(uit, p), /<a href="\/privacy">Privacy website<\/a>[\s\S]*<a href="\/privacy-app">Privacy app<\/a>/, p);
});

test('uitleg voor testers: bèta, back-up, code nooit afgeven, beginscherm op iPhone en Android, beperkingen en het feedbackadres', () => {
  const uit = tijdelijk();
  bouw({ publicatie: true, gegevens: PROEF, uit });
  const html = lees(uit, 'beta.html');
  for (const v of ['Wat betekent bèta?', 'elke week een eigen back-up', 'Wij vragen nooit om je code: niet per telefoon, niet per chat en niet per mail',
    'Zet op beginscherm', 'iPhone (Safari)', 'Android (Chrome)', 'Toevoegen aan startscherm', 'Zonder internet wordt niets opgeslagen',
    'Geen verbinding', 'Meer → Feedback of hulp', 'href="/privacy-app"']) assert.ok(html.includes(v), v);
  assert.match(html, /<a href="mailto:contact@test\.invalid">/);
  assert.match(lees(uit, 'index.html'), /<a href="\/beta">uitleg voor testers<\/a>/);
  // Zonder bedrijfsgegevens (de voorbeeldbouw) geen verzonnen adres: alleen "nog in te vullen".
  const voorbeeld = tijdelijk();
  bouw({ uit: voorbeeld });
  assert.doesNotMatch(lees(voorbeeld, 'beta.html'), /mailto:/);
  assert.match(lees(voorbeeld, 'beta.html'), /Mail ons op <span class="nog-invullen">nog in te vullen<\/span>/);
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
