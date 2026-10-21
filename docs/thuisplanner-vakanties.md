# Thuisplanner: Vakanties (F8)

**Status:** ontwerp **besloten op 21 oktober 2026** door de producteigenaar (V0). V1 is op hoofdlijnen akkoord;
het datamodel is akkoord als ontwerpkeuze. **V1.1 (database, RLS, tests) is op 21 oktober 2026 lokaal gebouwd en
getest**, na het afzonderlijke akkoord op lokaal toepassen en testen (§12.5). Niet gecommit, niet op staging. Geen
commits, pushes, merges of deployments zonder akkoord. V1.2 (sync) en V1.3 (app) zijn nog niet begonnen.

- **Hoort bij:** Thuisplanner-fase F8 ("Vakantie", gate 9) in `docs/roadmap.md`, sectie "Ontwikkelrichting
  Thuisplanner"; stap 2.8 ("Vakantie-to-do's worden taken") en de rij "Vakanties" in "Functies die voorlopig blijven".
- **Gelezen vóór dit ontwerp:** `PRODUCT_PRINCIPLES.md`, `docs/productkompas-beslissingen.md`, `docs/roadmap.md`,
  `docs/identiteit-en-items.md` (§3 en §4), `docs/huisplan-ux-contract.md` (Vakantie), `docs/nachtwerkplan.md`
  (mijlpaal L), `docs/dataformaat-v1.md`, `docs/thuisplanner-inhoud.md`, `docs/thuisplanner-sync.md`,
  `thuisplanner/README.md`, de migraties in `thuisplanner/supabase/migrations`, `thuisplanner/sync/thuisplanner-sync.js`
  en de app in `thuisplanner/app/src`.
- **Grenzen:** Huisplan (`index.html`, `test/index.html`, `supabase/`, Firebase) blijft volledig ongemoeid; er worden
  geen Huisplan-gegevens overgezet. Het online-stagingtraject staat hier los van: Vakanties komt pas op staging na een
  apart besluit.

## 1. Besluiten

### 1.1 Productbeslissingen (21 oktober 2026, eerste ronde)

| # | Besluit | Gevolg |
|---|---|---|
| D1 | Vakanties wordt een volwaardig onderdeel, bereikbaar via **Meer** en waar relevant via **Vandaag**. | Geen nieuwe tab (navigatiegate, beslissing 2). |
| D2 | Nuttige Huisplan-functies blijven, met een betere gebruikservaring. | Vakantie met datum en bestemming, aftellen, paklijst per persoon, voorbereidingen, notities, hergebruik van een vorige lijst, afvinken opnieuw beginnen, verwijderen met ongedaan maken. |
| D3 | Geen vakantiebudget. | Vervalt (de roadmaprij "alle tabbladen blijven" is hiermee voor Thuisplanner beslecht). Wat een latere import met Huisplan-budgetten doet, valt onder het importbesluit. |
| D4 | Geen automatische bestemmingstips. | Vervalt; geen verkeer naar Nominatim/Overpass. Bestemming is een tekstveld. |
| D5 | Paklijst standaard per gezinslid, plus de groep **Gezamenlijk**. | Groepen = actieve leden (ook kinderen zonder account) + Gezamenlijk. Geen vrije groepen in V1. |
| D6 | Pakitems zijn gedetailleerd (sokken, onderbroeken, shirts). | Lange lijsten: snel achter elkaar invoeren en duidelijke voortgang per persoon. |
| D7 | Geen aantallen, geen gedeeltelijk afvinken. | Eén vinkje per item. |
| D8 | Een eerdere paklijst hergebruiken zonder bestaande items te overschrijven. | Overnemen vult aan en slaat over wat er al staat. |
| D9 | Voorbereidingen staan los van de paklijst en zijn gewone taken. | `tasks.trip_id`. |
| D10 | Afspraken en boodschappen koppelen zonder onnodige dubbele items. | Boodschappen via een koppeltabel; afspraken via `event_details` (V2). |
| D11 | Geen categorieweergave voor paklijsten. | Geen categorieën of kopjes. |
| D12 | Rustig, mobielvriendelijk, huidige huisstijl. | `thuisplanner/ontwerp/tokens.css` ongewijzigd. |

### 1.2 Besluiten na de beoordeling van het V1-voorstel (21 oktober 2026, tweede ronde)

| # | Besluit | Verwerkt in |
|---|---|---|
| R1 | V1-functionaliteit en schermindeling: akkoord op hoofdlijnen. | §3, §4 |
| R2 | Datamodel `trips`, `trip_packing_items`, `trip_shopping_links`, `tasks.trip_id`: akkoord op de ontwerpkeuze; de migratie pas na de technische controles en een afzonderlijk uitvoeringsakkoord. | §5, §12 |
| R3 | Afspraken koppelen in V2, met de beschreven privacytoets. | §6.3 |
| R4 | **Niet definitief vastleggen dat er nooit een Taken-scherm komt.** Voor V1 zijn Vandaag en Agenda voldoende om voorbereidingen te bereiken. | §6.1 |
| R5 | Gedeelde vakanties zijn genoeg voor V1; privévakanties zijn een latere ontwerpbeslissing. | §6.4 |
| R6 | Een vakantie kan **zonder datum, met alleen een vertrekdatum, of met beide datums**. Een einddatum zonder vertrekdatum hoeft niet. | §5.1, §6.5 |

Aandachtspunten van de producteigenaar, verwerkt:
- persoonskeuze op smalle telefoons duidelijk en makkelijk te bedienen (§4.4);
- geen aantallen, categorieën of gedeeltelijk afvinken (§3);
- de twee uitzonderingen bij ongedaan maken verwerkt én getest (§7, §9, §12);
- oude vakantiekoppelingen van hergebruikte boodschappen verschijnen niet opnieuw als actueel (§6.2, §9, §12).

## 2. Productkompas-toets V1

1. **Principes:** 1 (meer gemak dan gedoe), 2 (rust: één kaart op Vandaag, geen badges), 3 (één keer vertellen: geen
   dubbele taken of boodschappen), 4 (een tweede vakantie begint niet leeg), 7 (lid ≠ label; kinderen zonder account
   doen mee), "fouten goedkoop" (alles ongedaan te maken, overnemen overschrijft niets), "privacy volgt de situatie".
2. **Neemt het werk weg?** Ja: de paklijst van vorige keer hergebruiken; voorbereidingen verschijnen vanzelf in de
   Agenda en op Vandaag; één boodschappenlijst voor alles.
3. **Organiseren, onthouden of uitvoeren?** Ja.
4. **Kan het eenvoudiger?** Drie onderdelen in plaats van vijf Huisplan-tabs; geen budget, tips, categorieën, aantallen
   of sjabloonbeheer; koppelingen op bestaande items in plaats van nieuwe itemsoorten.
5. **Aandacht, controle, privacy:** geen meldingen; alles gedeeld binnen het huishouden en afgedwongen door RLS; het
   privacygevoelige deel (afspraken) pas in V2 met eigen bewijs.
6. **Bewijs:** de paklijst per persoon is de bewezen kern uit Huisplan; de rest is een hypothese die we met de testers
   toetsen.
7. **Ultieme toets:** ja, het huishouden hoeft minder te onthouden en minder dubbel in te voeren.

**Gate 9** (besluit 11): moet aantoonbaar gehaald zijn voor `trips`, `trip_packing_items`, `trip_shopping_links` en
`tasks.trip_id` vóór de app deze gegevens leest of schrijft (§12.4).

## 3. Wat V1 doet

- **Vakanties:** aanmaken met alleen een naam; vertrekdatum, einddatum en bestemming optioneel (R6); naam, datums en
  bestemming aanpassen; verwijderen met ongedaan maken. Vanzelf ingedeeld in Komend / Nu / Eerder (§6.5).
- **Paklijst:** per lid + Gezamenlijk; snel achter elkaar toevoegen; afvinken (één vinkje); tekst aanpassen;
  verplaatsen naar een andere persoon of Gezamenlijk; verwijderen (ook vegen); alles ongedaan te maken; geen dubbele
  items per persoon; voortgang per persoon.
- **Overnemen** van een eerdere vakantie, voor iedereen of één persoon: aanvullend, niet afgevinkt, ongedaan te maken.
- **Afvinken opnieuw beginnen** (bijvoorbeeld voor de terugreis), voor één persoon of iedereen, ongedaan te maken.
- **Voorbereidingen** als gewone taken met de vakantie gekoppeld; zichtbaar bij de vakantie, in de Agenda en (met een
  datum) op Vandaag. Een bestaande taak koppelen of loskoppelen via het taak-detail.
- **Te kopen:** gewone boodschappen op de gewone lijst, gekoppeld aan één of meer vakanties.
- **Notities:** één tekstveld per vakantie.
- **Vandaag:** één kaart rond en tijdens de vakantie. **Agenda:** de vakantie zichtbaar in de week.
- **Niet in V1:** afspraken koppelen, een weergave voor tijdens de reis, "Handig onderweg" (V2). Nooit (besloten):
  budget, bestemmingstips, categorieën, aantallen, gedeeltelijk afvinken.

## 4. Schermen op mobiel

### 4.1 Meer
Nieuwe rij boven "Huishouden": "✈ Vakanties", met als ondertitel de eerstvolgende vakantie ("Frankrijk · over 9
dagen") of "Paklijsten en voorbereidingen".

### 4.2 Vakanties (lijst)
```
‹ Meer          Vakanties      [＋]
NU            (alleen als er een loopt)
KOMEND
  Frankrijk          12–26 jul · nog 9 dagen
  Kerst Texel        vertrek 27 dec
  Noorwegen          nog geen datum
EERDER (3)                        ⌄
```
Komend: op vertrekdatum, vakanties zonder datum onderaan. Eerder: nieuwste eerst, ingeklapt. Lege staat: "Nog geen
vakanties. Plan je eerste vakantie: de paklijst kun je daarna steeds hergebruiken." met een knop.

### 4.3 Nieuwe vakantie en aanpassen (bestaand `Venster`)
```
Naam          [Frankrijk          ]
Vertrek       [12 jul ]            (optioneel)
Terug         [26 jul ]            (optioneel; pas te kiezen na een vertrekdatum)
Bestemming    [Ardèche            ] (optioneel)
                     [ Bewaren ]
```

### 4.4 Eén vakantie
```
‹ Vakanties                      ⋯
Frankrijk
12–26 jul · Ardèche
Nog 9 dagen
┌──────────┬──────────┬──────────┐
│ Regelen  │ Inpakken │ Notities │
└──────────┴──────────┴──────────┘
```
- ⋯-menu: naam, datums en bestemming aanpassen; vakantie verwijderen (ongedaan te maken; gekoppelde taken en
  boodschappen blijven bestaan, alleen het label verdwijnt).
- Aftelling: "Nog N dagen" / "Morgen" / "Vandaag vertrek" / "Dag 3 van 15" (met einddatum) of "Dag 3" (zonder) /
  "Afgelopen" / niets zonder datum.
- Het laatst gekozen onderdeel wordt **per toestel** onthouden (lokale voorkeur, niet in de gedeelde data).

**Inpakken**
```
┌────────────┐┌─────────────┐┌───────────┐
│ Bas  12/40 ││ Sanne 30/52 ││ Loïs 0/38 │
└────────────┘└─────────────┘└───────────┘
┌──────────────────┐
│ Gezamenlijk 4/21 │
└──────────────────┘
Loïs · 0 van 38 ingepakt
┌───────────────────────────────────┐
│ ＋ Toevoegen voor Loïs…            │
├───────────────────────────────────┤
│ ○ Sokken                          │
│ ○ Onderbroeken                    │
│ ○ Shirts korte mouw               │
│ …                                 │
├───────────────────────────────────┤
│ Ingepakt (12)                   ⌄ │
└───────────────────────────────────┘
⋯  Overnemen van een eerdere vakantie · Afvinken opnieuw beginnen
```
**Persoonskeuze op smalle telefoons** (aandachtspunt):
- de knoppen **lopen door op een volgende regel** in plaats van horizontaal te schuiven: iedereen is altijd zichtbaar,
  ook op 320 px, zonder verborgen namen buiten beeld;
- elke knop is minstens 44 px hoog, met de naam en klein de voortgang ("12/40"); te lange namen worden afgekapt met
  "…", de volledige naam staat in het label voor schermlezers;
- de gekozen persoon is gevuld in de accentkleur, de anderen hebben een rand in hun ledenkleur (`--lid-1..4`);
- de keuze wordt herhaald in de kop ("Loïs · 0 van 38 ingepakt") en in het invoerveld ("Toevoegen voor Loïs…"), zodat
  nooit twijfel is voor wie je invoert;
- volgorde: leden in hun vaste volgorde, Gezamenlijk als laatste; de eerste keer staat de keuze op jezelf; daarna
  onthoudt het toestel de laatste keuze per vakantie.

Gedrag:
- het invoerveld blijft open na Enter (snel achter elkaar invoeren, D6);
- tik op het rondje = afvinken (het item zakt naar "Ingepakt"); tik op de tekst = klein venster: tekst aanpassen,
  verplaatsen naar een andere persoon of Gezamenlijk, verwijderen; vegen naar links = verwijderen;
- dezelfde tekst nog eens bij dezelfde persoon: "Staat al op de lijst van Loïs", niets dubbel;
- een lege lijst terwijl er een eerdere vakantie met een paklijst is: één rustige regel "Begin met de paklijst van
  Italië 2026?" [Overnemen].

**Overnemen:** kies een eerdere vakantie (nieuwste eerst, met het aantal items), dan "Iedereen" of één persoon →
"34 items overgenomen · Ongedaan maken". Wat er al staat, wordt overgeslagen; overgenomen items zijn niet afgevinkt;
items van een lid dat niet meer actief is, worden overgeslagen.

**Afvinken opnieuw beginnen:** "Voor Loïs" of "Voor iedereen" → "38 vinkjes weggehaald · Ongedaan maken".

**Regelen**
```
VOORBEREIDINGEN
  ＋ Voorbereiding toevoegen…
  ○ Vignet regelen            za 4 jul · Bas
  ○ Paspoort Loïs ophalen           Sanne
  ○ Kattenoppas vragen
  Klaar (2) ⌄
TE KOPEN
  ＋ Boodschap toevoegen…
  ○ Zonnebrand
  ✓ Reisziekte-tabletten
```
- Een voorbereiding opent het bestaande `DetailVenster` (dag, wie, "Hoort bij vakantie"). Volgorde: open met datum op
  datum, dan open zonder datum; klaar ingeklapt.
- Te kopen: staat de boodschap al op de lijst, dan "Stond al op de lijst, nu ook voor Frankrijk". Rijmenu: "Niet meer
  voor deze vakantie". Het blok verdwijnt als de vakantie voorbij is.

**Notities:** één tekstveld, bewaard met een korte vertraging en versiecontrole; bij een gelijktijdige wijziging de
bestaande conflictmelding.

### 4.5 Vandaag, Agenda, Boodschappen en taak-detail
- **Vandaag:** één kaart vanaf 14 dagen vóór vertrek tot en met de laatste dag (§6.5); bij meer vakanties de
  eerstvolgende. "✈ Frankrijk · over 9 dagen" met daaronder "3 voorbereidingen open · ingepakt 46/151"; tijdens de
  vakantie "✈ Frankrijk · dag 3 van 15". Tik opent de vakantie. Daarbuiten geen kaart.
- **Agenda (week):** op de dagen van de vakantie een dunne regel "✈ Frankrijk" boven de afspraken; zonder einddatum
  alleen op de vertrekdag ("✈ Frankrijk · vertrek"). Gekoppelde taken krijgen een klein label. De vakantie zelf wordt
  geen agenda-item.
- **Boodschappen:** een klein grijs label met de vakantie(s) waarvoor de boodschap **nu** nodig is (§6.2).
- **Taak-detail:** regel "Hoort bij vakantie: Frankrijk ›" (kiezen uit komende en lopende vakanties, of "Geen").

## 5. Datamodel (gebouwd in V1.1, alleen lokaal; migratie `20261025120000_vakanties.sql`)

### 5.1 `public.trips`
`id uuid` (door de app gemaakt), `household_id`, `name` (1–100), `start_date date`, `end_date date`,
`destination` (≤ 100), `notes` (≤ 4000), `version`, `created_at`, `updated_at`, `deleted_at`.
- Datumregel (R6): `end_date is null or (start_date is not null and end_date >= start_date)`. Dus geen datum, alleen
  een vertrekdatum, of beide; nooit alleen een einddatum.
- `unique (household_id, id)`; index `(household_id, start_date)`.

### 5.2 `public.trip_packing_items`
`id`, `household_id`, `trip_id`, `member_id` (leeg = Gezamenlijk), `name` (1–100), `name_key` (gegenereerd: kleine
letters, enkele spaties, zoals `shopping_items.name_key`), `packed_at`, `packed_by_member_id`, `version`, `created_at`,
`updated_at`, `deleted_at`.
- Uniek: `(household_id, trip_id, coalesce(member_id, nul-uuid), name_key) where deleted_at is null`.
- `packed_by_member_id` alleen met `packed_at`.

### 5.3 `public.trip_shopping_links`
`id`, `household_id`, `trip_id`, `shopping_item_id`, `settled_at`, `version`, `created_at`, `updated_at`, `deleted_at`.
- `settled_at`: de koppeling is **afgehandeld** (de boodschap is gekocht en daarna voor iets anders teruggezet, §6.2).
  Alleen de server zet dit veld.
- Uniek: één **actuele** koppeling per vakantie en boodschap:
  `(household_id, trip_id, shopping_item_id) where deleted_at is null and settled_at is null`.

### 5.4 `public.tasks`
Kolom `trip_id` met een samengestelde verwijzing naar `trips`.

### 5.5 Waarom deze vorm
- **Taken: kolom.** Een taak komt niet terug na afronden; één vakantie per taak is genoeg. De koppeling erft versie,
  seintje en conflictcontrole van de rij.
- **Boodschappen: koppeltabel.** Een boodschap is één rij per naam (`kg5c_inhoud.sql:154`) die steeds terugkomt:
  `add_shopping_items` zet een afgevinkte boodschap weer open in dezelfde rij (`kg5d_herstel3.sql:79-95`, uitkomst
  `terug`). Een kolom zou bij twee vakanties een koppeling overschrijven en bij hergebruik een oude koppeling laten
  "doorlekken".
- **Afspraken (V2): in `event_details`,** het enige deel dat bij "Bezet" niet leesbaar is (§6.3).
- **Paklijst: eigen tabel.** Inpakken is geen kopen (`docs/identiteit-en-items.md:545-549`).
- Alle nieuwe tabellen volgen het bestaande patroon (samengestelde verwijzingen op `household_id`, `guard_content`,
  `ping_content`, zacht verwijderen), dus geen nieuwe soort beveiliging of synchronisatie.

## 6. Regels voor koppelingen

### 6.1 Taken (R4)
- Een voorbereiding is een gewone taak met `trip_id`: één item, zichtbaar bij de vakantie, in de Agenda (op de dag of
  onder "Taken zonder datum") en met een datum op Vandaag. Eén keer afvinken geldt overal.
- V1 voegt **geen** apart Taken-scherm toe; Vandaag en Agenda zijn voor V1 genoeg om voorbereidingen te bereiken.
  **Een later Taken-scherm blijft uitdrukkelijk mogelijk** (een navigatiebesluit, beslissing 2); de koppeling via
  `tasks.trip_id` werkt daar zonder aanpassing.
- Een vakantie verwijderen laat de taken staan; het label verdwijnt. Ongedaan maken brengt het label terug.

### 6.2 Boodschappen: één item, meerdere contexten, geen oude koppelingen als actueel
- Een boodschap kan bij geen, één of meer vakanties horen ("Frankrijk · Texel"). Eén keer afvinken geldt overal (één
  aankoop, geen aantallen).
- Koppelen gebeurt in dezelfde transactie als het toevoegen (`add_shopping_items` met `p_trip`); ook als de boodschap
  al op de lijst stond (`al_op_lijst`) of terugkomt (`terug`).
- **Hergebruik sluit oude koppelingen af.** Komt een afgevinkte boodschap via toevoegen terug op de lijst (`terug`),
  dan zet de server bij al haar actuele koppelingen `settled_at`. Gevolg:
  - "Zonnebrand" in juli voor Frankrijk gekocht en in december gewoon weer toegevoegd: géén label "Frankrijk" op de
    lijst, en bij Frankrijk niet opnieuw "te kopen";
  - wordt hij teruggezet vanuit een vakantie, dan krijgt alleen díe vakantie een nieuwe, actuele koppeling;
  - een afvinkje terugdraaien als correctie (in Boodschappen het vinkje weer weghalen) is geen hergebruik: de
    koppeling blijft actueel.
- **Wat waar verschijnt:**
  - het label op de boodschappenlijst: alleen actuele koppelingen (niet afgehandeld, niet verwijderd) van vakanties die
    niet voorbij zijn;
  - "Te kopen" bij een vakantie: actuele koppelingen met de huidige status van de boodschap; afgehandelde koppelingen
    als "✓ gekocht" (als er voor die boodschap geen actuele koppeling is); bij een afgelopen vakantie niets.
- Ontkoppelen = de koppeling zacht verwijderen; de boodschap blijft op de lijst.
- Een verwijderde en later opnieuw toegevoegde boodschap is een nieuwe rij zonder koppeling.

### 6.3 Afspraken (V2) en privacy (R3)
Pas in V2, met een eigen gate 9-bewijs. De V1-structuur verandert daarvoor niet.
1. `trip_id` komt in `event_details`, **nooit in `events`** (`events` is ook bij een privé-afspraak voor ieder lid
   leesbaar, `kg5c_inhoud.sql:298`).
2. `event_details` is alleen leesbaar bij een gedeelde afspraak of voor de eigen account
   (`kg5c_herstel1.sql:42-55`), en voor niemand bij een gearchiveerd lid (`archief_bewaartermijn.sql:31-48`);
   `event_overview` geeft bij "Bezet" vanzelf `trip_id = null`.
3. De vakantiepagina leest afspraken alleen uit `event_overview`. **Geen tellers of samenvattingen op `trips`.**
4. Seintjes blijven `{t, id, v, op}`, zonder vakantie-ID.
5. AVG: een echt verwijderde privé-afspraak neemt de koppeling via de bestaande cascade mee.
6. Bewijs: KG-T33 uitbreiden en een tegenproef met `events.trip_id`. V1.1 legt al een catalogustest vast dat `events`
   geen `trip_id` heeft (§12.4, KG-T83).

### 6.4 Zichtbaarheid (R5)
In V1 zijn vakanties, paklijsten en koppelingen **gedeeld** binnen het huishouden, zoals taken en boodschappen:
ieder actief lid leest en wijzigt. Privévakanties zijn een latere ontwerpbeslissing onder gate 9.

### 6.5 Datums en fase (R6)
- **Laatste dag:** de einddatum; zonder einddatum geldt een vakantie als maximaal 14 dagen (vertrekdatum + 13),
  totdat iemand een einddatum invult.
- **Komend:** geen datum, of vertrek na vandaag. **Nu:** vertrek ≤ vandaag ≤ laatste dag. **Eerder:** laatste dag vóór
  vandaag.
- Deze afleiding gebeurt in de app (één functie, met unittests); de database bewaart alleen de datums.

## 7. Ongedaan maken, met de twee uitzonderingen

Algemeen: elke verwijdering, verplaatsing en wijziging toont "Ongedaan maken". Ongedaan maken is zelf een gewone
schrijfactie met versiecontrole.

**U1. Herstellen botst met een item dat intussen opnieuw is ingevoerd.** Iemand verwijdert "Sokken" bij Loïs en voegt
daarna opnieuw "Sokken" toe; daarna wordt de verwijdering ongedaan gemaakt. Twee keer "Sokken" kan niet (unieke
index). Uitkomst: de database weigert (23505), de app meldt "Staat al op de lijst van Loïs" (bestaande soort `dubbel`
in `meldingVoor`) en er verandert niets. Hetzelfde geldt voor verplaatsen naar een persoon die het item al heeft, en
voor een tekstwijziging naar een tekst die bij die persoon al bestaat. Bij een koppeling van een boodschap die
intussen opnieuw gekoppeld is, telt herstellen als geslaagd (de koppeling bestaat al).

**U2. Een herhaalde overname na een verloren antwoord.** Opgelost in plaats van geaccepteerd: elke overname krijgt een
vaste opdracht-ID van de app, en de server leidt de ID van elk nieuw item af uit (opdracht-ID, bron-item-ID). Een
herhaling met dezelfde opdracht-ID maakt niets dubbel én geeft **dezelfde** items terug, zodat "Ongedaan maken" ook dan
werkt.

**Veiligheid bij ongedaan maken van bulkhandelingen:**
- ongedaan maken van een overname verwijdert alleen overgenomen items die sindsdien **niet zijn aangepast** (nog
  versie 1). Wat iemand intussen afvinkte of wijzigde, blijft staan: "2 items bleven staan omdat ze intussen zijn
  aangepast";
- ongedaan maken van "afvinken opnieuw beginnen" zet alleen items terug die sindsdien niet zijn aangepast (versie
  komt overeen); de rest wordt gemeld en blijft zoals hij is.

## 8. Synchronisatie en app (V1.2 en V1.3, globaal)

- **Sync** (`thuisplanner/sync/thuisplanner-sync.js`): nieuwe velden en lijsten (`VELDEN_*` :32-36, `leeg()` :90,
  `SORTEER` :127, `OPDRACHTEN` :187, `haalOp` :372-395, `vernieuw` :419-425, `opSeintje` :446), acties (:776-871),
  types in `thuisplanner-sync.d.ts`. Taken krijgen `trip_id` in `VELDEN_TAAK`. P1: vakantie-inhoud blijft alleen in
  het geheugen.
- **Prestaties:** alleen pakitems ophalen van vakanties die niet voorbij zijn; een afgelopen vakantie haalt haar lijst
  op bij openen. Overnemen gebeurt op de server, dus de bronlijst hoeft niet op het toestel te staan.
- **App:** `lib/types.ts` (`Vakantie`, `Pakitem`, `vakantieId` op `Taak`, koppelingen bij `Boodschap`),
  `lib/lokaal/omzetten.ts` en `staat.ts`, demomodus (`lib/store.ts`, `data/demo.ts`), nieuw scherm
  `screens/Vakanties.tsx` via Meer, een selector in `lib/vandaag.ts`, de periode in `screens/Agenda.tsx`, het label in
  `screens/Boodschappen.tsx`, de regel "Hoort bij vakantie" in `DetailVenster`/`ItemVenster`.

## 9. Acceptatiecriteria V1

Lokaal (en later op staging, na een apart besluit), met twee accounts in één huishouden en een kind zonder account.

**Vakanties en datums**
1. Een vakantie aanmaken met alleen een naam; later datums en bestemming toevoegen; de naam wijzigen.
2. Drie datumvormen werken: zonder datum (Komend, "nog geen datum"), met alleen een vertrekdatum, met beide datums.
   Een einddatum is pas te kiezen na een vertrekdatum; de database weigert een einddatum zonder vertrekdatum en een
   einddatum vóór de vertrekdatum.
3. Komend / Nu / Eerder klopt voor alle drie vormen; zonder einddatum is een vakantie "Nu" vanaf de vertrekdag en
   "Eerder" na 14 dagen, of eerder zodra een einddatum is ingevuld die voorbij is.
4. De aftelling klopt: nog N dagen, morgen, vandaag vertrek, dag X van Y (met einddatum), dag X (zonder), afgelopen.
5. Een vakantie verwijderen en ongedaan maken; gekoppelde taken en boodschappen blijven bestaan.

**Paklijst**
6. Per persoon (beide volwassenen, het kind, Gezamenlijk) snel achter elkaar toevoegen; de voortgang per persoon klopt.
7. Op 320 px breed zijn met vijf groepen alle personen zichtbaar zonder horizontaal schuiven; elke knop is minstens
   44 px hoog; de gekozen persoon staat ook in de kop en in het invoerveld.
8. Afvinken: het item zakt naar "Ingepakt"; de ander ziet het binnen enkele seconden op de andere telefoon.
9. Aanpassen, verplaatsen, verwijderen (ook vegen) en ongedaan maken.
10. "Sokken" twee keer bij dezelfde persoon geeft geen dubbel item ("Staat al op de lijst"); bij twee personen wel twee.
11. **U1:** "Sokken" verwijderen, opnieuw "Sokken" toevoegen, dan de verwijdering ongedaan maken → melding "Staat al op
    de lijst", één item "Sokken". Ook bij verplaatsen en hernoemen naar een bestaand item.
12. Overnemen voor iedereen en voor één persoon: alles komt over, niet afgevinkt; bestaande items blijven staan;
    nog eens overnemen voegt niets dubbel toe.
13. **U2:** overnemen waarbij het eerste antwoord verloren gaat (in de test nagebootst) → de herhaling geeft dezelfde
    items terug; "Ongedaan maken" haalt precies de overgenomen items weg.
14. Ongedaan maken van een overname laat items staan die iemand intussen afvinkte of wijzigde, met een melding.
15. Afvinken opnieuw beginnen voor één persoon en voor iedereen, en ongedaan maken; intussen gewijzigde items worden
    gemeld en niet overschreven.
16. Er zijn geen aantallen, geen categorieën en geen gedeeltelijk afvinken.

**Voorbereidingen**
17. Een voorbereiding toevoegen bij de vakantie: zonder datum in de Agenda onder "Taken zonder datum" met het label;
    met een datum op die dag in de Agenda en op Vandaag; afvinken op Vandaag = afgevinkt bij de vakantie.
18. Een bestaande taak via het detail koppelen en loskoppelen.

**Boodschappen**
19. Een boodschap toevoegen bij de vakantie: op de gewone lijst met het label; afvinken in Boodschappen = afgevinkt
    bij de vakantie.
20. Dezelfde naam bij een tweede vakantie geeft één item met twee labels; een boodschap die al op de lijst stond,
    wordt gekoppeld en niet verdubbeld.
21. **Oude koppelingen:** "Zonnebrand" voor Frankrijk afvinken (gekocht) en daarna in Boodschappen gewoon opnieuw
    toevoegen → geen label "Frankrijk", en bij Frankrijk staat hij als "✓ gekocht", niet als "te kopen".
22. Het vinkje bij een gekoppelde boodschap per ongeluk zetten en weer weghalen → de koppeling blijft actueel.
23. Na afloop van een vakantie verdwijnen haar labels uit Boodschappen en het blok "Te kopen" bij de vakantie.
24. "Niet meer voor deze vakantie" haalt alleen de koppeling weg.

**Overig**
25. Notities op twee telefoons; bij gelijktijdig wijzigen de bestaande conflictmelding.
26. Vandaag toont de kaart vanaf 14 dagen vóór vertrek tot en met de laatste dag, en daarbuiten niet.
27. De Agenda toont de vakantie in de week (zonder einddatum alleen op de vertrekdag).
28. Werkt in de demomodus en in de lokale Supabase-modus; leesbaar op 320 px, licht en donker.
29. Een lid van een ander huishouden kan niets lezen of wijzigen; een gearchiveerd lid ook niet (RLS-tests, §12.4).

## 10. Later uitbreiden zonder herbouw

| Later | Wat erbij komt | Wat in V1 niet verandert |
|---|---|---|
| Afspraken koppelen (V2) | `event_details.trip_id`, parameter in `save_event`/`edit_occurrence`, sectie Planning | tabellen, sync en schermen van V1 |
| Tijdens de reis (V2) | volgorde op de vakantiepagina; eventueel `trip_infos` | gegevens van V1 |
| Een Taken-scherm (als besloten) | een weergave op `tasks` | `tasks.trip_id` |
| Vrije groepen (huisdier, auto) | kolom `group_label` | bestaande items |
| Zelf volgorde slepen | kolom `sort` | — |
| Privévakanties | een zichtbaarheidsontwerp onder gate 9 | gedeelde vakanties |
| Slimme + "voor Frankrijk" | herkenning in `lib/zin.ts` | koppelingen |
| Voorstellen uit eerdere reizen | lezen van bestaande pakitems | — |
| Import uit Huisplan | vertaalregels (§13) | — |

Bewust niet speculatief: geen lege kolommen "voor later" en geen generieke `links`-tabel.

## 11. Bouwvolgorde en status

| Stap | Inhoud | Status |
|---|---|---|
| V0 | Dit document; de roadmap bijgewerkt | **Gedaan** (21 oktober 2026, lokaal, niet gecommit) |
| V1.1 | Database, RLS en tests (§12), alleen lokaal; daarna een onafhankelijke review | **Lokaal gebouwd en getest** (21 oktober 2026; akkoord op lokaal toepassen en testen); niet gecommit, niet op staging; wacht op review |
| V1.2 | Sync-module, types, integratietests (twee accounts, seintjes) | Na V1.1 |
| V1.3 | Schermen, demodata, unit- en e2e-tests, `CHANGELOG.md` | Na V1.2 |
| — | Staging | Apart besluit, los van het lopende stagingtraject |
| V2 | Afspraken koppelen (eigen gate 9-bewijs), tijdens de reis | Na V1 en gebruik |

## 12. V1.1 — database, RLS en tests (akkoord 21 oktober 2026; lokaal gebouwd, zie §12.5)

Niets hiervan is uitgevoerd. Na akkoord: één migratie, alleen lokaal toegepast en getest; geen staging, geen
commit of push zonder akkoord.

### 12.1 Migratie `thuisplanner/supabase/migrations/20261025120000_vakanties.sql`

**Tabellen** (§5), elk met:
- samengestelde verwijzingen op `household_id` (patroon `tasks_assignee_fkey`, `kg5c_inhoud.sql:132`):
  `trip_packing_items` en `trip_shopping_links` → `trips` (`on delete cascade`; een vakantie wordt alleen hard
  verwijderd met het hele huishouden); `member_id` en `packed_by_member_id` → `household_members` (`on delete cascade`
  resp. `set null (packed_by_member_id)`; leden worden in Thuisplanner niet hard verwijderd, alleen met het huishouden);
  `shopping_item_id` → `shopping_items`; `tasks.trip_id` → `trips` (`on delete set null (trip_id)`);
- checks op lengte en datums (§5.1), `packed_by` alleen met `packed_at`;
- indexen: `trips (household_id, start_date)`, `trip_packing_items (household_id, trip_id)`,
  `trip_shopping_links (household_id, shopping_item_id)`, `tasks (household_id, trip_id) where trip_id is not null`,
  plus de unieke indexen uit §5.2 en §5.3.

**Rechten en RLS** (vorm van `kg5c_inhoud.sql:315-336`):
- `enable row level security`; `revoke all … from public, anon, authenticated`;
- `select` + kolomrechten:
  - `trips`: insert (`id, household_id, name, start_date, end_date, destination, notes`), update (`name, start_date,
    end_date, destination, notes, deleted_at`);
  - `trip_packing_items`: insert (`id, household_id, trip_id, member_id, name`), update (`name, member_id, packed_at,
    packed_by_member_id, deleted_at`);
  - `trip_shopping_links`: insert (`id, household_id, trip_id, shopping_item_id`), update (`deleted_at`); **geen**
    recht op `settled_at`;
  - `tasks`: `trip_id` toevoegen aan de bestaande insert- en update-rechten;
- policies select/insert/update met `household_id in (select private.my_household_ids())` (via de poort, KG-T73);
- geen delete-recht; geen tabel in een publicatie (KG-T27).

**Triggers:** `private.guard_content()` (versie, tijden, vaste kolommen, actief lid) en `private.ping_content()`
(seintje `{t, id, v, op}`) op alle drie tabellen. Extra trigger op `trip_packing_items` en `trip_shopping_links`:
`trip_id` en (voor koppelingen) `shopping_item_id` zijn vast na invoegen.

**Functies** (logica in `private.*` als security definer: eerst `require_uid`, `lock_household_shared`,
`is_active_member`; een dunne `public.*` als security invoker met de foutwrapper zonder DETAIL/HINT uit
`kg5c_herstel2`):
1. `add_shopping_items(p_household, p_ids, p_names, p_trip uuid default null)` vervangt de huidige versie
   (`kg5d_herstel3.sql:28`). Zonder `p_trip` precies het huidige gedrag (de bestaande tests blijven ongewijzigd groen).
   Met `p_trip`: de vakantie moet in hetzelfde huishouden bestaan en niet verwijderd zijn; bij uitkomst `terug` eerst
   `settled_at = now()` op alle actuele koppelingen van die boodschap, daarna (bij alle uitkomsten) een actuele
   koppeling met `on conflict do nothing`. Alles in dezelfde transactie, dus het opdrachtregister
   `private.shopping_commands` maakt een herhaling volledig idempotent. Ook zonder `p_trip` sluit `terug` de oude
   koppelingen af (§6.2).
2. `copy_packing_items(p_household, p_command uuid, p_from_trip, p_to_trip, p_member uuid default null,
   p_gezamenlijk boolean default false)` → de items van deze opdracht (`id, member_id, name`). Bron en doel in hetzelfde
   huishouden, niet verwijderd, niet gelijk. Neemt niet-verwijderde bron-items over van actieve leden en Gezamenlijk
   (of alleen `p_member`, of alleen Gezamenlijk), slaat bestaande (zelfde persoon + `name_key`) over, zet niets
   afgevinkt. Nieuwe ID = afgeleid uit (`p_command`, bron-item-ID) via `private.afgeleide_id`, dus een herhaling geeft
   dezelfde items terug (U2).
3. `set_packed(p_household, p_trip, p_items jsonb)` met per item `{id, version, packed, packed_at?, packed_by?}`
   (hoogstens 1000): zet of wist `packed_at` en `packed_by_member_id` voor items van die vakantie. Standaard het moment
   nu en het lid van de aanroeper; `packed_at`/`packed_by` herstellen bij ongedaan maken de oorspronkelijke stand
   (niet in de toekomst; alleen een actief lid). Items met een andere versie worden overgeslagen en teruggemeld
   (`outcome` = `gezet` of `overgeslagen`, §7).

Ongedaan maken van een overname gebruikt geen nieuwe functie: één update via PostgREST op de teruggegeven ID's met
`version = 1`.

### 12.2 Documentatie bij V1.1
`docs/thuisplanner-inhoud.md` (nieuw domein, gate 9-bewijs), `thuisplanner/README.md` (de grens "geen inhoudstabellen
(… vakantie)" bijwerken), een regel in `CHANGELOG.md`.

### 12.3 Wat V1.1 niet doet
Geen wijziging aan `events`/`event_details` (V2); geen sync- of app-code; geen seed met echte gegevens (een fictieve
vakantie in `seed-lokaal.sql` volgt bij V1.3); geen staging.

### 12.4 Tests (gate 9-bewijs voor het domein Vakanties)

**RLS-matrix** (`thuisplanner/supabase/tests/rls_tests.sql`, nieuwe scenario's):

| Test | Wat bewezen wordt |
|---|---|
| KG-T76 | `trips`: lid leest en schrijft binnen het eigen huishouden; niet-lid, ander huishouden en gearchiveerd lid niet; geen delete; vaste kolommen; versie +1; datumregels (einddatum zonder vertrek, einde vóór vertrek geweigerd; geen datum, alleen vertrek en beide toegestaan). |
| KG-T77 | `trip_packing_items`: huishoudgrens; vakantie of lid van een ander huishouden geweigerd; uniek per persoon + tekst (ongeacht hoofdletters en spaties), wel dezelfde tekst bij een andere persoon en bij Gezamenlijk; herstellen, verplaatsen of hernoemen naar een bestaand item geeft 23505 en verandert niets (U1); `packed_by` zonder `packed_at` geweigerd; `trip_id` vast. |
| KG-T78 | `trip_shopping_links`: huishoudgrens; vakantie of boodschap van een ander huishouden geweigerd; `settled_at` niet door de client te schrijven; één actuele koppeling per vakantie en boodschap; ontkoppelen en opnieuw koppelen. |
| KG-T79 | `tasks.trip_id`: vakantie van een ander huishouden geweigerd; bestaand takengedrag ongewijzigd. |
| KG-T80 | `add_shopping_items` met `p_trip`: koppeling bij `nieuw`, `al_op_lijst` en `terug`; `terug` sluit oude koppelingen af (ook zonder `p_trip`); herhaalde opdracht maakt geen tweede koppeling; vakantie van een ander huishouden: algemene fout, geen bijwerking; zonder `p_trip` gedrag gelijk aan nu. |
| KG-T81 | `copy_packing_items`: aanvullend; slaat bestaande items, verwijderde bron-items en niet-actieve leden over; één persoon; herhaling met dezelfde opdracht-ID geeft dezelfde ID's (U2); bron = doel, of bron/doel van een ander huishouden geweigerd. |
| KG-T82 | `set_packed`: zetten en terugzetten; versieverschil overgeslagen en teruggemeld; items van een andere vakantie of ander huishouden niet geraakt. |
| KG-T83 | Voorbereiding V2-privacy: `public.events` heeft geen kolom `trip_id`; geen view of functie leest `trip_id` van een afspraak buiten `event_details`. |

Daarnaast blijven KG-T27, KG-T33, KG-T73–KG-T75 en `statisch.js` (RLS op elke tabel, `public` = invoker) groen.

**Tegenproeven** (`tegenproeven.txt`, elk moet de bijbehorende test laten falen): het datumcheck weghalen;
`grant delete` op een nieuwe tabel; een policy `using (true)`; de unieke index op pakitems weghalen; `settled_at`
schrijfbaar maken; het afsluiten bij `terug` weghalen; willekeurige ID's in `copy_packing_items`; de versiecontrole in
`set_packed` weghalen; een kolom `events.trip_id` toevoegen.

**Gelijktijdigheid** (`integratie/gelijktijdig.test.mjs`, met echte aparte verbindingen en de bestaande
`KG_TEGENPROEF`): twee leden voegen tegelijk hetzelfde pakitem toe (één wint); twee overnames tegelijk (geen
dubbelingen); twee leden voegen tegelijk dezelfde boodschap met koppeling toe (één boodschap, één actuele koppeling).

**Integratie** (`integratie/vakanties.test.mjs`, een eigen bestand zonder `psql`): via PostgREST en Realtime als echte
gebruikers: invoegen, bijwerken met versie, overnemen, vinkjes, koppelen, de oude aanroep van `add_shopping_items`
zonder vakantie, en seintjes op de drie tabellen met alleen `{t, id, v, op}`.

**Waar:** alleen tegen de lokale Supabase-stack (`thuisplanner/supabase/tests/run.sh`, `integratie/run.sh`).

### 12.5 Uitvoering en resultaten (21 oktober 2026, lokaal)

Gebouwd na het akkoord "migratie lokaal toepassen en testen; geen commit, push of staging":

- **Migratie** `thuisplanner/supabase/migrations/20261025120000_vakanties.sql`, toegepast op een eigen lokale stack
  (project `thuisplanner`, poorten 55321–55324) met `supabase migration up --local`. Niet op staging of een ander
  online project. Kleine afwijkingen van §5 en §12.1:
  - de kolommen van pakitems heten `name`/`name_key`, gelijk aan `shopping_items`;
  - `copy_packing_items` heeft een extra parameter `p_gezamenlijk` (alleen Gezamenlijk overnemen);
  - `set_packed` kan bij ongedaan maken het oorspronkelijke moment en de oorspronkelijke persoon terugzetten;
  - een extra trigger op pakitems controleert dat een persoon een actief lid is (ook bij verplaatsen); een trigger op
    koppelingen houdt vakantie, boodschap en `settled_at` vast.
- **Tests aangepast:** de matrix telt nu 83 scenario's (`rls_tests.sql`, `run.sh`, `statisch.js`); tegenproef 56
  (de oude `add_shopping_items`) en de tegenproef in `integratie/herstel3.test.mjs` gebruiken de nieuwe signatuur met
  vier parameters; `integratie/run.sh` draait ook `vakanties.test.mjs`.

| Controle | Resultaat |
| --- | --- |
| RLS-matrix op de lokale stack, vóór de migratie | 75 van 75 |
| RLS-matrix na de migratie, zonder nieuwe scenario's | 75 van 75 (bestaand gedrag ongewijzigd) |
| RLS-matrix met KG-T76 t/m KG-T83 | **83 van 83** |
| Tegenproeven (alle 125) | 124 van 125 gevangen; de ene (56, oude signatuur) aangepast en daarna los gevangen door KG-T38 |
| Gelijktijdigheid (`gelijktijdig.test.mjs`, 16 scenario's, waarvan 4 nieuw) | 16 van 16; tegenproef: het nieuwe scenario "archiveren tijdens overnemen" laat zonder vergrendeling de fout zien |
| API en Realtime (`vakanties.test.mjs`) | 2 van 2 |
| `poort.test.mjs`, `uitnodiging.test.mjs` | 6 van 6 |
| Statische controles (`statisch.js`) | geslaagd, Huisplan ongewijzigd |

**Niet gedraaid op deze machine:** de integratiesuites die `psql` op de host nodig hebben (`integratie.test.mjs`,
`sync.test.mjs`, `herstel.test.mjs`, `herstel2.test.mjs`, `herstel3.test.mjs` en de tegenproef daarvan,
`react.test.mjs`, `p1p2.test.mjs`, `k1.test.mjs`, `uitnodigingsmail.test.mjs`), plus de syncdemo- en app-e2e. Op deze
Windows-machine staat geen PostgreSQL-client. Ze draaien in de workflow `thuisplanner-db.yml` (job `supabase-lokaal`)
zodra er een PR is, of lokaal na het installeren van een PostgreSQL-client. De aanroep van `add_shopping_items` zonder
vakantie (zoals de sync-module die doet) is wel via de API getest.

**Let op voor het stagingtraject:** de migratie staat ongecommit in de gedeelde werkmap. Een `supabase db push` vanuit
deze map zou haar meenemen; dat mag niet zonder apart besluit.

## 13. Bijlage: Huisplan-vakanties (alleen gelezen)

Ter vergelijking; Huisplan blijft ongewijzigd. Regels in `index.html`; `test/index.html` is voor Vakanties identiek
(ca. 809 regels later).

| Functie | Bron |
|---|---|
| Toegang via Meer → Vakanties en via de pil in de Vandaag-kop | `index.html:1266`, `:3513-3517`, `:7289` |
| Eén scherm met chips per vakantie, vertrekdatum met aftelling, bestemming, ⋯-menu, vijf subtabs (Paklijsten, To-do, Notities, Budget, Bestemming) | `:6915-7288` |
| Datamodel `{id, naam, startDatum, paklijst:{persoon:[…]}, todos, notes, bestemming, budget, _tab, _osmCache}`; personen zijn vrije labels | `:6921`, `docs/dataformaat-v1.md:83-88`, `docs/dataformaat-v1.schema.json:233-259` |
| Kopiëren van een andere vakantie (overschrijft), afvinkjes resetten, verwijderen met ongedaan maken | `:6939-6960`, `:2080-2088` |
| Paklijst per label, to-do's zonder datum of toewijzing, notities, budget, OSM-tips | `:7011-7287` |
| Koppelingen: alleen aftelling (Vandaag-pil, briefing, Meer); geen agenda, taken, boodschappen of zoeken | `:3513-3517`, `:6769-6778`, `:5143-5150` |
| Beperkingen: geen hernoemen, geen einddatum, geen archief, `_tab`/`_osmCache` in gedeelde data, vermoedelijk verouderde verwijzingen na een sync (niet bevestigd) | `:6990`, `:6986`, `:2707`, `docs/fase1-notities.md:15-20` |

**Import (later, eigen gates):** vakantie → `trips` (vertrekdatum, geen einddatum); `paklijst[label]` → pakitems bij
het lid als het label een bevestigd lid is, anders in Gezamenlijk met het label vóór de tekst (beslissing 6: label ≠
lid); `todos` → taken met `trip_id`; `notes` → `notes`; `_tab` en `_osmCache` niet; budget volgens het importbesluit.
