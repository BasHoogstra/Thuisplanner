#!/usr/bin/env node
// KomtGoed KG-1: statische controles op komtgoed/supabase, zonder database, browser of netwerk.
//   node komtgoed/supabase/tests/statisch.js
// Ook gebruikt door tests/komtgoed.test.js en de GitHub Actions-workflow.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const KG = path.join(ROOT, 'komtgoed', 'supabase');
const MIG = path.join(KG, 'migrations');
const TESTS = path.join(KG, 'tests');

function assert(c, m) { if (!c) throw new Error(m); }
const sqlZonderCommentaar = s => s.replace(/--[^\n]*/g, '');
const migraties = () => fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();

// Functies uit pgcrypto/uuid-ossp: op Supabase in schema extensions (zie tests/supabase.test.js).
const EXTENSION_FUNCS = ['gen_random_bytes', 'gen_salt', 'crypt', 'digest', 'hmac', 'pgp_sym_encrypt',
  'pgp_sym_decrypt', 'pgp_pub_encrypt', 'pgp_pub_decrypt', 'armor', 'dearmor', 'encrypt', 'decrypt',
  'uuid_generate_v1', 'uuid_generate_v1mc', 'uuid_generate_v3', 'uuid_generate_v4', 'uuid_generate_v5'];

const checks = {
  'migraties: geldige namen en oplopende, unieke versies'() {
    const files = migraties();
    assert(files.length >= 1, 'Geen migraties in komtgoed/supabase/migrations');
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
    assert(nummers.length === 22, 'Verwacht 22 genummerde scenario\'s, gevonden ' + nummers.length);
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
    assert(/^project_id = "komtgoed"$/m.test(toml), 'project_id moet "komtgoed" zijn');
    assert(!fs.existsSync(path.join(KG, '.temp')), 'komtgoed/supabase/.temp bestaat (gekoppeld project?)');
    const alles = execSync('git ls-files -co --exclude-standard komtgoed', { cwd: ROOT }).toString();
    assert(!/project-ref|\.temp\//.test(alles), 'Koppelbestand van de Supabase CLI in komtgoed/');
    // De refs van de bestaande Huisplan-projecten mogen in komtgoed/ niet voorkomen.
    const refs = ['tmkhpiomdnneeoscsjge', 'rfgmaqqsjvsuibfucdrp'];
    alles.split('\n').filter(f => f && f !== 'komtgoed/supabase/tests/statisch.js').forEach(f => {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      refs.forEach(r => assert(!s.includes(r), f + ' noemt bestaand Supabase-project ' + r));
    });
  },

  'geen geheime sleutels in komtgoed/ of de workflow'() {
    const files = execSync('git ls-files -co --exclude-standard komtgoed .github', { cwd: ROOT }).toString().split('\n').filter(Boolean);
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
