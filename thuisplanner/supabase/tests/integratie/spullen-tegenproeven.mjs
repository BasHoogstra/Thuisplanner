// Tegenproeven voor spullen.test.mjs en spullen-sync.test.mjs (gate 9, Mijn spullen & Documenten): zet telkens één regel te ruim neer in de
// LOKALE database (een functie of de bucket), draai de scheidingstests, en controleer dat minstens één test faalt. De
// oorspronkelijke definitie wordt altijd teruggezet, ook na een fout. Alleen tegen 127.0.0.1/localhost.
//   API_URL=... ANON_KEY=... SERVICE_ROLE_KEY=... DB_URL=... node spullen-tegenproeven.mjs
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const { DB_URL } = process.env;
if (!DB_URL || !/@(127\.0\.0\.1|localhost):/.test(DB_URL)) throw new Error('Weigering: DB_URL moet een lokale database zijn');

const db = new pg.Client({ connectionString: DB_URL });
await db.connect();
const definitie = async f => (await db.query(`select pg_get_functiondef($1::regprocedure) as d`, [f])).rows[0].d;

const BIJ = `select 1 from private.document_bij_pad(p_name) x join public.documents d on d.household_id = x.household_id and d.id = x.document_id`;
// [omschrijving, functie (of null), te ruime vervanging, herstel (als geen functie), extra herstel]
const PROEVEN = [
  ['lezen zonder huishoudcontrole (B leest A via een bekend pad)', 'private.documentobject_lezen(text)',
    `create or replace function private.documentobject_lezen(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
       select exists (select 1 from private.document_bij_pad(p_name) x join public.documents d on d.id = x.document_id
         where d.upload_status = 'klaar' and d.deleted_at is null) and (select private.uid()) is not null $$`],
  ['lezen vóór de bevestiging', 'private.documentobject_lezen(text)',
    `create or replace function private.documentobject_lezen(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
       select exists (${BIJ} where d.household_id in (select private.my_household_ids()) and d.deleted_at is null
         and (d.visibility = 'household' or private.is_my_event(d.owner_member_id, d.owner_user_id))) $$`],
  ['lezen zonder persoonlijk/gedeeld', 'private.documentobject_lezen(text)',
    `create or replace function private.documentobject_lezen(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
       select exists (${BIJ} where d.household_id in (select private.my_household_ids()) and d.upload_status = 'klaar' and d.deleted_at is null) $$`],
  ['uploaden zonder huishoud- of eigenaarscontrole', 'private.documentobject_uploaden(text)',
    `create or replace function private.documentobject_uploaden(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
       select (select private.uid()) is not null $$`],
  // Overschrijven vraagt ook een update-policy (die er bewust niet is): de tegenproef zet beide te ruim neer.
  ['overschrijven van een bevestigd document', 'private.documentobject_uploaden(text)',
    `create or replace function private.documentobject_uploaden(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
       select exists (${BIJ} where d.household_id in (select private.my_household_ids()) and d.deleted_at is null
         and private.is_my_event(d.owner_member_id, d.owner_user_id)) $$;
     create policy kg_overschrijven on storage.objects for update to authenticated using (bucket_id = 'documenten' and private.documentobject_uploaden(name))`,
    null, 'drop policy if exists kg_overschrijven on storage.objects'],
  ['een publieke bucket', null, `update storage.buckets set public = true where id = 'documenten'`, `update storage.buckets set public = false where id = 'documenten'`],
  ['documenten zonder persoonlijk/gedeeld', 'private.document_visible(uuid)',
    `create or replace function private.document_visible(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
       select exists (select 1 from public.documents d where d.id = p_id and d.household_id in (select private.my_household_ids())) $$`],
  ['lezen van spullen zonder persoonlijk/gedeeld (de partner ziet een persoonlijk spul)', null,
    `alter policy possessions_select on public.possessions using (household_id in (select private.my_household_ids()))`,
    `alter policy possessions_select on public.possessions using (household_id in (select private.my_household_ids())
       and (visibility = 'household' or owner_member_id = private.my_member_id(household_id)))`],
  ['een taak aan het persoonlijke spul van de partner', 'private.guard_task_possession()',
    `create or replace function private.guard_task_possession() returns trigger language plpgsql set search_path = '' as $$ begin return new; end $$`],
  ['koppelen zonder controle op beide kanten', 'private.guard_document_link()',
    `create or replace function private.guard_document_link() returns trigger language plpgsql set search_path = '' as $$ begin return new; end $$`],
];

let fouten = 0;
try {
  for (const [i, [wat, functie, sabotage, herstel, extra]] of PROEVEN.entries()) {
    const terug = functie ? await definitie(functie) : herstel;
    await db.query(sabotage);
    let r;
    try {
      r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-force-exit', 'spullen.test.mjs', 'spullen-sync.test.mjs'],
        { cwd: new URL('.', import.meta.url), encoding: 'utf8', env: process.env });
    } finally {
      await db.query(terug);
      if (extra) await db.query(extra);
    }
    const uit = (r.stdout || '') + (r.stderr || '');
    const gefaald = /^(# |ℹ )fail [1-9]/m.test(uit);
    if (gefaald) console.log(`tegenproef ${i + 1} gevangen: ${wat}`);
    else { fouten++; console.log(`TEGENPROEF ${i + 1} NIET GEVANGEN: ${wat}`); }
  }
} finally {
  await db.end();
}
console.log(`Tegenproeven spullen gevangen: ${PROEVEN.length - fouten} van ${PROEVEN.length}`);
process.exit(fouten ? 1 : 0);
