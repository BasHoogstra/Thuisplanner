# KomtGoed (werknaam)

De nieuwe gezinsapp, technisch gescheiden van Huisplan. De definitieve merknaam is nog niet gekozen;
"komtgoed" is alleen een werknaam en mag later overal worden vervangen.

- **Ontwikkelrichting en gevolgen voor bestaande besluiten:** `docs/roadmap.md`, sectie
  "Ontwikkelrichting KomtGoed".
- **Technisch bouwplan (KG-5A):** `docs/komtgoed-bouwplan.md`.
- **Fundament (KG-1, verstevigd in KG-5B):** `docs/komtgoed-fundament.md`.

## Wat hier staat

| Pad | Inhoud |
| --- | --- |
| `supabase/config.toml` | Supabase CLI-configuratie, alleen voor lokale ontwikkeling. Niet gekoppeld aan een project. |
| `supabase/migrations/` | Het databaseschema van KomtGoed. KG-1: profielen, huishoudens, leden, uitnodigingen, rollen, toegangsrechten. KG-5B: account-ID's afgeschermd, account en huishouden verwijderen, limiet op huishoudens. |
| `supabase/tests/rls_tests.sql` | De RLS- en rechtentestmatrix (KG-T01 t/m KG-T27), in één transactie die wordt teruggedraaid. |
| `supabase/tests/tegenproeven.txt` | Sabotages: elke regel schakelt één beveiliging uit; de matrix moet dan op het genoemde scenario falen. |
| `supabase/tests/run.sh` | Bouwt een tijdelijke, lege PostgreSQL op, voert de migraties uit en draait de matrix (en met `--tegenproef` de tegenproeven). Met `--db <url>` op een draaiende lokale Supabase. |
| `supabase/tests/integratie/` | Integratietest met supabase-js tegen een lokale Supabase: API, Auth (account verwijderen) en Realtime (niets lekt uit). |
| `supabase/tests/statisch.js` | Statische controles zonder database (naamgeving, RLS op elke tabel, security invoker in `public`, geen secrets, geen koppeling, Huisplan-bestanden ongewijzigd). |
| `supabase/tests/supabase_stub.sql` | Kopie van de Huisplan-nabootsing van de Supabase-onderdelen (auth, rollen, extensies), zodat deze map los staat. |

## Tests draaien

```sh
node komtgoed/supabase/tests/statisch.js                 # zonder database
komtgoed/supabase/tests/run.sh                           # matrix op een nabootsing: verwacht "27 van 27"
komtgoed/supabase/tests/run.sh --tegenproef              # matrix + tegenproeven: verwacht "22 van 22"
node tests/run.js komtgoed                               # via de bestaande testrunner
```

`run.sh` vraagt PostgreSQL 16+ (`initdb`, `pg_ctl`, `psql`; standaard in `/usr/lib/postgresql/16/bin`,
anders `PGBIN=...`). Het script maakt een tijdelijke database in een tijdelijke map en ruimt die op.

Op een echte lokale Supabase (Docker nodig; nooit tegen een online project):

```sh
cd komtgoed && npx supabase@2.117.0 start -x studio,imgproxy,storage-api,edge-runtime,logflare,vector,supavisor,postgres-meta
komtgoed/supabase/tests/run.sh --db postgresql://postgres:postgres@127.0.0.1:55322/postgres --tegenproef
(cd komtgoed/supabase/tests/integratie && npm ci) && SUPABASE="npx supabase@2.117.0" komtgoed/supabase/tests/integratie/run.sh
cd komtgoed && npx supabase@2.117.0 stop --no-backup
```

Matrix en tegenproeven lopen in een transactie die wordt teruggedraaid; de integratietest verwijdert
zijn eigen testaccounts. Beide weigeren een ander adres dan `127.0.0.1`/`localhost`.

In GitHub Actions draaien dezelfde controles via `.github/workflows/komtgoed-db.yml`: op een tijdelijke
PostgreSQL op de runner, en (job `supabase-lokaal`) op een lokale Supabase-stack in Docker op de runner.
Zonder secrets en zonder verbinding met een online Supabase-project.

## Grenzen (KG-1 en KG-5B)

- **Geen koppeling met een bestaand project:** geen `supabase link` en geen `db push`. Er is ook geen
  verbinding met de Huisplan-projecten (`supabase/`).
- **Nog niet gebouwd:** geen deploy, geen app en geen inhoudstabellen (agenda, taken, boodschappen,
  vakantie).
- **Huisplan blijft ongemoeid:** `index.html`, `test/index.html`, `supabase/` en Firebase worden niet
  aangeraakt (gecontroleerd in `statisch.js`).
