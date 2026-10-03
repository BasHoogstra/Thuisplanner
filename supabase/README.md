# Supabase (fase 1)

De database van Huisplan wordt vanaf fase 1 vastgelegd in deze map. Elke schemawijziging is een
SQL-bestand in `migrations/`, gaat via git, en wordt eerst op **staging** toegepast en pas daarna op
**productie**. Wijzigingen via het dashboard (SQL-editor, tabeleditor) zijn niet de bedoeling; als
het toch gebeurt, moet het alsnog als migratie hier terechtkomen.

De app gebruikt nog geen Supabase. Tot en met stap 1.15 draait Huisplan op Firebase.

## Omgevingen

| Omgeving | Project-ref | URL | Regio | Data |
|---|---|---|---|---|
| **Productie** | `tmkhpiomdnneeoscsjge` | https://tmkhpiomdnneeoscsjge.supabase.co | eu-west-1 | leeg (geen rijen, geen gebruikers) |
| **Staging** | `rfgmaqqsjvsuibfucdrp` | https://rfgmaqqsjvsuibfucdrp.supabase.co | eu-west-1 | alleen testdata, nooit echte data |

Beide in de organisatie *Huisplan* (gratis abonnement). Let op: een gratis project wordt na een week
zonder activiteit gepauzeerd; staging moet dan in het dashboard weer worden gestart.

## Sleutels

- In de app komt alleen de **publieke sleutel** (`sb_publishable_…` of de oude `anon`-sleutel). Die
  is bedoeld om openbaar te zijn; de beveiliging zit in de RLS-regels in de database.
- De **service-role-sleutel** en de **secret keys** (`sb_secret_…`) komen nooit in de app, nooit in
  deze repository en nooit in een commit. Ze omzeilen alle beveiliging. Bewaar ze alleen in het
  Supabase-dashboard of in een lokale `.env` (staat in `.gitignore`).
- `tests/secrets.test.js` controleert bij elke testrun dat er geen geheime sleutel in de repository staat.

## Werken met migraties (Supabase CLI)

```
npx supabase login                                    # eenmalig, met je eigen account
npx supabase link --project-ref rfgmaqqsjvsuibfucdrp  # staging
npx supabase migration list                           # lokaal vs. staging
npx supabase db push --dry-run                        # wat zou er gebeuren?
npx supabase db push                                  # migraties toepassen op staging
```

Pas als staging klopt (zie *Controle* hieronder): dezelfde stappen met
`--project-ref tmkhpiomdnneeoscsjge` voor productie.

Nieuwe migratie: `npx supabase migration new korte_naam`, SQL schrijven, op staging toepassen,
controleren, committen.

### Regel: extensiefuncties altijd met `extensions.`

De Supabase CLI (`db push`, `db reset --linked`) logt in als de tijdelijke rol `cli_login_postgres`.
Die heeft geen eigen `search_path`, dus een migratie draait daar met `"$user", public`, **zonder**
`extensions`. Het dashboard en de Claude-koppeling draaien als `postgres`, met
`"$user", public, extensions`. Een functie uit een extensie zonder schemanaam werkt dus wel via het
dashboard, maar faalt via de CLI (`function gen_random_bytes(integer) does not exist`).

Daarom in elke migratie:
- extensies expliciet: `create extension if not exists <naam> with schema extensions;`
- functies uit extensies volledig: `extensions.gen_random_bytes(…)`, `extensions.crypt(…)`,
  `extensions.uuid_generate_v4()` enzovoort. (`gen_random_uuid()` zit in Postgres zelf en mag zonder.)

`tests/supabase.test.js` faalt als een migratie een bekende extensiefunctie zonder `extensions.` gebruikt.

### Regel: migraties altijd met LF-regeleinden

Postgres bewaart de tekst van functies letterlijk, inclusief regeleinden. Wordt een migratie vanaf
een Windows-checkout met CRLF uitgevoerd (`core.autocrlf`), dan krijgen de functies op die database
CR-tekens in hun definitie. Ze werken hetzelfde, maar de schema-vingerafdruk wijkt dan af van
productie (gezien bij stap 1.1 op staging: alle zes functies). Daarom:

- `.gitattributes` bevat `*.sql text eol=lf`, zodat SQL-bestanden overal met LF worden uitgecheckt;
- `tests/supabase.test.js` faalt als een migratiebestand op schijf een CR bevat.

Een bestaande Windows-checkout eenmalig normaliseren (zonder lokale wijzigingen):
`git pull`, `git rm --cached -r supabase`, `git reset --hard`.

### Uitzondering op migratie 20261002064401

Migraties die al in productie zijn uitgevoerd veranderen we normaal nooit. Voor
`20261002064401_huishoudens_leden_items.sql` is één keer een bewuste uitzondering gemaakt
(fase 1, stap 1.1), omdat `db reset --linked` op staging er anders op vastliep:

- toegevoegd: `create extension if not exists pgcrypto with schema extensions;`
- gewijzigd: `gen_random_bytes(18)` → `extensions.gen_random_bytes(18)` (standaardwaarde van
  `household_invites.token`)

| | md5 van het bestand |
|---|---|
| Zoals in productie uitgevoerd (2 okt 2026) | `d8f582e182523642a7c907c69f8190f7` |
| Huidige versie in Git | `8e265fb9a05a12149af7737e43174b6b` |

Gevolgen:
- **De migratiehistorie van productie wijkt tekstueel af van Git.** In
  `supabase_migrations.schema_migrations.statements` staat voor deze versie nog de oude tekst. Dat
  is bewust zo gelaten.
- **Het resulterende schema hoort gelijk te zijn.** In productie verwijst de standaardwaarde van
  `household_invites.token` al naar `extensions.gen_random_bytes` (gecontroleerd met een leeg
  `search_path`), en `pgcrypto` staat er al in `extensions`. De vingerafdruk hieronder moet dus op
  staging en productie gelijk zijn.
- **Productie voert dit bestand niet opnieuw uit.** De CLI vergelijkt alleen versienummers; versie
  `20261002064401` staat al in productie.

## Controle: staging gelijk aan productie

`tests/schema_fingerprint.sql` geeft een vingerafdruk van het app-schema (`public` en `private`):
tabellen, kolommen, constraints, indexen, RLS-regels, functies (definitie en rechten), triggers,
rechten op tabellen en schema's, en realtime. Draai het in beide projecten (SQL-editor of CLI); de
regel `TOTAAL` moet gelijk zijn. Het script leest alleen.

Referentie productie op 2 oktober 2026 (na de twee migraties): **97 onderdelen,
md5 `3e81d04cd0775634d6bac6604db9aa3d`**.

| Controle | Datum | Staging | Productie |
|---|---|---|---|
| Na `supabase db reset --linked` vanuit LF-checkout (stap 1.1 afgerond) | 3 okt 2026 | 97, `3e81d04c…aa3d` | 97, `3e81d04c…aa3d` |

Staging is daarmee aantoonbaar volledig reproduceerbaar uit `supabase/migrations/`.

Vanaf stap 1.2 telt de vingerafdruk ook de RLS-regels op `storage.objects`, de bucket
`household-files` en de standaardrechten in `public` mee. De referentiewaarde hierboven (97) hoort bij
de versie van het script uit stap 1.1; vergelijk altijd twee databases met dezelfde versie van het script.

| Controle (script 1.2) | Datum | Staging | Productie |
|---|---|---|---|
| Na `db reset --linked` met migraties t/m `20261003090000` (staging) | 3 okt 2026 | 169, `2780289b…36b3` | 103, `11e207d4…26e9` (nog zonder 1.2; zoals 1.1: 97, `3e81d04c…aa3d`) |

Na het toepassen van `20261003090000` op productie hoort productie 169, `2780289b…36b3` te geven.

## Stap 1.2: leden, sync, import en bestanden

Migratie `20261003090000_leden_sync_import_opslag.sql`. Alleen databasefundering; de app gebruikt
Supabase nog niet.

### Ledenmodel
- **`household_members.id` is het member-ID**: de vaste identiteit van een persoon in het
  huishouden. `user_id` is alleen de optionele koppeling met een account.
- Leden zonder account (kinderen, een partner die nog niet is aangemeld) zijn volwaardige leden.
- Velden: `display_name` (verplicht), `kind` (`adult`/`child`), `color` (`#RRGGBB`), `sort`,
  `legacy_names` (oude namen uit Firebase, voor de import), `linked_at`, `created_at`, `joined_at`.
- Een account hoort per huishouden bij hoogstens één lid. Koppelen gaat **alleen** via
  `accept_invite`; via de API kan niemand zelf een `user_id` invullen of wijzigen.
- Uitnodiging met `member_id` koppelt het account aan dat bestaande lid (er ontstaat geen tweede
  "Sanne"); zonder `member_id` ontstaat een nieuw lid met de opgegeven naam.

### Rollen
| Technisch | In de app | Mag |
|---|---|---|
| `owner` | beheerder | alles: huishouden hernoemen/verwijderen, leden toevoegen/aanpassen/verwijderen, uitnodigen, importeren |
| `member` | gezinslid | items lezen en schrijven, eigen naam en kleur aanpassen |

- Er kunnen meerdere beheerders zijn: Bas en Sanne zijn allebei `owner`. Een uitnodiging is
  standaard voor een beheerder.
- Een beheerder heeft altijd een account (`check`), en een huishouden houdt altijd minstens één
  beheerder met account (trigger `members_ensure_owner`, gecontroleerd aan het eind van de transactie).
  Het hele huishouden verwijderen mag wel.
- `leave_household`: je account wordt losgekoppeld, het lid en de data blijven bestaan. De laatste
  beheerder kan dat pas na `transfer_ownership` (ander lid met account wordt beheerder, jij gewoon lid).

### Synchronisatie (`items`)
- `deleted_at`: verwijderen = grafsteen zetten. Echt verwijderen kan via de API niet meer (geen
  delete-regel); alleen met het hele huishouden mee of via de server.
- `rev`: begint op 1 en telt bij elke wijziging op (trigger), voor conflictdetectie.
- `created_at`/`created_by` worden bij aanmaken gezet en blijven daarna gelijk;
  `updated_at`/`updated_by` bij elke wijziging. `household_id`, `coll` en `id` zijn onveranderlijk.
- Index `(household_id, updated_at)` voor "alles sinds" bestond al.

### Import en bestanden
- `legacy_imports`: de oude Firebase-planner ongewijzigd (`raw`), met `source_hash` (sha256, uniek
  per huishouden), `counts` en `status`. Alleen beheerders zien en maken ze; alleen status
  `received` mag via de API (de importfunctie van 1.12 zet de rest).
- Bucket `household-files` (privé, max 10 MB, afbeeldingen en pdf). Pad `{household_id}/…`; alleen
  leden van dat huishouden mogen lezen/schrijven. Een pad dat niet met een geldige uuid-map begint,
  geeft geen toegang.

### Beveiliging
- `anon` heeft geen rechten meer op onze tabellen en functies; ook niet op toekomstige tabellen in
  `public` (standaardrechten aangepast). `authenticated` kan geen `truncate`, `references` of
  `trigger` meer (truncate omzeilt RLS).
- Functies met extra rechten (security definer) staan in schema `private`, dat niet via de API
  bereikbaar is. In `public` staan alleen dunne functies zonder extra rechten (`create_household`,
  `accept_invite`, `transfer_ownership`, `leave_household`). Daarmee verdwijnen de twee
  adviseurmeldingen uit 1.1, terwijl de controles zelf in de private functies zitten.
- Bestandsregels op `storage.objects` worden op Supabase toegestaan via `supautils`
  (`postgres` is lid van `supabase_privileged_role`).

### Tests
- `tests/rls_tests.sql`: 20 scenario's met Bas (beheerder), Sanne (wordt via uitnodiging aan haar
  bestaande lid gekoppeld), Kees (nieuw lid via uitnodiging), Eve (buitenstaander), Lynn en Loïs
  (kinderen zonder account), plus anon. Eén transactie met `rollback`: er blijft niets achter.
  Veilig op staging (SQL-editor of `psql`), nooit op productie.
- `tests/lokaal/run.sh`: bouwt met een lokale PostgreSQL 16+ een lege database op uit
  `supabase/migrations/` (met `tests/lokaal/supabase_stub.sql` als nagebootste Supabase-omgeving),
  toont de vingerafdruk en draait de RLS-tests. Ook onderdeel van `node tests/run.js` als
  PostgreSQL aanwezig is.

## Migraties

| Versie | Naam | Wat |
|---|---|---|
| `20261002064401` | `huishoudens_leden_items` | Tabellen `households`, `household_members`, `household_invites`, `items`; RLS; `create_household`, `accept_invite`; realtime op `items` |
| `20261002064437` | `beveiliging_en_indexen_aanscherpen` | Hulpfuncties naar schema `private`, RLS-regels opnieuw met `(select auth.uid())`, rol-bescherming, indexen op verwijzingen |
| `20261003090000` | `leden_sync_import_opslag` | Stap 1.2: member-ID en leden zonder account, beheerders, uitnodiging per lid, grafstenen en revisies, `legacy_imports`, bucket `household-files`, anon-rechten ingetrokken, definer-functies naar `private` |

`20261002064437` is letterlijk de SQL die op 2 oktober 2026 in productie is uitgevoerd (md5 gelijk
aan `supabase_migrations.schema_migrations`). `20261002064401` was dat ook, tot de bewuste
uitzondering hierboven.
