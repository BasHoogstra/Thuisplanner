# Thuisplanner H0: lokale hersteltest (17 oktober 2026)

**Status:** ✅ geslaagd. Alleen lokaal, met uitsluitend fictieve gegevens. Geen externe diensten, geen nieuwe software,
en geen wijzigingen aan staging, de repository-code of andere omgevingen. Eén bevinding (H0-1) is direct van belang
voor de echte back-up.

## Opzet

| Onderdeel | Waarde |
| --- | --- |
| Bron | De lokale stack `thuisplanner_k12` (PostgreSQL 17.11, de 12 migraties) |
| Gegevens | Het fictieve gezin De Boer (`scripts/lokaal.mjs seed`), aangevuld via de gewone functies met: een uitnodiging op adres (deel 1b), een gearchiveerd lid en een privé-afspraak. Daarnaast de fictieve accounts van eerdere metingen (`@test.invalid`) |
| Herstelplek | Een **tweede**, lege lokale stack `thuisplanner_herstel` (eigen poorten 54430–54434), opgebouwd met de 12 migraties uit de repository |
| Export | `pg_dump` 17.11 in de databasecontainer, alleen gegevens. Twee delen: `public` en `private`, en `auth.users` met `auth.identities`. Sessies en refresh-tokens bewust niet: na een herstel logt iedereen opnieuw in |
| Versleuteling | OpenSSL CMS, AES-256-GCM, met de sleutel verpakt via RSA-4096. Versleuteld met alleen het publieke certificaat; de privésleutel stond apart ("offline") |
| Integriteit | SHA-256 van de export, gecontroleerd na het ontsleutelen |
| Laden | In één transactie, met `session_replication_role = replica`: geen triggers, en verwijzingen pas aan het eind consistent |

## Resultaten

| # | Controle | Uitkomst |
| --- | --- | --- |
| 1 | Export | 35.120 bytes, 14 tabellen, in 3 s |
| 2 | Versleuteld bestand | Geen enkel e-mailadres leesbaar; het type is `authEnvelopedData` (AES-GCM) |
| 3 | Ontsleutelen, plus de SHA-256-controle | OK |
| 4 | Laden in de herstelplek | Zonder fouten, in één transactie, ongeveer 1 s. De opbouw van de lege stack duurde 40 s. **Totale hersteltijd (lokaal, klein): onder 1 minuut** |
| 5 | Vingerafdruk: per tabel het aantal rijen en een md5 over alle rijen, plus `auth.users`, `auth.identities`, de migratiegeschiedenis en de geplande taken | **16 van 16 gelijk** |
| 6 | Nacontrole (`verbinding-controle.mjs`, `leesNa` en `naFouten`) | Geen afwijkingen. Het schema, de RLS, de rechten, de Realtime-policy, beide geplande taken en de opruiming van adressen zijn zoals bedoeld |
| 7 | RLS-matrix op de herstelde kopie | **64 van 64** |
| 8 | Inloggen op bron en kopie, met per account vergeleken: lidmaatschappen, huishoudens, zichtbare details, uitnodigingen (beheer) en "Uitnodigingen voor jou" | **Gelijk voor Eva, Thomas en Sanne.** Eva ziet haar privé-afspraak, Thomas niet. Thomas ziet alleen zijn eigen privé-afspraak. Sanne (nog zonder huishouden) ziet na het herstel automatisch de uitnodiging op haar adres |

## Bevindingen

- **H0-1 (belangrijk):**
  - Wat ging er mis: een export met `pg_dump -n public -n private -t auth.users -t auth.identities` bevatte **alleen de
    twee auth-tabellen**. Met `-t` erbij negeert `pg_dump` de opties `-n`. Zo'n back-up was geldig, versleuteld en
    "geslaagd", maar zonder één huishouden.
  - Gevolg: elke dagelijkse back-up wordt na het maken automatisch gecontroleerd op **de aanwezigheid van alle
    verwachte tabellen**, met een vergelijking van het aantal rijen met de bron. Alleen controleren dat de export is
    gelukt en hoe groot hij is, is onvoldoende.
  - Zonder de hersteltest was dit niet ontdekt.
- **H0-2:** de tabel `events` verwijst naar zichzelf (reeksen). Een export van alleen de gegevens laadt daarom alleen
  zonder triggers en met uitgestelde controle op verwijzingen. Lokaal kon de rol `postgres` dat. **Aanname:** op een
  gehoste Supabase mag `postgres` `session_replication_role` zetten; de migratiehandleiding van Supabase doet dat. Te
  controleren bij de eerste oefening met een echte back-up.
- **H0-3:** sessies en refresh-tokens zitten bewust niet in de back-up. Na een herstel logt iedereen opnieuw in met een
  code. Gegevens en lidmaatschappen zijn er meteen.
- **H0-4:** het schema komt uit de repository (de migraties), de gegevens uit de back-up. Dat werkt alleen als de
  migratiegeschiedenis van de back-up gelijk is aan die van de repository op dat moment. Controle 5 vergelijkt dat.
  Een back-up hoort dus vast te leggen bij welke commit hij hoort.

## Wat H0 niet aantoont

- Herstel op of naar een **gehoste** Supabase, inclusief de rechten van de rol `postgres` (H0-2).
- De dagelijkse automatische uitvoering, object lock, het bewaarbeleid en de meldingen.
- De hersteltijd bij grote hoeveelheden gegevens.
- Fysieke back-ups van Supabase Pro of PITR.

Die horen bij de eerste oefening met een echte back-upomgeving, na een apart akkoord.

## Vereisten voor de echte back-up (volgend uit H0)

1. Twee exports (applicatie en auth), of een expliciete lijst tabellen. Na elke export automatisch nagaan: zijn alle
   verwachte tabellen er, en klopt het aantal rijen ongeveer?
2. In de metagegevens van de back-up: de migratieversies en de commit.
3. Versleutelen met alleen de publieke sleutel op de back-upmachine; de privésleutel offline.
4. De controlesom vóór het versleutelen, en controleren na het ontsleutelen.
5. Een maandelijkse hersteloefening, zoals deze: een lege stack met de migraties, laden, de vingerafdruk, de
   nacontrole, de RLS-matrix en een inlogvergelijking.
6. **Vault (sinds de automatische uitnodigingsmail, 18 oktober 2026).** De twee Vault-waarden
   (`thuisplanner_wachtrij_url` en `thuisplanner_wachtrij_geheim`) gaan niet mee naar een **nieuw** project. Elk project
   heeft een eigen hoofdsleutel, dus een `pg_dump` van `vault.secrets` is daar niet te ontsleutelen.
   - Sluit `vault` uit van de export.
   - Zet beide waarden na het herstel opnieuw (een nieuw wachtrijgeheim ook als functiegeheim).
   - De nacontrole meldt het als ze ontbreken. Tot dan wachten uitnodigingsmails; er gaat niets verloren.

Werkbestanden staan in de scratchmap van deze sessie, niet in de repository: de vingerafdruk, de scripts, de
versleutelde export en de testsleutels.
