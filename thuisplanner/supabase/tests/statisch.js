#!/usr/bin/env node
// Thuisplanner KG-1/KG-5B: statische controles op thuisplanner/supabase, zonder database, browser of netwerk.
//   node thuisplanner/supabase/tests/statisch.js
// Ook gebruikt door tests/thuisplanner.test.js en de GitHub Actions-workflow.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const KG = path.join(ROOT, 'thuisplanner', 'supabase');
const MIG = path.join(KG, 'migrations');
const TESTS = path.join(KG, 'tests');

function assert(c, m) { if (!c) throw new Error(m); }
const sqlZonderCommentaar = s => s.replace(/--[^\n]*/g, '');
const migraties = () => fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();

// Functies uit pgcrypto/uuid-ossp: op Supabase in schema extensions (zie tests/supabase.test.js).
const EXTENSION_FUNCS = ['gen_random_bytes', 'gen_salt', 'crypt', 'digest', 'hmac', 'pgp_sym_encrypt',
  'pgp_sym_decrypt', 'pgp_pub_encrypt', 'pgp_pub_decrypt', 'armor', 'dearmor', 'encrypt', 'decrypt',
  'uuid_generate_v1', 'uuid_generate_v1mc', 'uuid_generate_v3', 'uuid_generate_v4', 'uuid_generate_v5'];

// Edge Functions met de service-rol (bouwverslag deel 2, §7.3 P-7). De service-rol omzeilt RLS en dus de toegangspoort.
// Alleen deze functies mogen hem gebruiken, en elk alleen met het bewijs dat hij eerst controleert wie er aanroept.
const SERVICE_ROL_TOEGESTAAN = {
  'stuur-code': { bewijs: /webhookGeldig\(/, reden: 'alleen na de handtekening van de Auth-hook (Standard Webhooks)' },
  'controleer-code': { bewijs: /'k1_controleer'/, reden: 'vóór het inloggen; elke poging loopt door de grenzen in k1_controleer' },
  'stuur-uitnodiging': { bewijs: /instelling\('WACHTRIJ_GEHEIM'\)[\s\S]*geheimGelijk\(geheim, verwacht\)[\s\S]*return json\(401/,
    reden: 'alleen met het wachtrijgeheim van de database (Vault), in constante tijd vergeleken' },
  'mail-bezorging': { bewijs: /aanbieder\.bezorging\(req, body\)[\s\S]*if \(!melding\) return json\(401/,
    reden: 'alleen een melding met een geldige handtekening van de aanbieder' },
};
/** Fouten voor een lijst Edge Functions ({ naam, bron }); _gedeeld telt als gedeelde code. Leeg = in orde. */
function serviceRolFouten(functies) {
  const f = [];
  for (const { naam, bron } of functies) {
    if (naam.startsWith('_gedeeld/')) {
      if (/SUPABASE_SERVICE_ROLE_KEY/.test(bron) && naam !== '_gedeeld/k1.ts') f.push(`${naam} leest de service-rolsleutel (alleen _gedeeld/k1.ts mag dat, in rpc)`);
      continue;
    }
    const gebruikt = /SUPABASE_SERVICE_ROLE_KEY/.test(bron) || /import\s*\{[^}]*\brpc\b[^}]*\}\s*from\s*['"]\.\.\/_gedeeld\/k1\.ts['"]/.test(bron);
    if (!gebruikt) continue;
    const regel = SERVICE_ROL_TOEGESTAAN[naam];
    if (!regel) f.push(`${naam} gebruikt de service-rol maar staat niet op de lijst (SERVICE_ROL_TOEGESTAAN in statisch.js)`);
    else if (!regel.bewijs.test(bron)) f.push(`${naam} gebruikt de service-rol zonder de controle vooraf (${regel.reden})`);
  }
  return f;
}
function leesFuncties() {
  const map = path.join(KG, 'functions');
  const uit = [];
  for (const d of fs.readdirSync(map, { withFileTypes: true }).filter(x => x.isDirectory())) {
    if (d.name === '_gedeeld') {
      for (const b of fs.readdirSync(path.join(map, d.name)).filter(x => x.endsWith('.ts'))) uit.push({ naam: '_gedeeld/' + b, bron: fs.readFileSync(path.join(map, d.name, b), 'utf8') });
    } else {
      const bron = fs.readdirSync(path.join(map, d.name)).filter(x => x.endsWith('.ts')).map(b => fs.readFileSync(path.join(map, d.name, b), 'utf8')).join('\n');
      uit.push({ naam: d.name, bron });
    }
  }
  return uit;
}

const checks = {
  'migraties: geldige namen en oplopende, unieke versies'() {
    const files = migraties();
    assert(files.length >= 1, 'Geen migraties in thuisplanner/supabase/migrations');
    const versies = files.map(f => {
      const m = /^(\d{14})_([a-z0-9_]+)\.sql$/.exec(f);
      assert(m, 'Ongeldige migratienaam: ' + f);
      return m[1];
    });
    assert(new Set(versies).size === versies.length, 'Dubbele migratieversie');
  },

  'SQL en scripts: alleen LF-regeleinden'() {
    const bad = [];
    [MIG, TESTS].forEach(d => fs.readdirSync(d).filter(f => /\.(sql|sh|txt)$/.test(f))
      .forEach(f => { if (fs.readFileSync(path.join(d, f)).includes(13)) bad.push(f); }));
    assert(bad.length === 0, 'CR/CRLF in: ' + bad.join(', '));
  },

  'migraties: extensiefuncties altijd met schemanaam extensions.'() {
    const bad = [];
    migraties().forEach(f => {
      const sql = sqlZonderCommentaar(fs.readFileSync(path.join(MIG, f), 'utf8'));
      EXTENSION_FUNCS.forEach(fn => {
        const re = new RegExp('(^|[^A-Za-z0-9_."])' + fn + '\\s*\\(', 'gi');
        if (re.test(sql)) bad.push(f + ': ' + fn + '() zonder extensions.');
      });
    });
    assert(bad.length === 0, bad.join('\n'));
  },

  'migraties: elke tabel in public heeft RLS aan'() {
    const sql = migraties().map(f => sqlZonderCommentaar(fs.readFileSync(path.join(MIG, f), 'utf8'))).join('\n');
    const tabellen = [...sql.matchAll(/create table public\.([a-z_]+)/gi)].map(m => m[1]);
    assert(tabellen.length > 0, 'Geen tabellen gevonden');
    const zonder = tabellen.filter(t => !new RegExp('alter table public\\.' + t + '\\s+enable row level security', 'i').test(sql));
    assert(zonder.length === 0, 'Tabel zonder RLS: ' + zonder.join(', '));
  },

  'migraties: functies in public zijn security invoker; security definer alleen in private'() {
    const sql = migraties().map(f => sqlZonderCommentaar(fs.readFileSync(path.join(MIG, f), 'utf8'))).join('\n');
    const bad = [];
    let n = 0;
    for (const m of sql.matchAll(/create (?:or replace )?function (public|private)\.([a-z_]+)\s*\(([\s\S]*?)\$\$/gi)) {
      n++;
      const kop = m[3];
      if (m[1].toLowerCase() === 'public' && !/security invoker/i.test(kop)) bad.push('public.' + m[2] + ' is niet security invoker');
      if (!/set search_path = ''/i.test(kop)) bad.push(m[1] + '.' + m[2] + ' zonder vast, leeg search_path');
    }
    assert(n >= 20, 'Te weinig functies gevonden (' + n + '); klopt de controle nog?');
    assert(bad.length === 0, bad.join('\n'));
  },

  'RLS-tests: één transactie die wordt teruggedraaid'() {
    const sql = sqlZonderCommentaar(fs.readFileSync(path.join(TESTS, 'rls_tests.sql'), 'utf8'));
    assert(/^\s*begin;/i.test(sql), 'rls_tests.sql moet met begin; starten');
    assert(/rollback;\s*$/i.test(sql), 'rls_tests.sql moet met rollback; eindigen');
    assert(!/\bcommit\b/i.test(sql), 'rls_tests.sql mag geen commit bevatten');
    const nummers = [...new Set([...sql.matchAll(/pg_temp\.ok\('(KG-T\d\d)'\)/g)].map(m => m[1]))];
    assert(nummers.length === 75, 'Verwacht 75 genummerde scenario\'s, gevonden ' + nummers.length);
  },

  'tegenproeven: elke regel noemt een bestaand scenario'() {
    const sql = fs.readFileSync(path.join(TESTS, 'rls_tests.sql'), 'utf8');
    const regels = fs.readFileSync(path.join(TESTS, 'tegenproeven.txt'), 'utf8').split('\n').filter(Boolean);
    assert(regels.length >= 10, 'Te weinig tegenproeven');
    regels.forEach(r => {
      const [id, sab] = r.split('|');
      assert(/^KG-T\d\d$/.test(id) && sab && sab.trim(), 'Ongeldige tegenproefregel: ' + r);
      assert(sql.includes("pg_temp.ok('" + id + "')"), 'Tegenproef verwijst naar onbekend scenario ' + id);
    });
  },

  'configuratie: eigen project, niet gekoppeld aan een bestaand Supabase-project'() {
    const toml = fs.readFileSync(path.join(KG, 'config.toml'), 'utf8');
    assert(/^project_id = "thuisplanner"$/m.test(toml), 'project_id moet "thuisplanner" zijn');
    // supabase start maakt .temp aan (genegeerd); een project-ref erin betekent dat er gekoppeld is.
    assert(!fs.existsSync(path.join(KG, '.temp', 'project-ref')), 'thuisplanner/supabase/.temp/project-ref bestaat (gekoppeld project?)');
    const alles = execSync('git ls-files -co --exclude-standard thuisplanner', { cwd: ROOT }).toString();
    assert(!/project-ref|\.temp\//.test(alles), 'Koppelbestand van de Supabase CLI in thuisplanner/');
    // De refs van de bestaande Huisplan-projecten mogen in thuisplanner/ niet voorkomen.
    const refs = ['tmkhpiomdnneeoscsjge', 'rfgmaqqsjvsuibfucdrp'];
    alles.split('\n').filter(f => f && f !== 'thuisplanner/supabase/tests/statisch.js').forEach(f => {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      refs.forEach(r => assert(!s.includes(r), f + ' noemt bestaand Supabase-project ' + r));
    });
  },

  'geen geheime sleutels in thuisplanner/ of de workflow'() {
    const files = execSync('git ls-files -co --exclude-standard thuisplanner .github', { cwd: ROOT }).toString().split('\n').filter(Boolean);
    const bad = [];
    const jwt = /eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
    files.forEach(f => {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(s)) bad.push(f + ': sb_secret');
      if (/sb_publishable_[A-Za-z0-9_-]{8,}/.test(s)) bad.push(f + ': sb_publishable (hoort niet in KG-1)');
      if (/SERVICE_ROLE_KEY\s*[=:]\s*['"]?[A-Za-z0-9._-]{20,}/.test(s)) bad.push(f + ': SERVICE_ROLE_KEY met waarde');
      let m;
      while ((m = jwt.exec(s))) bad.push(f + ': JWT');
    });
    assert(bad.length === 0, bad.join('\n'));
  },

  'browsercode (sync en demo) gebruikt nooit de service-role-sleutel'() {
    const map = path.join(ROOT, 'thuisplanner');
    const browser = ['sync/thuisplanner-sync.js', 'dev/demo/paneel.js', 'dev/demo/paneel.html', 'dev/demo/index.html', 'dev/server.mjs'];
    const bad = browser.filter(f => fs.existsSync(path.join(map, f)) && /SERVICE_ROLE|service_role|sb_secret/.test(fs.readFileSync(path.join(map, f), 'utf8')));
    assert(bad.length === 0, 'Service-role-sleutel genoemd in browsercode of server: ' + bad.join(', '));
    const sync = path.join(map, 'sync/thuisplanner-sync.js');
    if (fs.existsSync(sync)) assert(!/console\./.test(fs.readFileSync(sync, 'utf8')), 'De synchronisatiemodule logt naar de console');
  },

  'React-app: browsercode noemt nooit de service-role-sleutel; de lokale env krijgt alleen de anon-sleutel'() {
    const app = path.join(ROOT, 'thuisplanner/app');
    if (!fs.existsSync(path.join(app, 'src'))) return 'overgeslagen: geen React-app';
    const bestanden = execSync('git ls-files -co --exclude-standard src index.html', { cwd: app }).toString().split('\n').filter(Boolean);
    const bad = bestanden.filter(f => /SERVICE_ROLE|service_role|sb_secret/.test(fs.readFileSync(path.join(app, f), 'utf8')));
    assert(bad.length === 0, 'Service-role-sleutel genoemd in de React-app: ' + bad.join(', '));
    const script = path.join(app, 'scripts/lokaal.mjs');
    if (fs.existsSync(script)) {
      const s = fs.readFileSync(script, 'utf8');
      const env = s.slice(s.indexOf('export function schrijfEnv'), s.indexOf('/** Start Vite'));
      assert(env.includes('VITE_SUPABASE_ANON_KEY') && !/SERVICE_ROLE/.test(env), 'scripts/lokaal.mjs zet meer dan de anon-sleutel in de browseromgeving');
    }
  },

  'Edge Functions: de service-rol alleen in de toegestane functies, en alleen na de controle vooraf'() {
    const fouten = serviceRolFouten(leesFuncties());
    assert(fouten.length === 0, fouten.join('\n'));
    // Tegenproeven: elke sabotage moet gevonden worden (zo blijft de controle zelf scherp).
    const echt = Object.fromEntries(leesFuncties().map(x => [x.naam, x.bron]));
    const proeven = [
      ['een nieuwe functie met rpc', [{ naam: 'nieuw', bron: "import { json, rpc } from '../_gedeeld/k1.ts';" }]],
      ['een nieuwe functie met de sleutel zelf', [{ naam: 'nieuw', bron: "Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')" }]],
      ['stuur-uitnodiging zonder het wachtrijgeheim', [{ naam: 'stuur-uitnodiging', bron: echt['stuur-uitnodiging'].replace(/geheimGelijk\(geheim, verwacht\)/g, 'true') }]],
      ['mail-bezorging zonder handtekening', [{ naam: 'mail-bezorging', bron: echt['mail-bezorging'].replace(/if \(!melding\) return json\(401, \{\}\);/g, '') }]],
      ['stuur-code zonder handtekening', [{ naam: 'stuur-code', bron: echt['stuur-code'].replace(/webhookGeldig\(/g, 'altijdGeldig(') }]],
      ['controleer-code zonder grenzen', [{ naam: 'controleer-code', bron: echt['controleer-code'].replace(/'k1_controleer'/g, "'k1_zonder_grens'") }]],
      ['gedeelde code met de sleutel', [{ naam: '_gedeeld/nieuw.ts', bron: "Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')" }]],
    ];
    for (const [wat, invoer] of proeven) assert(serviceRolFouten(invoer).length > 0, 'Tegenproef niet gevangen: ' + wat);
    return `${Object.keys(SERVICE_ROL_TOEGESTAAN).length} functies op de lijst; ${proeven.length} tegenproeven gevangen`;
  },

  'website: geen scripts of bronnen van buiten in de bron, geen verzonnen bedrijfsgegevens, de bouw buiten git'() {
    const map = path.join(ROOT, 'thuisplanner', 'website');
    const src = path.join(map, 'src');
    const bestanden = [...fs.readdirSync(src).filter(f => f.endsWith('.html')).map(f => path.join(src, f)),
      ...fs.readdirSync(path.join(src, 'delen')).map(f => path.join(src, 'delen', f))];
    for (const f of bestanden) {
      const html = fs.readFileSync(f, 'utf8');
      assert(!/<script|<iframe|<form|\son[a-z]+=|javascript:/i.test(html), path.relative(ROOT, f) + ' bevat een script, frame, formulier of event-handler');
      for (const [, url] of html.matchAll(/\s(?:src|href)="(https?:\/\/[^"]+)"/g)) {
        assert(/^https:\/\/(app\.)?mijnthuisplanner\.nl(\/|$)/.test(url), path.relative(ROOT, f) + ' laadt of linkt naar ' + url);
      }
    }
    // Bedrijfsgegevens komen alleen van de eigenaar: in de repository ofwel leeg, ofwel ingevuld zonder testwaarden.
    const g = JSON.parse(fs.readFileSync(path.join(map, 'gegevens.json'), 'utf8'));
    for (const [k, v] of Object.entries(g.bedrijf)) {
      if (typeof v === 'string') assert(!/test\.invalid|proef|voorbeeld|12345678|example/i.test(v), 'gegevens.json: bedrijf.' + k + ' lijkt een testwaarde');
    }
    assert(fs.readFileSync(path.join(map, '.gitignore'), 'utf8').includes('dist/'), 'website/dist hoort niet in git');
  },

  'bestaande Huisplan-bestanden ongewijzigd door deze branch'() {
    const beschermd = ['index.html', 'test/index.html', 'supabase'];
    let basis;
    try { basis = execSync('git merge-base HEAD origin/main', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
    catch (e) { return 'overgeslagen: origin/main niet beschikbaar'; }
    const gewijzigd = execSync('git diff --name-only ' + basis + ' -- ' + beschermd.join(' '), { cwd: ROOT }).toString().trim();
    assert(gewijzigd === '', 'Beschermde bestanden gewijzigd t.o.v. main:\n' + gewijzigd);
  },
};

module.exports = checks;

if (require.main === module) {
  let fout = 0;
  for (const [naam, fn] of Object.entries(checks)) {
    try { const r = fn(); console.log('  ✓ ' + naam + (r ? ' (' + r + ')' : '')); }
    catch (e) { fout++; console.log('  ✗ ' + naam + '\n    ' + String(e.message).split('\n').join('\n    ')); }
  }
  console.log(fout ? 'MISLUKT: ' + fout + ' controle(s)' : 'GESLAAGD: alle statische controles');
  process.exit(fout ? 1 : 0);
}
