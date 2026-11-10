# Mijn spullen & Documenten: uitrolplan voor staging (concept, 30 oktober 2026)

**Status:** ter beoordeling door de producteigenaar. Er is niets uitgevoerd en niets online gewijzigd. Elke stap hieronder
die iets online doet, vraagt een eigen akkoord. Dit plan volgt het patroon van stap 9b in
`docs/thuisplanner-staging-overstap.md` (repetitie, export, dry-run, push, nacontrole, app, toestellen).

## 1. Voorwaarden vóór de eerste online stap

| # | Voorwaarde | Stand nu |
| --- | --- | --- |
| V1 | Migratie 28 (Vakanties) is definitief vastgesteld en gecommit op de hoofdlijn | Open (hoofdlijnsessie) |
| V2 | De hoofdlijn (met 28) is samengevoegd in `thuisplanner-spullen`, de conflicten zijn opgelost, en de volledige lokale ronde is groen | Open; hangt af van V1 |
| V3 | `SCHEMA_PER_STAND` is opnieuw gemeten voor stand 28 en voor stand 29 bovenop 28; `$VerwachtAantal` in `verbinding.ps1` wordt 21 | Open; hangt af van V2 |
| V4 | Alle wijzigingen zijn gecommit (de scripts weigeren ongecommitte migraties en functies) | Open |
| V5 | Een telefoontest via het lokale netwerk met fictieve gegevens (iPhone en Android) | Open (onderdeel C) |
| V6 | Akkoord op dit plan | Open |

## 2. Wat er online komt

| Onderdeel | Wat | Gevolg voor bestaande gegevens |
| --- | --- | --- |
| Migratie 29 `spullen_documenten` | Tabellen `possessions`, `documents` en `document_links`; `tasks.possession_id`; RLS, guards, seintjes; de functies voor de twee fasen en het opruimen | Niets geraakt; `possession_id` is leeg |
| Storage (in migratie 29) | De privé-bucket `documenten` (10 MB, PDF, JPEG, PNG en WebP) en precies twee policies op `storage.objects` (lezen en uploaden) | Geen; tot nu toe was er geen opslag |
| Geplande taak (in migratie 29) | `thuisplanner-documenten-opruimen`, dagelijks 04:07 (UTC), één aanroep van `opruimen-documenten`; die bepaalt zelf wat er weg moet | Geen |
| Edge Functions | `bevestig-upload` (nieuw), `opruimen-documenten` (nieuw); de vier bestaande opnieuw, omdat `_gedeeld/k1.ts` twee hulpfuncties voor de opslag kreeg | De bestaande vier: zelfde gedrag, nieuwe bundel |
| App | De versie met Mijn spullen; de functie alleen zichtbaar met `VITE_SPULLEN=aan` | Zonder de schakelaar exact de oude zoekopdrachten |
| Geen nieuw geheim | De opruimronde gebruikt het bestaande wachtrijgeheim en leidt het adres af van `thuisplanner_wachtrij_url` | Vault blijft zoals het is |

## 3. De stappen

Elke stap noemt wat er gebeurt, de controle, en de terugval. Online stappen alleen met een eigen akkoord.

**U0 · Lokaal: samenvoegen en meten** (na V1)
- De hoofdlijn met 28 samenvoegen in `thuisplanner-spullen`. Verwachte conflicten: `sync/thuisplanner-sync.js` en
  `.d.ts`, `app/src/lib/store.ts`, `rls_tests.sql`, `run.sh` (verwacht "96 van 96"), `tegenproeven.txt`, `statisch.js`
  en de Vakanties-synctests. De RLS-nummers zijn afgestemd (spullen KG-T89 t/m KG-T94, Vakanties KG-T95 en KG-T96).
- `SCHEMA_PER_STAND` meten voor stand 28 en 29; `$VerwachtAantal` naar 21.
- De volledige lokale ronde op een verse eigen stack, met alle tegenproeven; de app-tests (tsc, Vitest, e2e).
- **Akkoord:** voor de merge en de commits.

**U1 · Online, alleen lezend: export en hersteltoets**
- `verbinding.ps1 -Ref <staging> -Export -ExportMap <nieuwe lege map>`. Er zijn nog geen bestanden, dus zonder
  `-MetBestanden`.
- `hersteltoets.sh` met die export.
- **Controle:** manifest en controlesommen in orde; terugzetten gelijk aan de export.

**U2 · Lokaal: de repetitie**
- `generale.sh` met de export van U1: de migraties zoals online, daarna 28 en 29 met `db push`.
- **Controle:** alle bestaande rijen ongewijzigd; nieuw alleen de kolommen en tabellen van 28 en 29; de nacontrole tegen
  stand 29 in orde, inclusief de opslag (één bucket, twee policies) en de zes geplande taken.
- Sinds `c30db69` draait Storage in de repetitie mee, dus de bucket en de policies worden echt aangemaakt.

**U3 · Online: migratie 28** (door of samen met de hoofdlijnsessie; buiten dit plan, wel ervóór)

**U4 · Online: migratie 29**
- Eerst de dry-run: `verbinding.ps1 -Ref <staging> -Bijwerken`. Verwacht: precies één nieuwe migratie
  (`20261029120000_spullen_documenten`).
- Dan met `-Push`, na de getypte bevestiging.
- **Controle (nacontrole):** 21 migraties; het schema precies de gemeten referentie; de bucket en de twee policies precies
  de vaste lijst; de zes geplande taken actief; Vault en pg_net in orde.
- **Tussentoestand:** de oude app werkt ongewijzigd (alleen toevoegingen). De geplande ronde roept tot U5 een functie aan
  die er nog niet is (een 404 in pg_net, geen fout in de database); dat is onschuldig, want er is nog niets op te ruimen.
- **Terugval:** vooruit repareren met een nieuwe migratie (er zijn geen terug-migraties). De noodschakelaar van het
  herstelplan blijft beschikbaar.

**U5 · Online: de Edge Functions**
- `functies.ps1 -Ref <staging>` (alleen controleren), daarna met `-Deploy`. Het token van het Thuisplanner-account bij
  een verborgen prompt; de producteigenaar trekt het daarna in.
- **Controle:** `functions list` toont precies zes functies, alle `ACTIVE`, met `verify_jwt` uit.
- **Daarna kort nalopen:** inloggen met een code (raakt de opnieuw gebundelde `stuur-code` en `controleer-code`).
  `opruimen-documenten` zonder het juiste geheim geeft 401.
- **Terugval:** de vorige versie van een functie opnieuw deployen vanaf de vorige commit.

**U6 · Online: de app, in twee stappen**
1. **De nieuwe app met de schakelaar uit.** `thuisplanner-staging` vooruit zetten naar de geteste commit (fast-forward)
   en pushen; Cloudflare bouwt. Op de toestellen hoort niets te veranderen.
2. **De schakelaar aan, alleen voor staging.** Voorstel: de variabele `VITE_SPULLEN=aan` in het Pages-project
   `thuisplanner-staging`, daarna opnieuw bouwen. Zo staat er in de code niets per omgeving, en blijft productie uit tot
   een eigen besluit. Alternatief: een gecommit `.env.staging`. Dit is een wijziging in Cloudflare, dus een eigen akkoord.
- **Terugval:** de variabele weghalen en opnieuw bouwen. De app vraagt dan weer precies wat ze daarvoor vroeg; de
  database hoeft niet terug.

**U7 · De rooktest op staging, met fictieve gegevens**
- Een PDF en een foto bewaren; "Bewaard" pas na de bevestiging; openen buiten de app.
- Twee toestellen: een gedeeld document verschijnt op het andere toestel; een persoonlijk document niet.
- De prullenbak en terugzetten; een taak bij een spul; de vraag in de +.
- De telefoontest: iPhone (Safari, een HEIC-foto, een PDF openen) en Android (Chrome).
- `verbinding.ps1 -Export -MetBestanden`: de bestanden komen mee, met de juiste controlesommen.
- Alleen lezend in de SQL-editor: de geplande taken (`cron.job`) en hun laatste uitvoering (`cron.job_run_details`).
- **Controlepunt: de geplande opruimtaak draait echt en wist bestanden.** Een fictief testhuishouden met een document
  verwijderen; na de eerstvolgende ronde om 04:07 (UTC) alleen lezend nagaan dat `cron.job_run_details` voor
  `thuisplanner-documenten-opruimen` op `succeeded` staat, dat pg_net een 200 van `opruimen-documenten` kreeg
  (`net._http_response`), en dat er onder dat huishouden geen object meer in `storage.objects` staat. Pas dan is de
  verwijderprocedure online aangetoond.

## 4. Risico's en hoe het plan ermee omgaat

| Risico | Maatregel |
| --- | --- |
| De Storage-policies zijn alleen lokaal bewezen | De repetitie (U2) met Storage; de vaste lijst in de nacontrole (U4); de rooktest (U7) met twee accounts en een persoonlijk document |
| Staging draait Postgres 17.11, lokaal 17.6 | Zoals bij 9b: de dry-run en de nacontrole zijn de laatste toets |
| De vier bestaande functies krijgen een nieuwe bundel | Ongewijzigde code behalve twee nieuwe hulpfuncties; de K1-tests lokaal groen; na U5 een code-login |
| De opruimronde online voor het eerst | Eén aanroep per dag; zonder adres of geheim in Vault roept ze niets aan; ze leest alleen uit Vault; een mislukte aanroep wordt de volgende dag herhaald, en wat al uit de tabel is, wordt dan als wees gevonden |
| Gratis plan van staging (1 GB opslag, geen back-ups) | Voldoende voor fictieve testgegevens. Back-ups bevatten bij Supabase nooit bestanden; daarom de eigen export met `-MetBestanden` |
| Een stack die na lange belasting vastloopt (lokaal gezien, oorzaak niet vastgesteld) | Op staging de logboeken van Storage en de functies bekijken bij de rooktest |
| De volgorde 28 → 29 | U3 vóór U4; de nacontrole kent per stand de referentie |

## 5. Buiten dit plan (vóór de bèta)

- Het verwijderscript uit de bèta-voorbereiding, met de bestanden (onderdeel B levert het spullendeel).
- De privacyverklaring: documenten, de prullenbak van 30 dagen en de eigen export.
- Een beslissing over het Supabase-plan voor de bèta (opslag en back-ups).

## 6. Inschatting

| Stap | Tijd |
| --- | --- |
| U0 | 1–1,5 dag |
| U1 en U2 | 0,5 dag |
| U4, U5 en U6 | 0,5 dag (met de producteigenaar, voor het token en Cloudflare) |
| U7 | 0,5 dag (met de producteigenaar en de toestellen) |
