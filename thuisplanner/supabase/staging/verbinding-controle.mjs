// Thuisplanner-staging: ALLEEN LEZEND controleren met welke database we verbonden zijn, en wat erin staat.
// Gebruikt door verbinding.ps1 (docs/thuisplanner-staging.md, stap 3). Schrijft nooit iets: elke vraag loopt in
// een read-only transactie die wordt teruggedraaid.
//
// Verbinding: KG_OMGEVING (staging, beta of productie; zie thuisplanner/omgevingen.json), KG_DB_URL (de
// session-pooler-URI ZONDER wachtwoord), het wachtwoord alleen in PGPASSWORD, en KG_REF (het verwachte
// projectkenmerk). Alles wat niet precies klopt, wordt geweigerd vóór er verbinding is: ook een kenmerk dat bij een
// andere omgeving hoort, of een Huisplan-project. Het wachtwoord wordt nooit getoond.
//   node verbinding-controle.mjs leeg <standbestand>        weigert als het project niet leeg is; bewaart de stand
//   node verbinding-controle.mjs bijwerken <standbestand>   weigert tenzij de geschiedenis precies een begin van de
//                                                           repository is en er nieuwe migraties klaarstaan; bewaart de stand
//   node verbinding-controle.mjs vergelijk <standbestand>   controleert dat er sindsdien niets is veranderd
//   node verbinding-controle.mjs na                         nacontrole na een push (ook later te herhalen)
import { createHash, X509Certificate } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Zelfde lijst als thuisplanner/app/scripts/staging-build.ts: de Huisplan-projecten als SHA-256 van het kenmerk.
const HUISPLAN_HASHES = new Set([
  'ac0b690fc1fa36c5bb314976c3cc64f799b81ef38494de0e748e26293842125e',
  '81269699bafc709ab950f9156081d6ef6c1359c2f0631e6e99efcbc1690f9b6a',
]);
const isHuisplanRef = r => HUISPLAN_HASHES.has(createHash('sha256').update(r).digest('hex'));

// De pooler van Supabase gebruikt een eigen CA ("Supabase Root 2021 CA"), die niet in de standaardlijst van Node.js
// of Windows staat. Daarom vertrouwen we, alleen voor deze verbinding, precies deze roots. Bron: de officiële
// Supabase CLI (github.com/supabase/cli, prod-ca-2021.crt en prod-ca-2025.crt), gecontroleerd tegen de keten die de
// pooler aanbiedt (16 oktober 2026). De vingerafdrukken staan hier vast: een gewijzigd of ander bestand wordt geweigerd.
const SUPABASE_ROOTS = new Set([
  '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA',   // prod-ca-2021, geldig tot 2031
  '5F:9B:77:95:1A:7A:A1:30:3F:9B:58:EE:A9:BF:A8:9E:35:8C:FD:C1:5F:97:86:FF:10:D4:93:0A:72:2C:9A:E2',   // prod-ca-2025, geldig tot 2035
]);
const CA_BESTAND = path.join(path.dirname(fileURLToPath(import.meta.url)), 'supabase-root-ca.crt');

/** De vastgepinde Supabase-roots uit supabase-root-ca.crt; weigert als er iets anders in staat. */
export function supabaseRoots(bestand = CA_BESTAND) {
  const pems = readFileSync(bestand, 'utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  if (!pems.length) throw new Error('Geen certificaat in ' + bestand);
  for (const pem of pems) {
    const c = new X509Certificate(pem);
    if (!SUPABASE_ROOTS.has(c.fingerprint256) || !c.ca) throw new Error('Onbekend certificaat in ' + bestand + ' (' + c.subject.replace(/\n/g, ', ') + ')');
  }
  return pems;
}

const OMGEVINGEN_BESTAND = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../omgevingen.json');
export const leesOmgevingen = (bestand = OMGEVINGEN_BESTAND) => JSON.parse(readFileSync(bestand, 'utf8'));

/**
 * Hoort dit projectkenmerk bij deze omgeving? Leeg = in orde. Een kenmerk dat bij een andere omgeving staat, wordt
 * altijd geweigerd (staging en bèta nooit door elkaar). Het kenmerk moet precies het vastgelegde kenmerk van deze
 * omgeving zijn; een omgeving zonder vastgelegd kenmerk wordt geweigerd.
 */
export function omgevingFouten(naam, ref, omgevingen = leesOmgevingen()) {
  const f = [];
  const o = omgevingen[naam];
  if (!['staging', 'beta', 'productie'].includes(naam) || !o) return [`KG_OMGEVING moet staging, beta of productie zijn (niet ${JSON.stringify(naam)}).`];
  for (const [ander, a] of Object.entries(omgevingen)) {
    if (ander !== naam && a && typeof a === 'object' && a.supabaseRef && a.supabaseRef === ref) f.push(`KG_REF hoort bij de omgeving ${ander}, niet bij ${naam}.`);
  }
  // Zonder vastgelegd kenmerk is niet ondubbelzinnig welk project bij deze omgeving hoort: dan nooit verbinden.
  if (!o.supabaseRef) f.push(`Voor ${naam} staat nog geen projectkenmerk in omgevingen.json: leg het eerst vast (na controle in het dashboard).`);
  else if (o.supabaseRef !== ref) f.push(`KG_REF wijkt af van het kenmerk van ${naam} in omgevingen.json.`);
  return f;
}

/** De verbinding zonder wachtwoord, gemaskeerd om te tonen. */
export const gemaskeerd = u => u.replace(/:\/\/([^:@/]+)(:[^@]*)?@/, (_, gebruiker) => `://${gebruiker}:***@`);

/** Fouten in de opgegeven verbinding (leeg = in orde). */
export function verbindingFouten(url, ref, wachtwoord) {
  const f = [];
  if (!/^[a-z]{20}$/.test(ref || '')) f.push('KG_REF is geen projectkenmerk van 20 kleine letters.');
  else if (isHuisplanRef(ref)) f.push('KG_REF is een Huisplan-project.');
  let u;
  try { u = new URL(url || ''); } catch { f.push('KG_DB_URL is geen geldige verbinding.'); return f; }
  if (u.protocol !== 'postgresql:' && u.protocol !== 'postgres:') f.push('De verbinding moet met postgresql:// beginnen.');
  if (u.password) f.push('Er staat een wachtwoord in KG_DB_URL; dat hoort alleen in PGPASSWORD.');
  if (decodeURIComponent(u.username) !== `postgres.${ref}`) f.push(`De gebruiker moet precies postgres.${ref || '<kenmerk>'} zijn (session pooler).`);
  if (!/^aws-\d+-eu-central-1\.pooler\.supabase\.com$/.test(u.hostname)) f.push('De host moet de session pooler in eu-central-1 zijn (aws-…-eu-central-1.pooler.supabase.com).');
  if (u.port !== '5432') f.push('Poort 5432 (session pooler), niet 6543 (transaction pooler).');
  if (u.pathname !== '/postgres') f.push('De database moet postgres zijn.');
  if (u.search) f.push('Geen extra parameters in de verbinding.');
  for (const m of (url || '').matchAll(/[a-z]{20}/g)) if (isHuisplanRef(m[0])) f.push('De verbinding noemt een Huisplan-project.');
  if (!wachtwoord) f.push('PGPASSWORD is niet gezet (verbinding.ps1 vraagt het wachtwoord).');
  return [...new Set(f)];
}

/** Wat er in de database staat (alleen lezen). */
export async function leesStand(client) {
  await client.query('begin transaction read only');
  try {
    const een = async (sql) => (await client.query(sql)).rows[0];
    const alle = async (sql) => (await client.query(sql)).rows;
    const wie = await een(`select current_user as gebruiker, current_database() as database, current_setting('server_version') as versie,
      current_setting('transaction_read_only') as alleen_lezen`);
    const migratieschema = (await een(`select to_regclass('supabase_migrations.schema_migrations') is not null as er`)).er;
    const migraties = migratieschema ? Number((await een('select count(*) as n from supabase_migrations.schema_migrations')).n) : 0;
    const versies = migratieschema ? (await alle('select version from supabase_migrations.schema_migrations order by version')).map(r => r.version) : [];
    const vingerafdruk = await alle(`
      select n.nspname as schema,
             (select count(*) from pg_class c where c.relnamespace = n.oid and c.relkind in ('r','v','m','p')) as relaties,
             (select count(*) from pg_proc p where p.pronamespace = n.oid) as functies,
             (select count(*) from pg_policy pol join pg_class c on c.oid = pol.polrelid where c.relnamespace = n.oid) as policies
      from pg_namespace n
      where n.nspname not like 'pg\\_%' and n.nspname <> 'information_schema'
      order by 1`);
    const extensies = (await alle('select extname from pg_extension order by 1')).map(r => r.extname);
    const pgCron = await een(`select (select count(*) from pg_available_extensions where name = 'pg_cron') > 0 as beschikbaar,
      (select count(*) from pg_extension where extname = 'pg_cron') > 0 as aan`);
    const publiek = Number((await een(`select count(*) as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','v','m','p')`)).n);
    const privaat = (await een(`select to_regnamespace('private') is not null as er`)).er;
    const gebruikers = (await een(`select to_regclass('auth.users') is not null as er`)).er
      ? Number((await een('select count(*) as n from auth.users')).n) : 0;
    return { wie, migratieschema, migraties, versies, publiek, privaat, gebruikers, pgCron, extensies, vingerafdruk };
  } finally {
    await client.query('rollback');
  }
}

/**
 * Mag dit project worden bijgewerkt? Alleen een bestaande Thuisplanner-database waarvan de migratiegeschiedenis
 * precies het begin is van die in de repository, met ten minste één nieuwe migratie. Geeft ook de nieuwe versies.
 */
export function bijwerkFouten(s, repo) {
  const f = [];
  if (!s.privaat) f.push('het schema private ontbreekt: dit is geen Thuisplanner-database');
  if (!s.versies.length) f.push('er staan nog geen migraties in de geschiedenis: gebruik de eerste push (zonder -Bijwerken)');
  else if (s.versies.length > repo.length || s.versies.some((v, i) => v !== repo[i])) {
    f.push(`de migratiegeschiedenis ${JSON.stringify(s.versies)} is geen begin van de repository ${JSON.stringify(repo)}`);
  } else if (s.versies.length === repo.length) f.push('er staan geen nieuwe migraties klaar');
  if (!s.pgCron.beschikbaar) f.push('pg_cron is niet beschikbaar');
  if (s.wie.alleen_lezen !== 'on') f.push('de controle liep niet alleen-lezend');
  return { fouten: f, nieuw: f.length ? [] : repo.slice(s.versies.length) };
}

/** Is dit een leeg, nieuw project (nog geen Thuisplanner-schema, geen migraties, geen gebruikers buiten de testers)? */
export function leegFouten(s) {
  const f = [];
  if (s.migraties > 0) f.push(`er staan al ${s.migraties} migraties in de geschiedenis`);
  if (s.publiek > 0) f.push(`er staan al ${s.publiek} tabellen of views in public`);
  if (s.privaat) f.push('het schema private bestaat al');
  if (!s.pgCron.beschikbaar) f.push('pg_cron is niet beschikbaar');
  if (s.wie.alleen_lezen !== 'on') f.push('de controle liep niet alleen-lezend');
  return f;
}

// Het schema na de 16 migraties (relaties, functies en policies in public en private), gemeten op een lege lokale
// Supabase-stack na precies deze migraties (18 oktober 2026, met deel 2: toegangspoort, K1, de uitnodigingsmail en de automatische verzending).
// Wijkt staging hiervan af, dan kreeg het niet hetzelfde schema.
export const VERWACHT_SCHEMA = [
  { schema: 'private', relaties: 9, functies: 94, policies: 0 },
  { schema: 'public', relaties: 11, functies: 34, policies: 18 },
];

// De dagelijkse taken (pg_cron): naam, tijdstip en opdracht.
export const VERWACHTE_TAKEN = [
  { jobname: 'thuisplanner-archief-opruimen', schedule: '17 3 * * *', command: 'select private.purge_archived_private()' },
  { jobname: 'thuisplanner-codes-opruimen', schedule: '41 3 * * *', command: 'select private.k1_opruimen()' },
  { jobname: 'thuisplanner-uitnodigingen-opschonen', schedule: '29 3 * * *', command: 'select private.purge_invite_emails()' },
  { jobname: 'thuisplanner-uitnodigingsmails-opruimen', schedule: '53 3 * * *', command: 'select private.uitnodigingsmails_opruimen()' },
  { jobname: 'thuisplanner-uitnodigingsmails-versturen', schedule: '* * * * *', command: 'select private.uitnodigingsmail_ronde()' },
];

/**
 * Welke schema's de API (PostgREST) blootstelt (bouwverslag deel 2, §7.2 P-6). `private` heeft functies die alleen veilig
 * zijn zolang het schema niet via de API bereikbaar is. Een verzoek met `Accept-Profile: private` hoort PGRST106 te
 * geven, en die melding noemt de blootgestelde schema's: precies public en graphql_public. Leeg = in orde.
 */
export function schemaFouten(status, body) {
  if (body?.code !== 'PGRST106') return [`schema private is via de API bereikbaar of gaf een onverwacht antwoord (${status} ${body?.code ?? ''})`];
  const lijst = String(body.hint ?? body.message ?? '').match(/exposed:\s*(.+)$/i)?.[1]?.split(',').map(s => s.trim()).filter(Boolean).sort();
  if (!lijst) return ['de lijst met blootgestelde schema\'s is niet te lezen'];
  return JSON.stringify(lijst) === '["graphql_public","public"]' ? [] : [`blootgestelde schema's ${JSON.stringify(lijst)} in plaats van alleen public en graphql_public`];
}

/**
 * De instellingen van Supabase Auth, zoals GET /auth/v1/settings ze geeft (deel 2): alleen e-mail, nooit automatisch
 * bevestigen, geen anonieme accounts, geen telefoon, SAML of passkeys. Aanmelden blijft aan: een nieuw adres krijgt een
 * code (de besloten test zit in de database, niet in Auth). Leeg = in orde.
 */
export function authFouten(s) {
  const f = [];
  const aan = Object.entries(s?.external ?? {}).filter(([, v]) => v === true).map(([k]) => k);
  if (JSON.stringify(aan) !== '["email"]') f.push(`inlogmethoden ${JSON.stringify(aan)} in plaats van alleen ["email"]`);
  if (s?.mailer_autoconfirm !== false) f.push('e-mailadressen worden automatisch bevestigd (mailer_autoconfirm)');
  if (s?.disable_signup !== false) f.push('aanmelden staat uit in Auth: nieuwe genodigden kunnen dan geen code krijgen');
  if (s?.saml_enabled !== false) f.push('SAML staat aan');
  if (s?.passkeys_enabled === true) f.push('passkeys staan aan (nog niet ontworpen, R1)');
  return f;
}

/** Alles wat na de push gecontroleerd wordt (alleen lezen). */
export async function leesNa(client) {
  await client.query('begin transaction read only');
  try {
    const alle = async (sql) => (await client.query(sql)).rows;
    const versies = (await alle(`select version from supabase_migrations.schema_migrations order by version`)).map(r => r.version);
    const zonderRls = (await alle(`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
      and not relrowsecurity order by 1`)).map(r => r.relname);
    const zonderPolicy = (await alle(`select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid) order by 1`)).map(r => r.relname);
    const anonRechten = (await alle(`select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v')
      and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
        or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete')) order by 1`)).map(r => r.relname);
    const anonPrivate = (await alle(`select has_schema_privilege('anon', 'private', 'usage') as er`))[0].er;
    const definerPubliek = (await alle(`select proname from pg_proc where pronamespace = 'public'::regnamespace and prosecdef order by 1`)).map(r => r.proname);
    const realtime = await alle(`select polname, polcmd, array(select rolname::text from pg_roles where oid = any (polroles)) as rollen
      from pg_policy where polrelid = 'realtime.messages'::regclass order by 1`);
    const cron = to_regnamespace_bestaat(await alle(`select to_regnamespace('cron') is not null as er`))
      ? await alle(`select jobname, schedule, command, active from cron.job order by 1`) : [];
    const schema = await alle(`
      select n.nspname as schema,
             (select count(*)::int from pg_class c where c.relnamespace = n.oid and c.relkind in ('r','v','m','p')) as relaties,
             (select count(*)::int from pg_proc p where p.pronamespace = n.oid) as functies,
             (select count(*)::int from pg_policy pol join pg_class c on c.oid = pol.polrelid where c.relnamespace = n.oid) as policies
      from pg_namespace n where n.nspname in ('public', 'private') order by 1`);
    // De controle op de daadwerkelijke opruiming van e-mailadressen (KG-5H deel 1b). Alleen aantallen, nooit adressen.
    // Een verlopen uitnodiging mag haar adres hoogstens tot de volgende dagelijkse opschoning houden (marge: 2 dagen).
    const metAdres = Number((await alle(`select count(*) as n from information_schema.columns
      where table_schema = 'public' and table_name = 'household_invites' and column_name = 'invited_email'`))[0].n) > 0;
    const adressen = metAdres ? (await alle(`select
        count(*) filter (where invited_email is not null and (accepted_at is not null or revoked_at is not null or declined_at is not null))::int as gesloten,
        count(*) filter (where invited_email is not null and expires_at <= now() - interval '2 days')::int as verlopen
      from public.household_invites`))[0] : null;
    // Deel 2: de schakelaars van de toegangspoort en K1 (alleen de stand, geen inhoud), en de opslag (Storage).
    const metInstellingen = (await alle(`select to_regclass('private.instellingen') is not null as er`))[0].er;
    const instellingen = metInstellingen ? (await alle(`select wachtwoordsessies_toegestaan, sessiecontrole, onderhoud, huishouden_open,
        registratie_open, codes_aan, mail_testaanbieder from private.instellingen`))[0] ?? null : null;
    const metOpslag = (await alle(`select to_regclass('storage.buckets') is not null as er`))[0].er;
    const opslag = metOpslag ? (await alle(`select (select count(*) from storage.buckets)::int as buckets,
        (select count(*) from pg_policy where polrelid = 'storage.objects'::regclass)::int as policies`))[0] : { buckets: 0, policies: 0 };
    // D6, automatische verzending: pg_net aan, de twee namen in Vault (alleen of ze bestaan; de waarden worden nooit
    // gelezen), en de stand van de wachtrij (alleen aantallen).
    const pgNet = (await alle(`select count(*)::int as n from pg_extension where extname = 'pg_net'`))[0].n === 1;
    const metVault = (await alle(`select to_regclass('vault.secrets') is not null as er`))[0].er;
    const vaultNamen = metVault ? (await alle(`select name from vault.secrets where name in ('thuisplanner_wachtrij_url', 'thuisplanner_wachtrij_geheim') order by 1`)).map(r => r.name) : [];
    const metStand = (await alle(`select to_regprocedure('private.uitnodigingsmail_stand()') is not null as er`))[0].er;
    const wachtrij = metStand ? (await alle(`select * from private.uitnodigingsmail_stand()`))[0] : null;
    return { versies, zonderRls, zonderPolicy, anonRechten, anonPrivate, definerPubliek, realtime, cron, schema, adressen, instellingen, opslag,
      pgNet, vaultNamen, wachtrij };
  } finally {
    await client.query('rollback');
  }
}
const to_regnamespace_bestaat = rijen => rijen[0]?.er === true;

/** Fouten na de push (leeg = alles zoals bedoeld). verwachteVersies: de migraties in de repository. */
export function naFouten(n, verwachteVersies, verwachtSchema) {
  const f = [];
  if (JSON.stringify(n.versies) !== JSON.stringify(verwachteVersies)) f.push(`migratiegeschiedenis ${JSON.stringify(n.versies)} wijkt af van de repository ${JSON.stringify(verwachteVersies)}`);
  if (n.zonderRls.length) f.push('tabellen zonder RLS: ' + n.zonderRls.join(', '));
  if (n.zonderPolicy.length) f.push('tabellen zonder enige policy: ' + n.zonderPolicy.join(', '));
  if (n.anonRechten.length) f.push('anon heeft rechten op: ' + n.anonRechten.join(', '));
  if (n.anonPrivate) f.push('anon heeft toegang tot schema private');
  if (n.definerPubliek.length) f.push('security definer in public: ' + n.definerPubliek.join(', '));
  const rt = n.realtime.find(p => p.polname === 'thuisplanner_household_luisteren');
  if (!rt || rt.polcmd !== 'r' || JSON.stringify(rt.rollen) !== '["authenticated"]') f.push('Realtime-policy thuisplanner_household_luisteren ontbreekt of is niet alleen-lezen voor authenticated');
  if (n.realtime.some(p => p.polname !== 'thuisplanner_household_luisteren')) f.push('onverwachte Realtime-policies: ' + n.realtime.map(p => p.polname).join(', '));
  for (const t of VERWACHTE_TAKEN) {
    const job = n.cron.find(j => j.jobname === t.jobname);
    if (!job || job.schedule !== t.schedule || job.command !== t.command || !job.active) f.push(`geplande taak ${t.jobname} ontbreekt of wijkt af`);
  }
  const onverwacht = n.cron.filter(j => !VERWACHTE_TAKEN.some(t => t.jobname === j.jobname));
  if (onverwacht.length) f.push('onverwachte geplande taken: ' + onverwacht.map(j => j.jobname).join(', '));
  if (!n.adressen) f.push('household_invites heeft geen kolom invited_email');
  else {
    if (n.adressen.gesloten) f.push(`${n.adressen.gesloten} gesloten uitnodiging(en) met een e-mailadres`);
    if (n.adressen.verlopen) f.push(`${n.adressen.verlopen} uitnodiging(en) langer dan 2 dagen verlopen en nog met een e-mailadres: de opschoning draait niet`);
  }
  if (!n.instellingen) f.push('private.instellingen ontbreekt (toegangspoort)');
  else {
    // Online nooit wachtwoordsessies (alleen de lokale ontwikkelstack zet die aan, via seed.sql), en de sessiecontrole aan.
    if (n.instellingen.wachtwoordsessies_toegestaan !== false) f.push('wachtwoordsessies zijn toegestaan: dat mag alleen lokaal (seed.sql)');
    if (n.instellingen.sessiecontrole !== true) f.push('de sessiecontrole van de toegangspoort staat uit');
  }
  if (n.instellingen && n.instellingen.mail_testaanbieder != null) f.push('de testaanbieder voor mail staat aan: dat mag alleen lokaal');
  if (!n.pgNet) f.push('pg_net staat niet aan: uitnodigingsmails gaan niet automatisch');
  for (const naam of ['thuisplanner_wachtrij_geheim', 'thuisplanner_wachtrij_url']) {
    if (!(n.vaultNamen ?? []).includes(naam)) f.push(`Vault mist ${naam}: uitnodigingsmails blijven wachten`);
  }
  if (n.wachtrij && (n.wachtrij.wacht_lang || n.wachtrij.bezig_over_termijn)) {
    f.push(`${n.wachtrij.wacht_lang} uitnodigingsmail(s) wachten langer dan 10 minuten en ${n.wachtrij.bezig_over_termijn} hangen: de verzending draait niet`);
  }
  if (n.opslag && (n.opslag.buckets || n.opslag.policies)) f.push(`Storage is in gebruik (${n.opslag.buckets} buckets, ${n.opslag.policies} policies): niet ontworpen en niet door de poort getoetst`);
  if (verwachtSchema && JSON.stringify(n.schema) !== JSON.stringify(verwachtSchema)) f.push(`schema wijkt af van de lokale referentie: ${JSON.stringify(n.schema)} in plaats van ${JSON.stringify(verwachtSchema)}`);
  return f;
}

/** De versies van de migraties in de repository (thuisplanner/supabase/migrations). */
export function repoVersies() {
  const map = path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
  return readdirSync(map).filter(f => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort().map(f => f.slice(0, 14));
}

async function verbind() {
  const { KG_DB_URL: url, KG_REF: ref, PGPASSWORD: wachtwoord, KG_OMGEVING: omgeving = 'staging' } = process.env;
  const fouten = [...omgevingFouten(omgeving, ref), ...verbindingFouten(url, ref, wachtwoord)];
  console.log('omgeving: ' + omgeving);
  if (fouten.length) { console.log('GEWEIGERD vóór verbinden:\n- ' + fouten.join('\n- ')); process.exit(2); }
  console.log('verbinding: ' + gemaskeerd(url));
  const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../tests/integratie/package.json'));
  const { Client } = require('pg');
  // Het wachtwoord komt alleen uit PGPASSWORD (node-postgres leest die zelf). TLS met certificaatcontrole.
  // TLS met volledige controle (keten én hostnaam), met uitsluitend de Supabase-root als vertrouwensanker.
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: true, ca: supabaseRoots() }, application_name: 'thuisplanner-controle' });
  await client.connect();
  return client;
}

async function hoofd() {
  const [opdracht, bestand] = process.argv.slice(2);
  if (opdracht === 'na') {
    const client = await verbind();
    let n;
    try { n = await leesNa(client); } finally { await client.end(); }
    console.log(`migraties ${n.versies.length}: ${n.versies[0] ?? '-'} … ${n.versies.at(-1) ?? '-'}`);
    console.log(`schema: ${n.schema.map(s => `${s.schema} ${s.relaties} relaties, ${s.functies} functies, ${s.policies} policies`).join('; ')}`);
    console.log(`Realtime-policies: ${n.realtime.map(p => `${p.polname} (${p.polcmd}, ${p.rollen.join(',')})`).join('; ') || 'geen'}`);
    console.log(`geplande taken: ${n.cron.map(j => `${j.jobname} ${j.schedule} ${j.active ? 'actief' : 'uit'}`).join('; ') || 'geen'}`);
    if (n.adressen) console.log(`e-mailadressen bij uitnodigingen: ${n.adressen.gesloten} bij gesloten, ${n.adressen.verlopen} bij lang verlopen (beide horen 0 te zijn)`);
    if (n.wachtrij) console.log(`uitnodigingsmails: ${Object.entries(n.wachtrij).map(([k, v]) => `${k} ${v}`).join(', ')}; Vault: ${(n.vaultNamen ?? []).join(', ') || 'leeg'}; pg_net ${n.pgNet ? 'aan' : 'uit'}`);
    if (n.instellingen) console.log(`schakelaars: ${Object.entries(n.instellingen).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    const f = naFouten(n, repoVersies(), VERWACHT_SCHEMA);
    // De Auth-instellingen (openbaar met de anon-sleutel; geen geheim). Zonder KG_ANON_KEY: overgeslagen en gemeld.
    const anon = process.env.KG_ANON_KEY;
    if (anon) {
      const r = await fetch(`https://${process.env.KG_REF}.supabase.co/auth/v1/settings`, { headers: { apikey: anon } });
      if (!r.ok) f.push(`Auth-instellingen niet te lezen (${r.status})`);
      else f.push(...authFouten(await r.json()));
      const s = await fetch(`https://${process.env.KG_REF}.supabase.co/rest/v1/`, { headers: { apikey: anon, 'Accept-Profile': 'private' } });
      f.push(...schemaFouten(s.status, await s.json().catch(() => null)));
    } else console.log('Auth-instellingen en blootgestelde schema\'s: OVERGESLAGEN (zet KG_ANON_KEY om ze te controleren)');
    if (f.length) { console.log('AFWIJKING na de push (niets hersteld):\n- ' + f.join('\n- ')); process.exit(1); }
    console.log('IN ORDE: migratiegeschiedenis, RLS en policies, rechten, Realtime-policy, geplande taken, opruiming van e-mailadressen, schakelaars van de poort en opslag zoals bedoeld');
    return;
  }
  if (!['leeg', 'bijwerken', 'vergelijk'].includes(opdracht) || !bestand) { console.log('gebruik: leeg|bijwerken|vergelijk <standbestand> | na'); process.exit(2); }
  const client = await verbind();
  let s;
  try { s = await leesStand(client); } finally { await client.end(); }
  console.log(`gebruiker ${s.wie.gebruiker}, database ${s.wie.database}, PostgreSQL ${s.wie.versie}, alleen-lezend ${s.wie.alleen_lezen}`);
  console.log(`migraties ${s.migraties}, tabellen in public ${s.publiek}, schema private ${s.privaat ? 'ja' : 'nee'}, accounts ${s.gebruikers}, pg_cron beschikbaar ${s.pgCron.beschikbaar ? 'ja' : 'nee'} (aan: ${s.pgCron.aan ? 'ja' : 'nee'})`);
  const afdruk = JSON.stringify({ migraties: s.migraties, extensies: s.extensies, vingerafdruk: s.vingerafdruk });
  if (opdracht === 'leeg') {
    const f = leegFouten(s);
    if (f.length) { console.log('NIET LEEG of niet geschikt:\n- ' + f.join('\n- ')); process.exit(1); }
    writeFileSync(bestand, afdruk);
    console.log('LEEG en geschikt: stand bewaard (' + createHash('sha256').update(afdruk).digest('hex').slice(0, 12) + ')');
  } else if (opdracht === 'bijwerken') {
    const { fouten, nieuw } = bijwerkFouten(s, repoVersies());
    if (fouten.length) { console.log('NIET BIJ TE WERKEN:\n- ' + fouten.join('\n- ')); process.exit(1); }
    writeFileSync(bestand, afdruk);
    console.log(`BIJ TE WERKEN: ${s.versies.length} migraties al uitgevoerd, ${nieuw.length} nieuw (${nieuw.join(', ')}); stand bewaard (`
      + createHash('sha256').update(afdruk).digest('hex').slice(0, 12) + ')');
  } else {
    const voor = readFileSync(bestand, 'utf8');
    if (voor !== afdruk) { console.log('GEWIJZIGD sinds de eerste controle:\nvoor: ' + voor + '\nna:   ' + afdruk); process.exit(1); }
    console.log('ONGEWIJZIGD (' + createHash('sha256').update(afdruk).digest('hex').slice(0, 12) + ')');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  hoofd().catch(e => { console.log('FOUT: ' + String(e.message || e).replace(/password[^\s]*/gi, 'password ***')); process.exit(1); });
}
