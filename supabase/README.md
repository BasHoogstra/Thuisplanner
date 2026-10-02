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

## Controle: staging gelijk aan productie

`tests/schema_fingerprint.sql` geeft een vingerafdruk van het app-schema (`public` en `private`):
tabellen, kolommen, constraints, indexen, RLS-regels, functies (definitie en rechten), triggers,
rechten op tabellen en schema's, en realtime. Draai het in beide projecten (SQL-editor of CLI); de
regel `TOTAAL` moet gelijk zijn. Het script leest alleen.

Referentie productie op 2 oktober 2026 (na de twee migraties): **97 onderdelen,
md5 `3e81d04cd0775634d6bac6604db9aa3d`**.

## Migraties

| Versie | Naam | Wat |
|---|---|---|
| `20261002064401` | `huishoudens_leden_items` | Tabellen `households`, `household_members`, `household_invites`, `items`; RLS; `create_household`, `accept_invite`; realtime op `items` |
| `20261002064437` | `beveiliging_en_indexen_aanscherpen` | Hulpfuncties naar schema `private`, RLS-regels opnieuw met `(select auth.uid())`, rol-bescherming, indexen op verwijzingen |

Beide bestanden zijn letterlijk de SQL die op 2 oktober 2026 in productie is uitgevoerd
(gecontroleerd met md5 tegen `supabase_migrations.schema_migrations`).
