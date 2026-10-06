# Huisplan roadmap

De permanente roadmap van Huisplan. Leidend zijn:

- het Productkompas in `PRODUCT_PRINCIPLES.md`;
- de beslissingen en harde randvoorwaarden in `docs/productkompas-beslissingen.md`.

Waar deze roadmap daarvan afwijkt, gaan het Productkompas en de beslissingen voor. Meld zo'n
afwijking dan eerst.

**Leesvolgorde:**
1. `PRODUCT_PRINCIPLES.md`
2. `docs/productkompas-beslissingen.md`
3. `docs/roadmap.md` (dit document)
4. de relevante fase- of technische documentatie, zoals `docs/identiteit-en-items.md`,
   `docs/ontwerp-1.4.2.md`, `docs/fase1-notities.md`, `docs/dataformaat-v1.md` en
   `supabase/README.md`
5. pas dan de implementatie

**Wat hier wel en niet staat:**
- Deze roadmap bevat wat, waarom, volgorde, afhankelijkheden, status en gates.
- Concrete implementatie, uitgebreide tests en migratie-instructies staan in de fase- of technische
  documentatie, niet hier.

- **Bron:** de uitvoeringsroadmap zoals vastgesteld op 2 oktober 2026, met dezelfde fases, stappen
  en volgorde.
- **Bijgewerkt:** 5 oktober 2026, met de beslissingen 1–10 en de aanvullingen daarop uit
  `docs/productkompas-beslissingen.md`. Op 6 oktober 2026 aangevuld met stap 1.4.2 en de zeven
  architectuurbesluiten uit `docs/identiteit-en-items.md` (sectie 7, vastgesteld op 6 oktober
  2026). Wat daarbuiten nog een voorstel is, is gemarkeerd als 📝.
  De status van 1.4.1 is bijgewerkt naar live. Daarna aangevuld met besluit 8 (herbruikbaar
  verhuisslot; 1.5 en 1.12 blijven afzonderlijke migraties) bij 1.4.2, 1.5 en 1.12, en met besluit 9
  (na de review van het 1.4.2-plan) bij 1.4.2. Stap 1.14 is gemarkeerd als follow-up.
- **Status:** volgens `CHANGELOG.md`.

**Legenda**

| Status | Betekenis |
| --- | --- |
| **Live** | Afgerond en in de live-app (`index.html`). |
| **Afgerond** | Afgerond zonder app-wijziging (backend of documentatie). |
| **Open PR** | Gebouwd, maar nog niet gemerged. |
| **Gepland** | Nog niet begonnen. |

| Markering | Betekenis |
| --- | --- |
| ⛔ **Gate** | Harde randvoorwaarde: moet aantoonbaar zijn geregeld vóór het genoemde moment. |
| 🔁 **Later herbeoordelen** | Bewust nog niet opgelost. Bij het genoemde moment opnieuw beoordelen. |
| ✏️ **Aangepast** | Gewijzigd door een expliciete beslissing over het Productkompas. |
| 📝 **Voorstel** | Nog niet besloten; geldt pas na een besluit van de producteigenaar. |

## Productkompas-toets (werkwijze vanaf nu)

Elke nieuwe stap of wijziging van een stap wordt vóór de start kort getoetst. Leg de antwoorden
vast in de notities van de fase (bijvoorbeeld `docs/fase1-notities.md`).

1. Welke principes uit `PRODUCT_PRINCIPLES.md` raakt deze stap?
2. Neemt dit daadwerkelijk werk of denkwerk weg?
3. Hoort dit bij organiseren, onthouden of uitvoeren van het huishouden?
4. Kan het eenvoudiger?
5. Is aandacht, controle en privacy goed beschermd?
6. Is er werkelijk gebruik of bewijs, of testen we nog een hypothese?
7. **Ultieme toets:** hoeft het huishouden hierdoor minder te onthouden, regelen of organiseren?

Controleer daarnaast of er een ⛔ gate voor de stap geldt en of die is gehaald. Is een gate niet
gehaald, of botst de stap met het Productkompas, dan stoppen we en melden we dat vóór de
implementatie.

De toets hoeft niet met terugwerkende kracht te worden ingevuld voor bestaande of afgeronde stappen.

## Uitgangspunten

- **Niets verdwijnt in deze roadmap.**
  - Functies die de audit wilde heroverwegen, krijgen een andere plek, worden instelbaar of worden
    een gefilterde weergave. Ze blijven werken.
  - Of iets definitief weggaat, beslissen we later op basis van werkelijk gebruik (stap 2.14,
    beslissing 10).
- **Bestaande data gaat nooit verloren.** Elke stap met een datamigratie:
  - maakt eerst een back-up;
  - is versie-gebonden;
  - kan worden teruggedraaid;
  - laat de oude data een bewaartermijn lang staan.
- **Eén stap is één afgeronde wijziging:**
  - een eigen branch en commit, of een kleine reeks;
  - groene tests en een regel in de changelog;
  - eerst in de testversie (`test/index.html`).
- **Supabase is de nieuwe backend.** De roadmap bouwt voort op het bestaande schema in `supabase/`.
- **Eerst leden, dan backend.** De lastigste datawijziging (van 'ik' en 'partner' naar member-ID's)
  gebeurt in de huidige data, los van de wissel naar Supabase. Zo veranderen er nooit twee dingen
  tegelijk.
- **Migraties niet testen op de echte planner.** De testversie in `/test/` gebruikt dezelfde
  Firebase-data als de live-app. Stappen met een datamigratie worden eerst getest op een kopie van
  de data, nooit via `/test/` op de echte planner.
- **Automatisering** ✏️ (beslissing 1):
  - Bij twijfel vraagt Huisplan één keer. Na voldoende zekerheid en toestemming kan het de
    handeling voortaan zelfstandig uitvoeren.
  - Hoe groter het gevolg van een fout, hoe meer bevestiging nodig is.
  - Automatisering moet zichtbaar, voorspelbaar en eenvoudig terug te draaien zijn.
  - De risicogrenzen uit principe 5 blijven leidend.
- **Verdienmodel** ✏️ (beslissing 3):
  - De gratis versie blijft bruikbaar voor organiseren.
  - Premium verkoopt extra gemak, automatisering, AI en koppelingen.
  - Bestaande huishouddata worden niet gegijzeld.
  - Een Premium-proefperiode blijft mogelijk. Wat vervalt, is dat de hele planner na afloop
    alleen-lezen of onbruikbaar wordt.

## Overzicht van de gates

| Gate | Geldt vóór | Beslissing |
| --- | --- | --- |
| Activiteit of auteurschap maakt iemand niet automatisch huishoudlid. 1.5 respecteert deze regel en verspreidt het bekende probleem met externe gebruikers niet verder; 1.6 lost het structureel op. | 1.5 (persoonsmigratie) en 1.6 (centraal ledenbeheer) | 6 |
| Het ledenregister op de echte planner is gecontroleerd. | Start van 1.5 | 8 |
| Vóór `SupabaseStore` huishouddata gaat lezen/schrijven, moet de Supabase-autorisatie/RLS het onderscheid tussen gedeelde en afgeschermde huishouddata veilig kunnen ondersteunen voor de gegevens waarvoor dat op dat moment nodig is (security/privacy-gate). | 1.10 | 9 |
| De navigatie is getoetst aan werkelijk gebruik. | 3.1 | 2 |

**Gates uit de architectuurbesluiten** (`docs/identiteit-en-items.md`, sectie 7, vastgesteld op
6 oktober 2026):

| Gate | Geldt vóór | Besluit |
| --- | --- | --- |
| Stap 1.4.2 is afgerond: E1 t/m E6 (herstelkopie buiten het toestel met hersteloefening, veilig schrijven, gedrag bij opslagfouten, beslislogboek, classificatie van de data, en het bewezen mechanisme om oude schrijvers uit te sluiten) | de start van 1.5 | 5 |
| Oude Firebase-clients kunnen aantoonbaar niet meer schrijven, ook niet met oude of gekopieerde markeringen en niet met schrijfacties die al onderweg zijn. Een wijziging aan de Firebase-configuratie gebeurt alleen na apart, expliciet akkoord. | de migratie-schrijfactie van 1.5 | 7 |
| De bestaande data is geclassificeerd | de itemmigratie (fase 2) | 4 |

📝 **Nog uit te werken:** het Supabase-schema aangepast aan het contract, via een nieuwe migratie
(sectie 5.2). Besluit 4 legt de richting vast; de concrete wijzigingen worden apart goedgekeurd,
vóór de eerste echte Supabase-schrijver (uiterlijk vóór 1.8 in productie).

## Fase 0: Huidige app afronden en opruimen

**Doel:** een stabiele, consistente Huisplan op de huidige Firebase-opslag, met een vangnet voor
alles wat daarna komt.

**Status: Live** (versie 1.0.19).

Alles in deze fase gebeurt in de bestaande app en het bestaande dataformaat. De stappen 0.3–0.12
zijn onderling onafhankelijk.

| Stap | Titel | Doel | Status |
| --- | --- | --- | --- |
| 0.1 | Vangnet: automatische tests en versienummer | Elke volgende stap kunnen bouwen en controleren zonder dat er ongemerkt data verdwijnt. | Live |
| 0.2 | Bewaking van versie en verhuizing | Zorgen dat elk toestel straks netjes meeverhuist naar Supabase, en dat een verouderde versie nooit over nieuwere data heen schrijft. | Live |
| 0.3 | Losse bugs uit de audit | Bekende fouten weg, zonder gedrag te veranderen dat mensen gewend zijn. | Live |
| 0.4 | Verwijderen en vegen overal gelijk | Eén voorspelbare manier van verwijderen, met ongedaan maken, en geen acties die alleen met vegen kunnen. | Live |
| 0.5 | Oude taken zichtbaar in plaats van stil verplaatst | Geen taak meer die onopgemerkt verdwijnt of van datum verandert. | Live |
| 0.6 | Dagvenster in het design system | Het venster dat opent bij 'Dag openen', de plusknop in Week en tikken in Maand ziet eruit en werkt als Vandaag. | Live |
| 0.7 | Maandweergave leesbaar op een telefoon | In één oogopslag zien welke dagen druk zijn, en wat er op een dag staat. | Live |
| 0.8 | Invoerformulieren achter een knop | Schermen openen op de inhoud, niet op een leeg formulier. | Live |
| 0.9 | Design system op de oudere schermen | Elk scherm voelt als dezelfde app. | Live |
| 0.10 | Teksten, toon en eerlijke herinneringen | De app belooft niets wat hij niet doet, en spreekt overal dezelfde taal. | Live |
| 0.11 | Extra lagen instelbaar maken | Wie de ochtendbriefing, seizoenstip of weekscore niet wil, kan ze uitzetten, zonder dat ze voor anderen verdwijnen. | Live |
| 0.12 | Aantoonbaar ongebruikte code verwijderen | Een kleiner, overzichtelijker bestand, zonder dat er een functie verdwijnt. | Live |
| 0.13 | Het huidige dataformaat vastleggen | Een exacte beschrijving van de Firebase-data als basis voor de migratie in fase 1. | Live |

## Fase 1: Commerciële fundering

**Doel:** accounts, één huishouden met meerdere leden (volwassenen en kinderen) en centrale opslag in
Supabase, met een veilige overstap voor bestaande planners.

De volgorde is bewust:

1. eerst leden en member-ID's in de huidige data (1.4–1.6), zodat de grootste datawijziging los
   staat van de wissel van backend. Daarbinnen geldt: **eerst 1.4.2, daarna pas 1.5.** 1.5 start
   niet voordat 1.4.2 is afgerond (besluit 5);
2. daarna de backend (1.7–1.11);
3. pas dan de overstap van echte data (1.12–1.15).

Tot en met 1.15 blijft de Firebase-versie werken.

| Stap | Titel | Doel | Afhankelijk van | Migratie | Status |
| --- | --- | --- | --- | --- | --- |
| 1.1 | Supabase-omgevingen en migraties in de repo | Een herhaalbare, controleerbare backend met een aparte testomgeving. | – | Nee | Afgerond |
| 1.2 | Schema aanvullen voor leden, kinderen en betrouwbare sync | Het schema geschikt maken voor leden zonder account, stabiele member-ID's en veilige synchronisatie. | 1.1 | Ja (lege tabellen) | Afgerond (staging en productie, beide leeg) |
| 1.3 | Opslaglaag in de app scheiden | De app los maken van Firebase, zodat een tweede opslag ernaast kan. | 0.1, 0.2 | Nee | Live (1.3.0) |
| 1.4 | Ledenregister in de huidige data | Iedereen in het huishouden krijgt een vast member-ID, nog vóór de overstap. | 1.3 | Ja (nieuw veld) | Live (1.4.0) |
| 1.4.1 | Alleen echte huishoudleden in het ledenregister | Correctie op 1.4: niet elke naam in de planner wordt een huishoudlid. | 1.4 | Ja (registerversie 2) | Live (1.4.1) |
| 1.4.2 | Voorbereiding 1.5 | De migratie van 1.5 veilig en corrigeerbaar maken (E1 t/m E6). Gedragswijzigingen in de code, geen datamigratie. | 1.4.1 | Nee | Gepland (eerstvolgende stap) |
| 1.5 | Verwijzingen omzetten van naam naar member-ID | Toewijzen, auteurs en per-persoon-data hangen aan een vast ID in plaats van aan een naam of 'ik'/'partner'. | 1.4.2 (afgerond), 1.4, 0.2 | Ja (versie-gebonden, met back-up) | Gepland ⛔ |
| 1.6 | Kinderen en meer volwassenen in de app | Elk huishouden past: alleen, stel, gezin met kinderen, of meer volwassenen. | 1.5 | Nee | Gepland ⛔ |
| 1.7 | Inloggen met een account | Mensen kunnen een account maken en inloggen, eerst alleen op staging. | 1.1, 1.2 | Nee | Gepland |
| 1.8 | Huishouden aanmaken en leden beheren | Een nieuw huishouden start volledig in Supabase, zonder Firebase. | 1.7, 1.6 | Nee | Gepland |
| 1.9 | Uitnodigen en toegang beheren | Toegang die je kunt geven én intrekken, in plaats van een link die voor altijd werkt. | 1.8 | Nee | Gepland |
| 1.10 | Synchronisatie met Supabase | Dezelfde app, met Supabase als opslag, live tussen toestellen en bruikbaar offline. | 1.3, 1.8 | Nee | Gepland ⛔ |
| 1.11 | Foto's naar bestandsopslag | Foto's van garanties en onderhoud niet meer als tekst in de data, zodat synchroniseren snel blijft. | 1.10 | Ja (via de import) | Gepland |
| 1.12 | Importfunctie voor bestaande planners | Een volledige, controleerbare kopie van een Firebase-planner in een Supabase-huishouden. | 1.2, 1.5, 1.10, 1.11 | Ja | Gepland |
| 1.13 | Overstap-wizard in de app | Een bestaand huishouden verhuist zelf, stap voor stap, zonder hulp van een ontwikkelaar. | 1.12, 1.9 | Ja (via 1.12) | Gepland |
| 1.14 | Firebase-planner bevriezen en late wijzigingen meenemen | Na de overstap schrijft niemand meer in Firebase, en gaat niets verloren van toestellen die nog offline waren. | 1.13, 0.2 | Ja (markering in Firebase) | Gepland 📝 (follow-up: aansluiten op het verhuisslot, zie 1.12) |
| 1.15 | Uitrol en uitfaseren | Gecontroleerd overgaan, eerst met jullie eigen huishouden. | 1.14 | Ja (per huishouden) | Gepland |

### Fase 1: gates en beslissingen per stap

**1.4.1 (PR #8, live)**
- **Bekend probleem, bewust niet opgelost in 1.4.1** (beslissing 6). Een externe gebruiker, gast of
  oppas die iets toevoegt, kan huishoudlid worden. PR #8 blijft hiervoor ongewijzigd en het
  probleem blijft expliciet gedocumenteerd.
  - Het open punt staat in `docs/fase1-notities.md`, punt 11 (op `main` sinds de merge van PR #8).
- **Tijdelijke migratie-UX geaccepteerd** (beslissing 7). De vragen komen één voor één in losse
  dialogen, met een rode bevestigingsknop. Er komt geen extra UI-scope bij PR #8.
- **Een foutief "nee" is nog niet te herstellen. Tijdelijk geaccepteerd** (beslissing 8).
  Structureel herstel hoort in het centrale ledenbeheer (1.6).
  - 🔁 **Later herbeoordelen** als het centrale ledenbeheer (1.6) sterk wordt uitgesteld.

**1.5**
- ⛔ **Gate** (beslissing 8): het ledenregister op de echte planner is gecontroleerd vóór de start
  van 1.5.
- ⛔ **Gate** (beslissing 6): activiteit of auteurschap maakt iemand niet automatisch huishoudlid.
  1.5 moet deze regel al respecteren en mag het bekende probleem met externe gebruikers niet
  verder verspreiden. De structurele oplossing volgt in 1.6.
- ⛔ **Gate** (besluit 5): 1.5 start pas als 1.4.2 is afgerond.
- ⛔ **Gate** (besluit 7): geen migratie-schrijfactie voordat aantoonbaar server-side is geborgd dat
  oude clients niet meer kunnen schrijven.
- **Vastgesteld** (`docs/identiteit-en-items.md`, architectuurbesluiten 1–3, 5 en 7):
  - de member-UUID wordt de blijvende identiteit. Voor bestaande leden is die deterministisch
    afgeleid (UUIDv5), zodat gelijktijdige of hervatte migraties dezelfde UUID's opleveren. Nieuwe
    leden krijgen UUIDv4. `m_…` blijft als alias, zodat de verwijzingen maar één keer worden
    omgezet;
  - labels worden via een labelkaart vertaald. `resolveMember()` maakt nooit een lid aan en geeft
    bij twijfel `null`;
  - een beslislogboek met een lijst voorgangers (`basedOn`) vervangt "nee wint". Er wordt niet op
    de klok beslist, en het oplossen van een conflict bouwt voort op alle conflicterende koppen;
  - oude schrijvers worden aan de serverkant uitgesloten. Het mechanisme wordt in 1.4.2 (E6)
    onderzocht en bewezen. Hun offline wijzigingen worden na de update met dezelfde mapping
    omgezet;
  - 1.5 blijft een afzonderlijke migratie binnen Firebase en wordt niet samengevoegd met 1.12
    (besluit 8). Ze gebruikt het verhuisslot uit 1.4.2. Het wijzigen van de Firebase-regels en het
    activeren van het slot voor 1.5 vereisen een afzonderlijk, expliciet akkoord;
  - personen in velden: `memberIds[]`, `byMember`/`byLabel` en `forLabel`.

**1.4.2 Voorbereiding 1.5** (besluit 5; de eerstvolgende stap)
- Voorwaarden E1 t/m E6 uit `docs/identiteit-en-items.md`, sectie 5.1: werkende
  gedragswijzigingen in de code, maar geen datamigratie. De omzetting gebeurt pas in 1.5, onder de
  schrijfblokkade.
- Bewust niet in 1.4.2: items, relaties, herhaling, het wijzigen van Vandaag, de parser, en de
  schermen voor ledenbeheer.
- Tot 1.6 loopt een correctie via de bestaande dialoog of het ontwikkelhulpmiddel. De schermen voor
  beheer, herstel en samenvoegen komen in 1.6.
- E6: het mechanisme om oude Firebase-clients server-side uit te sluiten wordt hier onderzocht en
  in een geïsoleerde omgeving bewezen (besluit 7). Het principe ligt vast (besluit 8): een
  herbruikbaar server-side verhuisslot per bronpad, zodat hetzelfde principe in 1.12 opnieuw kan
  worden toegepast. Het concrete mechanisme is nog niet gekozen.
  - 1.4.2 ontwerpt en bewijst het mechanisme alleen, in een geïsoleerde omgeving. Er worden geen
    Firebase-regels gewijzigd, er wordt geen slot geactiveerd, en productiegegevens en de
    live/testplanner worden niet aangeraakt.
  - Hoe de app bepaalt waar een planner staat (`resolveLocation()`) en het exacte slotformaat horen
    bij het ontwerp. Ze worden alleen vastgelegd voor zover ze nodig zijn als contract
    (`docs/identiteit-en-items.md`, 3.1, eis 4).
  - Een wijziging aan de Firebase-configuratie gebeurt niet zonder apart, expliciet akkoord.
- **Besluit 9** (na de review van het 1.4.2-plan; `docs/identiteit-en-items.md`, 7.1):
  - zonder bruikbare ETag wordt niet geschreven;
  - `same`/`different` krijgt een afzonderlijk semantisch contract naast `member`/`notMember`;
  - optie A is de onderzoeksrichting voor E6; dat is geen toestemming om Firebase-regels te
    wijzigen of een slot te activeren;
  - het bewijs gebeurt in de Firebase Emulator met een harde lokale netwerkallowlist; een echt
    Firebase-testproject vraagt een afzonderlijk akkoord;
  - vóór het E6-bewijs worden de werkelijke Firebase-regels alleen-lezend gecontroleerd, en de
    Firebase-projecten en historische clientversies geïnventariseerd;
  - E5 gebeurt lokaal en geanonimiseerd, ook op ruwe data, caches en bases;
  - ⛔ geen praktijktest van E2/E3 op echte huishouddata; het herstelprotocol wordt eerst volledig
    ontworpen;
  - de UUIDv5-namespace en de exacte invoercodering worden vóór gebruik vastgelegd en getest.
- **Ontwerp:** `docs/ontwerp-1.4.2.md` (ontwerp, geen contract; met de open vragen P1-1 t/m
  P1-10).

**1.6 (centraal ledenbeheer)**
- ⛔ **Gate** (beslissing 6): hier wordt de gast/oppas-regel structureel opgelost. Activiteit of
  auteurschap maakt iemand niet automatisch huishoudlid.
- Hier hoort ook het structurele herstel van een foutief "nee" (beslissing 8).

**1.10 Synchronisatie met Supabase**
- ⛔ **Security/privacy-gate vóór 1.10** (beslissing 9):
  > Vóór `SupabaseStore` huishouddata gaat lezen/schrijven, moet de Supabase-autorisatie/RLS het
  > onderscheid tussen gedeelde en afgeschermde huishouddata veilig kunnen ondersteunen voor de
  > gegevens waarvoor dat op dat moment nodig is.
- Aanleiding:
  - de huidige Row Level Security geeft elk huishoudlid zicht op alle items;
  - claims op verlanglijstjes worden alleen client-side verborgen.
- Dit betekent niet dat alle toekomstige privacyfuncties vóór 1.10 gebouwd moeten worden.
- De oplossing is nog niet ontworpen. Ontwerp en implementatie volgen pas wanneer daartoe wordt
  besloten.
- 📝 **Uit te werken schemavoorwaarden** (`docs/identiteit-en-items.md`, sectie 5.2). Besluit 4
  legt de richting vast; de concrete wijzigingen worden apart goedgekeurd. Ze moeten zijn
  doorgevoerd **vóór de eerste echte Supabase-schrijver**: op staging vóór de tests met data in
  1.7–1.8, en in productie uiterlijk vóór 1.8 (het eerste echte huishouden).
  - `items`: de sleutel wordt `(household_id, id)` met een UUID, en een typewissel gaat alleen
    via een conversie;
  - `household_members`: `status` (`active`/`archived`) en `legacy_ids`; `is_member()` en
    `is_owner()` tellen alleen actieve leden;
  - een account ontkoppelen gaat via overdracht van beheer. Een kale `set null` is niet genoeg,
    door de check op beheerders;
  - `households.created_by` mag accountverwijdering niet blokkeren;
  - een vertaling voor `kind = 'unknown'`;
  - contracten voor grafstenen en revisies;
  - relaties blijven binnen hetzelfde huishouden.

  Nu wordt geen Supabase-migratie uitgevoerd.

**1.12 Importfunctie voor bestaande planners**
- 1.12 blijft een afzonderlijke migratie naar Supabase. Ze wordt niet samengevoegd met 1.5
  (besluit 8).
- Bij de overgang naar Supabase wordt hetzelfde principe als in 1.5 opnieuw toegepast: het
  server-side verhuisslot per bronpad uit 1.4.2 (`docs/identiteit-en-items.md`, 3.1, eis 4). Het
  acceptatiescenario wordt daarbij opnieuw bewezen, nu met Supabase als doel.
- ⛔ **Gate** (besluiten 7 en 8): dat het slot herbruikbaar is, geeft geen toestemming vooraf. Het
  wijzigen van de Firebase-regels en het activeren van een slot vereisen ook hier een afzonderlijk,
  expliciet akkoord.
- 📝 **Follow-up (nog niet verwerkt):** stap 1.14 noemt nu nog "markering in Firebase". Een
  markering is volgens `docs/identiteit-en-items.md` (3.1) niet genoeg als slot. 1.14 moet later
  naar het server-side verhuisslot verwijzen. Dat gebeurt in een aparte wijziging.

## Fase 2: Eén samenhangend model

**Doel:** één soort taak, alles met een datum op één tijdlijn, en een rustiger Meer, zonder functies
weg te halen.

Bestaande schermen blijven bestaan, maar worden gefilterde weergaven van hetzelfde model. Elke
migratiestap:
- is versie-gebonden;
- maakt eerst een back-up;
- bewaart de oude rijen 60 dagen voordat 2.13 ze opruimt.

| Stap | Titel | Doel | Afhankelijk van | Migratie | Status |
| --- | --- | --- | --- | --- | --- |
| 2.1 | Eén tijdlijn voor alles met een datum | Vandaag, Week en Maand tonen alles wat op een dag speelt. | Fase 1 | Nee | Gepland |
| 2.2 | Taakmodel ontwerpen en testen | Een vastgelegd model voor alle soorten taken, met bewezen conversie, voordat er iets wordt omgezet. | 2.1 | Nee | Gepland |
| 2.3 | De app leest taken via één taken-laag | Alle schermen halen taken op dezelfde manier op, zodat de opslag daarna stap voor stap kan veranderen. | 2.2 | Nee | Gepland |
| 2.4 | Losse en meerdaagse taken omzetten | Het eerste en grootste deel van de taken in het nieuwe model. | 2.3 | Ja | Gepland |
| 2.5 | Vaste taken omzetten | Vaste taken zijn gewone taken met een herhaling, bewerkbaar en toewijsbaar. | 2.4 | Ja | Gepland |
| 2.6 | Onderhoud omzetten | Onderhoud verschijnt als taak op het moment dat het aan de beurt is. | 2.5 | Ja | Gepland |
| 2.7 | Backlog wordt 'Ooit' | Ideeën zonder datum horen bij de taken, en zijn met één tik in te plannen. | 2.4 | Ja | Gepland |
| 2.8 | Vakantie-to-do's worden taken | Een to-do voor de vakantie verschijnt ook op Vandaag als hij een datum krijgt. | 2.4 | Ja | Gepland |
| 2.9 | Eén taakeditor | Elke taak heeft dezelfde bewerkmogelijkheden, waar je hem ook opent. | 2.5–2.8 | Nee | Gepland |
| 2.10 | Documenten en vervaldata samenbrengen | Garanties en de vervaldata-kluis op één plek. | 2.1 | Nee (eventueel later) | Gepland |
| 2.11 | Eten: maaltijdplanner en recepten samen | Plannen wat je eet en je recepten op één plek, verbonden met Week en Boodschappen. | 2.1 | Nee | Gepland |
| 2.12 | Meer wordt Ons huis | Een rustig archief met alles erin, logisch gegroepeerd en met één zoekveld. | 2.10, 2.11 | Nee | Gepland |
| 2.13 | Oude structuren opruimen | De data bevat alleen nog het nieuwe model. | 2.4–2.8 plus 60 dagen | Ja (opruimen) | Gepland |
| 2.14 | Gebruik meten, als basis voor latere keuzes | Pas beslissen over Vaste lasten, Gewoonten, Wie is waar en andere secundaire functies als bekend is hoe vaak ze gebruikt worden. | Fase 1 | Nee | Gepland |

### Fase 2: beslissingen per stap

**2.1 en 2.2: items en relaties**
- **Vastgesteld** (architectuurbesluiten 4 en 6):
  - items krijgen uiteindelijk een UUID die niet van de collectie afhangt;
  - er komt geen universele alles-entiteit: elk type houdt zijn eigen betekenisvolle velden;
  - een typewissel gaat alleen via een bewuste conversie;
  - ⛔ vóór de itemmigratie wordt de bestaande data eerst geclassificeerd (sectie 3.4);
  - Vandaag is definitief een niet-schrijvende weergave: alleen renderen mag geen huishouddata
    wijzigen. Het huidige doorschuiven van taken wordt op het passende moment omgebouwd; dat
    blokkeert 1.5 niet.
- 📝 **Voorstel** (`docs/identiteit-en-items.md`, sectie 4 en 5.3):
  - het minimale itemcontract vóór 2.1 vastleggen, zodat 2.1 Vandaag direct als projectie bouwt
    zonder tijdelijke conversielogica;
  - drie vaste relaties (`context`, `about`, `supports`); herkomst volgt in fase 3;
  - een klein contract voor herhaling en afgeleide datums;
  - hulpregel bij handelingen: "Als het ene klaar is, is het andere dan per definitie ook klaar?"
    - Ja: één item met meerdere weergaven.
    - Nee: twee gekoppelde items.

**2.14 en de bestaande functies**
- 🔁 **Later herbeoordelen** (beslissing 10). Er wordt niets verwijderd op basis van alleen het
  Productkompas. Werkelijk gebruik bepaalt mede wat blijft, verandert of minder prominent wordt.
  Dit geldt onder meer voor:
  - Gezins-DNA met verdeling per persoon;
  - weekscore en Koppelgesprek;
  - toasts over wijzigingen door anderen;
  - de vanzelf openende briefing;
  - seizoenstips.
- 2.14 levert hiervoor de gebruiksgegevens. Ook de navigatietoets vóór 3.1 (beslissing 2) kan
  daarop steunen.

## Fase 3: Centrale invoer

**Doel** ✏️ (beslissing 1): één plek om iets vast te leggen. Huisplan stelt voor waar het hoort.
Bij twijfel vraagt Huisplan één keer. Na voldoende zekerheid en toestemming kan het de handeling
voortaan zelfstandig uitvoeren. Hoe groter het gevolg van een fout, hoe meer bevestiging nodig is.
Automatisering is zichtbaar, voorspelbaar en eenvoudig terug te draaien. De risicogrenzen uit
principe 5 blijven leidend.

> Was: "Huisplan stelt voor waar het hoort en vraagt altijd om bevestiging."

Deze fase werkt pas goed op het model van fase 2 (één taaksoort, leden met ID's). Elke stap komt
eerst in de testversie en wordt met een paar huishoudens geprobeerd.

| Stap | Titel | Doel | Afhankelijk van | Migratie | Status |
| --- | --- | --- | --- | --- | --- |
| 3.1 | Navigatie onderzoeken | Vaststellen of Vandaag \| Boodschappen \| + \| Ons huis beter werkt dan de huidige balk. | 2.12 | Nee | Gepland ⛔ 🔁 |
| 3.2 | Taalherkenning uitbreiden | Zinnen als 'stofzuigen elke vrijdag voor Lynn' goed begrijpen. | 2.9 | Nee | Gepland |
| 3.3 | Voorstelvenster: Goed of Anders… | Bij twijfel één keer een voorstel ter bevestiging tonen, volgens het automatiseringsuitgangspunt van beslissing 1. | 3.2 | Nee | Gepland ✏️ |
| 3.4 | Nog uitzoeken | Bij twijfel bewaren in plaats van gokken. | 3.3 | Nee | Gepland |
| 3.5 | Centrale + in de navigatie | De + is de primaire manier om iets vast te leggen. | 3.1, 3.4 | Nee | Gepland |
| 3.6 | Leren van correcties | Huisplan onthoudt keuzes van het huishouden ('pindakaas' is een boodschap, 'Lyn' is Lynn). | 3.3 | Nee | Gepland |
| 3.7 | Spraak | Inspreken zonder te typen. | 3.5 | Nee | Gepland |
| 3.8 | Foto en AI (laatste uitbreiding) | Een foto van een bon, paspoort of recept wordt een voorstel. | 3.5, 4.6 | Nee | Gepland 🔁 |

### Fase 3: gates en beslissingen per stap

**3.2 tot en met 3.5: centrale `+`** 📝 Voorstel
- De parser levert een lijst acties met relaties op, zodat één invoer meerdere gekoppelde acties
  kan opleveren.
- Automatisering volgt beslissing 1:
  - binnen expliciet verleende toestemming mag een actie, ook een wijziging, zelfstandig worden
    uitgevoerd, zichtbaar en herstelbaar;
  - zonder die toestemming, of bij wezenlijke gevolgen, wordt een wijziging aan een bestaand plan
    voorgesteld in plaats van stil uitgevoerd (`docs/identiteit-en-items.md`, sectie 4.5).
- Een prototype van deze stroom moet echt geïsoleerd zijn van de echte planner. `/test/` is dat
  niet (sectie 5.3).

**3.1 Navigatie**
- ⛔ **Gate** (beslissing 2): vóór 3.1 wordt de navigatie getoetst aan werkelijk gebruik.
- 🔁 **Later herbeoordelen.** Er zijn drie indelingen en geen ervan is een definitief ontwerp:

  | Bron | Indeling | Status |
  | --- | --- | --- |
  | Oorspronkelijke roadmap | Vandaag \| Boodschappen \| + \| Ons huis | Te onderzoeken |
  | Productkompas, principe 8 | Vandaag, Agenda, Boodschappen, +, Taken, Vakantie | Hypothese |
  | Huidige app | Vandaag, Bakje, Boodschappen, Meer | Huidige situatie |

- De uitkomst bepaalt 3.5.

**3.3 Voorstelvenster** ✏️ (beslissing 1)
- Was: "Nooit iets stil ergens neerzetten."
- Voortaan geldt het automatiseringsuitgangspunt (zie Uitgangspunten):
  - Bij twijfel vraagt Huisplan één keer. Na voldoende zekerheid en toestemming kan het de
    handeling voortaan zelfstandig uitvoeren.
  - Hoe groter het gevolg van een fout, hoe meer bevestiging nodig is.
  - Automatisering moet zichtbaar, voorspelbaar en eenvoudig terug te draaien zijn.
  - De risicogrenzen uit principe 5 blijven leidend.
- Hoe dat in 3.3–3.6 wordt uitgewerkt, is nog niet ontworpen. Dat volgt bij de Productkompas-toets
  van deze stappen.

**3.8 Foto en AI**
- 🔁 **Herprioriteren bij de eerstvolgende roadmapreview** (beslissing 5).
  - Een foto of document omzetten in relevante huishoudinformatie is een belangrijk voorbeeld van
    de kernbelofte van Huisplan.
  - Het houdt niet automatisch de laagste prioriteit omdat het historisch achteraan stond.
  - De plaats in de volgorde en de titel "(laatste uitbreiding)" zijn bewust nog niet veranderd.
    Dat gebeurt bij de roadmapreview.
  - Nu niet implementeren.

## Fase 4: Commercieel product

**Doel:** alles wat nodig is om Huisplan te verkopen en betrouwbaar te laten draaien.

Een deel kan parallel aan fase 2 en 3. Zodra fase 1 in productie draait (na 1.15), kunnen 4.1 → 4.2,
4.5, 4.6 en 4.7–4.9 parallel.

| Stap | Titel | Doel | Afhankelijk van | Migratie | Status |
| --- | --- | --- | --- | --- | --- |
| 4.1 | Echte pushmeldingen | Meldingen komen aan, ook als de app dicht is. | Fase 1 | Nee | Gepland 🔁 |
| 4.2 | Herinneringen via de server | Een herinnering gaat op tijd af, op het juiste toestel. | 4.1, 2.9 | Nee | Gepland |
| 4.3 | Onboarding | Een nieuw huishouden is binnen twee minuten op weg. | 1.8, 3.5 | Nee | Gepland |
| 4.4 | Uitnodigingen afronden | Uitnodigen werkt zoals mensen het van andere apps kennen. | 1.9, 4.3 | Nee | Gepland |
| 4.5 | Abonnement en betalen | Huishoudens kunnen een abonnement afsluiten en beheren. | Fase 1 | Nee | Gepland ✏️ |
| 4.6 | Privacy, account verwijderen en data-export | Voldoen aan de AVG en vertrouwen geven. | Fase 1 | Nee | Gepland |
| 4.7 | Monitoring en foutmeldingen | Problemen zien voordat gebruikers ze melden. | Fase 1 | Nee | Gepland |
| 4.8 | Back-ups en herstel | Geen data kwijt, ook niet bij een fout van ons. | Fase 1 | Nee | Gepland |
| 4.9 | Productieomgeving en releaseproces | Voorspelbaar en veilig uitbrengen. | 0.1, 1.1 | Nee | Gepland |
| 4.10 | Lanceervereisten | Klaar om te verkopen. | 4.1–4.9 | Nee | Gepland |

### Fase 4: beslissingen per stap

**4.1 Pushmeldingen**
- 🔁 **Later herbeoordelen** (beslissing 4). Push blijft mogelijk.
- Bij het ontwerp wordt push getoetst aan principe 6: alleen aandacht vragen wanneer de melding
  daadwerkelijk waarde heeft.

**4.5 Abonnement en betalen** ✏️ (beslissing 3)
- Vervallen: het model waarbij de hele planner na afloop van een proefperiode alleen-lezen of
  onbruikbaar wordt.
- Een Premium-proefperiode blijft een open mogelijkheid. Een mogelijke richting:
  Premium-proefperiode, daarna terug naar een bruikbare Gratis-versie.
- Richting:
  - De gratis versie moet bruikbaar blijven voor organiseren.
  - Premium verkoopt extra gemak, automatisering, AI en koppelingen.
  - Bestaande huishouddata worden niet gegijzeld.
- Welke functies precies premium zijn, staat nog open (zie Beslispunten).

## Beslispunten

Deze keuzes liggen bij de producteigenaar. Ze blokkeren de roadmap niet direct, maar wel de stap
die erachter staat. De kolom "Oorspronkelijk advies" komt uit de roadmap van 2 oktober.

| Keuze | Nodig voor | Oorspronkelijk advies | Stand na beslissingen 1–10 |
| --- | --- | --- | --- |
| Inlogmethoden | 1.7 | Start met een e-mailcode (geen wachtwoord); Apple en Google in fase 4. | Ongewijzigd open. |
| Bewaartermijn van de oude Firebase-data | 1.15 | 90 dagen na de overstap, daarna kan het huishouden het eigen project opruimen. | Ongewijzigd open. |
| Navigatie | 3.1, 3.5 | Beslissen na het onderzoek in 3.1, niet vooraf. | 🔁 Vóór 3.1 toetsen aan werkelijk gebruik (beslissing 2). |
| Prijsmodel en welke functies betaald zijn | 4.5 | Eén abonnement per huishouden, onbeperkt leden, met proefperiode; eventueel AI-foto's als extra. | ✏️ Vervallen: de hele planner alleen-lezen of onbruikbaar na een proefperiode (beslissing 3). Een Premium-proefperiode blijft mogelijk, bijvoorbeeld met daarna een terugval naar een bruikbare Gratis-versie. Het prijsmodel zelf staat nog open. |
| AI-dienst voor foto's en de kosten daarvan | 3.8 | Pas kiezen als 3.1–3.7 bewezen zijn; verwerking in de EU en geen opslag bij de dienst. | 🔁 De prioriteit van 3.8 wordt herbeoordeeld bij de eerstvolgende roadmapreview (beslissing 5). |
| Alleen web-app of ook in de app-winkels | 4.10 | Eerst als web-app; app-winkels pas als pushmeldingen op iPhone een probleem blijken. | Ongewijzigd open. |
| Welke secundaire functies definitief blijven na 2.14 | Na 2.14 | Na minimaal drie maanden gebruikscijfers per functie beslissen. | 🔁 Op basis van werkelijk gebruik (beslissing 10). |

## Functies die voorlopig blijven

De audit adviseerde bij deze onderdelen om ze te heroverwegen of minder prominent te maken. In deze
roadmap blijven ze allemaal bestaan. Of ze blijven, veranderen of minder prominent worden, bepaalt
werkelijk gebruik mede (🔁 beslissing 10).

| Functie | Plek en verandering in de roadmap |
| --- | --- |
| Vaste lasten | Blijft volledig, onder Ons huis → Huis. |
| Gewoonten | Blijft, ook op Vandaag. Optioneel per lid (1.6). |
| Koppelgesprek | Blijft een optionele vaste taak met gespreksvragen; na 2.5 een gewone herhalende taak. |
| Vakanties | Alle tabbladen blijven. Personen worden leden (1.6), to-do's worden gekoppelde taken (2.8), datums komen in de kalender (2.1). |
| Wie is waar | Blijft als scherm. Werkt met alle leden (1.6) en voedt de kalender (2.1). |
| Ochtendbriefing | Blijft, standaard aan, uit te zetten (0.11). |
| Seizoenstip en weekscore | Blijven, standaard aan, uit te zetten (0.11). Mildere toon (0.10). |
| Gezins-DNA, Statistieken, Weekoverzicht | Blijven, samen onder Terugkijken (2.12). |
| Huisgeheugen | Blijft; het zoekveld van Ons huis zoekt er ook in (2.12). |
| "Wat eten we?"-spinner | Blijft en wordt beter bereikbaar, als knop in Eten (2.11). |
| Emoji-reacties en confetti | Blijven zoals nu. |
| Backlog | Blijft als scherm; de items worden taken met 'ooit' (2.7). |
| Onderhoud | Blijft als scherm met voortgangsbalken; items worden herhalende taken (2.6). |
| Garanties en Vervaldata-kluis | Beide blijven; één gezamenlijk scherm met filters (2.10). |
| Maaltijdplanner en Recepten | Beide blijven; samen in Eten (2.11). |
| Bestellingen, Verlanglijstje, Notitieboek, Verjaardagen | Blijven; verlanglijstjes per lid (1.6), datums in de kalender (2.1). |
| Toevoegen (inbox) | Blijft; wordt 'Nog uitzoeken' achter de centrale + (3.4, 3.5). |
| Dagnotitie, themakleur, back-up | Blijven ongewijzigd. |
