#!/usr/bin/env node
// Thuisplanner dev: een kleine lokale webserver voor de synchronisatiedemo.
//   cd thuisplanner/dev && npm start        →  http://127.0.0.1:5180
// Serveert alleen: de demopagina's, de synchronisatiemodule, supabase-js (UMD) en een config met de
// lokale URL en de publieke (anon) sleutel. Nooit de service-role-sleutel. Luistert alleen op 127.0.0.1.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DEMO, lokaleSupabase } from './omgeving.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const BESTANDEN = {
  '/': ['demo/index.html', 'text/html'],
  '/paneel.html': ['demo/paneel.html', 'text/html'],
  '/paneel.js': ['demo/paneel.js', 'text/javascript'],
  '/stijl.css': ['demo/stijl.css', 'text/css'],
  '/sync/thuisplanner-sync.js': ['../sync/thuisplanner-sync.js', 'text/javascript'],
  '/vendor/supabase.js': ['node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'text/javascript'],
};

export function startServer({ poort = Number(process.env.PORT || 5180) } = {}) {
  const { API_URL, ANON_KEY } = lokaleSupabase();
  const config = JSON.stringify({
    url: API_URL, anonKey: ANON_KEY, wachtwoord: DEMO.wachtwoord,
    accounts: Object.fromEntries(Object.entries(DEMO.accounts).map(([k, v]) => [k, { email: v.email, naam: v.naam }])),
  });
  const server = http.createServer(async (req, res) => {
    const pad = new URL(req.url, 'http://x').pathname;
    const kop = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (pad === '/config.json') { res.writeHead(200, { ...kop, 'Content-Type': 'application/json' }); return res.end(config); }
    const b = BESTANDEN[pad];
    if (!b) { res.writeHead(404, kop); return res.end('Niet gevonden'); }
    try {
      res.writeHead(200, { ...kop, 'Content-Type': b[1] + '; charset=utf-8' });
      res.end(await readFile(path.join(HIER, b[0])));
    } catch { res.writeHead(500, kop); res.end('Fout'); }
  });
  return new Promise(r => server.listen(poort, '127.0.0.1', () => r(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().then(s => console.log(`Thuisplanner-syncdemo: http://127.0.0.1:${s.address().port}`));
}
