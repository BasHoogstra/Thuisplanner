#!/usr/bin/env node
// Thuisplanner: de publieke website (mijnthuisplanner.nl) bouwen. Zonder afhankelijkheden: Node leest de pagina's in
// src/, vult kop, voet en instellingen in (gegevens.json), kopieert de ontwerpbasis (thuisplanner/ontwerp) en schrijft
// dist/ met de beveiligingsheaders voor Cloudflare Pages.
//
//   node bouw.mjs                voorbeeldbouw: lege bedrijfsgegevens zichtbaar als "nog in te vullen", niet
//                                vindbaar (noindex); alleen om lokaal te bekijken en te testen
//   node bouw.mjs --publicatie   publicatiebouw: weigert bij lege of onvolledige bedrijfsgegevens of een ongeldige
//                                instelling; alleen deze bouw mag online
//
// De site heeft geen JavaScript, geen cookies, geen formulieren en geen verzoeken naar andere sites. De CSP dwingt dat af.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ONTWERP = path.resolve(HIER, '../ontwerp');

/** Controleert de instellingen. Geeft een lijst fouten (leeg = in orde). */
export function instellingFouten(g, { publicatie }) {
  const f = [];
  if (g.basisUrl !== 'https://mijnthuisplanner.nl') f.push('basisUrl moet https://mijnthuisplanner.nl zijn');
  if (!['beta', 'app'].includes(g.start?.modus)) f.push("start.modus moet 'beta' of 'app' zijn");
  if (g.start?.modus === 'app' && !/^https:\/\/app\.mijnthuisplanner\.nl\/?$/.test(g.start.appUrl ?? '')) f.push('start.appUrl moet https://app.mijnthuisplanner.nl zijn');
  const b = g.bedrijf ?? {};
  const leeg = v => typeof v !== 'string' || !v.trim();
  if (!leeg(b.email) && !/^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$/i.test(b.email)) f.push('bedrijf.email is geen e-mailadres');
  if (!leeg(b.kvk) && !/^\d{8}$/.test(b.kvk)) f.push('bedrijf.kvk moet 8 cijfers zijn');
  if (!leeg(b.btw) && !/^NL[0-9A-Z]{9}B[0-9]{2}$/.test(b.btw)) f.push('bedrijf.btw is geen Nederlands btw-id (NL…B..)');
  if (b.adresAfgeschermd && !leeg(b.adres)) f.push('bedrijf.adres moet leeg zijn als het adres is afgeschermd');
  for (const [k, v] of Object.entries(b)) if (typeof v === 'string' && /[<>]/.test(v)) f.push(`bedrijf.${k} bevat < of >`);
  if (publicatie) {
    if (leeg(b.naam)) f.push('bedrijf.naam is leeg (publicatie geweigerd)');
    if (leeg(b.email)) f.push('bedrijf.email is leeg (publicatie geweigerd)');
    if (leeg(b.kvk)) f.push('bedrijf.kvk is leeg (publicatie geweigerd)');
    if (leeg(b.adres) && !b.adresAfgeschermd) f.push('bedrijf.adres is leeg en niet afgeschermd (publicatie geweigerd)');
  }
  return f;
}

const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const OPEN = '<span class="nog-invullen">nog in te vullen</span>';

/** De beveiligingsheaders (Cloudflare Pages, _headers). Geen scripts, geen frames, niets van buiten. */
export function headers({ publicatie }) {
  return [
    '/*',
    "  Content-Security-Policy: default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests",
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()',
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Cross-Origin-Resource-Policy: same-origin',
    '  Strict-Transport-Security: max-age=15552000',
    ...(publicatie ? [] : ['  X-Robots-Tag: noindex']),
    '',
    // De stijl heeft zijn inhoud in de naam (stijl.<hash>.css): een nieuwe versie is een nieuw bestand.
    '/stijl.*.css',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n');
}

export function bouw({ publicatie = false, gegevens = JSON.parse(readFileSync(path.join(HIER, 'gegevens.json'), 'utf8')), uit = path.join(HIER, 'dist') } = {}) {
  const fouten = instellingFouten(gegevens, { publicatie });
  if (fouten.length) throw new Error('Website niet gebouwd:\n- ' + fouten.join('\n- '));
  const b = gegevens.bedrijf;
  const veld = v => (v && String(v).trim() ? escape(v) : OPEN);
  const mail = b.email ? `<a href="mailto:${escape(b.email)}">${escape(b.email)}</a>` : OPEN;
  const start = gegevens.start.modus === 'app'
    ? { href: gegevens.start.appUrl, tekst: 'Naar de app' }
    : { href: '/#meedoen', tekst: 'Meedoen met de bèta' };
  const waarden = {
    START_HREF: escape(start.href),
    START_TEKST: escape(start.tekst),
    BASIS_URL: gegevens.basisUrl,
    JAAR: String(new Date().getFullYear()),
    BEDRIJF_NAAM: veld(b.naam),
    BEDRIJF_NAAM_TEKST: b.naam ? escape(b.naam) : 'Thuisplanner',
    BEDRIJF_KVK: veld(b.kvk),
    BEDRIJF_ADRES: b.adresAfgeschermd ? 'Afgeschermd in het Handelsregister' : veld(b.adres),
    BEDRIJF_BTW: b.btw ? escape(b.btw) : (publicatie ? 'Niet van toepassing' : OPEN),
    CONTACT_MAIL: mail,
    ROBOTS: publicatie ? 'index, follow' : 'noindex, nofollow',
  };
  const src = path.join(HIER, 'src');
  const deel = n => readFileSync(path.join(src, 'delen', n), 'utf8');
  const vul = (html, extra = {}) => html.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => {
    const v = { ...waarden, ...extra }[k];
    if (v === undefined) throw new Error(`Onbekende plaatshouder ${m}`);
    return v;
  });

  // De ontwerpbasis en de eigen stijl in één bestand, de tokens eerst (zelfde kleuren als de app).
  const stijl = readFileSync(path.join(ONTWERP, 'tokens.css'), 'utf8') + '\n' + readFileSync(path.join(src, 'stijl.css'), 'utf8');
  const stijlNaam = `stijl.${createHash('sha256').update(stijl).digest('hex').slice(0, 10)}.css`;
  waarden.STIJL = '/' + stijlNaam;
  if (existsSync(uit)) rmSync(uit, { recursive: true, force: true });
  mkdirSync(uit, { recursive: true });
  const paginas = readdirSync(src).filter(f => f.endsWith('.html')).sort();
  for (const p of paginas) {
    const bron = readFileSync(path.join(src, p), 'utf8');
    const [, titel = 'Thuisplanner', beschrijving = ''] = bron.match(/^<!--\s*titel:\s*(.*?)\s*\|\s*beschrijving:\s*(.*?)\s*-->/) ?? [];
    const pad = p === 'index.html' ? '' : p.replace(/\.html$/, '');
    const html = vul(deel('kop.html'), { TITEL: escape(titel), BESCHRIJVING: escape(beschrijving), CANONIEK: `${gegevens.basisUrl}/${pad}` })
      + vul(bron.replace(/^<!--[\s\S]*?-->\s*/, ''))
      + vul(deel('voet.html'));
    if (/<script|javascript:|\son[a-z]+=/i.test(html)) throw new Error(`${p}: geen scripts of event-handlers toegestaan`);
    writeFileSync(path.join(uit, p), html);
  }
  writeFileSync(path.join(uit, stijlNaam), stijl);
  copyFileSync(path.join(ONTWERP, 'pictogram.svg'), path.join(uit, 'pictogram.svg'));
  copyFileSync(path.join(ONTWERP, 'logo.svg'), path.join(uit, 'logo.svg'));
  writeFileSync(path.join(uit, '_headers'), headers({ publicatie }));
  // Een voorbeeldbouw is herkenbaar en hoort nooit online: het publicatiescript weigert een map met dit bestand.
  if (!publicatie) writeFileSync(path.join(uit, 'VOORBEELD-NIET-PUBLICEREN.txt'), 'Voorbeeldbouw: bedrijfsgegevens kunnen ontbreken. Publiceer alleen een bouw met --publicatie.\n');
  writeFileSync(path.join(uit, 'robots.txt'), publicatie ? `User-agent: *\nAllow: /\nSitemap: ${gegevens.basisUrl}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');
  const urls = paginas.filter(p => p !== '404.html').map(p => `  <url><loc>${gegevens.basisUrl}/${p === 'index.html' ? '' : p.replace(/\.html$/, '')}</loc></url>`);
  writeFileSync(path.join(uit, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  return { uit, paginas };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const publicatie = process.argv.includes('--publicatie');
  try {
    const { uit, paginas } = bouw({ publicatie });
    console.log(`${publicatie ? 'Publicatiebouw' : 'Voorbeeldbouw (niet publiceren)'}: ${paginas.length} pagina's in ${path.relative(process.cwd(), uit) || uit}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
