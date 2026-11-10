// Thuisplanner-staging: het deel van Mijn spullen & Documenten in de verwijderprocedure op verzoek (A9,
// docs/thuisplanner-beta-voorbereiding.md §5.4). Het verwijderscript van A9 roept deze drie functies aan; zelf verwijdert
// dit bestand geen rijen. De regels staan in de database (migratie 29) en blijven daar:
// - persoonlijke spullen en documenten verdwijnen met het account, en bij het verlaten van een huishouden;
// - gedeelde spullen en documenten blijven zolang het huishouden bestaat;
// - een verwijderd huishouden neemt al zijn spullen, documenten en koppelingen mee (cascade).
// Een cascade wist geen bestanden. Die ruimt de bestaande opruimronde op (private.documenten_opruimen_ronde, ook dagelijks
// via pg_cron); A9 roept haar direct na het verwijderen aan, zodat de controle "niets meer aanwezig" meteen kan.
//
// Volgorde in A9:
//   const o = await spullenOverzicht(db, { huishouden }) of ({ account })   // vóór het verwijderen, alleen lezend
//   ... getypte bevestiging, dan het verwijderen zelf (delete_household of het account) ...
//   const fouten = await spullenOpruimenNu(db, o)                             // [] = niets meer aanwezig
//
// db is een verbonden pg-client met de rechten van postgres (zoals export.mjs).
//
// STATUS (30 oktober 2026): voorbereidend. Nog NIET geïntegreerd met A9 (dat script bestaat nog niet). Bewezen is alleen
// het deel van Mijn spullen, lokaal, in tests/integratie/verwijderen-spullen.test.mjs (de stappen van A9 nagespeeld). De
// volledige verwijdering van een account of huishouden is daarom nog niet end-to-end gevalideerd: dat vraagt A9 met
// zijn eigen integratietest en de proef op de bèta (§5.4).

const BUCKET = 'documenten';

/**
 * Alleen lezend, vóór het verwijderen: wat er van Mijn spullen weg zal gaan, en wat de controle daarna nodig heeft.
 * - { huishouden }: alle spullen, documenten, koppelingen en bestanden van dat huishouden.
 * - { account }: de persoonlijke spullen en documenten van dat account (in alle huishoudens), en de huishoudens waar het
 *   lid van is. Of zo'n huishouden helemaal meegaat, bepaalt de database bij het verwijderen; de controle kijkt daarna.
 */
export async function spullenOverzicht(db, doel) {
  if (doel?.huishouden) {
    const h = doel.huishouden;
    const tel = async q => Number((await db.query(q, [h])).rows[0].n);
    return {
      soort: 'huishouden', huishouden: h,
      spullen: await tel('select count(*) as n from public.possessions where household_id = $1'),
      documenten: await tel('select count(*) as n from public.documents where household_id = $1'),
      koppelingen: await tel('select count(*) as n from public.document_links where household_id = $1'),
      bestanden: await tel(`select count(*) as n from storage.objects where bucket_id = '${BUCKET}' and name like $1::text || '/%'`),
    };
  }
  if (doel?.account) {
    const a = doel.account;
    const docs = (await db.query(`select id, storage_path from public.documents where visibility = 'private' and owner_user_id = $1`, [a])).rows;
    const spullen = (await db.query(`select id from public.possessions where visibility = 'private' and owner_user_id = $1`, [a])).rows;
    const huishoudens = (await db.query('select distinct household_id from public.household_members where user_id = $1', [a])).rows;
    return {
      soort: 'account', account: a,
      persoonlijkeDocumenten: docs.map(d => ({ id: d.id, pad: d.storage_path })),
      persoonlijkeSpullen: spullen.map(s => s.id),
      huishoudens: huishoudens.map(h => h.household_id),
    };
  }
  throw new Error('spullenOverzicht: geef { huishouden } of { account }');
}

/**
 * Na het verwijderen: is er van Mijn spullen niets meer dat weg moest? Geeft de afwijkingen; leeg = in orde.
 * Een huishouden dat er nog is (bij { account }), houdt zijn gedeelde spullen en documenten; dat is bedoeld.
 */
export async function spullenNietsMeer(db, o) {
  const f = [];
  const een = async (q, p) => Number((await db.query(q, p)).rows[0].n);
  const leegHuishouden = async h => {
    for (const t of ['possessions', 'documents', 'document_links']) {
      const n = await een(`select count(*) as n from public.${t} where household_id = $1`, [h]);
      if (n) f.push(`huishouden ${h}: nog ${n} rij(en) in ${t}`);
    }
    const n = await een(`select count(*) as n from storage.objects where bucket_id = '${BUCKET}' and name like $1::text || '/%'`, [h]);
    if (n) f.push(`huishouden ${h}: nog ${n} bestand(en) in Storage`);
  };
  if (o?.soort === 'huishouden') {
    if (await een('select count(*) as n from public.households where id = $1', [o.huishouden])) f.push(`huishouden ${o.huishouden} bestaat nog`);
    await leegHuishouden(o.huishouden);
  } else if (o?.soort === 'account') {
    const docIds = o.persoonlijkeDocumenten.map(d => d.id);
    const paden = o.persoonlijkeDocumenten.map(d => d.pad);
    const nd = await een('select count(*) as n from public.documents where id = any($1::uuid[])', [docIds]);
    if (nd) f.push(`nog ${nd} persoonlijk(e) document(en) van het account`);
    const ns = await een('select count(*) as n from public.possessions where id = any($1::uuid[])', [o.persoonlijkeSpullen]);
    if (ns) f.push(`nog ${ns} persoonlijk(e) spul(len) van het account`);
    const nb = await een(`select count(*) as n from storage.objects where bucket_id = '${BUCKET}' and name = any($1::text[])`, [paden]);
    if (nb) f.push(`nog ${nb} bestand(en) van persoonlijke documenten in Storage`);
    for (const h of o.huishoudens) {
      if (!(await een('select count(*) as n from public.households where id = $1', [h]))) await leegHuishouden(h);
    }
  } else {
    throw new Error('spullenNietsMeer: geef het overzicht van spullenOverzicht');
  }
  return f;
}

/**
 * Direct na het verwijderen: de bestaande opruimronde aanroepen (dezelfde als de dagelijkse) en wachten tot er niets meer
 * is. Geeft de afwijkingen die na de wachttijd over zijn; leeg = in orde. Een ronde die niets kon aanroepen (geen pg_net
 * of Vault) is een afwijking: dan is de procedure niet af.
 */
export async function spullenOpruimenNu(db, o, { wachtMs = 60000, stapMs = 1000 } = {}) {
  const aangeroepen = (await db.query('select private.documenten_opruimen_ronde() as r')).rows[0].r;
  if (aangeroepen !== true) return ['de opruimronde kon niet worden aangeroepen (pg_net of Vault ontbreekt)'];
  const eind = Date.now() + wachtMs;
  let f = await spullenNietsMeer(db, o);
  while (f.length && Date.now() < eind) {
    await new Promise(r => setTimeout(r, stapMs));
    f = await spullenNietsMeer(db, o);
  }
  return f;
}
