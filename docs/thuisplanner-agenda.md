# Thuisplanner Agenda: ontwerpbesluiten en integratieplan

- **Vastgesteld:** 26 oktober 2026, door de producteigenaar. Dit is een **voorlopig productakkoord**: Sanne test de
  werkende Agenda later; haar feedback kan tot gerichte aanpassingen leiden.
- **Basis:** het losse, klikbare Agenda-prototype (buiten de repository, beoordeeld door de producteigenaar) en het
  UX-voorstel van 22 oktober 2026.
- **Branch:** `thuisplanner-agenda`, vanaf `thuisplanner-deel2` (`41f105d`, de lijn van de eerste online praktijktest).
- **Herziet:** de W2-besluiten **D5** en **D6** van 21 oktober 2026 (zie §3).

## 1. Productkompas-toets

| Vraag | Antwoord |
| --- | --- |
| Principes | 2 (rust boven volledigheid), 6 (aandacht besparen), 1 (meer gemak dan gedoe), 8 (Agenda is het tweede onderdeel in de hypothese) |
| Neemt het denkwerk weg? | Ja: sneller zien wat er deze week speelt en welke dag druk is, zonder te scrollen of titels te raden |
| Hoort het bij organiseren, onthouden, uitvoeren? | Ja: de gezinsagenda is de kern van organiseren |
| Kan het eenvoudiger? | Ja, en dat is het doel: minder labels en stippen, één opbouw van een dag in alle weergaven |
| Aandacht, controle, privacy | Ongewijzigd. "Bezet" komt uit de database (`is_busy`, RLS), niet uit de interface. Geen nieuwe meldingen |
| Bewijs | Hypothese, getoetst met het prototype; daarna de praktijktest met Sanne |
| Gates | Geen ⛔ geraakt: alleen de app-laag, geen migratie, geen wijziging aan de sync-module. Gate 9 geldt opnieuw voor latere agendakoppelingen (§5) |
| Ultieme toets | Ja: het gezin hoeft minder te zoeken en te onthouden wat er deze week speelt |

## 2. Ontwerpbesluiten

| # | Besluit | Uitwerking |
| --- | --- | --- |
| A1 | **Laptop-week: zeven rijen** | Eén dag per rij, de items als tegels die doorlopen op de volgende regel. Een drukke dag maakt alleen zijn eigen rij hoger. Een klik op de dag opent de Dag |
| A2 | **iPhone-week: weekstrip met de gekozen dag** | De strip blijft bovenaan, met per dag één neutraal drukte-streepje. Daaronder de gekozen dag, daarna "Rest van de week" |
| A3 | **Rest van de week: een regel per dag onder de gekozen dag** | De eenvoudigste en rustigste variant: geen extra knop of toestand. Alle andere dagen van de week, voorbije gedimd, met de afspraaktitels en "n taken". Een tik kiest die dag. De uitklapbare strip uit het prototype vervalt |
| A4 | **Dag: één dagblok** | Eerst afspraken (tijd, streepje in lidkleur, titel, naam), een stippellijn, dan taken (rondje in lidkleur). Afspraken zijn prominenter (vet, met tijd). De Dag toont ook eindtijd, plek, wie en herhaling |
| A5 | **Maand: rustig** | Laptop: hoogstens twee titels zonder tijd, "nog n" en "n taken". Mobiel: het getal en één drukte-streepje; een tik toont die dag eronder. Vakanties als doorlopende periode. Geen legenda |
| A6 | **Gezinsleden** | Overal kleur én naam, nooit kleur alleen. Mobiel één filterknop ("Iedereen ▾"), laptop de huidige keuzes |
| A7 | **Afgeronde taken ingeklapt** | "n afgerond · tonen", dezelfde zin als op Vandaag |
| A8 | **Taken zonder datum ingeklapt met telling** | "Zonder datum · n open"; op de laptop-Dag in een zijkolom |
| A9 | **Openstaande taken van eerdere dagen** | Op hun eigen dag, en alleen in het blok van vandaag met "nog open sinds gisteren / n dagen" (dezelfde regel als `takenVandaag` op Vandaag). Niets extra op Vandaag |
| A10 | **De centrale + krijgt de gekozen datum mee** | Alleen vanuit de Agenda, met één tik te wijzigen (sluit aan op `docs/thuisplanner-snelinvoer.md`) |
| A11 | **Privacy ongewijzigd** | "Bezet" uit `is_busy`/RLS. Bij "Bezet" ook geen herhaling, plek of titel in de interface |
| A12 | **Woorden breken niet af** | Alleen tussen woorden. Een woord dat langer is dan de regel wordt afgekapt ("…" of afgesneden), nooit gebroken |

### Open punten (nog te beslissen of te toetsen)

| # | Punt | Advies |
| --- | --- | --- |
| O1 | Tablet (768–959 px) heeft nu de mobiele indeling | Rijen vanaf ±720 px (stap 5) |
| O2 | Vegen tussen dagen | Niet in de eerste versie; eerst tikken |
| O3 | Herhalende afspraken maken de maand vol | Nu niet aanpassen; eerst Sanne laten oordelen |
| O4 | Meerdaagse afspraken staan alleen op de eerste dag | Oplossen vóór de agendakoppelingen (stap 9) |
| O5 | De vakantie in de Agenda | Na de merge van Vakanties (stap 8) |
| O6 | Agendakoppelingen in Gratis of Premium | Productbesluit voor later |

## 3. Herziening van W2 (D5 en D6)

W2 (21 oktober 2026, `CHANGELOG.md`) besloot:

- **D5:** mobiel is de week één doorlopende lijst; lege dagen achter elkaar staan samen op één regel.
- **D6:** desktop houdt zeven kolommen met compacte rijen.

**Herzien op 26 oktober 2026:** D5 wordt vervangen door **A2 en A3** (weekstrip, gekozen dag, rest van de week). D6 wordt
vervangen door **A1** (zeven rijen). De herziening wordt van kracht met bouwstap 4 (mobiel) en 5 (laptop); tot dan blijven
de lijst en de kolommen staan, met de visuele verbeteringen van stap 1.

Wat uit W2 blijft gelden: één persoonsmarkering per rij in de week, details (plek, eindtijd, herhaling) in het
detailvenster, geen afbreekstreepjes, hoogstens twee regels per titel, en de + per dag. Strenger dan W2: woorden breken
niet midden in het woord af (A12).

## 4. Integratieplan

Elke stap is één commit, met groene tests en een regel in de changelog. Eerst lokaal; naar staging alleen met een apart
akkoord. Nieuwe onderdelen komen in nieuwe bestanden, zodat bestanden die Vakanties en de slimme + ook wijzigen
(`Rijen.tsx`, `app.css`, `kg4.spec.ts`) zo weinig mogelijk veranderen.

| Stap | Inhoud | Soort |
| --- | --- | --- |
| 0 | Deze documentatie en de eigen worktree | Documentatie |
| 1 | **Visuele rust:** geen woordbreuk, tijd en naam op één regel, rondje en streepje in de lidkleur, rustigere maand zonder legenda, informatieve tekst met voldoende contrast | Visueel |
| 2 | Dagblok in de Dag; afgerond ingeklapt (ook in de week) | Functioneel, klein |
| 3 | Zonder datum ingeklapt met telling; zijkolom op de laptop | Functioneel, klein |
| 4 | Mobiel: weekstrip, gekozen dag, rest van de week, filterknop (vervangt D5) | Functioneel |
| 5 | Laptop en tablet: zeven rijen (vervangt D6) | Functioneel |
| 6 | Maand mobiel: een tik kiest de dag, het dagblok eronder | Functioneel |
| 7 | Nog open van eerder bij vandaag; de centrale + met de gekozen datum (in overleg met de slimme +) | Functioneel |
| 8 | De vakantie als periode in week, strip en maand (na de merge van Vakanties) | Functioneel |
| 9 | Meerdaagse afspraken op elke dag (`afsprakenTussen`, ook voor Vandaag) | Functioneel, gedeelde logica |
| 10 | Staging, de praktijktest met Sanne, gerichte correcties | Uitrol, apart akkoord |

**Wat elke stap borgt:** geen migratie en geen wijziging aan de sync-module; afspraken, taken, reeksen en uitzonderingen
lopen via dezelfde functies; de bestaande herhalings- en privacytests blijven groen; e2e op 320, 360, 390, 768 en
1280 px, licht en donker; een drukke dag in de tests; informatieve tekst met minstens 4,5:1 contrast.

### Stap 1: visuele rust (26 oktober 2026, lokaal)

Alleen de Agenda, alleen CSS en weergave; geen gegevens, geen gedrag.

- **Geen woordbreuk:** titels in de Agenda breken alleen tussen woorden. Een woord dat breder is dan de kolom (bijvoorbeeld
  "Toestemmingsformulier" in de zeven kolommen op 1280 px) wordt zichtbaar ingekort met "…", nooit gebroken. Die beperking
  van de kolommen verdwijnt met de rijen in stap 5.
- **Compacter:** mobiel staan tijd, titel en naam op één regel; op de laptop staan tijd en naam samen boven de titel
  (twee regels per item in plaats van drie).
- **Lidkleur:** een afspraak krijgt een smal streepje in de kleur van het lid (meer leden: neutraal; iedereen: geen), een
  taak een rondje in die kleur. De stip vóór de naam vervalt; de naam blijft altijd staan.
- **Maand:** laptop toont titels met een smal streepje in de lidkleur, "nog n" en "n taken" als tekst; mobiel toont per
  dag één neutraal drukte-streepje (`drukte()` in `lib/kalender.ts`). De legenda vervalt. De schermlezertekst per dag
  ("4 afspraken, 2 taken") blijft gelijk.
- **Contrast:** informatieve tekst in de Agenda (lege dagen, dagkoppen, voorbije afspraken, afgeronde taken, "nog n")
  gebruikt `--inkt-2` in plaats van `--inkt-3` of doorzichtigheid, en haalt zo minstens 4,5:1 in licht en donker. De
  ontwerptokens zelf veranderen niet. Elders in de app (Vandaag, Boodschappen) is dat nog niet nagelopen.
- **Tests:** `tests/agenda.test.ts` (`drukte`, `lidKleur`) en `e2e/agenda.spec.ts` (woordbreuk in Week, Dag en Maand;
  lidkleur; maand zonder legenda; contrast inclusief doorzichtigheid), op 320, 360, 390, 768 en 1280 px en in donker.
  Tegenproeven: met de oude afbreekregel en met de oude doorzichtigheid falen de tests.

### Stap 2: het dagblok en afgerond ingeklapt (26 oktober 2026, lokaal)

- **Dag (A4):** één kaart (`components/DagBlok.tsx`) in plaats van de losse blokken "Afspraken" en "Taken". Eerst de
  afspraken met de bestaande rijen (tijd en eindtijd, streepje in de lidkleur, titel, wie, plek, privé, herhaling), dan
  een stippellijn, dan de open taken met een rondje in de lidkleur. Geen zichtbare kopjes; voor schermlezers de lijsten
  "Afspraken", "Taken" en "Afgerond". Een lege dag is één zin: "Niets gepland."
- **Afgerond (A7):** in de Dag onderaan in de kaart "n afgerond · tonen / verbergen", zoals op Vandaag; in de Week per
  dag "n afgerond" als kleine knop (schermlezer: "n afgerond op <dag>, tonen"). Een afgevinkte taak schuift naar die
  groep; de bestaande melding blijft. Een andere dag begint weer ingeklapt.
- **Contrast in de Dag:** voorbije afspraken, plek en eindtijd gebruiken `--inkt-2` in plaats van doorzichtigheid of
  `--inkt-3` (alleen in de Agenda; Vandaag houdt de eigen opmaak).
- **Ongewijzigd:** de knoppen "+ Afspraak" en "+ Taak", datum, gezinsfilter, "Bezet", detailvensters, gegevens,
  sync-module, de indeling van week en maand.
- **Tests:** drie nieuwe tests in `e2e/agenda.spec.ts` (één blok en volgorde, lege dag, afgerond in Dag en Week,
  afvinken heen en terug) en de contrasttest uitgebreid met de Dag; `week.spec.ts` "afvinken in de week, en terug"
  aangepast aan het inklappen. Tegenproeven: afgerond standaard open, en de oude doorzichtigheid, worden gevangen.

## 5. Latere agendakoppelingen (productrichting, nu niet bouwen)

**Productbesluit (26 oktober 2026):** Thuisplanner wordt een volwaardige gezinsagenda die ook bestaande agenda's kan
samenbrengen. Gebruikers kunnen zonder externe agenda starten. Later volgen koppelingen met Google Agenda,
Outlook/Microsoft 365 en, waar technisch haalbaar, Apple/iCloud. Er worden nu geen tabellen of velden toegevoegd.

**Wat het huidige model al goed doet (beschermen):**
- Afspraken hebben een UUID die de app maakt; privé-inhoud hoort bij het account (`owner_user_id`). Een externe agenda
  hoort ook bij één account.
- De tweedeling gedeeld/privé met "Bezet" komt overeen met vrij/bezet in externe agenda's. Geen fijnmazige rechten per
  lid toevoegen.
- Herhaling wordt berekend uit de reeks en de uitzonderingen; dat model blijft van Thuisplanner zelf.

**Wat de nieuwe Agenda-code moet respecteren (kost nu niets):**
1. De schermen halen afspraken alleen via `dagInhoud`/`afsprakenTussen`, nooit door zelf alle items te doorzoeken. Zo kan
   de opslag later per periode ophalen (`docs/thuisplanner-productiegeschiktheid.md`, F2) en kunnen externe reeksen met
   rijkere herhalingen erin.
2. Of iets te wijzigen is, komt uit `lib/rechten.ts`. Een externe, alleen-lezen afspraak past daar later bij.
3. Geen aannames over een klein aantal afspraken of een kort tijdsbereik.
4. Meerdaagse afspraken worden op elke dag getoond (stap 9).
5. Ids en de vorm van items blijven betekenisloos; `reeks@datum` bestaat alleen in het geheugen.

**Voor het latere ontwerp:**
- **Herkomst en dubbelingen:** een aparte koppeltabel (koppeling, extern id, iCalUID, ETag), uniek per koppeling en
  extern id. Dezelfde uitnodiging in de agenda's van twee gezinsleden wordt één afspraak met twee deelnemers.
- **Eigenaar en zichtbaarheid:** één keer per gekoppelde agenda kiezen (van wie; gedeeld of "Bezet"). Een geïmporteerde
  afspraak krijgt de eigenaar als deelnemer (leeg betekent: het hele huishouden).
- **Tijdzones:** Thuisplanner bewaart lokale datum en tijd in de zone van het huishouden; bij import omrekenen en de
  oorspronkelijke zone in de koppeltabel bewaren.
- **Synchronisatie:** eerst alleen inlezen, op de server (Edge Functions), via push van Google/Microsoft Graph of
  CalDAV (iCloud). Tokens nooit in de browser, versleuteld bewaard. Tweerichtingsverkeer later, met een eigen ontwerp
  voor conflicten.
- **Omvang:** het besluit hoe ver Agenda en Taken terug moeten kunnen kijken (B-data) en ophalen per periode (F2) zijn
  nodig vóór de koppelingen.
- **Privacy:** gate 9 opnieuw voor de nieuwe gegevens (externe afspraken en tokens); toestemming per account;
  ontkoppelen verwijdert de geïmporteerde gegevens.
- **Interface:** de herkomst alleen subtiel in het detailvenster; één "Agenda koppelen" per gezinslid, zonder
  instellingenmenu.

## 6. Samenwerking met andere trajecten

- **Vakanties** (`thuisplanner-vakanties`, nog niet gemerged): wijzigt ook `Agenda.tsx` (vakantieregel), `Rijen.tsx`
  (vakantielabel) en `app.css`. De vakantieweergave in de Agenda komt pas in stap 8, na die merge.
- **Slimme +:** wijzigt `kg4.spec.ts`, `SnelInvoer.tsx` en de snelinvoer-documentatie. Stap 7 (de + met de datum) in
  overleg; de Agenda-stappen raken die bestanden verder niet.
- `docs/thuisplanner-vakanties.md` §4.5 en `docs/thuisplanner-snelinvoer.md` worden pas na de commits van die trajecten
  bijgewerkt.
- **Meldingen en herinneringen** (`docs/thuisplanner-meldingen.md`, later): de Agenda bouwt er nu niets voor. Afspraken
  houden stabiele ids, en een afwijkende herinnering per afspraak komt later in een eigen, persoonlijke tabel, nooit op
  de gedeelde afspraak.
