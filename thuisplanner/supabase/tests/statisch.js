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
  'bevestig-upload': { bewijs: /const rij = await eigenRij\(req, id\);\s*if \(!rij\) return antwoord\(404[\s\S]*if \(rij\.upload_status !== 'wacht'\) return antwoord\(409/,
    reden: 'eerst het document als de gebruiker zelf (RLS) ophalen, en alleen een eigen wachtend document' },
  'opruimen-documenten': { bewijs: /instelling\('WACHTRIJ_GEHEIM'\)[\s\S]*geheimGelijk\(geheim, verwacht\)[\s\S]*return json\(401/,
    reden: 'alleen met het wachtrijgeheim van de database (Vault), in constante tijd vergeleken' },
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

/**
 * P13 (privacyherstel tasks.possession_id): taken zijn voor het hele huishouden zichtbaar. Elke kolom op public.tasks die
 * verwijst naar een tabel met `visibility` (persoonlijk of gedeeld) moet een trigger hebben (before insert or update of die
 * kolom) met een guard die security invoker is, de kolom controleert en eist dat het doel gedeeld is (visibility =
 * 'household'), direct of via een functie in private. Geeft de fouten; leeg = in orde. `beschermd` telt de kolommen.
 */
function taakVerwijzingFouten(sql) {
  const fouten = [], beschermd = [];
  const metZicht = new Set([...sql.matchAll(/create table public\.([a-z_]+) \(([\s\S]*?)\n\);/gi)]
    .filter(m => /\bvisibility\b/i.test(m[2])).map(m => m[1].toLowerCase()));
  for (const m of sql.matchAll(/alter table public\.([a-z_]+) add column visibility\b/gi)) metZicht.add(m[1].toLowerCase());
  const functies = {};   // de laatste definitie telt
  for (const m of sql.matchAll(/create (?:or replace )?function private\.([a-z_]+)\s*\(([\s\S]*?)\$\$([\s\S]*?)\$\$/gi)) functies[m[1].toLowerCase()] = { kop: m[2], romp: m[3] };
  // Gedeeld zonder uitzondering voor de eigenaar (possession_visible laat de eigenaar zijn persoonlijke spul zien: te ruim).
  const alleenGedeeld = romp => /visibility\s*=\s*'household'/i.test(romp) && !/is_my_event|owner_/i.test(romp);
  const eistGedeeld = romp => alleenGedeeld(romp)
    || [...romp.matchAll(/private\.([a-z_]+)\s*\(/gi)].some(c => alleenGedeeld(functies[c[1].toLowerCase()]?.romp ?? ''));
  for (const m of sql.matchAll(/alter table public\.tasks add constraint [a-z_]+ foreign key \(household_id, ([a-z_]+)\)\s+references public\.([a-z_]+)/gi)) {
    const [kolom, doel] = [m[1].toLowerCase(), m[2].toLowerCase()];
    if (!metZicht.has(doel)) continue;
    beschermd.push(kolom);
    const triggers = [...sql.matchAll(new RegExp('create trigger [a-z_]+ before insert or update of ' + kolom + ' on public\\.tasks\\s+for each row execute function private\\.([a-z_]+)\\(\\)', 'gi'))];
    if (!triggers.length) { fouten.push(`tasks.${kolom} → ${doel}: geen guard-trigger (before insert or update of ${kolom})`); continue; }
    for (const t of triggers) {
      const f = functies[t[1].toLowerCase()];
      if (!f) fouten.push(`tasks.${kolom}: guard private.${t[1]} niet gevonden`);
      else if (/security definer/i.test(f.kop)) fouten.push(`tasks.${kolom}: guard private.${t[1]} is security definer (dan is current_user nooit authenticated)`);
      else if (!new RegExp('new\\.' + kolom + '\\b', 'i').test(f.romp) || !eistGedeeld(f.romp)) fouten.push(`tasks.${kolom}: guard private.${t[1]} eist niet dat ${doel} gedeeld is`);
    }
  }
  return Object.assign(fouten, { beschermd });
}

/**
 * P2 (review PR #54): de migraties in de repository, het overzicht (docs/thuisplanner-migratievolgorde.md), de gemeten
 * schemareferenties (SCHEMA_PER_STAND) en het uitrolscript (verbinding.ps1, $VerwachtAantal) moeten overeenstemmen; anders
 * weigert het uitrolscript terecht, of controleert de nacontrole tegen een verkeerde stand. Geeft de fouten; leeg = in orde.
 * Het overzicht mag een reeks noemen ("`A` … `B`"); elke versie daarbinnen telt dan als genoemd.
 */
function migratieConsistentieFouten({ versies, verwachtAantal, overzicht, schemaSleutels }) {
  const fouten = [];
  if (verwachtAantal !== versies.length) fouten.push(`verbinding.ps1 verwacht ${verwachtAantal} migraties; de repository heeft er ${versies.length}`);
  const reeksen = [...overzicht.matchAll(/`(\d{14})` … `(\d{14})`/g)].map(m => [m[1], m[2]]);
  for (const v of versies) {
    if (!overzicht.includes('`' + v + '`') && !reeksen.some(([a, b]) => v >= a && v <= b)) fouten.push(`migratie ${v} staat niet in docs/thuisplanner-migratievolgorde.md`);
  }
  const laatste = versies[versies.length - 1];
  if (!schemaSleutels.includes(laatste)) fouten.push(`geen gemeten schemareferentie (SCHEMA_PER_STAND) voor de laatste migratie ${laatste}`);
  for (const s of schemaSleutels) if (!versies.includes(s)) fouten.push(`SCHEMA_PER_STAND noemt ${s}, maar die migratie bestaat niet`);
  return fouten;
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

  'migraties: repository, overzicht, schemareferenties en het uitrolscript stemmen overeen'() {
    const versies = migraties().map(f => f.slice(0, 14));
    const ps1 = fs.readFileSync(path.join(KG, 'staging', 'verbinding.ps1'), 'utf8');
    const verwachtAantal = Number((/^\$VerwachtAantal = (\d+)/m.exec(ps1) || [])[1]);
    const overzicht = fs.readFileSync(path.join(ROOT, 'docs', 'thuisplanner-migratievolgorde.md'), 'utf8');
    const controle = fs.readFileSync(path.join(KG, 'staging', 'verbinding-controle.mjs'), 'utf8');
    const schemaSleutels = [...controle.matchAll(/^ {2}'(\d{14})': Object\.freeze\(\[/gm)].map(m => m[1]);
    const invoer = { versies, verwachtAantal, overzicht, schemaSleutels };
    const fouten = migratieConsistentieFouten(invoer);
    assert(fouten.length === 0, fouten.join('\n'));
    // Tegenproeven: elk soort afwijking moet gevonden worden.
    const laatste = versies[versies.length - 1];
    const proeven = [
      { ...invoer, verwachtAantal: verwachtAantal - 1 },
      { ...invoer, overzicht: overzicht.split('`' + laatste + '`').join('') },
      { ...invoer, schemaSleutels: schemaSleutels.filter(v => v !== laatste) },
      { ...invoer, schemaSleutels: [...schemaSleutels, '20991231120000'] },
    ];
    const gevangen = proeven.filter(p => migratieConsistentieFouten(p).length > 0).length;
    assert(gevangen === proeven.length, `tegenproeven migratieconsistentie: ${gevangen} van ${proeven.length} gevangen`);
    return `${versies.length} migraties; ${gevangen} tegenproeven gevangen`;
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

  'taken: een verwijzing naar iets met persoonlijk/gedeeld heeft een guard die gedeeld eist (P13)'() {
    const sql = migraties().map(f => sqlZonderCommentaar(fs.readFileSync(path.join(MIG, f), 'utf8'))).join('\n');
    const fouten = taakVerwijzingFouten(sql);
    assert(fouten.length === 0, fouten.join('\n'));
    assert(fouten.beschermd.includes('possession_id'), 'tasks.possession_id niet gevonden; klopt de controle nog?');
    // Tegenproeven: zonder trigger, met de oude guard, als security definer, en een nieuwe kolom zonder guard.
    const oudeGuard = `create or replace function private.guard_task_possession() returns trigger language plpgsql set search_path = '' as $$ begin
      if new.possession_id is not null and not private.possession_visible(new.possession_id) then raise exception 'x'; end if; return new; end $$;`;
    const proeven = [
      sql.replace(/create trigger tasks_possession_refs[^;]*;/i, ''),
      sql + '\n' + oudeGuard,
      sql + '\nalter function private.guard_task_possession() security definer;\n' + oudeGuard.replace("set search_path = ''", "security definer set search_path = ''").replace('possession_visible(new.possession_id)', "spul_gedeeld_vergrendeld(new.household_id, new.possession_id, true)"),
      sql + `\ncreate table public.plans (\n  id uuid,\n  visibility public.visibility\n);\nalter table public.tasks add constraint tasks_plan_fkey foreign key (household_id, plan_id) references public.plans (household_id, id);`,
    ];
    const gevangen = proeven.filter(s => taakVerwijzingFouten(s).length > 0).length;
    assert(gevangen === proeven.length, `tegenproeven P13: ${gevangen} van ${proeven.length} gevangen`);
    return `${fouten.beschermd.join(', ')}; ${gevangen} tegenproeven gevangen`;
  },

  'RLS-tests: één transactie die wordt teruggedraaid'() {
    const sql = sqlZonderCommentaar(fs.readFileSync(path.join(TESTS, 'rls_tests.sql'), 'utf8'));
    assert(/^\s*begin;/i.test(sql), 'rls_tests.sql moet met begin; starten');
    assert(/rollback;\s*$/i.test(sql), 'rls_tests.sql moet met rollback; eindigen');
    assert(!/\bcommit\b/i.test(sql), 'rls_tests.sql mag geen commit bevatten');
    const nummers = [...new Set([...sql.matchAll(/pg_temp\.ok\('(KG-T\d\d)'\)/g)].map(m => m[1]))];
    assert(nummers.length === 98, 'Verwacht 98 genummerde scenario\'s, gevonden ' + nummers.length);
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
