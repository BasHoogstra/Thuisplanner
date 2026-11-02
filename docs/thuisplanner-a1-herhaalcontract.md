# A1: het gedeelde herhalingscontract (alleen lokaal) — verslag ter review

- **Status:** lokaal gebouwd en getest; ter **onafhankelijke review** in een concept-PR (`review/a1-herhaalcontract` →
  `review/a1-basis`). **Geen migratie, geen deployment, niet bedoeld om te mergen** zonder een eigen besluit.
- **Akkoord:** A1 uitsluitend lokaal (de eigenaar, 30 oktober 2026); de review via een concept-PR (2 november 2026).
  Het ontwerp: fase A versie 3, definitief goedgekeurd op 30 oktober 2026 (§5, het herhalingscontract).
- **Basis van de review:** `488f347` (staat al op origin). Gebouwd en getest is op `d03fa8d`, de nieuwste, nog niet
  gepushte commit van de hoofdlijn `thuisplanner-vakanties`. Tussen `488f347` en `d03fa8d` zitten alleen
  documentwijzigingen (`CHANGELOG.md`, `docs/projectstatus.md`, `docs/thuisplanner-staging-overstap.md`). App, tests,
  migraties en configuratie zijn identiek (gecontroleerd met `git diff --quiet`). Zo bevat de review **geen andere
  hoofdlijncommits**. A1 voegt alleen nieuwe bestanden toe.
- **Omgeving:**
  - `node_modules` is een koppeling (junction) naar de werkmap van de hoofdlijn, alleen gelezen. Er is niets
    gedownload;
  - de SQL-tests draaien in een **eigen wegwerpcontainer** van een image die al lokaal stond
    (`public.ecr.aws/supabase/postgres:17.6.1.167`, `--pull never`, `--network none`, 1 CPU, 2 GB), zonder gedeelde
    database of staging;
  - PostgreSQL 16 was niet lokaal geïnstalleerd; de container draait 17.6.

## 1. Bestanden (alle nieuw, ongecommit)

| Bestand | Regels | Inhoud |
| --- | --- | --- |
| `thuisplanner/app/src/lib/herhaalregel.ts` | 224 | De pure TypeScript-module: `controleerRegel`, `isGeldigeRegel`, `datumsTussen`, `komtVoorOp`, `regelUitFrequentie`, `regelTekst`, `MAX_KEREN` |
| `thuisplanner/app/tests/herhaalregel.test.ts` | 171 | Vitest: de vectoren, de geldigheid, de gelijkwaardigheid over 10 jaar, willekeurige regels, grenzen |
| `thuisplanner/supabase/tests/herhaalregel/vectoren.json` | 95 | 26 datumvectoren en 17 geldigheidsvectoren, gedeeld door TypeScript en SQL |
| `thuisplanner/supabase/tests/herhaalregel/rule_occurs_on.sql` | 164 | **Alleen een testbestand, geen migratie:** `private.rule_nth_weekday`, `rule_check`, `rule_matches`, `rule_index`, `rule_occurs_on`, en een letterlijke kopie van de huidige `private.occurs_on` ter vergelijking |
| `thuisplanner/supabase/tests/herhaalregel/maak-sql-tests.mjs` | 33 | Maakt uit `vectoren.json` de SQL-controles |
| `thuisplanner/supabase/tests/herhaalregel/gelijkwaardigheid.sql` | 38 | Oud tegenover nieuw, per dag over 10 jaar |
| `thuisplanner/supabase/tests/herhaalregel/tegenproef.sql` | 78 | Drie sabotages van het contract |
| `thuisplanner/supabase/tests/herhaalregel/run.sh` | 75 | Eerst de kopiecontrole, daarna alles in de wegwerpcontainer, met `--tegenproef` |
| `thuisplanner/supabase/tests/herhaalregel/controleer-kopie.mjs` | 28 | **Kopiecontrole:** de vergelijkingskopie van `private.occurs_on` moet letterlijk gelijk zijn aan de migratie; anders faalt `run.sh` |
| `docs/thuisplanner-a1-herhaalcontract.md` | – | Dit verslag |
| `docs/thuisplanner-a1-uitslagen/*.txt` | – | De testlogboeken (opgeschoond: lokale paden vervangen door `<werkmap>`) |

Bestaande bestanden zijn niet gewijzigd (`git status`: alleen nieuwe bestanden; `statisch.js`: "bestaande
Huisplan-bestanden ongewijzigd").

## 2. Zelf draaien

```sh
cd thuisplanner/app && npx vitest run tests/herhaalregel.test.ts            # ±14 s
cd thuisplanner/app && HERHAAL_VOLLEDIG=1 npx vitest run tests/herhaalregel.test.ts -t "dagtoets komtVoorOp"   # opt-in, ±85 s
bash thuisplanner/supabase/tests/herhaalregel/run.sh --tegenproef            # Docker met de lokale image; ±10 min
```

## 3. Uitslagen (de logboeken in `docs/thuisplanner-a1-uitslagen/`)

De resultaten van de zware runs (de SQL-gelijkwaardigheid, de opt-in en de volledige suite) horen bij **exact
dezelfde code** als in deze review. Daarna is alleen de kopiecontrole aan `run.sh` toegevoegd. Daarom is alleen het
script opnieuw gedraaid zonder de miljoenenvergelijking (`sql-run-na-kopiecontrole.txt`), en de miljoenenvergelijking
niet opnieuw.

| Controle | Uitslag | Datum | Logboek |
| --- | --- | --- | --- |
| Vitest `herhaalregel.test.ts` | **50 geslaagd, 1 overgeslagen** (de opt-in) | 2 nov 2026 | `vitest-herhaalregel.txt` |
| Opt-in: `komtVoorOp` per dag, 10 jaar | **geslaagd** (85 s) | 2 nov 2026 | `vitest-optin-volledig.txt` |
| Volledige Vitest-suite | **34 van 34 bestanden, 620 geslaagd, 1 overgeslagen** | 2 nov 2026 | `vitest-volledig.txt` |
| `tsc --noEmit` | exit 0 | 2 nov 2026 | `typecheck.txt` |
| `statisch.js` | GESLAAGD | 2 nov 2026 | `statisch.txt` |
| SQL: vectoren | **26 datumvectoren en 17 geldigheidsvectoren geslaagd** | 2 nov 2026 | `sql-run.txt` |
| SQL: gelijkwaardigheid | **5.552.560 vergelijkingen over 10 jaar, 0 verschillen** | 2 nov 2026 | `sql-run.txt` |
| SQL: tegenproeven | sabotage 1, 2 en 3: de vectoren falen; sabotage 1: de gelijkwaardigheid faalt | 2 nov 2026 | `sql-run.txt` |
| TS: tegenproeven (eenmalig, met de hand) | sabotage "laatste dag van de maand": 7 tests falen; "week begint op zondag": 8 tests falen; daarna identiek hersteld | 30 okt 2026 | in het sessielogboek |
| Kopiecontrole `occurs_on` (nu automatisch in `run.sh`) | letterlijk gelijk; een tegenproef (één teken anders in een tijdelijke kopie) faalt met code 1 | 2 nov 2026 | `kopiecontrole.txt` |
| `run.sh --tegenproef --zonder-gelijkwaardigheid`, na het toevoegen van de kopiecontrole | kopiecontrole geslaagd; 26 + 17 vectoren geslaagd; tegenproef 1, 2 en 3 falen zoals verwacht; GESLAAGD | 2 nov 2026 | `sql-run-na-kopiecontrole.txt` |

**Incidenten tijdens het testen** (transparant):
1. **De eerste volledige Vitest-run had 8 fouten**, door time-outs onder zware belasting. De SQL-container en de
   oorspronkelijke 10-jaarstest liepen tegelijk. Apart gedraaid: 40 van 40 geslaagd. Daarna is de 10-jaarstest in
   TypeScript lichter gemaakt (van 56 s naar ±7 s, even volledig), met de zware variant als opt-in.
2. **Docker Desktop werd onbereikbaar** tijdens de eerste SQL-run, zonder begrenzing. De eigenaar heeft Docker
   herstart. Sindsdien draait de container met een begrenzing van 1 CPU en 2 GB.
3. **Met 1 GB viel de database in de container uit** bij de 10-jaarsvergelijking in één query. De vergelijking draait
   nu per reeks; daarna geslaagd.
4. **Een fout in het eerste script:** door `pipefail` met `grep` zag je een mislukte stap niet. Dat is hersteld: een
   mislukte vergelijking toont nu de fout en stopt met code 1.

## 4. Wat de gelijkwaardigheidstest precies bewijst

**Bewezen** (voor regels die het huidige model kent: dagelijks, wekelijks, maandelijks of jaarlijks, met of zonder
einddatum, zonder interval, weekdagen of count):

1. **SQL:** voor elk anker in 2024 (maand- en jaarreeksen: elke dag van 2024, dus alle randen: de 29e–31e en 29
   februari; dag- en weekreeksen: 1–14 januari 2024, elke weekdag twee keer), elk **zonder einde** en **met een einde
   na 400 dagen**, geeft `private.rule_occurs_on` met de standaardwaarden **voor elke dag van 1 januari 2024 t/m 31
   december 2033** hetzelfde antwoord als de **echte, letterlijk gekopieerde** `private.occurs_on` uit de migratie:
   5.552.560 vergelijkingen, 0 verschillen.
2. **TypeScript, dezelfde ankers en dagen:**
   - de opsomming `datumsTussen` (per jaar) geeft per dag hetzelfde als een TypeScript-nabouw van `occurs_on`;
   - `datumsTussen` geeft per kalenderjaar dezelfde lijst als de huidige `voorkomenDatums` (de app);
   - `regelTekst` geeft dezelfde tekst als `herhalingTekst`;
   - opt-in: `komtVoorOp` per dag gelijk aan de nabouw.
3. **Het nieuwe deel van het contract** (interval, weekdagen, n-de of laatste weekdag, count, de regels voor de
   geldigheid) klopt met 26 + 17 **onafhankelijk vastgestelde** vectoren (met de hand, gecontroleerd met losse
   SQL-zoekopdrachten over een kalender), **in TypeScript én SQL**.
4. **Opsomming en dagtoets zijn het eens** voor 300 willekeurige geldige regels (vaste zaadwaarde), elk over twee jaar
   per dag (alleen TypeScript).
5. **De tegenproeven** laten zien dat de tests de belangrijkste semantiek echt bewaken: het overslaan van maanden
   zonder die dag, de weekstart op maandag, en de telling bij count.

**Niet bewezen** (ontbrekende controles):

| # | Ontbreekt | Waarom het telt | Voorstel |
| --- | --- | --- | --- |
| C1 | **Gelijkheid tussen TypeScript en SQL buiten de 43 vectoren** (bijvoorbeeld voor willekeurige regels met interval, weekdagen of count) | De app en de server moeten exact gelijk blijven | Een gegenereerde set van bijvoorbeeld 500 willekeurige regels in JSON, met beide kanten vergeleken (dezelfde aanpak als de vectoren) |
| C2 | **Ankers buiten 2024** (een gewoon jaar als anker, ankers vóór 2024, eeuwjaren zoals 2100) | 29 februari als anker en de overgang naar een gewoon jaar zijn alleen voor 2024 bekeken | Ankers in 2025 en 2100 toevoegen aan de gelijkwaardigheid |
| C3 | **Andere einddatums** dan "geen" en "+400 dagen" (bijvoorbeeld een einde op een maandrand of op de dag van het anker) | Randgevallen van "inclusief" | Een set einddatums per anker |
| C4 | **Dag- en weekreeksen met maar 14 ankers** | Lager risico (eenvoudige regels), maar niet volledig | Uitbreiden naar 2 jaar ankers, alleen in SQL (snel genoeg per reeks) |
| C5 | **`voorkomenDatums` over vensters groter dan een jaar** | De bestaande app begrenst dagelijks en wekelijks op 1000 **stappen** (inclusief uitzonderingen); de nieuwe module op 1000 **datums**. Dat verschilt alleen bij meer dan 1000 dagkeren met uitzonderingen in één venster; de schermen vragen hoogstens een paar weken | Een **bestaande** grens, geen gedragswijziging. In de app-integratie (A3) met één definitie werken |
| C6 | ~~De automatische controle dat de kopie van `occurs_on` gelijk blijft aan de migratie~~ | **Opgelost in deze review:** `controleer-kopie.mjs` is de eerste stap van `run.sh` | – |
| C7 | **PostgreSQL 16** (het minimum in de README) en CI | Getest op 17.6, alleen lokaal | In de CI-workflow opnemen bij de integratie (eigen akkoord) |
| C8 | **Prestaties in echte functies** (`occurrence_taken`, het opslaan) | `rule_index` (alleen bij count) loopt per keer door; een lange count-reeks kost dan meer | Meten bij A2 (migratie) |
| C9 | **De integratie in de app en de database** (`save_event`, `occurrence_taken`, `afsprakenTussen`) | A1 is alleen het contract | A2/A3, volgens het ontwerp |

## 5. Afwijkingen tussen het bestaande gedrag en het nieuwe contract

**Geen**, voor alle regels die het huidige model kent (zie §4). Het goedgekeurde contract is niet aangepast. Eén
bestaand verschil binnen de huidige code (niet door A1 veroorzaakt): de grens van 1000 in `voorkomenDatums` (stappen)
tegenover geen grens in de database (C5).
