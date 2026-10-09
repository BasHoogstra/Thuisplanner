# KomtGoed (werknaam)

De nieuwe gezinsapp, technisch gescheiden van Huisplan. De definitieve merknaam is nog niet gekozen;
"komtgoed" is alleen een werknaam en mag later overal worden vervangen.

- **Ontwikkelrichting en gevolgen voor bestaande besluiten:** `docs/roadmap.md`, sectie
  "Ontwikkelrichting KomtGoed".
- **Fundament (KG-1):** `docs/komtgoed-fundament.md`.

## Wat hier staat

| Pad | Inhoud |
| --- | --- |
| `supabase/config.toml` | Supabase CLI-configuratie, alleen voor lokale ontwikkeling. Niet gekoppeld aan een project. |
| `supabase/migrations/` | Het databaseschema van KomtGoed. KG-1: profielen, huishoudens, leden, uitnodigingen, rollen, toegangsrechten. |
| `supabase/tests/rls_tests.sql` | De RLS- en rechtentestmatrix (KG-T01 t/m KG-T22), in één transactie die wordt teruggedraaid. |
| `supabase/tests/tegenproeven.txt` | Sabotages: elke regel schakelt één beveiliging uit; de matrix moet dan op het genoemde scenario falen. |
| `supabase/tests/run.sh` | Bouwt een tijdelijke, lege PostgreSQL op, voert de migraties uit en draait de matrix (en met `--tegenproef` de tegenproeven). |
| `supabase/tests/statisch.js` | Statische controles zonder database (naamgeving, RLS op elke tabel, security invoker in `public`, geen secrets, geen koppeling, Huisplan-bestanden ongewijzigd). |
| `supabase/tests/supabase_stub.sql` | Kopie van de Huisplan-nabootsing van de Supabase-onderdelen (auth, rollen, extensies), zodat deze map los staat. |

## Tests draaien

```sh
node komtgoed/supabase/tests/statisch.js                 # zonder database
komtgoed/supabase/tests/run.sh                           # matrix: verwacht "22 van 22"
komtgoed/supabase/tests/run.sh --tegenproef              # matrix + tegenproeven: verwacht "14 van 14"
node tests/run.js komtgoed                               # via de bestaande testrunner
```

`run.sh` vraagt PostgreSQL 16+ (`initdb`, `pg_ctl`, `psql`; standaard in `/usr/lib/postgresql/16/bin`,
anders `PGBIN=...`). Het script maakt een tijdelijke database in een tijdelijke map en ruimt die op.

In GitHub Actions draaien dezelfde controles via `.github/workflows/komtgoed-db.yml`. Dat gebeurt op
een tijdelijke PostgreSQL op de runner, zonder secrets en zonder verbinding met Supabase.

## Grenzen (KG-1)

- **Geen koppeling met een bestaand project:** geen `supabase link` en geen `db push`. Er is ook geen
  verbinding met de Huisplan-projecten (`supabase/`).
- **Nog niet gebouwd:** geen deploy, geen app en geen inhoudstabellen (agenda, taken, boodschappen,
  vakantie).
- **Huisplan blijft ongemoeid:** `index.html`, `test/index.html`, `supabase/` en Firebase worden niet
  aangeraakt (gecontroleerd in `statisch.js`).
