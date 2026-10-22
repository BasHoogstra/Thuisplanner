// Thuisplanner-staging: de nacontrole (staging/verbinding-controle.mjs, opdracht "na") tegen de LOKALE stack met alle
// migraties. De vaste referentie (VERWACHT_SCHEMA en VERWACHTE_TAKEN) moet precies kloppen met wat de migraties
// opbouwen; anders meldt de nacontrole na een online push een valse afwijking, of mist hij een echte. Vóór 22 oktober
// 2026 toetste niets dat: de referentie liep één functie achter (review stap 3a, R1).
//   DB_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node --test nacontrole.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { leesNa, naFouten, repoVersies, splitsVerwacht, VERWACHT_SCHEMA, VERWACHTE_TAKEN } from '../../staging/verbinding-controle.mjs';

const DB_URL = process.env.DB_URL || '';
if (!/^postgres(ql)?:\/\/[^@/]*@(127\.0\.0\.1|localhost):\d+\//.test(DB_URL)) throw new Error('Weigering: alleen een lokale database (DB_URL naar 127.0.0.1/localhost)');

let client, n;
before(async () => {
  client = new pg.Client({ connectionString: DB_URL, application_name: 'nacontrole-test' });
  await client.connect();
  n = await leesNa(client);
});
after(async () => { await client?.end(); });

test('de vorm van het schema is precies de referentie van de nacontrole', () => {
  assert.deepEqual(n.schema, VERWACHT_SCHEMA);
});

test('de migratiegeschiedenis is die van de repository, en de geplande taken zijn precies de verwachte', () => {
  assert.deepEqual(n.versies, repoVersies());
  assert.deepEqual(n.cron.map(j => j.jobname).sort(), VERWACHTE_TAKEN.map(t => t.jobname).sort());
});

test('de nacontrole vindt lokaal alleen de bekende, lokale afwijkingen', () => {
  // Lokaal zijn wachtwoordsessies aan (fictieve accounts, seed.sql) en kunnen Vault, de testaanbieder en de wachtrij
  // anders staan dan online. Al het andere (RLS, policies, rechten, Realtime, taken, schema) moet in orde zijn.
  const lokaal = [/^wachtwoordsessies zijn toegestaan/, /^Vault mist /, /^de testaanbieder voor mail staat aan/, /uitnodigingsmail\(s\) wachten/];
  const rest = naFouten(n, repoVersies(), VERWACHT_SCHEMA).filter(f => !lokaal.some(r => r.test(f)));
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
