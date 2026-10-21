// Thuisplanner-staging: een controleerbare export van de gegevens vóór de migraties 12–16, en het terugzetten ervan in
// een LOKALE database (de hersteltoets). Zie docs/thuisplanner-staging-overstap.md, stap 2b.
//
// De export:
// - leest alleen, in één read-only transactie met één momentopname (repeatable read): de telling en de rijen horen dus
//   bij hetzelfde moment;
// - neemt alle gewone tabellen uit public en private mee, en uit auth alleen de accounts en identiteiten (geen sessies,
//   verversingstokens, eenmalige tokens of het auditlogboek);
// - schrijft per tabel één JSON-bestand en een manifest met de telling, de SHA-256 per bestand, de migratieversies en de
//   vingerafdruk van het schema. Het schema zelf is de repository: de migraties uit het manifest;
// - alleen naar een lege map buiten de repository: de export bevat persoonsgegevens (adressen, gehashte wachtwoorden).
//
// Het terugzetten (herstel) mag alleen in een database op deze computer (127.0.0.1 of localhost), met precies dezelfde
// migraties als in het manifest. Triggers en sleutelcontroles staan tijdens het terugzetten uit
// (session_replication_role = replica), zodat versies en tijden niet veranderen; daarna vergelijkt het per tabel de
// rijen met de export.
//
//   node export.mjs mapcontrole <map>    mag de export naar deze map? (vóór er verbinding is)
//   node export.mjs controleer <map>     controlesommen en tellingen van een export (zonder database)
//   DB_URL=postgresql://postgres:postgres@127.0.0.1:<poort>/postgres node export.mjs herstel <map>
//   DB_URL=... node export.mjs vergelijk <map>   alleen vergelijken, niets terugzetten
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, '../../..');
export const SOORT = 'thuisplanner-export';
export const AUTH_TABELLEN = ['auth.users', 'auth.identities'];

const sha256 = s => createHash('sha256').update(s).digest('hex');
const ident = s => '"' + String(s).replace(/"/g, '""') + '"';
const tabelNaam = (schema, tabel) => `${ident(schema)}.${ident(tabel)}`;
const bestandVoor = naam => naam.replace(/[^a-z0-9_.]/gi, '_') + '.json';

/** Mag de export naar deze map? Leeg = in orde. Absoluut, buiten de repository, en nog niet bestaand of leeg. */
export function exportMapFouten(map, repo = REPO) {
  if (!map || !path.isAbsolute(map)) return ['Geef een absolute map op (buiten de repository).'];
  const m = path.resolve(map), r = path.resolve(repo);
  const binnen = (a, b) => { const rel = path.relative(b, a); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
  if (binnen(m, r) || binnen(r, m)) return ['De map ligt in (of boven) de repository: een export met persoonsgegevens hoort daar nooit.'];
  if (existsSync(m) && readdirSync(m).length) return ['De map bestaat al en is niet leeg.'];
  return [];
}

/** De tabellen in de export: alle gewone tabellen in public en private, plus de accounts en identiteiten uit auth. */
async function tabellen(client) {
  const { rows } = await client.query(`
    select n.nspname as schema, c.relname as tabel
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and not c.relispartition
      and (n.nspname in ('public', 'private') or (n.nspname || '.' || c.relname) = any ($1))
    order by (n.nspname = 'auth') desc, n.nspname, c.relname`, [AUTH_TABELLEN]);
  return rows;
}

/** Kolommen die terug te zetten zijn (geen gegenereerde kolommen), in volgorde. */
async function kolommen(client, schema, tabel) {
  const { rows } = await client.query(`
    select a.attname from pg_attribute a
    where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    order by a.attnum`, [tabelNaam(schema, tabel)]);
  return rows.map(r => r.attname);
}

/** De rijen van één tabel, in een vaste volgorde, als JSON-tekst (dezelfde vorm bij export en vergelijken). */
async function rijenTekst(client, schema, tabel, kols) {
  const lijst = kols.map(ident).join(', ');
  const { rows } = await client.query(
    `select coalesce(json_agg(r order by r::text), '[]'::json)::text as rijen, count(*)::int as aantal
     from (select ${lijst} from only ${tabelNaam(schema, tabel)}) r`);
  return { tekst: rows[0].rijen, aantal: rows[0].aantal };
}

/**
 * De vorm van het Thuisplanner-schema: per schema (public, private) het aantal relaties, functies en policies, en per
 * tabel de kolommen. Die komt uit de migraties en is dus lokaal en online gelijk; andere schema's (extensies, auth)
 * verschillen tussen gehost en lokaal en tellen niet mee.
 */
export async function schemaVorm(client) {
  const { rows: tellingen } = await client.query(`
    select n.nspname as schema,
      (select count(*)::int from pg_class c where c.relnamespace = n.oid and c.relkind in ('r','v','m','p')) as relaties,
      (select count(*)::int from pg_proc p where p.pronamespace = n.oid) as functies,
      (select count(*)::int from pg_policy pol join pg_class c on c.oid = pol.polrelid where c.relnamespace = n.oid) as policies
    from pg_namespace n where n.nspname in ('public', 'private') order by 1`);
  const { rows: kols } = await client.query(`
    select n.nspname || '.' || c.relname as tabel, string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum) as kolommen
    from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p') group by 1 order by 1`);
  return { tellingen, kolommen: kols };
}

/** Lees alles voor de export, in één read-only momentopname. */
export async function leesExport(client) {
  await client.query('begin transaction isolation level repeatable read read only');
  try {
    const wie = (await client.query(`select current_setting('server_version') as versie, now() as moment`)).rows[0];
    const versies = (await client.query(`select to_regclass('supabase_migrations.schema_migrations') is not null as er`)).rows[0].er
      ? (await client.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r => r.version) : [];
    const uit = [];
    for (const { schema, tabel } of await tabellen(client)) {
      const kols = await kolommen(client, schema, tabel);
      const { tekst, aantal } = await rijenTekst(client, schema, tabel, kols);
      const telling = Number((await client.query(`select count(*) as n from only ${tabelNaam(schema, tabel)}`)).rows[0].n);
      if (telling !== aantal) throw new Error(`telling van ${schema}.${tabel} wijkt af binnen één momentopname`);
      uit.push({ naam: `${schema}.${tabel}`, kolommen: kols, rijenTekst: tekst, aantal });
    }
    return { versie: wie.versie, moment: new Date(wie.moment).toISOString(), versies, schema: await schemaVorm(client), tabellen: uit };
  } finally {
    await client.query('rollback');
  }
}

/** Schrijf de export en het manifest, en controleer direct wat er staat. */
export function schrijfExport(map, exp, meta = {}) {
  const fouten = exportMapFouten(map);
  if (fouten.length) throw new Error(fouten.join(' '));
  mkdirSync(map, { recursive: true });
  const lijst = [];
  for (const t of exp.tabellen) {
    const bestand = bestandVoor(t.naam);
    const inhoud = `{"tabel":${JSON.stringify(t.naam)},"kolommen":${JSON.stringify(t.kolommen)},"rijen":${t.rijenTekst}}\n`;
    writeFileSync(path.join(map, bestand), inhoud);
    lijst.push({ naam: t.naam, bestand, rijen: t.aantal, sha256: sha256(inhoud) });
  }
  const manifest = { soort: SOORT, ...meta, gemaakt: exp.moment, postgres: exp.versie, migraties: exp.versies, schema: exp.schema, tabellen: lijst };
  writeFileSync(path.join(map, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  const c = controleerExport(map);
  if (c.fouten.length) throw new Error('De export klopt na het schrijven niet: ' + c.fouten.join('; '));
  return { manifest, sha256Manifest: sha256(readFileSync(path.join(map, 'manifest.json'))) };
}

/** Controlesommen, tellingen en vorm van een export (zonder database). */
export function controleerExport(map) {
  const fouten = [];
  let manifest;
  try { manifest = JSON.parse(readFileSync(path.join(map, 'manifest.json'), 'utf8')); } catch { return { fouten: ['manifest.json ontbreekt of is onleesbaar'] }; }
  if (manifest.soort !== SOORT) fouten.push('manifest.json is geen Thuisplanner-export');
  for (const t of manifest.tabellen ?? []) {
    let inhoud;
    try { inhoud = readFileSync(path.join(map, t.bestand)); } catch { fouten.push(`${t.bestand} ontbreekt`); continue; }
    if (sha256(inhoud) !== t.sha256) { fouten.push(`${t.bestand}: controlesom wijkt af`); continue; }
    const j = JSON.parse(inhoud.toString('utf8'));
    if (j.tabel !== t.naam || !Array.isArray(j.rijen) || j.rijen.length !== t.rijen) fouten.push(`${t.bestand}: telling of tabel wijkt af`);
  }
  const extra = readdirSync(map).filter(f => f !== 'manifest.json' && !(manifest.tabellen ?? []).some(t => t.bestand === f));
  if (extra.length) fouten.push('onbekende bestanden in de map: ' + extra.join(', '));
  return { fouten, manifest };
}

/** Alleen een database op deze computer. */
export function lokaalFouten(url) {
  if (!/^postgres(ql)?:\/\/[^@/]*@(127\.0\.0\.1|localhost):\d+\/postgres$/.test(url || '')) return ['DB_URL moet een database op deze computer zijn (127.0.0.1 of localhost).'];
  return [];
}

/**
 * Welke kolommen van de export bestaan in deze database? Voor public en private moeten het precies dezelfde zijn (het
 * schema komt uit de migraties). Voor auth kan het gehoste project een nieuwere versie van Supabase Auth hebben dan de
 * lokale stack: dan tellen alleen de gedeelde kolommen, en de rest wordt gemeld.
 */
async function gedeeldeKolommen(client, naam, exportKolommen) {
  const [schema, tabel] = naam.split('.');
  const lokaal = new Set(await kolommen(client, schema, tabel));
  const ontbreekt = exportKolommen.filter(k => !lokaal.has(k));
  if (ontbreekt.length && schema !== 'auth') throw new Error(`${naam}: kolommen ${ontbreekt.join(', ')} ontbreken lokaal; het schema wijkt af`);
  return { kols: exportKolommen.filter(k => lokaal.has(k)), ontbreekt };
}

/** Een rij met alleen deze kolommen, in de volgorde van de kolommen (zoals rijenTekst ze maakt). */
const alleen = (rij, kols) => Object.fromEntries(kols.map(k => [k, rij[k]]));

/** Vergelijk per tabel de rijen in de database met de export. Leeg = gelijk. */
export async function vergelijkExport(client, map, manifest, meldingen = []) {
  const f = [];
  for (const t of manifest.tabellen) {
    const j = JSON.parse(readFileSync(path.join(map, t.bestand), 'utf8'));
    const [schema, tabel] = t.naam.split('.');
    const { kols, ontbreekt } = await gedeeldeKolommen(client, t.naam, j.kolommen);
    if (ontbreekt.length) meldingen.push(`${t.naam}: ${ontbreekt.length} kolom(men) bestaan lokaal niet en zijn niet vergeleken (${ontbreekt.join(', ')})`);
    const { tekst, aantal } = await rijenTekst(client, schema, tabel, kols);
    const verwacht = ontbreekt.length
      ? j.rijen.map(r => alleen(r, kols)).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))
      : j.rijen;
    const lokaalRijen = JSON.parse(tekst);
    const gesorteerd = ontbreekt.length ? lokaalRijen.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)) : lokaalRijen;
    if (aantal !== t.rijen) f.push(`${t.naam}: ${aantal} rijen in plaats van ${t.rijen}`);
    else if (JSON.stringify(gesorteerd) !== JSON.stringify(verwacht)) f.push(`${t.naam}: inhoud wijkt af`);
  }
  return f;
}

/** Zet een export terug in een lokale database met precies dezelfde migraties; daarna vergelijken. */
export async function herstelExport(client, map, meldingen = []) {
  const { fouten, manifest } = controleerExport(map);
  if (fouten.length) throw new Error('De export is niet in orde: ' + fouten.join('; '));
  const versies = (await client.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r => r.version);
  if (JSON.stringify(versies) !== JSON.stringify(manifest.migraties)) {
    throw new Error(`de lokale migraties ${JSON.stringify(versies)} zijn niet die van de export ${JSON.stringify(manifest.migraties)}`);
  }
  // Dezelfde migratienamen zijn niet genoeg (een aangepast manifest, of een migratie die lokaal anders is): de vorm van
  // het schema moet ook gelijk zijn, vóór er iets wordt teruggezet.
  if (!manifest.schema) throw new Error('het manifest heeft geen schemavorm; maak de export opnieuw');
  const lokaal = await schemaVorm(client);
  if (JSON.stringify(lokaal) !== JSON.stringify(manifest.schema)) {
    const anders = manifest.schema.kolommen.filter(k => !lokaal.kolommen.some(l => l.tabel === k.tabel && l.kolommen === k.kolommen)).map(k => k.tabel);
    throw new Error(`de vorm van het lokale schema wijkt af van de export (tellingen ${JSON.stringify(lokaal.tellingen)} tegen ${JSON.stringify(manifest.schema.tellingen)}${anders.length ? '; tabellen ' + anders.join(', ') : ''})`);
  }
  await client.query('begin');
  try {
    await client.query('set local session_replication_role = replica');
    for (const t of [...manifest.tabellen].reverse()) { const [s, n] = t.naam.split('.'); await client.query(`delete from only ${tabelNaam(s, n)}`); }
    for (const t of manifest.tabellen) {
      const j = JSON.parse(readFileSync(path.join(map, t.bestand), 'utf8'));
      if (!j.rijen.length) continue;
      const [s, n] = t.naam.split('.');
      const { kols } = await gedeeldeKolommen(client, t.naam, j.kolommen);
      const lijst = kols.map(ident).join(', ');
      await client.query(`insert into ${tabelNaam(s, n)} (${lijst}) overriding system value
        select ${lijst} from json_populate_recordset(null::${tabelNaam(s, n)}, $1::json)`, [JSON.stringify(j.rijen)]);
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
  return vergelijkExport(client, map, manifest, meldingen);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [opdracht, map] = process.argv.slice(2);
  (async () => {
    if (opdracht === 'mapcontrole') {
      const f = exportMapFouten(map);
      if (f.length) { console.log('GEWEIGERD: ' + f.join(' ')); process.exit(2); }
      console.log('exportmap: ' + path.resolve(map) + ' (buiten de repository, leeg)');
      return;
    }
    if (opdracht === 'controleer' && map) {
      const { fouten, manifest } = controleerExport(map);
      if (fouten.length) { console.log('NIET IN ORDE:\n- ' + fouten.join('\n- ')); process.exit(1); }
      console.log(`IN ORDE: ${manifest.tabellen.length} tabellen, ${manifest.tabellen.reduce((a, t) => a + t.rijen, 0)} rijen, migraties tot ${manifest.migraties.at(-1)}`);
      for (const t of manifest.tabellen) console.log(`  ${t.naam}: ${t.rijen}`);
      return;
    }
    if (!['herstel', 'vergelijk'].includes(opdracht) || !map) { console.log('gebruik: controleer <map> | herstel <map> | vergelijk <map>  (herstel en vergelijk met DB_URL naar een lokale database)'); process.exit(2); }
    const f = lokaalFouten(process.env.DB_URL);
    if (f.length) { console.log('GEWEIGERD: ' + f.join(' ')); process.exit(2); }
    const { Client } = createRequire(path.join(HIER, '../tests/integratie/package.json'))('pg');
    const client = new Client({ connectionString: process.env.DB_URL, application_name: 'thuisplanner-herstel' });
    await client.connect();
    try {
      const meldingen = [];
      const verschil = opdracht === 'herstel'
        ? await herstelExport(client, map, meldingen)
        : await vergelijkExport(client, map, controleerExport(map).manifest, meldingen);
      for (const m of meldingen) console.log('LET OP: ' + m);
      if (verschil.length) { console.log('VERSCHIL:\n- ' + verschil.join('\n- ')); process.exit(1); }
      console.log(opdracht === 'herstel' ? 'TERUGGEZET en gelijk aan de export (alle tabellen, alle rijen).' : 'GELIJK aan de export.');
    } finally { await client.end(); }
  })().catch(e => { console.log('FOUT: ' + String(e.message || e)); process.exit(1); });
}
