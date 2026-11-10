# Thuisplanner: Plannen (ontwerp voor de demo)

**Status:** in hoofdlijnen goedgekeurd door de producteigenaar op 4 november 2026 (besluit 18), met de aanpassingen in
§4.9, §5.1 en §9. Niets gebouwd; geen worktree, code, migratie of uitrol. Lokaal, staging en live: **nergens aanwezig**.
Elke volgende stap vraagt een eigen akkoord.

**Gelezen:** `PRODUCT_PRINCIPLES.md`, `docs/productkompas-beslissingen.md`, `docs/roadmap.md`,
`docs/identiteit-en-items.md`, `docs/thuisplanner-spullen-documenten.md`, en de bouwvoorbereiding in
`docs/thuisplanner-beta-voorbereiding.md`.

**Bekeken code:** de hoofdlijn `thuisplanner-vakanties` (`d03fa8d`), alleen lezend via git, plus de migraties op
`thuisplanner-spullen` en `thuisplanner-a2-afsprakenmodel`. De werkmap van deze sessie (`thuisplanner-deel2`) heeft de
nieuwste besluiten, maar een oudere app zonder Vakanties. Regelnummers en schermen hieronder gelden voor de hoofdlijn.
De demo zelf heb ik niet gestart: dit steunt op de code en een bestaande schermafbeelding.

---

## 1. Botsingen met het kompas (uitkomst in §9)

| # | Botsing | Waarom het ertoe doet | Mijn advies |
| --- | --- | --- | --- |
| **B1** | **Gate besluit 13.** "Slimme projecten" eist vóór *de eerste migratie voor projecten*: gate 9, een AVG-beoordeling van de AI-verwerker én de uitslag van de AI-kwaliteitsproef. Plannen is inhoudelijk hetzelfde domein. | Letterlijk gelezen blokkeert de AI-proef ook een Plannen-backend zonder enige AI. **De demo raakt dit niet** (geen migratie). | Eén begrip: een *plan* is waar een slim project straks in terechtkomt. Splits de gate: gate 9 "plannen" vóór de eerste migratie; AVG en kwaliteitsproef vóór de eerste AI-aanvraag. Dit vraagt een expliciet besluit (concepttekst in §10). |
| **B2** | **Roadmap: "KG-5E licht komt vóór nieuwe domeinen."** KG-5E licht is niet begonnen (`App.tsx` kiest nog tussen `DemoApp` en `LokaleApp`). Plannen staat ook nog niet in de roadmap. | Een Plannen-backend vóór KG-5E licht betekent dubbel werk. De releaseplanning (1b, bèta 1, Maaltijden) gaat ook voor. | Demo mag eerder, als bewuste uitzondering en alleen demo. **De backend wacht op KG-5E licht** en komt na bèta 1, bij mijlpaal 2c. |
| **B3** | **Missie:** "Huisplan is geen plek waar het gezin moet plannen." Principe 1 waarschuwt voor extra formulieren. Statussen, fases en verantwoordelijken zijn precies wat een app zakelijk en bewerkelijk maakt. | Hoort thuis in de toets, niet als veto: het doel is onthouden en verdelen wat er toch al moet gebeuren. | Alles behalve de titel is optioneel, er is geen verplichte status of fase, en een plan is na één veld bruikbaar. Na testen bij echte gezinnen beoordelen (principe 8). |
| **B4** | **Navigatie.** Beslissing 2: de navigatie wordt eerst getoetst aan gebruik. Besluiten 14 en 17 kozen bewust voor "geen extra hoofdmodule". | Een vijfde tab is een navigatiebesluit zonder bewijs. | **Voorlopig** onder **Meer**, op dezelfde manier als Vakanties. Geen permanente navigatiekeuze: evalueren na gebruikerstesten. |
| **B5** | **Besluit 17: één document, geen kopieën.** Bijlagen mogen geen tweede bestandssysteem worden; de opslag bestaat alleen op de niet-gemergde branch `thuisplanner-spullen`. | Echte bijlagen hangen volledig af van de oplevering van Spullen, en van de eigen gate. | Demo: nagespeeld. Echt: dezelfde tabel `documents` en dezelfde bucket, met een eigen koppeltabel (§6.3). |
| **B6** | **"Taken" bestaat niet als scherm.** Je opdracht noemt Taken en Vandaag, maar taken staan nu op Vandaag, in de Agenda (ook "Zonder datum") en bij Vakanties. | Nieuw Taken-scherm zou scope toevoegen. | Geen Taken-scherm bouwen. De eis "overal dezelfde status" geldt voor deze drie plekken plus Plannen. |

Kleine tegenstrijdigheid om te weten: de besluiten 12–17 staan op `thuisplanner-deel2`, niet op de hoofdlijn (al bekend
als B2 in `docs/projectstatus.md`). Een Plannen-branch vanaf de hoofdlijn mist die documenten, tot die merge is gedaan.

## 2. Productkompas-toets

1. **Principes:** 1 (meer gemak dan gedoe), 2 (rust), 3 (één keer vertellen: leden en taken worden hergebruikt), 7 (kinderen
   zonder account kunnen iets toegewezen krijgen), 8 (hypothese), 9 (geen oordeel over verdeling), de regels "Fouten
   goedkoop" en "Privacy volgt de situatie". Besluiten 2, 12, 13, 15, 16, 17.
2. **Neemt het werk weg?** Ja, als hypothese: wat er moet gebeuren en wie het oppakt staat niet meer in iemands hoofd, en
   losse taken verschijnen vanzelf op Vandaag. Nog geen bewijs. Het wordt pas echt "minder doen" met de sjablonen en
   voorstellen van besluit 13; dit is daarvoor de basis.
3. **Organiseren, onthouden, uitvoeren?** Ja, alle drie.
4. **Eenvoudiger?** Ja, zo gekozen: alleen de titel is verplicht, geen tweede takenlijst, geen tijdlijn, geen reacties,
   geen meldingen, en fases verschijnen pas als je ze zelf toevoegt.
5. **Aandacht, controle en privacy?** Geen meldingen of tellers op Vandaag, geen scores per persoon, gedeeld binnen het
   huishouden en vooraf duidelijk gezegd. Afschermen bij de server via gate 9 (alleen voor de echte versie).
6. **Bewijs?** Nog geen: er zijn geen gebruiksgegevens over plannen. **We testen een hypothese.** Daarom eerst de demo.
7. **Ultieme toets:** ja, mits het licht blijft. Wordt het een projectmanagementtool, dan nee.

**Gates:** demo geen. Backend: B1, gate 9 voor "plannen" en het takendomein, gate besluit 17 voor bijlagen, en een eigen
akkoord per migratie en bucket.

---

## 3. Gebruikersflow

**Klein plan (Schuur opruimen).**
Meer → Plannen → **Nieuw plan** → typ "Schuur opruimen" → **Maken**. Je staat meteen in het plan, met de cursor in
"Taak toevoegen…". Typ vijf taken, elk met Enter. Klaar: geen fase, geen datum, geen formulier. Wie iets oppakt, tikt op
de taak en kiest een naam.

**Groot plan (Zolder verbouwen).**
Hetzelfde begin. Via **Onderdeel toevoegen** maak je Voorbereiding, Verbouwing en Afwerking. Staan er al losse taken,
dan blijven die zonder kop bovenaan staan en verplaats je ze via de taak. Een onderdeel klapt in; het eerste onderdeel
met open taken staat open, de rest dicht (één focus per scherm).

**Dagelijks gebruik.**
Een taak met een datum staat vanzelf op die dag in de Agenda en, vanaf die dag, op Vandaag, met een klein label
"Zolder verbouwen". Afvinken op Vandaag werkt direct door in de voortgang, want het is hetzelfde item. Tik op het label
of open de taak om naar het plan te gaan. Elke wijziging heeft de bestaande melding met **Ongedaan maken**.

**Afronden.**
Alle taken klaar → in het plan verschijnt rustig: "Alles is klaar. Plan afronden?" (geen automatisch sluiten: er kan nog
iets bijkomen). Afgeronde plannen staan ingeklapt onder "Afgerond" en blijven terug te vinden.

**Verwijderen.**
Vanuit Plan bewerken, met de gewone bevestiging en één keuze als er taken zijn: *alleen het plan* (de taken blijven als
losse taken bestaan; dat volgt de `context`-regel in `docs/identiteit-en-items.md` §4.2 en het gedrag van Vakanties) of
*plan en taken*. In beide gevallen met Ongedaan maken.

## 4. Schermindeling (mobiel eerst, 360–390 px)

### 4.1 Meer: de ingang
Eén rij, boven of onder de bestaande rij Vakanties, in dezelfde vorm als `VakantiesRij`:
"Plannen · Zolder verbouwen en nog 1". Niets op Vandaag en geen vijfde tab. Dit is een **voorlopige plek**: na de
gebruikerstesten beoordelen we of Plannen vindbaar genoeg is (beslissing 2, besluit 18).

### 4.2 Overzicht
```text
┌────────────────────────────────────┐
│ DEMO  Fictief gezin · niets ...    │
│ ‹ Meer                             │
│ Plannen                            │
│ Wat pakken jullie samen aan?       │
│ ┌────────────────────────────────┐ │
│ │ Zolder verbouwen               │ │
│ │ Bezig · vóór 18 januari        │ │
│ │ ▓▓▓░░░░░░░░░░░  2 van 10 klaar │ │
│ │ ● Eva  ● Thomas · 2 voor jou   │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ Schuur opruimen                │ │
│ │ Bezig                          │ │
│ │ ▓▓▓░░░░░░░░░░░   1 van 5 klaar │ │
│ │ Samen · 1 voor jou             │ │
│ └────────────────────────────────┘ │
│ [+ Nieuw plan]                     │
│ Afgerond (0)  ⌄                    │
└────────────────────────────────────┘
```
- Kaart in de stijl van `.vak-kaart`, balk uit de bestaande `Voortgang` (die wordt daarvoor uit `Vakanties.tsx` gehaald).
- Sortering: eerst plannen met een einddatum (dichtst bij), dan de rest op laatst aangemaakt.
- Geen rood: een verstreken einddatum wordt een gewone zin ("was vóór 12 oktober").
- **Status is afgeleid, niet in te vullen:** *Nog niet begonnen*, *Bezig*, *Alles klaar*, *Afgerond*.
- Leeg: "Nog geen plannen. Iets groters dat jullie samen willen regelen, zoals de schuur opruimen?" met één knop.

### 4.3 Plan, zonder onderdelen (Schuur opruimen)
```text
│ ‹ Plannen                 Bewerken │
│ Schuur opruimen                    │
│ Eindelijk weer ruimte voor de      │
│ fietsen.                           │
│ ▓▓▓░░░░░░░░░░░   1 van 5 klaar     │
│                                    │
│ (Iedereen) Eva Thomas Lotte Daan   │
│  Nog niemand                       │
│                                    │
│ [Taak toevoegen…                +] │
│ ◐ Oud gereedschap uitzoeken     ›  │
│   ● Thomas · Bezig                 │
│ ○ Spullen naar de kringloop     ›  │
│   ● Eva · vandaag                  │
│ ○ Planken ophangen              ›  │
│   Nog niemand                      │
│ ○ Vegen                         ›  │
│   ● Lotte                          │
│ Afgerond (1)  ⌄                    │
│                                    │
│ Foto's en bestanden                │
│ [foto] [+]                         │
│ + Onderdeel toevoegen              │
```
### 4.4 Plan, met onderdelen (Zolder verbouwen)
```text
│ Zolder verbouwen          Bewerken │
│ Vóór 18 januari · ● Eva ● Thomas   │
│ ▓▓▓░░░░░░░░░░░  2 van 10 klaar     │
│ (Iedereen) Eva Thomas Lotte Daan …  │
│                                    │
│ ⌄ Voorbereiding         2 van 4    │
│   [Taak toevoegen…              +] │
│   ◐ Vergunning nakijken         ›  │
│     ● Eva · Bezig · over 4 dagen   │
│   ○ Budget afspreken            ›  │
│     Nog niemand                    │
│   Afgerond (2)  ⌄                  │
│ › Verbouwing            0 van 3    │
│ › Afwerking             0 van 3    │
│ + Onderdeel toevoegen              │
│ Foto's en bestanden   📎 2         │
```
- Taken blijven de bestaande `TaakRij` (afvinken en openen zijn al aparte knoppen), plus `◐` bij Bezig.
- **Wie doet wat:** de naam en kleur staan op elke rij, en de filter is dezelfde keuzerij als in de Agenda, plus "Nog
  niemand". Dat is de zinvolle vraag voor samenwerken: wat kan ik oppakken?
- **Bewust niet:** percentages of tellingen per persoon en vergelijkingen tussen leden (principe 9). "1 voor jou" is
  alleen voor jezelf.

### 4.5 Taak openen
Het bestaande venster (`DetailVenster`), geen nieuw formulier. Erbij komt alleen wat bij deze taak hoort:
```text
│ Vergunning nakijken                │
│ Status   [Te doen] [Bezig] [Afgerond]
│ Wanneer  over 4 dagen              │
│ Wie      [Eva] [Thomas] [Lotte] …  │  ← meer kiezen mag (alleen demo, §5.1)
│ Plan     Zolder verbouwen          │  ← tik: naar het plan
│ Onderdeel [Voorbereiding] [Geen] … │
│ Bijlagen [offerte.pdf] [+]         │
```
Die velden staan er alleen als de taak bij een plan hoort, of als je die zelf kiest via "Aan plan toevoegen".
Afvinken blijft overal één tik; "Bezig" zit bewust in het venster en is nooit nodig.

### 4.6 Plan aanmaken en bewerken
`Venster` met: **Naam** (verplicht), Omschrijving, Einddatum en Wie, die laatste drie onder "Meer invullen"
(hetzelfde idee als het rustiger Toevoegen-venster). Onderaan één regel: "Iedereen in het huishouden ziet dit plan."

### 4.7 Bijlagen
Een rustige rij met miniaturen onder het plan of in de taak. Tik: groot bekijken. **+**: foto kiezen of bestand kiezen.
In de demo staat er vaste tekst bij: "Demo: nagespeeld, er wordt niets bewaard." De bijlagen van taken staan ook
bij het plan, met de naam van de taak erbij, zodat er niet twee plekken zijn om te zoeken.

### 4.8 Laptop
Dezelfde schermen in de bestaande kolombreedte. Bij een breed scherm kan het plan links en de bijlagen rechts staan, zoals
de zijkolom van de Agenda. Niet nodig voor de eerste versie.

### 4.9 Agenda: de groep "Taken uit plannen" (ontwerpkeuze voor de demo)

**Uitgangspunt:** taken zonder datum mogen ingeklapt zijn, maar nooit uit beeld verdwijnen
(`docs/thuisplanner-agenda.md`, stap 3). Plan-taken zonder datum blijven daarom vindbaar in de Agenda, zonder dat ze de
lijst overnemen.
```text
Dicht (zoals nu):
│ › Zonder datum · 2 open · 9 uit plannen │

Open:
│ ⌄ Zonder datum · 2 open · 9 uit plannen │
│   ○ Aanslag gemeentebelasting nakijken ›│
│   ○ Kattenoppas vragen                 ›│
│     Frankrijk                           │
│   1 afgerond · tonen                    │
│   › Taken uit plannen · 9 open          │

Groep open:
│   ⌄ Taken uit plannen · 9 open          │
│   Zolder verbouwen · 6 open            ›│  ← naar het plan
│   ○ Budget afspreken                   ›│
│   ...                                   │
│   Schuur opruimen · 3 open             ›│
│   ◐ Oud gereedschap uitzoeken          ›│
│     ● Thomas · Bezig                    │
```
- **Regels:** alleen **open** plan-taken zonder datum staan in de groep. De groep is standaard dicht, en blijft open of
  dicht tijdens het navigeren (niet na herladen), net als "Zonder datum" zelf (A8).
- **Telling:** de kop telt losse taken en plan-taken apart. Alleen plan-taken: "Zonder datum · 9 uit plannen". Niets
  open en geen plan-taken: blijft "· niets open". Het gezinsfilter geldt ook voor de groep en de telling.
- **Eén niveau:** per plan een kopje met link, zonder inklappen per plan of per onderdeel. Het planlabel op de rij valt
  hier weg, want het kopje zegt het al.
- **Afvinken:** gewoon `wissel`, met Ongedaan maken. De taak verdwijnt uit de groep en staat bij Afgerond in haar plan.
  Afgeronde plan-taken krijgen hier geen eigen lijst.
- **Laptop-Dag:** in de zijkolom staat "Zonder datum" altijd open; de groep daarin blijft standaard dicht.
- **Vakantietaken veranderen niet:** die blijven in de gewone lijst, met hun label.
- **Zonder plan-taken** (altijd in lokaal en staging): precies het huidige beeld. `takenZonderDatum` blijft alles
  teruggeven (test in `kg3.test.ts`); de verdeling komt in een nieuwe functie.
- **Overwogen en niet gekozen:** gewoon in de lijst (tientallen regels van de zolder), helemaal weglaten (niet vindbaar),
  en inklappen per plan (twee niveaus diep op een telefoon).
- **Te toetsen:** of mensen de groep vinden, of ze de telling begrijpen, en of de kop op 360 px netjes afbreekt.

## 5. Datamodel in de demo (aansluiting op wat er is)

**Het hart:** een taak in een plan is een gewone `Taak` in `staat.items`, met een extra veld, precies zoals een
vakantievoorbereiding nu `vakantieId` heeft. Daardoor werkt afvinken via de bestaande `wissel`, en zien Vandaag, Agenda en
Plannen vanzelf dezelfde status. Dit is de `context`-relatie die `docs/identiteit-en-items.md` §4.2 al voorziet ("vakantie,
(later) project").

```ts
// Uitbreiding van Taak (alles optioneel, dus bestaande taken en tests veranderen niet)
planId?: string | null;
onderdeelId?: string | null;
bezig?: boolean;           // alleen zinvol als klaar === false
ookVoor?: LidId[];         // meer verantwoordelijken, naast het bestaande voor

// Nieuw
interface Plan extends SyncVelden { id; titel; omschrijving?; einddatum: Datum | null; wie: LidId[]; afgerondOp?: Datum | null }
interface PlanOnderdeel extends SyncVelden { id; planId; naam; volgorde: number }
interface PlanBijlage { id; planId; taakId: string | null; naam; soort: 'foto' | 'bestand'; voorbeeld?: string } // alleen demo
```

- **Eén bron voor de status.** `klaar` blijft de enige waarheid voor afgerond. Te doen, Bezig en Afgerond worden afgeleid:
  `klaar ? 'afgerond' : bezig ? 'bezig' : 'te-doen'`. Geen los statusveld dat kan gaan afwijken.
- **Voortgang wordt berekend**, nooit opgeslagen: afgeronde taken gedeeld door alle taken, per plan en per onderdeel, in
  één pure functie in een nieuw `lib/plan.ts`. Bezig telt niet half mee.
- **`Gegevens` in `store.ts`** krijgt `plannen`, `onderdelen` en `bijlagen`, zodat Ongedaan maken ook "plan met taken
  verwijderen" in één keer terugzet.
- **Niet doen:** een plan-taak als apart type, of kopieën van taken.

### Wat er verandert in bestaande schermen

| Plek | Wijziging | Risico |
| --- | --- | --- |
| `TaakRij`, `WeekTaakRij` | Klein planlabel, naast `VakantieLabel`; `◐` en "Bezig" | Laag |
| `DetailVenster`, `ItemVenster` | Status, plan en onderdeel | **Hoog:** zie §5.1 |
| `filter.ts` (`taakPast`) | Ook `ookVoor` meetellen, plus "Nog niemand" | Laag |
| `ZonderDatum` | De inklapbare groep "Taken uit plannen" (§4.9); `AgendaStand` krijgt `planTakenOpen` | Laag |
| `takenVandaag` | Niets: een taak met datum komt er zoals altijd op. Geen plankaart op Vandaag | – |
| `Meer` | De rij, plus de tekst "Wat werkt er in deze demo?" | Laag |
| `App.tsx`, `context.tsx` | Scherm `plannen`, route `#/plannen/<id>` | Laag, wel botsing met Spullen (zelfde regels) |

### 5.1 Voorwaarde: geen gegevensverlies bij meerdere verantwoordelijken

**Stand:** alle routes zijn gecontroleerd door de code te lezen (`d03fa8d`; regelnummers van die stand). **Getest is nog
niets:** de tests hieronder kunnen pas als er code is. Zij zijn een voorwaarde voor de bouw (besluit 18), geen nazorg.

Bij de controle bleek het probleem groter dan `wie[0]`: "Alles bewerken" bouwt de taak opnieuw op en zou ook het plan,
het onderdeel en Bezig weggooien.

| # | Route | Waar | Wat er nu gebeurt | Wat er moet gebeuren |
| --- | --- | --- | --- | --- |
| R1 | Taak openen en wijzigen | `DetailVenster.tsx:48`, `:89`, `:169` | Leest alleen `voor`, schrijft `wie[0]`, en de keuze is één persoon | Alle personen lezen en schrijven; meerkeuze |
| R2 | "Alles bewerken" | `ItemVenster.tsx:113`, `:232–235`, `:436` | **Bouwt een nieuw object zonder de oude taak over te nemen**: wat niet in de lijst staat, verdwijnt | Alle personen; alle overige velden blijven staan |
| R3 | Opslaan in de staat | `store.ts`: `bijwerken`, `behoudVakantie` | Vervangt het hele item; alleen de vakantie wordt beschermd | Vangnet voor `ookVoor`, `planId`, `onderdeelId`, `bezig` (ontbreekt = niet gewijzigd) |
| R4 | De + direct | `SnelInvoer.tsx:143`, `:276` | Schrijft `wie[0]`, en de keuze is één persoon | Alle gekozen personen |
| R5 | De + via "Alles invullen" | `SnelInvoer.tsx:130` naar `ItemVenster.tsx:113`, `:233` | Geeft `wie` door, en het formulier schrijft `wie[0]` | Zelfde als R2 |
| R6 | De zin in de + | `zin.ts:410–417` | Bij meer namen geen personen: de namen blijven in de titel, met de melding "Een taak is voor één persoon" | Geen verlies, en herkenning blijft zo in de eerste versie; **de meldingstekst klopt dan niet meer** en wordt: "De namen blijven in de titel. Meer personen kies je bij de taak." |
| R7 | De keuzelijst | `Keuzepanelen.tsx:58–66`, `ItemVenster.tsx:271–278` | `enkel`: een tik **vervangt** de hele selectie | Meerkeuze in de demo |
| R8 | Lokaal en staging | `omzetten.ts:71`, `:130`, `staat.ts:87–89`, `:160–162`, `ItemVenster.tsx:237` | De server kent één `assignee_member_id` | **Keuze blijft `enkel` zolang de server niet meer kan.** Anders kies je twee personen en bewaart de server stil één |
| R9 | Weergave | `Rijen.tsx:136`, `:141`, `:162`, `:167–169` | Toont alleen `voor` | Iedereen tonen ("Thomas +1" in de week) |
| R10 | Filter | `filter.ts:16` | Kijkt alleen naar `voor` | Ook `ookVoor`; zo blijft de taak vindbaar bij een tweede persoon |

**Geen risico gevonden:** `wissel` (neemt de hele taak over), Ongedaan maken (een kopie van de staat), en de routes die
altijd nieuw beginnen met één of geen persoon: `Vakanties.tsx:270` en `Vandaag.tsx:114`. Op de branch van Spullen ook
`AntwoordKaart.tsx:66` en `Spullen.tsx:331`; die branch voegt `spulId` toe aan de taak, dus R2 en R3 moeten bij de
samenvoeging ook daarop worden nagelopen.

**Aanpak: één plek in plaats van zes.**
- `taakMensen(t)` geeft `[voor, ...ookVoor]`; `metMensen(t, wie)` schrijft `voor = wie[0] ?? null` en de rest in `ookVoor`.
  Geen enkel scherm schrijft nog zelf `wie[0]`.
- **Leeg en ontbrekend zijn verschillend:** `ookVoor: []` betekent "niemand anders meer"; ontbreekt het veld, dan
  verandert er niets. Anders kun je een tweede persoon nooit meer verwijderen.
- R2 neemt de oude taak over met `...vorig`, net als R1.
- Eén vlag bepaalt de keuze: meerkeuze alleen als `!lokaal`.

**Tests, eerst geschreven (de bouw van deze stap begint pas als ze falen op de oude routes):**

| Test | Controleert |
| --- | --- |
| T1 | Taak voor Eva en Lotte: titel wijzigen via R1 → beide personen blijven |
| T2 | Idem via "Alles bewerken" (R2) → beide personen, plan, onderdeel, Bezig, `klaar` en `klaarOp` blijven |
| T3 | Alleen de datum wijzigen, via beide vensters → alles blijft |
| T4 | Eerste persoon uitzetten → de tweede wordt `voor`; `ookVoor` wordt `[]` |
| T5 | Tweede persoon uitzetten → `ookVoor` is `[]` en blijft dat na opslaan (geen terugkeer door het vangnet) |
| T6 | Alle personen uitzetten → "Nog niemand" |
| T7 | Nieuwe taak via de + met twee personen (R4 en R5) → beide bewaard |
| T8 | Afvinken, weer openzetten, Ongedaan maken → personen blijven |
| T9 | Filter op de tweede persoon vindt de taak in Agenda, Zonder datum en plan; de rij toont beide personen |
| T10 | Eerst via R1 wijzigen, daarna via R2, daarna weer R1 → steeds dezelfde personen en velden |
| T11 | Lokaal en staging: keuze is één persoon, en `naarTaakVelden` bevat geen plan- of `ookVoor`-veld |
| T12 | Taak zonder `ookVoor` (bestaand): gedrag en bestaande tests in `detail.test.tsx` ongewijzigd |
| T13 | **Tegenproef:** zet `wie[0]` tijdelijk terug in een route; de test van die route moet falen |

De end-to-endproef op 360 en 390 px doorloopt T1, T2 en T9 achter elkaar op één taak, vanaf Vandaag, Agenda en plan.

### Demogegevens (fictief, nieuw in `data/demo.ts`)

- **Zolder verbouwen:** einddatum over ±75 dagen; Eva en Thomas. Onderdelen Voorbereiding (zolder leegruimen en offertes
  dakraam: afgerond; vergunning nakijken: Bezig, over 4 dagen; budget afspreken: te doen), Verbouwing (dakraam laten
  plaatsen, isolatie, elektra), Afwerking (muren schilderen door Eva en Lotte, vloer leggen, bureau Daan terugzetten).
  Bijlagen: "Zolder nu (voorbeeld)" en "Offerte dakraam (voorbeeld).pdf", duidelijk verzonnen.
- **Schuur opruimen:** geen onderdelen en geen einddatum, 5 taken zoals in §4.3.
- **Tellingen:** één taak op *vandaag* in de gewone dag ("Spullen naar de kringloop"), om te laten zien dat afvinken doorwerkt.
  Dat wijzigt de samenvatting op Vandaag, dus een paar tests en schermafbeeldingen gaan mee. De **rustige dag blijft
  ongewijzigd rustig**: daarin staan geen plan-taken met een datum van vandaag.

## 6. Demo en echte backend, strikt gescheiden

| | **Demo (dit voorstel)** | **Echt (later, apart akkoord per stap)** |
| --- | --- | --- |
| Opslag | Alleen het geheugen van het tabblad; herladen zet terug | Supabase met RLS |
| Taken | `staat.items` | `public.tasks`, uitgebreid |
| Bijlagen | Verzonnen voorbeelden en een eigen bestand als tijdelijke `blob:`-link; nooit verstuurd | Privé-bucket, kort geldige links |
| Samenwerking | **Alleen nagespeeld:** je bent altijd Eva, en je ziet toewijzingen. Geen tweede telefoon, geen live bijwerken | Realtime-seintjes en versiecontrole via de bestaande sync |

### 6.1 Wat de scheiding bewaakt
- Plannen is **alleen zichtbaar in de demomodus**: geen rij in `MeerLokaal`, en `#/plannen` valt in lokaal en staging terug
  op Vandaag. Dus ook niet bij Sanne op staging.
- De planvelden gaan niet mee in `naarTaakVelden` (`omzetten.ts`), en de keuze van personen blijft daar één persoon (§5.1,
  R8 en T11).
- Test: een stagingbuild toont geen Plannen.
- De `Demo`-labels blijven zichtbaar bij de nagespeelde bijlagen, zoals Spullen dat nu doet.

### 6.2 Benodigde schema-uitbreidingen (schets; geen migratie maken)
Nummer: de eerstvolgende vrije ná de reservering 28–30.
```sql
create table public.plans (id, household_id, title, description, due_date, closed_on, version, created_at, updated_at, deleted_at,
  unique (household_id, id));
create table public.plan_members (household_id, plan_id, member_id, primary key (...)); -- samengestelde FK's
create table public.plan_sections (id, household_id, plan_id, name, position, version, ..., unique (household_id, plan_id, id));

alter table public.tasks
  add column plan_id uuid,            -- FK (household_id, plan_id), on delete set null (plan_id)
  add column plan_section_id uuid,    -- FK (household_id, plan_id, plan_section_id): onderdeel hoort bij hetzelfde plan
  add column started_on date,         -- Bezig; done_on blijft de enige waarheid voor afgerond
  add constraint één_context check (trip_id is null or plan_id is null);

create table public.task_members (household_id, task_id, member_id, primary key (...));
```
Patronen bestaan al: `tasks.trip_id`, de grants per kolom, `household_id`-verwijzingen zoals `trip_packing_lists`.
Geen `status`-kolom: die zou naast `done_on` en `done_by_member_id` een tweede waarheid worden.

**`assignee_member_id` blijft bestaan** als eerste verantwoordelijke, voor oudere app-versies. De minimale app-versie staat
nog open; dat is een aandachtspunt, want een oude app kan `task_members` niet bijwerken.

**Eén gedeeld vinkje.** Bij twee verantwoordelijken is er één status: wie afvinkt, rondt af voor iedereen. Moet het per
persoon, dan zijn het twee taken (de hulpregel uit `docs/identiteit-en-items.md`).

**Herhalende taken (besluit 15)** horen niet in een plan in de eerste versie: voortgang bij iets dat steeds terugkomt
heeft geen duidelijke betekenis. Tegen de tijd van de migratie afdwingen.

**Mee te nemen in de bouw:** de lijsten in `thuisplanner/sync/thuisplanner-sync.js`, `rls_tests.sql` en de tegenproeven,
`verbinding-controle.mjs` (de verwachte tabellen), de data-export en het verwijderscript.

### 6.3 Bijlagen in de echte versie
Hergebruik `documents` en de bucket `documenten` van Spullen; geen tweede opslag. Drie dingen passen daar nog niet op:
1. `document_links.possession_id` is `not null`. **Advies: een aparte `plan_document_links`** (`document_id`, `plan_id`,
   optioneel `task_id`), zodat de bewezen Spullen-tests (volgens de bouwsessie RLS 94/94 met tegenproeven, opslag 8/8) ongemoeid blijven.
2. `documents.kind` kent geen `foto`, en verbouwfoto's horen niet tussen je garanties. Soort erbij, en standaard
   verborgen in Documenten.
3. Alleen documenten die voor het huishouden zichtbaar zijn koppelen. Dat voorkomt het hele vraagstuk van een persoonlijk
   document in een gedeeld plan.

**Aandachtspunten:** op de iPhone komt een foto mogelijk als HEIC binnen, en de bucket staat alleen PDF, JPEG, PNG en WebP
toe: dat moet worden getest en waarschijnlijk op het toestel omgezet. Verkleinen tot ±0,5 MB is nodig. De kostenraming in
Spullen §6.8 gaat uit van 3 documenten per maand; **plannen met foto's zitten daar ruim boven**, dus de raming moet
opnieuw. De opslaglimiet van het gratis abonnement moet ik nog verifiëren voor een besluit; ik heb die niet opgezocht.

## 7. Eenvoudig en meer werk

Schattingen in werkdagen, grof en niet gemeten.

| Onderdeel | Omvang | Waarom |
| --- | --- | --- |
| **Direct eenvoudig (demo)** | | |
| Overzicht, kaarten, voortgang, afgeleide status | 1 | `Voortgang`, `.vak-kaart` en `Vakanties.tsx` bestaan al |
| Plan aanmaken, bewerken, verwijderen | 0,5–1 | Patroon van `VakantieVensters` |
| Taken via `planId`, afvinken overal gelijk | 0,5 | Patroon van `vakantieId`; `wissel` bestaat |
| Demogegevens, label op rijen, de rij in Meer | 0,5 | |
| **Iets meer (demo)** | | |
| Onderdelen: maken, hernoemen, inklappen, taak verplaatsen | 1 | Geen slepen op mobiel; volgorde via omhoog/omlaag |
| Bezig: de derde stand in rij en venster | 0,5 | |
| Meer verantwoordelijken, met de routes en tests uit §5.1 | 2 | Raakt bestaande formulieren; tests eerst |
| De groep "Taken uit plannen" in de Agenda | 0,5 | `ZonderDatum` bestaat al |
| Bijlagen nagespeeld | 1 | Kan leunen op Spullen, als dat dan gemerged is |
| Tests (Vitest, e2e op 360/390, donker), iPhone-proef | 1–2 | Ook de scheidingstests |
| **Totaal demo** | **±7–9** | |
| **Veel meer (echt)** | | |
| KG-5E licht (voorwaarde, staat al in het bèta-plan) | 3–4 | Niet begonnen |
| Migratie plannen en onderdelen, sync, gate 9, tegenproeven | 5–8 | Grove raming, op basis van Vakanties |
| `task_members` en het takendomein aanpassen | 2–4 | Raakt tasks-RLS, sync en oude clients |
| Echte bijlagen (na de oplevering van Spullen) | 3–5 | Gate 17, export, verwijderprocedure, HEIC |
| Plannen via de + ("schuur opruimen" als plan herkennen) | 2–3 | Raakt `intentie.ts` op de branch van Spullen |
| Sjablonen en AI-voorstel (besluit 13) | Eigen traject | Kwaliteitsproef, AVG, kostenplafond |

## 8. Technische aandachtspunten

- **Werkplek:** een eigen worktree `Thuisplanner-plannen` op branch `thuisplanner-plannen`, vanaf de hoofdlijn `d03fa8d`.
  **Niet** in `Thuisplanner-vakanties` (ongecommitte wijzigingen) of `Thuisplanner-spullen`.
- **Botsingen bij latere merge:** `App.tsx`, `context.tsx`, `store.ts`, `types.ts`, `Meer.tsx`, `Iconen.tsx`, `app.css`
  worden ook door Spullen gewijzigd. Daarom alles wat kan in nieuwe bestanden (`screens/Plannen.tsx`,
  `components/PlanVensters.tsx`, `lib/plan.ts`, `data/plannen-demo.ts`) en korte haakjes in de bestaande.
- **`Voortgang`, `BlokKop` en `Afgerond`** zitten nu lokaal in `Vakanties.tsx`. Verplaatsen raakt de open wijzigingen in dat
  bestand op de Vakanties-worktree. Advies: verplaatsing tot de merge uitstellen en in de eerste versie een klein eigen
  gedeeld component maken, of die verplaatsing als aparte kleine stap doen nadat Vakanties is gecommit.
- **De + in de eerste versie:** de "Taak toevoegen…"-regel in het plan is de snelste weg; de centrale + blijft taken
  maken, en die kun je via het venster aan een plan toevoegen. Dat is een tijdelijke afwijking van "de + is het
  uitgangspunt" (roadmap) en is bewust: herkenning wacht op de + van Spullen (`intentie.ts`).
- **Toegankelijkheid:** `◐` krijgt `aria-checked="mixed"`, tik gaat naar afgerond; `Voortgang` heeft al `role=progressbar`.
- **Lange titels:** de kaarten moeten `overflow-wrap: anywhere` houden, net als bij Vakanties.
- **Privacy bij samengestelde gezinnen:** plannen gaan nooit over een koppeling (besluit 12); ze staan daar niet in de
  deelbare soorten.
- **Niet in de eerste versie:** reacties of chat, activiteitenlijst, meldingen (besluit 16 noemt "de volgende stap van een
  project": later), sjablonen, afhankelijkheden, tijdlijn, budget, boodschappen in een plan.

## 9. Beslissingen (producteigenaar, 4 november 2026)

| # | Vraag | Besluit |
| --- | --- | --- |
| 1 | Zijn Plannen en slimme projecten één begrip, en wordt de gate van besluit 13 gesplitst? | Ja, beide (besluit 18) |
| 2 | Plek | **Voorlopig onder Meer; geen permanente navigatiekeuze. Evalueren na gebruikerstesten.** |
| 3 | Volgorde | Demo mag vóór KG-5E licht; de backend pas na KG-5E licht en na bèta 1 |
| 4 | Status | Bezig alleen in het venster, afronden via het gewone vinkje, plan-status afgeleid; geen handmatige stand in de eerste versie |
| 5 | Verantwoordelijken | Meer per taak, met één gedeeld vinkje; `voor` blijft de eerste, voor oudere versies. **Voorwaarde: §5.1** |
| 6 | Plan-taken zonder datum | **Blijven vindbaar in de Agenda, in de inklapbare groep "Taken uit plannen" onder Zonder datum (§4.9).** Dit vervangt het eerdere advies om ze weg te laten |
| 7 | Bijlagen | Later via `documents` en een eigen koppeltabel; foto's standaard verborgen in Documenten |
| 8 | Zichtbaarheid | Eerste versie alleen gedeeld, met een zin in het venster; privé later als het echt gemist wordt |
| 9 | Plan verwijderen | Taken blijven standaard als losse taken bestaan, met de keuze "plan en taken" |
| 10 | Voorbeeld op Vandaag | Eén taak in de gewone dag; de rustige dag blijft ongewijzigd |

## 10. Evaluatie na gebruikerstesten

Bij de eerste test met gezinnen beoordelen we in elk geval:
- **Plek:** vinden mensen Plannen onder Meer, of zoeken ze het elders? Dat voedt de navigatiegate (beslissing 2).
- **Agenda:** wordt de groep "Taken uit plannen" gevonden en begrepen, of is die ballast?
- **Bezig:** gebruikt iemand het echt?
- **Meer verantwoordelijken:** gebruikt, of is één persoon genoeg?
- **Het hele onderdeel:** neemt het werk weg, of is het een extra lijst om bij te houden (principe 1)?

## 11. Volgorde (elke stap met eigen akkoord)

1. Worktree aanmaken, vanaf de hoofdlijn.
2. Stap A: kleine plannen (overzicht, plan, taken, voortgang, afvinken overal gelijk). **Dan even kijken op de telefoon.**
3. Stap B: onderdelen, Bezig en de groep "Taken uit plannen".
4. Stap C: meer verantwoordelijken, **met eerst de tests uit §5.1**, en het filter.
5. Stap D: bijlagen, nagespeeld.
6. Volledige tests en iPhone-proef; daarna apart beslissen over commit en eventuele publicatie.
