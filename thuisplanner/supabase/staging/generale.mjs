// Thuisplanner-staging: de generale repetitie van een uitrol (bijv. Vakanties, Agenda en de slimme +: migraties 25–27).
// Alleen tegen een LOKALE database (127.0.0.1 of localhost), aangeroepen door generale.sh. Zie
// docs/thuisplanner-staging-overstap.md, "Stap 9b — Vakanties, Agenda en de slimme + naar staging".
//   DB_URL=postgresql://postgres:postgres@127.0.0.1:<poort>/postgres node generale.mjs <opdracht> ...
//     foto <bestand>          per tabel (public, private, auth.users, auth.identities): kolommen, aantal en controlesom
//     vergelijk <bestand>     dezelfde kolommen opnieuw: elke bestaande rij moet ongewijzigd zijn (nieuwe kolommen tellen
//                             niet mee; nieuwe tabellen worden genoemd)
//     voor <aantal>           de controle vooraf van verbinding.ps1 -Bijwerken: precies <aantal> nieuwe migraties
//     na                      de nacontrole van verbinding.ps1 tegen de stand van de repository (lokale afwijkingen apart)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bijwerkFouten, leesNa, leesStand, naFouten, repoVersies, splitsVerwacht, verwachtSchemaVoor } from './verbinding-controle.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const DB_URL = process.env.DB_URL || '';
if (!/^postgres(ql)?:\/\/[^@/]*@(127\.0\.0\.1|localhost):\d+\//.test(DB_URL)) {
  console.log('GEWEIGERD: alleen een lokale database (DB_URL naar 127.0.0.1 of localhost).'); process.exit(2);
}
const { Client } = createRequire(path.join(HIER, '../tests/integratie/package.json'))('pg');

// Wat in deze lokale opzet anders is dan online, en dus geen afwijking van de uitrol: Vault (stap 6), de testaanbieder.
const LOKAAL = [/^Vault mist /, /^de testaanbieder voor mail staat aan/];

async function tabellen(c) {
  return (await c.query(`select n.nspname as schema, c.relname as tabel from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and (n.nspname in ('public', 'private') or (n.nspname = 'auth' and c.relname in ('users', 'identities')))
    order by 1, 2`)).rows;
}
async function kolommen(c, schema, tabel) {
  return (await c.query(`select attname from pg_attribute where attrelid = format('%I.%I', $1::text, $2::text)::regclass
    and attnum > 0 and not attisdropped order by attnum`, [schema, tabel])).rows.map(r => r.attname);
}
async function som(c, schema, tabel, kol) {
  const lijst = kol.map(k => `"${k.replaceAll('"', '""')}"`).join(', ');
  const r = (await c.query(`select count(*)::int as n, md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as som
    from (select ${lijst} from "${schema}"."${tabel}") t`)).rows[0];
  return { rijen: r.n, som: r.som };
}

const [opdracht, arg] = process.argv.slice(2);
const c = new Client({ connectionString: DB_URL, application_name: 'thuisplanner-generale' });
await c.connect();
let code = 0;
try {
  if (opdracht === 'foto') {
    const foto = [];
    for (const { schema, tabel } of await tabellen(c)) {
      const kol = await kolommen(c, schema, tabel);
      foto.push({ schema, tabel, kolommen: kol, ...(await som(c, schema, tabel, kol)) });
    }
    writeFileSync(arg, JSON.stringify(foto, null, 1));
    console.log(`foto: ${foto.length} tabellen, ${foto.reduce((n, t) => n + t.rijen, 0)} rijen`);
  } else if (opdracht === 'vergelijk') {
    const foto = JSON.parse(readFileSync(arg, 'utf8'));
    const nu = await tabellen(c);
    const fouten = [];
    for (const t of foto) {
      if (!nu.some(x => x.schema === t.schema && x.tabel === t.tabel)) { fouten.push(`${t.schema}.${t.tabel} bestaat niet meer`); continue; }
      const kol = await kolommen(c, t.schema, t.tabel);
      const weg = t.kolommen.filter(k => !kol.includes(k));
      if (weg.length) { fouten.push(`${t.schema}.${t.tabel}: kolommen verdwenen (${weg.join(', ')})`); continue; }
      const s = await som(c, t.schema, t.tabel, t.kolommen);
      if (s.rijen !== t.rijen || s.som !== t.som) fouten.push(`${t.schema}.${t.tabel}: ${t.rijen} → ${s.rijen} rijen, controlesom ${s.som === t.som ? 'gelijk' : 'anders'}`);
      const erbij = kol.filter(k => !t.kolommen.includes(k));
      if (erbij.length) console.log(`  ${t.schema}.${t.tabel}: nieuwe kolommen ${erbij.join(', ')} (bestaande rijen ongewijzigd: ${s.som === t.som ? 'ja' : 'NEE'})`);
    }
    const nieuw = nu.filter(x => !foto.some(t => t.schema === x.schema && t.tabel === x.tabel));
    if (nieuw.length) console.log('  nieuwe tabellen: ' + nieuw.map(x => `${x.schema}.${x.tabel}`).join(', '));
    console.log(`vergeleken: ${foto.length} tabellen, ${foto.reduce((n, t) => n + t.rijen, 0)} rijen`);
    if (fouten.length) { console.log('AFWIJKING:\n- ' + fouten.join('\n- ')); code = 1; } else console.log('ALLE BESTAANDE GEGEVENS ONGEWIJZIGD');
  } else if (opdracht === 'voor') {
    const s = await leesStand(c);
    const { fouten, nieuw } = bijwerkFouten(s, repoVersies());
    console.log(`online stand (hier: de repetitie): ${s.versies.length} migraties, laatste ${s.versies.at(-1)}; nieuw: ${nieuw.join(', ') || '-'}`);
    if (fouten.length) { console.log('GEWEIGERD:\n- ' + fouten.join('\n- ')); code = 1; }
    else if (nieuw.length !== Number(arg)) { console.log(`AFWIJKING: ${nieuw.length} nieuwe migraties, verwacht ${arg}`); code = 1; }
    else console.log('CONTROLE VOORAF IN ORDE');
  } else if (opdracht === 'na') {
    const n = await leesNa(c);
    const alle = naFouten(n, repoVersies(), verwachtSchemaVoor(repoVersies()));
    const { fouten, verwacht } = splitsVerwacht(alle, true);
    const lokaal = fouten.filter(f => LOKAAL.some(r => r.test(f)));
    const echt = fouten.filter(f => !lokaal.includes(f));
    console.log(`na: ${n.versies.length} migraties; schema ${JSON.stringify(n.schema)}`);
    for (const f of [...verwacht, ...lokaal]) console.log('  verwacht in deze opzet: ' + f);
    if (echt.length) { console.log('AFWIJKING:\n- ' + echt.join('\n- ')); code = 1; } else console.log('NACONTROLE IN ORDE');
  } else {
    console.log('gebruik: foto <bestand> | vergelijk <bestand> | voor <aantal> | na'); code = 2;
  }
} finally {
  await c.end();
}
process.exit(code);
