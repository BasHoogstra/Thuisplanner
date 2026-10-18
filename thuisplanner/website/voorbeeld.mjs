#!/usr/bin/env node
// Thuisplanner-website lokaal bekijken: een kleine server voor dist/ die zich gedraagt als Cloudflare Pages.
// - "/privacy" geeft privacy.html, "/" geeft index.html;
// - een onbekend pad geeft 404.html met status 404;
// - de headers uit dist/_headers (blok "/*" en per pad) gaan mee.
//   node voorbeeld.mjs [poort]   (standaard 5184, alleen op 127.0.0.1)
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SOORT = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };

/** Leest een _headers-bestand: { '/*': { naam: waarde }, '/stijl.css': {...} }. */
export function leesHeaders(tekst) {
  const uit = {};
  let pad = null;
  for (const regel of tekst.split(/\r?\n/)) {
    if (!regel.trim()) continue;
    if (!regel.startsWith(' ')) { pad = regel.trim(); uit[pad] = {}; continue; }
    const i = regel.indexOf(':');
    uit[pad][regel.slice(0, i).trim()] = regel.slice(i + 1).trim();
  }
  return uit;
}

export function startVoorbeeld(poort = 5184, map = path.join(HIER, 'dist')) {
  const kop = leesHeaders(readFileSync(path.join(map, '_headers'), 'utf8'));
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (rel.includes('..') || rel.startsWith('/_')) rel = '/__geen__';
    let bestand = path.join(map, rel === '/' ? 'index.html' : rel.slice(1));
    if (!existsSync(bestand) && existsSync(bestand + '.html')) bestand += '.html';
    let status = 200;
    if (!existsSync(bestand) || statSync(bestand).isDirectory()) { bestand = path.join(map, '404.html'); status = 404; }
    const headers = { 'Content-Type': SOORT[path.extname(bestand)] ?? 'application/octet-stream', ...kop['/*'], ...(kop[rel] ?? {}) };
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : readFileSync(bestand));
  });
  return new Promise(ok => server.listen(poort, '127.0.0.1', () => ok(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const poort = Number(process.argv[2] ?? 5184);
  await startVoorbeeld(poort);
  console.log(`Website (voorbeeld) op http://127.0.0.1:${poort}/ (Ctrl+C om te stoppen)`);
}
