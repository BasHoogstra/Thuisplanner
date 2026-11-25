// Thuisplanner: verwijderen op verzoek (A9, docs/thuisplanner-beta-voorbereiding.md §5.4). Alleen voor de beheerder, vanaf
// deze computer, via verwijderen.ps1 (verborgen prompts); nooit in de app.
//
// Vier stappen, in deze volgorde:
//   1. alleen lezend een OVERZICHT: huishoudens, leden, accounts, aantallen per tabel, en waar het account en het adres
//      nu nog voorkomen;
//   2. een GETYPTE BEVESTIGING ('verwijder <omgeving> <adres>');
//   3. VERWIJDEREN in één transactie: het huishouden, de account(s), het adres op de testerslijst en de resten bij dat
//      adres (codes, tellers van de grenzen, uitnodigingen naar dat adres in andere huishoudens), en de sporen in het
//      auditlogboek van Supabase Auth, de Realtime-berichten en het eigenaarsveld van bestanden. Daarna de bestaande
//      opruimronde voor de bestanden van Mijn spullen (verwijderen-spullen.mjs);
//   4. een CONTROLE dat er niets meer is: elke tekst-, uuid- en json-kolom in de schema's van SCHEMAS wordt doorzocht op
//      de account-id's, de huishouden-id's, de adressen en de hash van het adres (zoals de codelaag die maakt).
//
// Twee soorten verzoek:
//   (a) --soort huishouden: de eigenaar vraagt om het hele huishouden. Alles van dat huishouden weg, ook het
//       lidmaatschap van de partner; het account van de eigenaar weg. Het account van een partner gaat alleen mee als
//       die dat zelf vraagt (--ook <adres van de partner>).
//   (b) --soort account: alleen het eigen account. Het account, de eigen privé-afspraken en persoonlijke spullen en
//       documenten weg; de gedeelde gegevens van het huishouden blijven (het lid blijft, zonder account). Is het account
//       het enige in een huishouden, dan gaat dat huishouden mee (de database beslist dat, zoals in de app).
//       Bestaat er (nog) geen account bij het adres, dan worden alleen de resten bij het adres opgeruimd.
//
// De regels zelf staan in de database (before_account_delete, spullen_before_account_delete, de cascades); dit script
// doet niets wat de database zou weigeren. Wat de database weigert (de enige eigenaar van een huishouden met andere
// accounts), toont het overzicht al vóór de bevestiging, en dan wordt er niets verwijderd.
//
// Verbinding: zoals verbinding-controle.mjs (KG_OMGEVING, KG_DB_URL zonder wachtwoord, PGPASSWORD, KG_REF; TLS met de
// vastgepinde Supabase-root). KG_PEPPER is het geheim K1_PEPPER van dat project (alleen voor de hash van het adres; wordt
// nergens heen gestuurd). Alleen voor de tests: KG_OMGEVING=lokaal met een verbinding naar 127.0.0.1 of localhost.
//
//   node verwijderen.mjs --soort huishouden --adres <adres> [--huishouden <id>] [--ook <adres>]...
//   node verwijderen.mjs --soort account --adres <adres>
//
// Uitkomst: 0 = verwijderd en niets meer aanwezig; 1 = fout of afwijking; 2 = geweigerd vóór verbinden;
// 3 = geweigerd vóór verwijderen (database zou weigeren, of geen bevestiging): er is dan niets verwijderd.
import { createHash, createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { spullenNietsMeer, spullenOpruimenNu, spullenOverzicht } from './verwijderen-spullen.mjs';
import { gemaskeerd, omgevingFouten, supabaseRoots, verbindingFouten } from './verbinding-controle.mjs';

/** De schema's die de controle doorzoekt. Alleen technische schema's zonder gegevens van gebruikers blijven buiten. */
export const SCHEMAS = ['public', 'private', 'auth', 'storage', 'realtime', 'net', 'cron', 'supabase_functions'];
const TYPES = ['uuid', 'text', 'varchar', 'bpchar', 'name', 'json', 'jsonb', '_uuid', '_text', '_varchar'];
const ADRES = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const schoonAdres = a => String(a ?? '').trim().toLowerCase();
/** Dezelfde hash als de codelaag (functions/_gedeeld/k1.ts, adresHmac). */
export const adresHash = (pepper, adres) => createHmac('sha256', pepper).update('adres:' + schoonAdres(adres)).digest('hex');
const q = naam => '"' + String(naam).replace(/"/g, '""') + '"';
const uniek = a => [...new Set(a)];

// ---------------------------------------------------------------------------------------------------------------------
// De controle: waar komen deze waarden nog voor?
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Doorzoekt elke tabel in SCHEMAS (elke kolom van een tekst-, uuid- of json-type) op de naalden ({ soort, waarde }),
 * zonder onderscheid tussen hoofd- en kleine letters. Alleen lezend, in één momentopname. Geeft per tabel en soort het
 * aantal rijen, en de tabellen die niet te lezen waren (die tellen als afwijking: een controle die niet kan kijken,
 * is niet geslaagd).
 */
export async function zoekResten(db, naalden) {
  const n = naalden.filter(x => x.waarde).map(x => ({ soort: x.soort, waarde: String(x.waarde).toLowerCase() }));
  const uit = { treffers: [], onleesbaar: [], tabellen: 0 };
  if (!n.length) return uit;
  await db.query('begin transaction isolation level repeatable read read only');
  try {
    const tabellen = (await db.query(`
      select ns.nspname as s, c.relname as t, array_agg(a.attname::text order by a.attnum) as k
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      join pg_type ty on ty.oid = a.atttypid
      where c.relkind = 'r' and ns.nspname = any($1) and ty.typname = any($2)
      group by 1, 2 order by 1, 2`, [SCHEMAS, TYPES])).rows;
    uit.tabellen = tabellen.length;
    for (const { s, t, k } of tabellen) {
      const rij = `lower(concat_ws(chr(31), ${k.map(c => q(c) + '::text').join(', ')}))`;
      const tel = n.map((_, i) => `count(*) filter (where position($${i + 1} in r) > 0) as n${i}`).join(', ');
      await db.query('savepoint zoek');
      try {
        const r = (await db.query(`select ${tel} from (select ${rij} as r from ${q(s)}.${q(t)}) x`, n.map(x => x.waarde))).rows[0];
        await db.query('release savepoint zoek');
        n.forEach((x, i) => { const aantal = Number(r['n' + i]); if (aantal) uit.treffers.push({ tabel: `${s}.${t}`, soort: x.soort, aantal }); });
      } catch (e) {
        await db.query('rollback to savepoint zoek');
        uit.onleesbaar.push(`${s}.${t} (${e.code ?? 'fout'})`);
      }
    }
  } finally {
    await db.query('rollback');
  }
  // Per tabel en soort samenvoegen (twee naalden van dezelfde soort, bijvoorbeeld twee accounts).
  const samen = new Map();
  for (const x of uit.treffers) { const s = `${x.tabel}|${x.soort}`; samen.set(s, { ...x, aantal: (samen.get(s)?.aantal ?? 0) + x.aantal }); }
  uit.treffers = [...samen.values()];
  return uit;
}

// ---------------------------------------------------------------------------------------------------------------------
// Stap 1: het overzicht (alleen lezend)
// ---------------------------------------------------------------------------------------------------------------------

const rijen = async (db, sql, p) => (await db.query(sql, p)).rows;

/** Een account op adres (ook een lopende adreswijziging telt), of null. */
async function accountOpAdres(db, adres) {
  const r = await rijen(db, `select id::text, lower(email) as email, nullif(lower(coalesce(email_change, '')), '') as email_change,
      email_confirmed_at, created_at, last_sign_in_at
    from auth.users where lower(email) = $1 or lower(nullif(email_change, '')) = $1`, [adres]);
  if (r.length > 1) throw new Error('Meer dan één account bij dit adres (ook als adreswijziging): eerst met de hand nakijken.');
  return r[0] ?? null;
}

/**
 * Wat de database bij het verwijderen van deze accounts doet (before_account_delete), nagespeeld zonder iets te wijzigen:
 * welke huishoudens meegaan (het account is de laatste eigenaar en er is geen ander account), en of er een weigering
 * komt (de laatste eigenaar van een huishouden met andere accounts).
 */
async function nagespeeld(db, accountIds, alWeg) {
  const weg = new Set(alWeg);
  const weigeringen = [];
  const mee = [];
  for (const id of [...accountIds].sort()) {
    const eigen = await rijen(db, `select m.household_id::text as h, h.name as naam from public.household_members m
      join public.households h on h.id = m.household_id
      where m.user_id = $1 and m.status = 'active' and m.role = 'owner' order by 1`, [id]);
    for (const { h, naam } of eigen) {
      if (weg.has(h)) continue;
      const [{ eigenaren, accounts }] = await rijen(db, `select
          count(*) filter (where o.role = 'owner') as eigenaren, count(*) as accounts
        from public.household_members o
        where o.household_id = $1 and o.status = 'active' and o.user_id is not null and o.user_id <> all($2::uuid[])`,
      [h, [...accountIds]]);
      // Andere eigenaren die blijven: het account wordt alleen losgemaakt. Anders: andere accounts = weigering.
      if (Number(eigenaren) > 0) continue;
      if (Number(accounts) > 0) weigeringen.push(`het account is de enige eigenaar van "${naam}" (${h}), waar nog ${accounts} ander(e) account(s) lid van zijn: eerst het eigendom overdragen, of het hele huishouden laten verwijderen (soort huishouden)`);
      else { weg.add(h); mee.push({ id: h, naam }); }
    }
  }
  return { mee, weigeringen };
}

/** Aantallen per tabel voor een huishouden: elke tabel in public en private met een kolom household_id, en de bestanden. */
async function aantallenVoorHuishouden(db, h) {
  const tabellen = await rijen(db, `select ns.nspname as s, c.relname as t from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'household_id' and not a.attisdropped
    where c.relkind = 'r' and ns.nspname in ('public', 'private') order by 1, 2`);
  const uit = {};
  for (const { s, t } of tabellen) {
    const n = Number((await rijen(db, `select count(*) as n from ${q(s)}.${q(t)} where household_id = $1`, [h]))[0].n);
    if (n) uit[`${s}.${t}`] = n;
  }
  const b = Number((await rijen(db, `select count(*) as n from storage.objects where bucket_id = 'documenten' and name like $1::text || '/%'`, [h]))[0].n);
  if (b) uit['storage.objects (bestanden)'] = b;
  return uit;
}

/** De kern van het overzicht, zonder eigen transactie (ook gebruikt voor de hercontrole vlak vóór het verwijderen). */
async function leesKern(db, verzoek, pepper) {
  const adres = schoonAdres(verzoek.adres);
  const soort = verzoek.soort;
  const ook = uniek((verzoek.ook ?? []).map(schoonAdres)).filter(a => a !== adres);
  const weigeringen = [];
  const account = await accountOpAdres(db, adres);
  const ookAccounts = [];
  for (const a of ook) {
    const r = await accountOpAdres(db, a);
    if (!r) weigeringen.push(`bij ${a} (--ook) hoort geen account`);
    else ookAccounts.push(r);
  }

  const lidmaatschappen = account ? await rijen(db, `select m.household_id::text as huishouden, h.name as naam, m.id::text as lid,
      m.display_name as weergavenaam, m.role as rol, m.status
    from public.household_members m join public.households h on h.id = m.household_id
    where m.user_id = $1 order by h.name, h.id`, [account.id]) : [];

  // Welke huishoudens gaan weg op verzoek (alleen bij soort huishouden).
  const opVerzoek = [];
  if (soort === 'huishouden') {
    if (!account) weigeringen.push('bij dit adres hoort geen account: een heel huishouden verwijderen kan alleen op verzoek van de eigenaar');
    else {
      const eigen = lidmaatschappen.filter(m => m.rol === 'owner' && m.status === 'active');
      let doel = null;
      if (verzoek.huishouden) {
        doel = eigen.find(m => m.huishouden === verzoek.huishouden);
        if (!doel) weigeringen.push(`dit account is geen actieve eigenaar van huishouden ${verzoek.huishouden}`);
      } else if (eigen.length === 1) doel = eigen[0];
      else if (!eigen.length) weigeringen.push('dit account is van geen enkel huishouden de eigenaar');
      else weigeringen.push(`dit account is eigenaar van ${eigen.length} huishoudens: kies er één met --huishouden (${eigen.map(m => `${m.huishouden} "${m.naam}"`).join(', ')})`);
      if (doel) {
        opVerzoek.push({ id: doel.huishouden, naam: doel.naam });
        for (const o of ookAccounts) {
          const lid = await rijen(db, 'select 1 from public.household_members where household_id = $1 and user_id = $2', [doel.huishouden, o.id]);
          if (!lid.length) weigeringen.push(`${o.email} (--ook) is geen lid van "${doel.naam}"`);
        }
      }
    }
  } else if (soort === 'account') {
    if (ook.length) weigeringen.push('--ook hoort alleen bij soort huishouden: elk account vraagt zijn eigen verzoek');
    if (verzoek.huishouden) weigeringen.push('--huishouden hoort alleen bij soort huishouden');
  } else weigeringen.push('soort moet huishouden of account zijn');

  const accounts = [...(account ? [{ ...account, rol: 'verzoeker' }] : []), ...ookAccounts.map(a => ({ ...a, rol: 'op eigen verzoek' }))];
  const accountIds = accounts.map(a => a.id);
  const sim = await nagespeeld(db, accountIds, opVerzoek.map(h => h.id));
  weigeringen.push(...sim.weigeringen);
  const huishoudens = [...opVerzoek.map(h => ({ ...h, reden: 'op verzoek van de eigenaar' })),
    ...sim.mee.map(h => ({ ...h, reden: 'het account is daar het enige account' }))];
  const wegIds = new Set(huishoudens.map(h => h.id));
  for (const h of huishoudens) {
    h.leden = await rijen(db, `select m.display_name as weergavenaam, m.kind as soort, m.role as rol, m.status,
        case when m.user_id is null then 'geen account'
             when m.user_id = any($2::uuid[]) then 'account wordt verwijderd'
             else 'account blijft (geen verzoek); alleen het lidmaatschap verdwijnt' end as account
      from public.household_members m where m.household_id = $1 order by m.sort, m.display_name`, [h.id, accountIds]);
    h.aantallen = await aantallenVoorHuishouden(db, h.id);
  }
  // Huishoudens die blijven en waar een account uit verdwijnt: wat daar weggaat (privé en persoonlijk) en wat blijft.
  const blijvend = [];
  for (const a of accounts) {
    const leden = await rijen(db, `select m.household_id::text as huishouden, h.name as naam, m.id::text as lid from public.household_members m
      join public.households h on h.id = m.household_id where m.user_id = $1 order by 1`, [a.id]);
    for (const l of leden.filter(l => !wegIds.has(l.huishouden))) {
      const [t] = await rijen(db, `select
          (select count(*) from public.events where owner_member_id = $1 and visibility = 'private') as prive_afspraken,
          (select count(*) from public.possessions where owner_user_id = $2 and visibility = 'private' and household_id = $3) as persoonlijke_spullen,
          (select count(*) from public.documents where owner_user_id = $2 and visibility = 'private' and household_id = $3) as persoonlijke_documenten`,
      [l.lid, a.id, l.huishouden]);
      blijvend.push({ huishouden: l.huishouden, naam: l.naam, account: a.email,
        verdwijnt: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Number(v)])) });
    }
  }

  const adressen = uniek([adres, ...ook, ...accounts.flatMap(a => [a.email, a.email_change]).filter(Boolean)]);
  const hashes = pepper ? adressen.map(a => adresHash(pepper, a)) : [];
  // Klopt de pepper? Een recente code van dit account moet bij een van de adressen horen. Zonder recente code (codes
  // staan hoogstens 24 uur in de database) valt het niet te controleren; dat staat dan in het overzicht.
  let pepperControle = 'niet te controleren (geen recente code van deze accounts)';
  if (accountIds.length) {
    const codes = await rijen(db, 'select distinct adres_hmac from private.k1_codes where user_id = any($1::uuid[])', [accountIds]);
    if (codes.length) {
      if (codes.every(c => hashes.includes(c.adres_hmac))) pepperControle = 'klopt (getoetst aan een recente code)';
      else weigeringen.push('de pepper klopt niet: een recente code van dit account heeft een andere hash van het adres. Controleer K1_PEPPER van dit project');
    }
  }
  const [rest] = await rijen(db, `select
      (select count(*) from private.testers where email = any($1::text[])) as testerslijst,
      (select count(*) from public.household_invites where invited_email = any($1::text[]) and household_id <> all($3::uuid[])) as uitnodigingen_elders,
      (select count(*) from private.k1_codes where adres_hmac = any($2::text[]) or user_id = any($4::uuid[])) as codes,
      (select count(*) from private.k1_accounts where adres_hmac = any($2::text[])) as tellers_grenzen`,
  [adressen, hashes, [...wegIds], accountIds]);

  const spullen = [...huishoudens.map(h => ({ huishouden: h.id })), ...accounts.map(a => ({ account: a.id }))];
  const kern = {
    soort, adres, adressen, hashes,
    accounts: accounts.map(a => ({ id: a.id, adres: a.email, adreswijziging: a.email_change, rol: a.rol,
      bevestigd: !!a.email_confirmed_at, aangemaakt: a.created_at, laatst_ingelogd: a.last_sign_in_at })),
    lidmaatschappen, huishoudens, blijvend,
    resten: Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, Number(v)])),
    pepperControle, weigeringen,
  };
  const spullenOverzichten = [];
  for (const d of spullen) spullenOverzichten.push(await spullenOverzicht(db, d));
  return { ...kern, spullen: spullenOverzichten };
}

/** De vaste kern waarop de hercontrole vergelijkt: wie en wat weggaat (niet de aantallen, die mogen intussen wijzigen). */
export const vingerafdruk = p => createHash('sha256').update(JSON.stringify({
  soort: p.soort, adressen: p.adressen, accounts: p.accounts.map(a => a.id).sort(), huishoudens: p.huishoudens.map(h => h.id).sort(),
  blijvend: p.blijvend.map(b => b.huishouden).sort(), weigeringen: p.weigeringen,
})).digest('hex');

/** De naalden van de controle: alles wat na het verwijderen nergens meer mag voorkomen. */
export function naaldenVan(p) {
  return [
    ...p.accounts.map(a => ({ soort: 'account', waarde: a.id })),
    ...p.huishoudens.map(h => ({ soort: 'huishouden', waarde: h.id })),
    ...p.adressen.map(a => ({ soort: 'adres', waarde: a })),
    ...p.hashes.map(h => ({ soort: 'hash van het adres', waarde: h })),
  ];
}

/** Stap 1: het overzicht, alleen lezend, in één momentopname. Met de sporen die er nu zijn (dezelfde zoektocht als de controle). */
export async function leesVerzoek(db, verzoek, pepper) {
  if (!pepper) throw new Error('KG_PEPPER ontbreekt: zonder pepper is de hash van het adres niet te maken');
  await db.query('begin transaction isolation level repeatable read read only');
  let plan;
  try { plan = await leesKern(db, verzoek, pepper); } finally { await db.query('rollback'); }
  plan.sporenVooraf = (await zoekResten(db, naaldenVan(plan))).treffers;
  return plan;
}

// ---------------------------------------------------------------------------------------------------------------------
// Stap 3: verwijderen (één transactie), en de bestanden
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Verwijdert alles uit het plan in één transactie (alles of niets). Vergrendelt eerst de betrokken huishoudens (in vaste
 * volgorde, zoals de app), en controleert dan of er sinds het overzicht niets wezenlijks veranderde.
 */
export async function voerUit(db, plan, pepper) {
  if (plan.weigeringen.length) throw new Error('Het overzicht bevat een weigering: er wordt niets verwijderd.');
  const ids = plan.accounts.map(a => a.id);
  await db.query('begin');
  try {
    const betrokken = uniek([...plan.huishoudens.map(h => h.id), ...plan.blijvend.map(b => b.huishouden)]).sort();
    for (const h of betrokken) await db.query('select private.lock_household($1)', [h]);
    const nu = await leesKern(db, { soort: plan.soort, adres: plan.adres, ook: plan.accounts.filter(a => a.rol !== 'verzoeker').map(a => a.adres),
      huishouden: plan.soort === 'huishouden' ? plan.huishoudens.find(h => h.reden === 'op verzoek van de eigenaar')?.id : undefined }, pepper);
    if (vingerafdruk(nu) !== vingerafdruk(plan)) throw new Error('Sinds het overzicht is er iets veranderd (accounts, huishoudens of lidmaatschappen). Er is niets verwijderd; begin opnieuw.');

    // Het huishouden op verzoek: alle inhoud gaat mee via de cascades (ook de lidmaatschappen van de partners).
    const opVerzoek = plan.huishoudens.filter(h => h.reden === 'op verzoek van de eigenaar').map(h => h.id);
    if (opVerzoek.length) await db.query('delete from public.households where id = any($1::uuid[])', [opVerzoek]);
    // De accounts, één voor één in vaste volgorde. De triggers van de database doen de rest (privé-afspraken,
    // persoonlijke spullen en documenten, het huishouden waar het account het enige account is), of weigeren.
    for (const id of [...ids].sort()) await db.query('delete from auth.users where id = $1', [id]);
    const naalden = naaldenVan(plan).map(n => n.waarde.toLowerCase());
    await db.query('delete from private.testers where email = any($1::text[])', [plan.adressen]);
    await db.query('delete from private.k1_codes where adres_hmac = any($1::text[]) or user_id = any($2::uuid[])', [plan.hashes, ids]);
    await db.query('delete from private.k1_accounts where adres_hmac = any($1::text[])', [plan.hashes]);
    // Uitnodigingen naar dit adres in andere huishoudens: ingetrokken en zonder adres (zoals intrekken in de app).
    await db.query(`update public.household_invites set revoked_at = coalesce(revoked_at, now()), invited_email = null
      where invited_email = any($1::text[])`, [plan.adressen]);
    // Gedeelde bestanden die het account uploadde, blijven bij het huishouden, zonder verwijzing naar het account.
    if (ids.length) await db.query(`update storage.objects set owner = null, owner_id = null
      where owner = any($1::uuid[]) or owner_id = any($2::text[])`, [ids, ids]);
    // Het auditlogboek van Supabase Auth bewaart adres en account-id, ook van een verwijderd account.
    await db.query(`delete from auth.audit_log_entries a where exists (select 1 from unnest($1::text[]) n
      where position(n in lower(a.payload::text)) > 0)`, [naalden]);
    // Realtime-seintjes over een verwijderd huishouden (of met een id van het account), als die er nog zijn.
    if (await tabelBestaat(db, 'realtime.messages')) {
      await db.query(`delete from realtime.messages m where exists (select 1 from unnest($1::text[]) n
        where position(n in lower(concat_ws(' ', m.topic, m.payload::text))) > 0)`, [naalden]);
    }
    await db.query('commit');
  } catch (e) {
    await db.query('rollback').catch(() => {});
    throw e;
  }
}

const tabelBestaat = async (db, naam) => (await rijen(db, 'select to_regclass($1) is not null as er', [naam]))[0].er;

/** Na het verwijderen: de bestanden opruimen (alleen als er bestanden waren) en controleren dat er niets meer is. */
export async function controleer(db, plan, { wachtMs = 60000 } = {}) {
  const fouten = [];
  const metBestanden = plan.spullen.filter(o => (o.bestanden ?? 0) > 0 || (o.persoonlijkeDocumenten?.length ?? 0) > 0);
  for (const o of metBestanden) fouten.push(...await spullenOpruimenNu(db, o, { wachtMs }));
  for (const o of plan.spullen.filter(o => !metBestanden.includes(o))) fouten.push(...await spullenNietsMeer(db, o));
  const z = await zoekResten(db, naaldenVan(plan));
  for (const t of z.treffers) fouten.push(`${t.tabel}: nog ${t.aantal} rij(en) met ${t.soort === 'account' ? 'een account-id' : t.soort === 'huishouden' ? 'een huishouden-id' : t.soort === 'adres' ? 'het adres' : 'de hash van het adres'}`);
  for (const t of z.onleesbaar) fouten.push(`niet te controleren: ${t}`);
  if (z.tabellen < 20) fouten.push(`de controle zag maar ${z.tabellen} tabellen: niet volledig`);
  return { fouten: uniek(fouten), tabellen: z.tabellen };
}

// ---------------------------------------------------------------------------------------------------------------------
// Opdrachtregel
// ---------------------------------------------------------------------------------------------------------------------

export function leesArgumenten(argv) {
  const v = { ook: [] };
  const f = [];
  for (let i = 0; i < argv.length; i++) {
    const [k, w] = [argv[i], argv[i + 1]];
    if (k === '--soort') { v.soort = w; i++; }
    else if (k === '--adres') { v.adres = w; i++; }
    else if (k === '--huishouden') { v.huishouden = w; i++; }
    else if (k === '--ook') { v.ook.push(...String(w ?? '').split(',').map(s => s.trim()).filter(Boolean)); i++; }
    else f.push(`onbekende optie: ${k}`);
  }
  if (!['huishouden', 'account'].includes(v.soort)) f.push('--soort moet huishouden of account zijn');
  if (!ADRES.test(schoonAdres(v.adres))) f.push('--adres is geen e-mailadres');
  for (const a of v.ook) if (!ADRES.test(schoonAdres(a))) f.push(`--ook ${a} is geen e-mailadres`);
  if (v.huishouden !== undefined && !UUID.test(v.huishouden)) f.push('--huishouden is geen id');
  return { verzoek: v, fouten: f };
}

/** Het overzicht als tekst (voor het scherm van de beheerder; met adressen, want daar wordt het verzoek op gecontroleerd). */
export function overzichtTekst(p) {
  const r = [];
  r.push(`Verzoek: ${p.soort === 'huishouden' ? '(a) heel huishouden' : '(b) alleen het eigen account'}, van ${p.adres}`);
  if (!p.accounts.length) r.push('Account: geen account bij dit adres; alleen de resten bij het adres worden opgeruimd.');
  for (const a of p.accounts) r.push(`Account ${a.rol}: ${a.adres}${a.adreswijziging ? ` (adreswijziging naar ${a.adreswijziging} loopt)` : ''}, id ${a.id}, ${a.bevestigd ? 'bevestigd' : 'onbevestigd'}, aangemaakt ${fmt(a.aangemaakt)}, laatst ingelogd ${fmt(a.laatst_ingelogd)}`);
  if (p.lidmaatschappen.length) {
    r.push('Lid van:');
    for (const m of p.lidmaatschappen) r.push(`  - "${m.naam}" (${m.huishouden}) als ${m.weergavenaam}, rol ${m.rol}, ${m.status}`);
  }
  for (const h of p.huishoudens) {
    r.push(`HUISHOUDEN WEG: "${h.naam}" (${h.id}), ${h.reden}`);
    for (const l of h.leden) r.push(`  lid ${l.weergavenaam} (${l.soort}, ${l.rol}, ${l.status}): ${l.account}`);
    r.push('  aantallen: ' + (Object.entries(h.aantallen).map(([t, n]) => `${t} ${n}`).join(', ') || 'geen rijen'));
  }
  for (const b of p.blijvend) {
    r.push(`HUISHOUDEN BLIJFT: "${b.naam}" (${b.huishouden}); van ${b.account} verdwijnen: ${b.verdwijnt.prive_afspraken} privé-afspraak/-afspraken, `
      + `${b.verdwijnt.persoonlijke_spullen} persoonlijk(e) spul(len), ${b.verdwijnt.persoonlijke_documenten} persoonlijk(e) document(en); de gedeelde gegevens blijven, het lid blijft zonder account`);
  }
  r.push(`Bij het adres: testerslijst ${p.resten.testerslijst}, uitnodigingen in andere huishoudens ${p.resten.uitnodigingen_elders}, codes ${p.resten.codes}, tellers van de grenzen ${p.resten.tellers_grenzen}`);
  r.push(`Pepper: ${p.pepperControle}`);
  if (p.sporenVooraf) r.push('Sporen nu (deze moeten na afloop allemaal weg zijn): ' + (p.sporenVooraf.map(t => `${t.tabel} ${t.aantal} (${t.soort})`).join(', ') || 'geen'));
  for (const w of p.weigeringen) r.push('WEIGERING: ' + w);
  return r.join('\n');
}
const fmt = d => d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '-';

async function verbind(omgeving) {
  const { KG_DB_URL: url, KG_REF: ref, PGPASSWORD: wachtwoord } = process.env;
  const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../tests/integratie/package.json'));
  const { Client } = require('pg');
  if (omgeving === 'lokaal') {
    // Alleen voor de tests: een lokale stack, zonder TLS.
    if (!/^postgres(ql)?:\/\/[^@/]*@(127\.0\.0\.1|localhost):\d+\//.test(url ?? '')) return { fouten: ['KG_OMGEVING=lokaal mag alleen naar 127.0.0.1 of localhost'] };
    const c = new Client({ connectionString: url, application_name: 'thuisplanner-verwijderen' });
    await c.connect();
    return { client: c, fouten: [] };
  }
  const fouten = [...omgevingFouten(omgeving, ref), ...verbindingFouten(url, ref, wachtwoord)];
  if (fouten.length) return { fouten };
  console.log('verbinding: ' + gemaskeerd(url));
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: true, ca: supabaseRoots() }, application_name: 'thuisplanner-verwijderen' });
  await c.connect();
  return { client: c, fouten: [] };
}

/** Eén regel van standaardinvoer (de getypte bevestiging); werkt ook als de invoer uit een pijp komt. */
function vraag(tekst) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    let klaar = false;
    rl.question(tekst, a => { klaar = true; rl.close(); resolve(a); });
    rl.on('close', () => { if (!klaar) resolve(''); });
  });
}

async function hoofd() {
  const omgeving = process.env.KG_OMGEVING ?? 'staging';
  const { verzoek, fouten } = leesArgumenten(process.argv.slice(2));
  const pepper = process.env.KG_PEPPER;
  if (!pepper) fouten.push('KG_PEPPER ontbreekt (verwijderen.ps1 vraagt hem)');
  console.log('omgeving: ' + omgeving);
  if (fouten.length) { console.log('GEWEIGERD vóór verbinden:\n- ' + fouten.join('\n- ')); return 2; }
  const v = await verbind(omgeving);
  if (v.fouten.length) { console.log('GEWEIGERD vóór verbinden:\n- ' + v.fouten.join('\n- ')); return 2; }
  const db = v.client;
  try {
    console.log('\n== 1. Alleen lezend: overzicht');
    const plan = await leesVerzoek(db, verzoek, pepper);
    console.log(overzichtTekst(plan));
    if (plan.weigeringen.length) { console.log('\nGEWEIGERD: er is niets verwijderd.'); return 3; }

    console.log('\n== 2. Bevestiging');
    const zin = `verwijder ${omgeving} ${plan.adres}`;
    const antwoord = await vraag(`Typ precies '${zin}' om alles hierboven te verwijderen (iets anders stopt): `);
    if (antwoord.trim() !== zin) { console.log('Geen bevestiging gegeven. Er is niets verwijderd.'); return 3; }

    console.log('\n== 3. Verwijderen (één transactie), daarna de bestanden');
    await voerUit(db, plan, pepper);
    console.log('Verwijderd.');

    console.log('\n== 4. Controle: niets meer aanwezig (account-id, huishouden-id, adres en de hash van het adres)');
    const c = await controleer(db, plan);
    const datum = new Date().toISOString().slice(0, 10);
    if (c.fouten.length) {
      console.log(`AFWIJKING (${c.tabellen} tabellen doorzocht):\n- ` + c.fouten.join('\n- '));
      console.log(`\nRegister: ${datum}, ${plan.soort === 'huishouden' ? 'heel huishouden' : 'eigen account'}, uitgevoerd MET AFWIJKING (zie hierboven)`);
      return 1;
    }
    console.log(`NIETS MEER AANWEZIG: ${c.tabellen} tabellen in ${SCHEMAS.join(', ')} doorzocht; Mijn spullen en bestanden leeg.`);
    console.log(`\nRegister (zonder persoonsgegevens): ${datum}, ${plan.soort === 'huishouden' ? 'heel huishouden' : 'eigen account'}, `
      + `${plan.huishoudens.length} huishouden(s) en ${plan.accounts.length} account(s) verwijderd, controle geslaagd`);
    return 0;
  } finally {
    await db.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  hoofd().then(c => process.exit(c), e => { console.log('FOUT: ' + String(e.message || e).replace(/password[^\s]*/gi, 'password ***')); process.exit(1); });
}
