// Thuisplanner-staging, stap 2b: de export en het terugzetten (staging/export.mjs), tegen de LOKALE stack.
// Bewijst: de export is één momentopname met kloppende tellingen en controlesommen; een gewijzigd of ontbrekend bestand
// wordt gevonden; terugzetten maakt de database weer precies gelijk aan de export (ook als er intussen iets is
// toegevoegd of gewijzigd); en terugzetten weigert bij andere migraties of een niet-lokale database.
//   DB_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node --test export.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  controleerExport, exportMapFouten, herstelExport, leesExport, lokaalFouten, schrijfExport, vergelijkExport,
} from '../../staging/export.mjs';

const DB_URL = process.env.DB_URL || '';
if (lokaalFouten(DB_URL).length) throw new Error('Weigering: alleen een lokale database (DB_URL naar 127.0.0.1/localhost)');
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

let client, tmp, map, eigenHuishouden;
before(async () => {
  client = new pg.Client({ connectionString: DB_URL, application_name: 'export-test' });
  await client.connect();
  tmp = mkdtempSync(path.join(os.tmpdir(), 'thuisplanner-export-test-'));
  map = path.join(tmp, 'export');
  // Eigen, verzonnen gegevens: de test hangt niet af van wat eerdere tests lieten staan. Met een tekstlijst (legacy_ids)
  // en een gegenereerde kolom (has_account), zodat ook die vormen heen en terug gaan.
  eigenHuishouden = (await client.query(`insert into public.households (name) values ('Exporttest ' || $1) returning id`, [Date.now()])).rows[0].id;
  await client.query(`insert into public.household_members (household_id, display_name, kind, legacy_ids) values ($1, 'Kind Exporttest', 'child', '{oud-1,oud-2}')`, [eigenHuishouden]);
  await client.query(`insert into public.shopping_items (household_id, name) values ($1, 'Melk (exporttest)')`, [eigenHuishouden]);
});
after(async () => {
  if (eigenHuishouden) await client?.query('delete from public.households where id = $1', [eigenHuishouden]).catch(() => {});
  await client?.end();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

test('de exportmap: absoluut, buiten de repository en leeg', () => {
  assert.match(exportMapFouten('relatief/pad').join(), /absolute map/);
  assert.match(exportMapFouten(path.join(REPO, 'thuisplanner', 'export')).join(), /repository/);
  assert.match(exportMapFouten(REPO).join(), /repository/);
  assert.match(exportMapFouten(path.dirname(REPO)).join(), /repository/);
  assert.deepEqual(exportMapFouten(path.join(tmp, 'nog-niet')), []);
  writeFileSync(path.join(tmp, 'iets.txt'), 'x');
  assert.match(exportMapFouten(tmp).join(), /niet leeg/);
});

test('alleen een lokale database voor het terugzetten', () => {
  assert.deepEqual(lokaalFouten('postgresql://postgres:postgres@127.0.0.1:55322/postgres'), []);
  for (const u of ['postgresql://postgres.abcdefghijklmnopqrst@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    'postgresql://postgres@127.0.0.1.voorbeeld.nl:5432/postgres', 'postgresql://postgres@10.0.0.5:5432/postgres', '', undefined]) {
    assert.ok(lokaalFouten(u).length, String(u));
  }
});

test('export: één momentopname, tellingen en controlesommen kloppen; alleen accounts en identiteiten uit auth', async () => {
  const exp = await leesExport(client);
  const { manifest } = schrijfExport(map, exp, { omgeving: 'lokaal-test' });
  const namen = manifest.tabellen.map(t => t.naam);
  assert.ok(namen.includes('auth.users') && namen.includes('auth.identities'));
  assert.ok(!namen.some(n => /^auth\.(sessions|refresh_tokens|one_time_tokens|audit_log_entries|flow_state|mfa_)/.test(n)), namen.join());
  assert.ok(namen.includes('public.households') && namen.includes('public.shopping_items') && namen.includes('private.instellingen'));
  for (const t of manifest.tabellen) {
    const [s, n] = t.naam.split('.');
    const { rows } = await client.query(`select count(*)::int as n from only "${s}"."${n}"`);
    assert.equal(t.rijen, rows[0].n, t.naam);
  }
  assert.ok(manifest.migraties.length >= 11);
  assert.deepEqual(controleerExport(map).fouten, []);
  assert.deepEqual(await vergelijkExport(client, map, manifest), []);
});

test('tegenproef: een gewijzigd, ontbrekend of extra bestand wordt gevonden', () => {
  const { manifest } = controleerExport(map);
  const t = manifest.tabellen.find(x => x.rijen > 0);
  const p = path.join(map, t.bestand);
  const origineel = readFileSync(p);
  writeFileSync(p, origineel.toString().replace('"rijen":[', '"rijen":[ '));
  assert.match(controleerExport(map).fouten.join(), /controlesom wijkt af/);
  rmSync(p);
  assert.match(controleerExport(map).fouten.join(), /ontbreekt/);
  writeFileSync(p, origineel);
  writeFileSync(path.join(map, 'extra.json'), '{}');
  assert.match(controleerExport(map).fouten.join(), /onbekende bestanden/);
  rmSync(path.join(map, 'extra.json'));
  assert.deepEqual(controleerExport(map).fouten, []);
});

test('terugzetten: een wijziging en een nieuwe rij na de export zijn daarna weg; alles is gelijk aan de export', async () => {
  const { manifest } = controleerExport(map);
  const huishouden = (await client.query('select id, name from public.households where id = $1', [eigenHuishouden])).rows[0];
  const nieuw = 'Na de export toegevoegd ' + Date.now();   // uniek per run: de test hangt niet af van eerdere runs
  await client.query('insert into public.shopping_items (household_id, name) values ($1, $2)', [huishouden.id, nieuw]);
  await client.query('update public.households set name = $2 where id = $1', [huishouden.id, huishouden.name + ' ' + Date.now()]);
  assert.ok((await vergelijkExport(client, map, manifest)).length >= 2);
  assert.deepEqual(await herstelExport(client, map), []);
  assert.equal((await client.query('select count(*)::int as n from public.shopping_items where name = $1', [nieuw])).rows[0].n, 0);
  assert.equal((await client.query('select name from public.households where id = $1', [huishouden.id])).rows[0].name, huishouden.name);
});

test('tegenproef: terugzetten weigert bij andere migraties, en verandert dan niets', async () => {
  const p = path.join(map, 'manifest.json');
  const origineel = readFileSync(p, 'utf8');
  const m = JSON.parse(origineel);
  writeFileSync(p, JSON.stringify({ ...m, migraties: m.migraties.slice(0, -1) }));
  // Het manifest zelf heeft geen controlesom in zichzelf; de migratiecontrole moet het tegenhouden.
  await assert.rejects(herstelExport(client, map), /lokale migraties .* zijn niet die van de export/);
  // Dezelfde migraties, maar een andere vorm van het schema (een tabel met een kolom meer): ook geweigerd.
  const vorm = structuredClone(m.schema);
  vorm.kolommen[0].kolommen += ',extra:text';
  writeFileSync(p, JSON.stringify({ ...m, schema: vorm }));
  await assert.rejects(herstelExport(client, map), /vorm van het lokale schema wijkt af/);
  writeFileSync(p, origineel);
  assert.deepEqual(await vergelijkExport(client, map, m), []);
});
