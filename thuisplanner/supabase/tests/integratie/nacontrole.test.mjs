// Thuisplanner-staging: de nacontrole (staging/verbinding-controle.mjs, opdracht "na") tegen de LOKALE stack met alle
// migraties. De vaste referentie (VERWACHT_SCHEMA en VERWACHTE_TAKEN) moet precies kloppen met wat de migraties
// opbouwen; anders meldt de nacontrole na een online push een valse afwijking, of mist hij een echte. Vóór 22 oktober
// 2026 toetste niets dat: de referentie liep één functie achter (review stap 3a, R1).
//   DB_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node --test nacontrole.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { leesNa, naFouten, repoVersies, SCHEMA_PER_STAND, splitsVerwacht, VERWACHT_SCHEMA, VERWACHTE_TAKEN, verwachteTakenVoor, verwachtSchemaVoor } from '../../staging/verbinding-controle.mjs';

const DB_URL = process.env.DB_URL || '';
if (!/^postgres(ql)?:\/\/[^@/]*@(127\.0\.0\.1|localhost):\d+\//.test(DB_URL)) throw new Error('Weigering: alleen een lokale database (DB_URL naar 127.0.0.1/localhost)');

let client, n;
before(async () => {
  client = new pg.Client({ connectionString: DB_URL, application_name: 'nacontrole-test' });
  await client.connect();
  n = await leesNa(client);
});
after(async () => { await client?.end(); });

test('de vorm van het schema is precies de referentie van de nacontrole voor deze migratiestand', () => {
  assert.deepEqual(n.schema, verwachtSchemaVoor(n.versies));
});

test('de referenties per stand: staging (16 migraties) ongewijzigd; Vakanties precies de vier tabellen erbij', () => {
  // De huidige stagingdatabase (de oude app): deze referentie verandert niet doordat Vakanties lokaal wordt voorbereid.
  assert.deepEqual(VERWACHT_SCHEMA, [
    { schema: 'private', relaties: 9, functies: 95, policies: 0 },
    { schema: 'public', relaties: 11, functies: 34, policies: 18 },
  ]);
  assert.equal(SCHEMA_PER_STAND['20261024120000'], VERWACHT_SCHEMA);
  // De lokale geïntegreerde database: alleen de Vakanties-objecten erbij (4 tabellen, 12 policies, 12 functies).
  const [p0, u0] = SCHEMA_PER_STAND['20261024120000'], [p1, u1] = SCHEMA_PER_STAND['20261027120000'];
  assert.deepEqual([p1.relaties - p0.relaties, p1.functies - p0.functies, p1.policies - p0.policies], [0, 8, 0]);
  assert.deepEqual([u1.relaties - u0.relaties, u1.functies - u0.functies, u1.policies - u0.policies], [4, 4, 12]);
  // De herstelmigratie (bezorgmeldingen): alleen in private 1 tabel en 1 functie erbij; public ongewijzigd.
  const [p2, u2] = SCHEMA_PER_STAND['20261027180000'];
  assert.deepEqual([p2.relaties - p1.relaties, p2.functies - p1.functies, p2.policies - p1.policies], [1, 1, 0]);
  assert.deepEqual([u2.relaties - u1.relaties, u2.functies - u1.functies, u2.policies - u1.policies], [0, 0, 0]);
  // Mijn spullen & Documenten (29): private +16 functies; public +3 tabellen, +3 functies, +9 policies.
  const [p3, u3] = SCHEMA_PER_STAND['20261029120000'];
  assert.deepEqual([p3.relaties - p2.relaties, p3.functies - p2.functies, p3.policies - p2.policies], [0, 16, 0]);
  assert.deepEqual([u3.relaties - u2.relaties, u3.functies - u2.functies, u3.policies - u2.policies], [3, 3, 9]);
  // Privacyherstel tasks.possession_id: alleen 3 functies in private.
  const [p4, u4] = SCHEMA_PER_STAND['20261029130000'];
  assert.deepEqual([p4.relaties - p3.relaties, p4.functies - p3.functies, p4.policies - p3.policies], [0, 3, 0]);
  assert.deepEqual([u4.relaties - u3.relaties, u4.functies - u3.functies, u4.policies - u3.policies], [0, 0, 0]);
  // Plannen: private +7 functies; public +2 tabellen, +3 functies (de wrappers), +6 policies.
  const [p5, u5] = SCHEMA_PER_STAND['20261111120000'];
  assert.deepEqual([p5.relaties - p4.relaties, p5.functies - p4.functies, p5.policies - p4.policies], [0, 7, 0]);
  assert.deepEqual([u5.relaties - u4.relaties, u5.functies - u4.functies, u5.policies - u4.policies], [2, 3, 6]);
  // Elke referentie hoort bij een migratie die in de repository staat, en een onbekende stand is een fout.
  for (const v of Object.keys(SCHEMA_PER_STAND)) assert.ok(repoVersies().includes(v), `referentie voor onbekende migratie ${v}`);
  assert.throws(() => verwachtSchemaVoor(['20261009120000']), /geen schemareferentie/);
  assert.throws(() => verwachtSchemaVoor([]), /geen schemareferentie/);
  // De nacontrole na een push toetst tegen de stand van de repository (staging moet dan precies dat zijn).
  assert.equal(verwachtSchemaVoor(repoVersies()), SCHEMA_PER_STAND[repoVersies().at(-1)]);
});

test('de migratiegeschiedenis is die van de repository, en de geplande taken zijn precies de verwachte', () => {
  assert.deepEqual(n.versies, repoVersies());
  assert.deepEqual(n.cron.map(j => j.jobname).sort(), verwachteTakenVoor(n.versies).map(t => t.jobname).sort());
  // Per stand: tot en met migratie 27 de vijf bestaande taken; vanaf 29 de opruimronde van de documenten erbij.
  assert.equal(verwachteTakenVoor(['20261027120000']), VERWACHTE_TAKEN);
  assert.deepEqual(verwachteTakenVoor(['20261027120000', '20261029120000']).map(t => t.jobname).slice(-1), ['thuisplanner-documenten-opruimen']);
});

test('de nacontrole vindt lokaal alleen de bekende, lokale afwijkingen', () => {
  // Lokaal zijn wachtwoordsessies aan (fictieve accounts, seed.sql) en kunnen Vault, de testaanbieder en de wachtrij
  // anders staan dan online. Al het andere (RLS, policies, rechten, Realtime, taken, schema) moet in orde zijn.
  const lokaal = [/^wachtwoordsessies zijn toegestaan/, /^Vault mist /, /^de testaanbieder voor mail staat aan/, /uitnodigingsmail\(s\) wachten/];
  const rest = naFouten(n, repoVersies(), verwachtSchemaVoor(repoVersies())).filter(f => !lokaal.some(r => r.test(f)));
  assert.deepEqual(rest, []);
});

test('"verwacht tot stap 6": alleen de twee Vault-meldingen, en alleen als dat gevraagd is', () => {
  const fouten = ['Vault mist thuisplanner_wachtrij_geheim: uitnodigingsmails blijven wachten',
    'Vault mist thuisplanner_wachtrij_url: uitnodigingsmails blijven wachten', 'pg_net staat niet aan: uitnodigingsmails gaan niet automatisch'];
  assert.deepEqual(splitsVerwacht(fouten, false), { fouten, verwacht: [] });
  const { fouten: f, verwacht } = splitsVerwacht(fouten, true);
  assert.deepEqual(f, ['pg_net staat niet aan: uitnodigingsmails gaan niet automatisch']);
  assert.equal(verwacht.length, 2);
  assert.deepEqual(splitsVerwacht(['Vault mist iets_anders: x'], true).verwacht, []);
});
