# Thuisplanner

De nieuwe gezinsapp **Thuisplanner**, technisch gescheiden van Huisplan.

- **Ontwikkelrichting en gevolgen voor bestaande besluiten:** `docs/roadmap.md`, sectie
  "Ontwikkelrichting Thuisplanner".
- **Technisch bouwplan (KG-5A):** `docs/thuisplanner-bouwplan.md`.
- **Fundament (KG-1, verstevigd in KG-5B):** `docs/thuisplanner-fundament.md`.
- **Inhoud (KG-5C: afspraken, taken, boodschappen):** `docs/thuisplanner-inhoud.md`.
- **Synchronisatie (KG-5D) en de lokale demo:** `docs/thuisplanner-sync.md`.
- **React-app met echte synchronisatie (lokaal, fictief):** `docs/thuisplanner-app.md`.

## Wat hier staat

| Pad | Inhoud |
| --- | --- |
| `supabase/config.toml` | Supabase CLI-configuratie, alleen voor lokale ontwikkeling. Niet gekoppeld aan een project. |
| `supabase/migrations/` | Het databaseschema van Thuisplanner. KG-1: profielen, huishoudens, leden, uitnodigingen, rollen, toegangsrechten. KG-5B: account-ID's afgeschermd, account en huishouden verwijderen, limiet op huishoudens; herstelronde 1: vergrendelingsprotocol tegen races. KG-5C: afspraken (privé als "Bezet"), taken en boodschappen. |
| `supabase/tests/rls_tests.sql` | De RLS- en rechtentestmatrix (KG-T01 t/m KG-T50), in één transactie die wordt teruggedraaid. |
| `supabase/tests/tegenproeven.txt` | Sabotages: elke regel schakelt één beveiliging uit; de matrix moet dan op het genoemde scenario falen. |
| `supabase/tests/run.sh` | Bouwt een tijdelijke, lege PostgreSQL op, voert de migraties uit en draait de matrix (en met `--tegenproef` de tegenproeven). Met `--db <url>` op een draaiende lokale Supabase. |
| `sync/thuisplanner-sync.js` | Synchronisatielaag (framework-onafhankelijk): seintje → opnieuw ophalen, versiecontrole, herverbinden, wissen bij verlies van toegang. |
| `dev/` | Lokale demo: server (alleen 127.0.0.1, alleen de anon-sleutel), seed met fictieve accounts, twee panelen, e2e-test met Playwright. Zie `docs/thuisplanner-sync.md` §4. |
| `supabase/tests/integratie/` | Integratietest met supabase-js tegen een lokale Supabase: API, Auth (account verwijderen) en Realtime (niets lekt uit). Plus `gelijktijdig.test.mjs`: races met aparte databaseverbindingen (node-postgres), met tegenproef. |
| `supabase/tests/statisch.js` | Statische controles zonder database (naamgeving, RLS op elke tabel, security invoker in `public`, geen secrets, geen koppeling, Huisplan-bestanden ongewijzigd). |
| `supabase/tests/supabase_stub.sql` | Kopie van de Huisplan-nabootsing van de Supabase-onderdelen (auth, rollen, extensies), zodat deze map los staat. |

## Tests draaien

```sh
node thuisplanner/supabase/tests/statisch.js                 # zonder database
thuisplanner/supabase/tests/run.sh                           # matrix op een nabootsing: verwacht "56 van 56"
thuisplanner/supabase/tests/run.sh --tegenproef              # matrix + tegenproeven: verwacht "66 van 66"
thuisplanner/supabase/tests/run.sh --tegenproef --gelijktijdig  # + gelijktijdigheidstests (node, aparte verbindingen)
node tests/run.js thuisplanner                               # via de bestaande testrunner
```

`run.sh` vraagt PostgreSQL 16+ (`initdb`, `pg_ctl`, `psql`; standaard in `/usr/lib/postgresql/16/bin`,
anders `PGBIN=...`). Het script maakt een tijdelijke database in een tijdelijke map en ruimt die op.

Op een echte lokale Supabase (Docker nodig; nooit tegen een online project):

```sh
cd thuisplanner && npx supabase@2.117.0 start -x studio,imgproxy,storage-api,edge-runtime,logflare,vector,supavisor,postgres-meta
thuisplanner/supabase/tests/run.sh --db postgresql://postgres:postgres@127.0.0.1:55322/postgres --tegenproef
(cd thuisplanner/supabase/tests/integratie && npm ci) && SUPABASE="npx supabase@2.117.0" thuisplanner/supabase/tests/integratie/run.sh
cd thuisplanner && npx supabase@2.117.0 stop --no-backup
```

Matrix en tegenproeven lopen in een transactie die wordt teruggedraaid; de integratietest verwijdert
zijn eigen testaccounts. Beide weigeren een ander adres dan `127.0.0.1`/`localhost`.

In GitHub Actions draaien dezelfde controles via `.github/workflows/thuisplanner-db.yml`: op een tijdelijke
PostgreSQL op de runner, en (job `supabase-lokaal`) op een lokale Supabase-stack in Docker op de runner.
Zonder secrets en zonder verbinding met een online Supabase-project.

## Grenzen (KG-1 en KG-5B)

- **Geen koppeling met een bestaand project:** geen `supabase link` en geen `db push`. Er is ook geen
  verbinding met de Huisplan-projecten (`supabase/`).
- **Nog niet gebouwd:** geen deploy, geen app en geen inhoudstabellen (agenda, taken, boodschappen,
  vakantie).
- **Huisplan blijft ongemoeid:** `index.html`, `test/index.html`, `supabase/` en Firebase worden niet
  aangeraakt (gecontroleerd in `statisch.js`).

## Regels voor nieuwe databasecode en Edge Functions (toegangspoort, deel 2)

Alleen een sessie die met een code is gestart, krijgt toegang (zie `docs/thuisplanner-deel2-bouwverslag.md` §7).
Voor elke nieuwe migratie of functie geldt:

- **Database:**
  - Gebruik nooit `auth.uid()`, `auth.jwt()`, `auth.role()`, `auth.email()` of `current_setting('request.jwt…')`.
    Gebruik `private.require_uid()` of een van de poortfuncties (`has_role`, `is_active_member`, `my_household_ids`,
    `is_my_event`, `may_listen`).
  - Een policy gaat altijd via een poortfunctie.
  - Een view is altijd `security_invoker`.
  - Functies in `public` zijn `security invoker` en geven alleen door aan `private`.
- **Edge Functions:**
  - Gebruik de service-rol (`rpc` uit `_gedeeld/k1.ts`) alleen als de functie eerst controleert wie er aanroept:
    - met de handtekening van een hook;
    - met de grenzen van K1;
    - of met de sessie van de gebruiker via de database.
  - Een nieuwe functie met de service-rol moet op de lijst `SERVICE_ROL_TOEGESTAAN` in `supabase/tests/statisch.js`.
- **Bewaking:** dit wordt automatisch bewaakt:
  - KG-T71 en KG-T73 tot en met KG-T75 in de RLS-matrix (met tegenproeven);
  - `statisch.js`;
  - de nacontrole (`staging/verbinding-controle.mjs`, ook: `private` niet via de API).

  Een uitzondering kan alleen bewust: in de lijst `kg_zonder_poort` in `rls_tests.sql`, met een reden.
