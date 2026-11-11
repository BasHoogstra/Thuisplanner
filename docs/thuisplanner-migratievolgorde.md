# Thuisplanner: migratievolgorde

Vastgelegd op 1 november 2026, bij de herstelronde na de onafhankelijke review (PR #48). Bron: de migraties in de
repository, de toegepaste stand op staging, en de branches van de andere werksporen.

## Regel

Supabase past migraties toe in de volgorde van hun versie (de tijdstempel). Een migratie met een **lager** nummer dan de
laatst toegepaste wordt "buiten de volgorde" en weigert de CLI zonder extra vlag. Daarom krijgt een nieuwe migratie altijd
een versie **na de laatst toegepaste op staging**, en vóór de nummers die andere werksporen al gereserveerd hebben, tenzij
die eerder online gaan. Een eenmaal toegepaste migratie wordt nooit herschreven of hernummerd.

## Stand

| Versie | Migratie | Stand |
| --- | --- | --- |
| `20261009120000` … `20261024120000` | KG-1 t/m de automatische uitnodigingsmail (16 migraties) | toegepast op staging |
| `20261025120000` | Vakanties | toegepast op staging (stap 9b) |
| `20261026120000` | Boodschappen "Later nodig" | toegepast op staging (stap 9b) |
| `20261027120000` | Extra inpaklijsten | toegepast op staging (stap 9b); **laatst toegepaste** (19 migraties) |
| **`20261027180000`** | **Herstel bezorgmeldingen** (PR #48) | in `thuisplanner-beta` (PR #54); nog niet toegepast |
| `20261028120000` | Vakanties-reviewpunten (V1.1) | gereserveerd; volgens de hoofdlijnsessie niet nodig (herstel in app en sync), nog niet geschreven |
| `20261029120000` | Mijn spullen & Documenten | in `thuisplanner-beta` (PR #54); nog niet toegepast |
| `20261029130000` | Spullen: taken alleen bij gedeelde spullen (privacyherstel `tasks.possession_id`, optie A) | in `thuisplanner-beta` (PR #54); nog niet toegepast; hoort onlosmakelijk bij `20261029120000` |
| `20261030120000` | Afsprakenmodel (A2, met A1) | **niet in de repository van de bèta**: op `thuisplanner-a2-afsprakenmodel`; buiten de gezinsbèta (besluit Bas, 10 november). Krijgt bij integratie een nieuw nummer na de laatst toegepaste |
| `20261111120000` | Plannen (besluit 18) | in `thuisplanner-beta` (PR #54); nog niet toegepast; **laatste in de repository** (23 migraties) |

## Waarom `20261027180000` voor de herstelmigratie

- De herstelmigratie is een reparatie van wat al op staging draait; ze hoort als eerste mee met de volgende uitrol.
- Met een versie direct na `20261027120000` en vóór 28, 29 en 30 komt **geen enkele** migratie buiten de volgorde, in
  welke volgorde de andere werksporen ook online gaan.
- Ze was nog nergens toegepast; het eerdere voorstel `20261031120000` is daarom zonder gevolgen hernummerd.

## Gevolgen voor de andere werksporen

- **Mijn spullen (29):** na het samenvoegen met deze herstelmigratie wordt de stand 21 migraties. De schemareferentie
  van stand 29 bouwt dan voort op `20261027180000` (private +1 relatie en +1 functie ten opzichte van stand 27), en
  `verbinding.ps1` verwacht 21. De bouwsessie werkt dat bij bij haar eigen samenvoeging.
- **Vakanties (28):** vervalt het nummer, dan verandert er niets. Komt er toch een migratie 28, dan komt die na
  `20261027180000` (geen conflict).
- **Agenda (30):** krijgt een versie na de laatste die dan in de repository staat.

## Bij elke nieuwe migratie bijwerken

`staging/verbinding-controle.mjs` (`SCHEMA_PER_STAND`, gemeten op een lege lokale database), `staging/verbinding.ps1`
(`$VerwachtAantal`), `tests/integratie/nacontrole.test.mjs` (de verschillen per stand), en dit overzicht.

**Automatisch bewaakt** (`tests/statisch.js`, "migraties: repository, overzicht, schemareferenties en het uitrolscript
stemmen overeen", met tegenproeven): elke migratie staat in dit overzicht; `$VerwachtAantal` is het aantal migraties;
de laatste migratie heeft een gemeten referentie in `SCHEMA_PER_STAND`, en elke referentie hoort bij een bestaande
migratie. Bijgewerkt op 11 november 2026 (review PR #54): het script verwachtte nog 20 migraties en dit overzicht miste
Plannen.
