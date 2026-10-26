# Productkompas: beslissingen over de roadmap en bestaande functies

Dit document legt vast hoe de bestaande roadmap en de bestaande functies zich verhouden tot het
Huisplan Productkompas v1.0 (`PRODUCT_PRINCIPLES.md`). Het Productkompas zelf blijft leidend en
wordt hier niet gewijzigd of aangevuld.

- Vastgesteld: 5 oktober 2026, door de producteigenaar, na een conflictanalyse van roadmap en documentatie.
  Aangevuld op dezelfde dag met verduidelijkingen bij de beslissingen 1, 3, 6, 8 en 9.
- Op 6 oktober 2026 zijn alleen feitelijke verwijzingen bijgewerkt (PR #8 is gemerged), en is een
  verwijzing toegevoegd naar `docs/identiteit-en-items.md`. De architectuurbesluiten daarin (sectie
  7) zijn op 6 oktober 2026 door de producteigenaar genomen. Ze werken de beslissingen hieronder
  technisch uit, maar veranderen ze niet.
- Op 9 oktober 2026 is besluit 11 toegevoegd (voorlopige ontwikkelrichting Thuisplanner). Op 18 oktober 2026 is
  alleen de naam in de tekst bijgewerkt (de oude werknaam vervangen door Thuisplanner); de inhoud is ongewijzigd. De
  beslissingen 1–10 zijn daarbij niet herschreven; besluit 11 legt alleen vast wanneer gate 9 nu
  geldt en dat de importgates ongewijzigd blijven.
- Op 26 oktober 2026 is besluit 12 toegevoegd (gescheiden ouders en samengestelde gezinnen), met de keuzes O1–O8 en
  twee nieuwe gates. De beslissingen 1–11 zijn daarbij niet herschreven.
- Op 26 oktober 2026 zijn de besluiten 13–16 toegevoegd (slimme projecten, huishoudkennis en contacten, herhalende
  taken, minimale herinneringen), met vijf nieuwe gates. De beslissingen 1–12 zijn daarbij niet herschreven.
- De roadmap staat in `docs/roadmap.md`. De beslissingen hieronder gelden voor iedere versie ervan.

## Harde randvoorwaarden (gates)

Deze punten moeten aantoonbaar zijn opgelost of geborgd vóór het genoemde moment.

| Gate | Geldt vóór | Bron |
| --- | --- | --- |
| Activiteit of auteurschap maakt iemand niet automatisch huishoudlid. 1.5 respecteert deze regel en verspreidt het bekende probleem met externe gebruikers niet verder; 1.6 lost het structureel op. | 1.5 (persoonsmigratie) en 1.6 (centraal ledenbeheer) | Beslissing 6 |
| Het ledenregister op de echte planner is gecontroleerd. | Start van fase 1.5 | Beslissing 8 |
| Vóór `SupabaseStore` huishouddata gaat lezen/schrijven, moet de Supabase-autorisatie/RLS het onderscheid tussen gedeelde en afgeschermde huishouddata veilig kunnen ondersteunen voor de gegevens waarvoor dat op dat moment nodig is (security/privacy-gate). | 1.10 | Beslissing 9 |
| De navigatie is getoetst aan werkelijk gebruik. | Fase 3.1 | Beslissing 2 |
| Koppelingen tussen huishoudens: een gekoppeld huishouden, en een lid zonder toegang in de koppeling, ziet aantoonbaar niets buiten de expliciet gedeelde items; lid worden geeft geen toegang; intrekken werkt direct op de server; de bestaande RLS en huishoudgrenzen zijn niet verzwakt; de AVG-beoordeling voor het delen van kindgegevens is gedaan. Bewezen met testmatrix en tegenproeven (gate 9 voor het domein "koppelingen"). | De eerste migratie met een koppel- of deeltabel, en opnieuw voor ieder volgend gedeeld domein | Beslissing 12 |
| Optie B (co-ouderschapsomgeving) start pas na een afzonderlijk productbesluit, op basis van werkelijk gebruik van optie A. | De eerste stap van optie B | Beslissing 12 |
| Slimme projecten: gate 9 voor het domein "projecten"; een AVG-beoordeling van de AI-verwerker (inclusief verwerkingslocatie); de uitslag van de kwaliteitsproef op een vaste testset. Een betaalde AI-dienst of een abonnement alleen na een afzonderlijk akkoord van de producteigenaar, met een vast kostenplafond. | De eerste migratie voor projecten, en de eerste echte aanvraag aan een AI-dienst | Beslissing 13 |
| Huishoudkennis en contacten: de server dwingt persoonlijk en gedeeld af bij lezen, zoeken, koppelen aan taken en projecten, signalen, meldingen en de data-export; wie iets niet mag zien, krijgt geen aanwijzing dat het bestaat. Bewezen met testmatrix en tegenproeven per toegangsniveau en per pad (gate 9 voor het domein "kennis en contacten"). | De eerste migratie met een contact- of kennistabel | Beslissing 14 |
| Herhalende taken: gate 9 voor het takendomein (herhaling, afvinken per keer, uitzonderingen). | De eerste migratie voor herhalende taken | Beslissing 15 |
| Herinneringen: een pushproef op de testtelefoons; gate 9 voor het domein "meldingen" (voorkeuren, toestellen, verzendlog); de inhoud van een melding bevat nooit privé-details, "Bezet"-inhoud of huishoudkennis. | De eerste migratie voor meldingen | Beslissing 16 |

## Beslissingen

### 1. Altijd bevestiging vragen: aanpassen

- **Oorspronkelijke roadmap:** fase 3 en stap 3.3 gaan uit van "altijd om bevestiging vragen" en "nooit iets
  stil ergens neerzetten".
- **Productkompas:** principes 5 en 6.
- **Beslissing:** de toekomstige roadmap gaat uit van het volgende.
  - Bij twijfel vraagt Huisplan één keer. Na voldoende zekerheid en toestemming kan het de
    handeling voortaan zelfstandig uitvoeren.
  - Hoe groter het gevolg van een fout, hoe meer bevestiging nodig is.
  - Automatisering moet zichtbaar, voorspelbaar en eenvoudig terug te draaien zijn.
  - De risicogrenzen uit principe 5 blijven leidend.
  - (Aanvulling: de formulering is gelijkgetrokken met principe 5.)

### 2. Navigatie: later herbeoordelen

- **Oorspronkelijke roadmap:** stap 3.1 gaat uit van Vandaag | Boodschappen | + | Ons huis.
- **Huidige app:** Vandaag, Bakje, Boodschappen, Meer.
- **Productkompas:** principe 8.
- **Beslissing:** de navigatie in het Productkompas is een hypothese, geen definitief ontwerp.
  Vóór fase 3.1 toetsen we de navigatie aan werkelijk gebruik.

### 3. Proefperiode die daarna alleen-lezen wordt: aanpassen

- **Oorspronkelijke roadmap:** stap 4.5 gaat uit van een proefperiode, waarna de app alleen-lezen wordt.
- **Productkompas:** principe 10.
- **Beslissing:** deze productrichting vervalt.
  - Wat vervalt, is het model waarbij de hele planner na afloop van een proefperiode alleen-lezen
    of onbruikbaar wordt.
  - Een Premium-proefperiode blijft een open mogelijkheid. Een mogelijke richting:
    Premium-proefperiode, daarna terug naar een bruikbare Gratis-versie.
  - De gratis versie moet bruikbaar blijven voor organiseren.
  - Premium verkoopt extra gemak, automatisering, AI en koppelingen.
  - Bestaande huishouddata worden niet gegijzeld.

### 4. Pushmeldingen: later herbeoordelen

- **Oorspronkelijke roadmap:** stap 4.1 voegt pushmeldingen toe.
- **Productkompas:** principe 6.
- **Beslissing:** push blijft mogelijk. Bij het ontwerp wordt het getoetst aan principe 6: alleen
  aandacht vragen wanneer de melding daadwerkelijk waarde heeft.

### 5. AI en foto's: herprioriteren bij de eerstvolgende roadmapreview

- **Oorspronkelijke roadmap:** stap 3.8 (AI en foto's) staat als laatste.
- **Productkompas:** principe 1, met de schoolbrief-foto als voorbeeld.
- **Beslissing:** het omzetten van een foto of document in relevante huishoudinformatie is een
  belangrijk voorbeeld van de kernbelofte van Huisplan. Het houdt niet automatisch de laagste
  prioriteit omdat het historisch achteraan stond. Herprioriteren gebeurt bij de eerstvolgende
  roadmapreview. Nu niet implementeren.

### 6. Externe gebruiker, gast of oppas: niet meer oplossen in 1.4.1

- **Huidige situatie (1.4.1):** wie iets toevoegt (als auteur of toevoeger) geldt als betrouwbaar
  lid. Een externe gebruiker kan zo huishoudlid worden. Dit staat als open punt in
  `docs/fase1-notities.md`, punt 11 (op `main` sinds de merge van PR #8).
- **Productkompas:** principe 7 ("Een persoon, naam of label dat ergens in Huisplan voorkomt, is
  niet automatisch een huishoudlid.").
- **Beslissing:** PR #8 blijft hiervoor ongewijzigd en het bekende probleem blijft expliciet
  gedocumenteerd. Dit is een harde randvoorwaarde voor persoonsmigratie (1.5) en centraal
  ledenbeheer (1.6): activiteit of auteurschap maakt iemand niet automatisch huishoudlid.
  1.5 moet deze regel al respecteren en mag het probleem niet verder verspreiden. 1.6 lost het
  structureel op.
- **Uitwerking (vastgesteld, architectuurbesluit 3):** `docs/identiteit-en-items.md`, sectie 1 en 2. Daar staat hoe
  `resolveMember()`, `byMember`/`byLabel` en labels voor niet-leden deze regel technisch borgen.

### 7. Losse dialogen en rode bevestigingsknop: niet aanpassen in 1.4.1

- **Huidige situatie (1.4.1):** de ledenvragen komen één voor één in aparte dialogen, met een rode
  bevestigingsknop.
- **Productkompas:** principes 2 en 6.
- **Beslissing:** geaccepteerd als tijdelijke, eenmalige migratie-UX. Er komt geen extra UI-scope
  bij PR #8.

### 8. Een foutief "nee" herstellen: tijdelijk accepteren

- **Huidige situatie (1.4.1):** een gegeven "nee" kan pas met het centrale ledenbeheer (1.6) worden
  hersteld.
- **Productkompas:** de regel "Fouten moeten goedkoop zijn".
- **Beslissing:**
  - Tijdelijk geaccepteerd.
  - Het register wordt gecontroleerd vóór 1.5.
  - Structureel herstel hoort in het centrale ledenbeheer (1.6).
  - Wordt dat sterk uitgesteld, dan beoordelen we dit opnieuw.
- **Vastgesteld** (`docs/identiteit-en-items.md`, sectie 2.4; architectuurbesluiten 2 en 5):
  - vóór 1.5 een beslislogboek met een lijst voorgangers (`basedOn`) in plaats van "nee wint",
    zodat een correctie veilig voortbouwt op de keuze of keuzes die zij herstelt;
  - een foutief "nee" wordt dan hersteld door de keuze te corrigeren, zonder verwijzingen met de
    hand opnieuw te koppelen;
  - de schermen voor herstel blijven in 1.6, dus deze beslissing verandert niet.

### 9. Supabase en privacy: gate vóór 1.10

- **Huidige situatie:** de Row Level Security geeft elk huishoudlid zicht op alle items. Claims op
  verlanglijstjes worden alleen client-side verborgen.
- **Productkompas:** de regel "Privacy volgt de situatie".
- **Beslissing:** privacy mag niet uitsluitend door de UI worden afgedwongen. Dit is een expliciete
  security/privacy-gate vóór stap 1.10:
  > Vóór `SupabaseStore` huishouddata gaat lezen/schrijven, moet de Supabase-autorisatie/RLS het
  > onderscheid tussen gedeelde en afgeschermde huishouddata veilig kunnen ondersteunen voor de
  > gegevens waarvoor dat op dat moment nodig is.
- Dit betekent niet dat alle toekomstige privacyfuncties vóór 1.10 gebouwd moeten worden.
- De oplossing wordt nu nog niet ontworpen of geïmplementeerd.

### 10. Bestaande functies: later herbeoordelen

- **Huidige app:**
  - Gezins-DNA met verdeling per persoon, weekscore en Koppelgesprek;
  - toasts over wijzigingen door anderen;
  - de vanzelf openende briefing;
  - seizoenstips.
- **Productkompas:** principes 2, 6 en 9.
- **Beslissing:** er wordt niets verwijderd op basis van alleen het Productkompas. Werkelijk gebruik
  bepaalt mede wat blijft, verandert of minder prominent wordt.

### 11. Ontwikkelrichting Thuisplanner (addendum, 9 oktober 2026, voorlopig)

- **Besluit van de producteigenaar:** de nieuwe gezinsapp (Thuisplanner) wordt technisch gescheiden van Huisplan
  gebouwd, op Supabase, in dezelfde repository maar in een eigen map `thuisplanner/`. Huisplan en alle gebruikersgegevens blijven ongewijzigd.
  PR #16, #17 en #18 blijven open, niet gemerged en niet gesloten.
- **Gevolgen voor de roadmap:** zie `docs/roadmap.md`, sectie "Ontwikkelrichting Thuisplanner".
  Kort: 1.4.2–1.6 gepauzeerd, 1.7–1.11 vervangen door de Thuisplanner-fasen, de import (1.12–1.15)
  blijft het doel voor bestaande planners.
- **Gevolgen voor de gates:**
  - Gate 9 (beslissing 9) blijft volledig. Ze geldt nu vóór de eerste Thuisplanner-inhoudstabel met
    huishouddata, en per domein opnieuw voor de gegevens van dat domein.
  - De gates van beslissing 6 en 8 en de architectuurbesluiten 4, 5 en 7 (inclusief "Firebase-
    configuratie alleen na apart, expliciet akkoord") blijven volledig van kracht vóór de import van
    bestaande planners. Welke delen van 1.4.2 vóór die import af moeten, wordt besloten bij het
    importbesluit.
  - De navigatiegate (beslissing 2) blijft.
- **Wat niet verandert:** het Productkompas, de beslissingen 1–10 en het uitgangspunt dat
  bestaande data nooit verloren gaat.

### 12. Gescheiden ouders en samengestelde gezinnen (26 oktober 2026)

- **Besluit van de producteigenaar:** Thuisplanner gaat gescheiden ouders en samengestelde gezinnen ondersteunen.
  - **Optie A is de basis:** zelfstandige huishoudens kunnen geselecteerde kindgerelateerde afspraken, taken en
    informatie met elkaar delen, zonder toegang te krijgen tot elkaars overige huishoudgegevens.
  - **Optie B is een optionele toekomstige uitbreiding:** een uitgebreidere co-ouderschapsomgeving
    (verblijfsroosters, overdrachtsmomenten, eventueel kostenverdeling). Optie B wordt niet gebouwd zonder
    afzonderlijk productbesluit.
- **Productkompas:** principes 3, 5, 6, 7 en 9, en de regels "Privacy volgt de situatie", "Fouten moeten goedkoop
  zijn" en "Huisplan groeit mee".
- **Uitgangspunten:**
  - Twee huishoudens blijven volledig zelfstandig, met eigen leden, eigenaar en gegevens. Een koppeling maakt niemand
    lid van het andere huishouden.
  - Gedeelde kindinformatie geeft geen toegang tot andere huishoudgegevens, in geen van beide richtingen.
  - Een gedeelde afspraak blijft één onderliggend item van één eigenaarshuishouden, zonder kopieën tussen
    huishoudens.
  - Toegang tot gedeelde items geldt per account binnen de koppeling, niet per huishouden. Nieuwe partners en andere
    nieuwe leden krijgen nooit automatisch toegang. Dit is een bewuste, beperkte uitzondering op principe 7, vanuit
    "Privacy volgt de situatie"; principe 7 zelf verandert niet.
  - De bestaande RLS en de huishoudgrenzen (samengestelde verwijzingen op `household_id`) worden niet verzwakt.
  - Thuisplanner registreert of beoordeelt geen gezag en geen verdeling (principe 9). Bevoegdheden zijn niet
    automatisch gelijk.
  - Meldingsinstellingen zijn persoonlijk, per account. Standaard geen meldingen over de grens van het huishouden.
  - Privé-afspraken en "Bezet" gaan nooit over de grens.
  - Voor gezinnen zonder koppeling verandert er niets zichtbaars.
- **Keuzes (vastgesteld op 26 oktober 2026):**

  | # | Keuze | Besluit |
  | --- | --- | --- |
  | O1 | Wijzigen door het andere huishouden | Gedeelde afspraken zijn voor het andere huishouden **alleen-lezen**. |
  | O2 | Nieuwe toegang aan één kant (bijvoorbeeld een nieuwe partner) | Vereist **instemming van beide kanten**. |
  | O2a | Instemming intrekken | Instemming kan later worden ingetrokken. Intrekken (en stoppen met de koppeling) kan altijd eenzijdig. |
  | O2b | Termijn van een toegangsverzoek | Een verzoek verloopt na **14 dagen**. Zonder instemming is er geen toegang. |
  | O3 | Wat wordt gedeeld | Delen staat per gekoppeld kind **standaard uit**. Tijdens het koppelen kan de gebruiker bewust kiezen om afspraken over dat kind voortaan standaard te delen. Per afspraak blijft zichtbaar of hij gedeeld wordt, en de instelling is aan te passen. Privé-afspraken en "Bezet" worden nooit gedeeld. |
  | O4 | Notities | Worden standaard **niet** gedeeld; alleen met expliciete keuze per afspraak. |
  | O5 | Herkomst bij de ontvanger | De ontvanger ziet uitsluitend het **eigen label** voor het andere huishouden, niet de huishoudnaam of wie de afspraak maakte. |
  | O6 | Bijwerken bij de ontvanger | In de eerste versie **periodiek ophalen**, geen realtime. Gedeelde items worden niet gepresenteerd als direct gesynchroniseerd. Intrekken van toegang wordt direct op de server afgedwongen; lokaal aanwezige gegevens worden veilig afgehandeld (zie `docs/thuisplanner-co-ouderschap.md`). |
  | O7 | Aantal koppelingen | **Meerdere koppelingen per huishouden, hoogstens één per kind.** Het ontwerp blijft voorbereid op meer koppelingen per kind. |
  | O8 | Gratis of Premium | Optie A is **gratis** (beslissing 3: organiseren blijft gratis). Optie B kan later eventueel Premium worden. |

- **Voorwaarden vóór implementatie:**
  - gate 9 opnieuw, voor het domein "koppelingen" (zie de tabel met gates);
  - een AVG-beoordeling voor het delen van kindgegevens met een tweede huishouden (grondslag, toestemming bij
    koppelen, intrekking, bewaartermijn, uitleg in de privacyverklaring en opname in de data-export);
  - toestemming en intrekking aantoonbaar server-side;
  - geen nieuwe migratie zonder uitleg en afzonderlijk akkoord.
- **Uitwerking:** `docs/thuisplanner-co-ouderschap.md`. De technische oplossingen daarin zijn een ontwerpvoorstel;
  niets is gebouwd of bewezen.
- **Wat niet verandert:** het Productkompas en de beslissingen 1–11.

### 13. Slimme projecten (26 oktober 2026)

- **Besluit van de producteigenaar:** via de centrale + kan het huishouden een grotere situatie beschrijven, zowel een
  bekende ("we verhuizen 1 maart") als een onverwachte ("vaatwasser kapot, waterschade in de keuken"). Thuisplanner
  stelt dan een plan voor: stappen met een logische volgorde en, waar zinvol, datums.
- **Productkompas:** principes 1, 3, 5 en 6; beslissingen 1, 3 en 5.
- **Uitgangspunten:**
  - **Hybride.** Sjablonen waar die helpen; voor vrije en onverwachte situaties een voorstel van een AI-component.
    Vrije invoer blijft altijd mogelijk.
  - **De gebruiker beslist.** Het plan is een voorstel, volledig aan te passen. Er wordt pas iets aangemaakt na
    bevestiging. Bij twijfel stelt Thuisplanner hoogstens één verduidelijkende vraag (beslissing 1).
  - **Geen schijnintelligentie.** Is er geen betrouwbaar voorstel, dan zegt Thuisplanner dat, en kan de gebruiker zelf
    stappen opgeven. Een sjabloon wordt nooit als maatwerk gepresenteerd. Bij acuut gevaar (brand, gaslucht,
    medische spoed) toont Thuisplanner een vaste verwijzing naar 112: een vaste regel, geen AI-advies.
  - **Minimale gegevens naar buiten.** Naar een externe AI gaat alleen wat nodig is (de zin van de gebruiker en de
    datum). Nooit huishoudkennis, contacten, namen van leden, privé-afspraken of andere onnodige persoonsgegevens.
    Welke kennis bij een stap hoort, koppelt Thuisplanner zelf, binnen de eigen rechten. De gebruiker ziet vóór
    verzending dat de zin naar de AI-hulp gaat; de AI-hulp is per huishouden uit te zetten.
  - **Keuze van de dienst.** Kwaliteit, betrouwbaarheid, privacy en beheersbare kosten staan voorop; gratis is geen
    voorwaarde. De verwerker gebruikt de invoer niet om te trainen en bewaart haar niet langer dan nodig. Een betaalde
    AI-dienst of een abonnement vraagt altijd vooraf een afzonderlijk akkoord van de producteigenaar, met een vast
    kostenplafond.
  - **Onverwachte situaties echt ondersteunen.** Vóór de bouw komt een kwaliteitsproef op een vaste testset van
    realistische situaties; op basis daarvan worden de aanpak en de dienst gekozen.
- **Voorwaarden vóór implementatie:** gate 9 voor het domein "projecten"; een AVG-beoordeling van de AI-verwerker,
  inclusief de verwerkingslocatie; de uitslag van de kwaliteitsproef; geen nieuwe migratie zonder uitleg en
  afzonderlijk akkoord (zie de tabel met gates).
- **Wat niet verandert:** het Productkompas en de beslissingen 1–12.

### 14. Huishoudkennis en contacten (26 oktober 2026)

- **Besluit van de producteigenaar:** Thuisplanner kan huishoudkennis vastleggen (bijvoorbeeld verzekeraar, huisarts,
  leasemaatschappij, school) en contacten zonder Thuisplanner-account (bijvoorbeeld familie en vrienden, met
  verjaardag). Thuisplanner toont deze kennis vanzelf bij relevante taken en projecten. Het beheer staat onder
  Instellingen; er komt **geen extra hoofdmodule**.
- **Productkompas:** principes 2, 3 en 7; de regel "Privacy volgt de situatie"; beslissing 6.
- **Uitgangspunten:**
  - **Een contact is geen huishoudlid** en wordt nooit automatisch uitgenodigd. Een contact koppelen aan een lid
    gebeurt alleen bewust.
  - **Persoonlijk of gedeeld.** Bij toevoegen kies je eenvoudig tussen *persoonlijk* (alleen jij) en *gedeeld* (het
    huishouden), voor een contact als geheel én voor afzonderlijke gevoelige gegevens. Bij duidelijk algemene
    huishoudcontacten (bijvoorbeeld loodgieter, school, energieleverancier) is gedeeld de voorgestelde standaard; bij
    medische en persoonlijke contacten en gegevens, en bij financiële gegevens, is persoonlijk de standaard. De
    gebruiker kan dit altijd aanpassen.
  - **De server dwingt de rechten af**, overal: lezen, zoeken, koppelen aan taken en projecten, signalen en
    realtime, meldingen en de data-export. Wie iets niet mag zien, krijgt ook geen aanwijzing dat het bestaat.
  - **Nooit naar buiten.** Kennis en contacten gaan nooit naar een externe AI en staan nooit in de inhoud van een
    melding.
  - **Niet opslaan:** BSN, wachtwoorden, pincodes en volledige betaalgegevens.
- **Voorwaarden vóór implementatie:** gate 9 voor het domein "kennis en contacten", met testmatrix en tegenproeven
  per toegangsniveau en per pad (lezen, zoeken, koppelen, export); geen nieuwe migratie zonder uitleg en afzonderlijk
  akkoord (zie de tabel met gates).
- **Wat niet verandert:** het Productkompas en de beslissingen 1–12.

### 15. Herhalende taken (26 oktober 2026)

- **Besluit van de producteigenaar:** herhalende taken horen bij de eerste demo. Ze worden in Huisplan veel gebruikt.
  Een afspraak voor de hele dag is geen gewenste vervanging; die tijdelijke omweg in de centrale + vervalt zodra
  herhalende taken er zijn.
- **Productkompas:** principes 3 en 8.
- **Uitgangspunten:**
  - Het ontwerp ondersteunt in elk geval: dagelijks; wekelijks op **geselecteerde weekdagen**; **om de twee weken**
    (ook op geselecteerde weekdagen); maandelijks; jaarlijks; met een optionele einddatum.
  - Afvinken gebeurt per keer. Bij wijzigen en verwijderen: "alleen deze" of "hele reeks".
  - Gemiste keren blijven een korte, vaste tijd zichtbaar.
  - De centrale + herkent herhalende taken (bijvoorbeeld "elke vrijdag stofzuigen").
- **Voorwaarden vóór implementatie:** gate 9 voor het takendomein; geen nieuwe migratie zonder uitleg en afzonderlijk
  akkoord (zie de tabel met gates).
- **Wat niet verandert:** het Productkompas en de beslissingen 1–12.

### 16. Minimale herinneringen (26 oktober 2026; herbeoordeling van beslissing 4)

- **Besluit van de producteigenaar:** de eerste demo krijgt een kleine set herinneringen: een afspraak met tijd, een
  verjaardag, en een taak met tijd of de volgende stap van een project.
- **Productkompas:** principe 6; beslissing 4.
- **Uitgangspunten:**
  - Instellingen zijn strikt persoonlijk, per account, nooit per huishouden. De standaard is rustig, met stille uren.
  - **Geen toestemming vragen bij het eerste openen.** Thuisplanner vraagt pas om meldingen wanneer iemand een
    herinnering aanzet, met een korte uitleg.
  - De inhoud van een melding toont nooit details van een privé-afspraak, "Bezet"-inhoud of huishoudkennis.
  - **Kanaal:** webpush is een mogelijke route. Het wordt pas gekozen nadat ondersteuning en betrouwbaarheid zijn
    getoetst op de telefoons van de testers.
- **Voorwaarden vóór implementatie:** een pushproef op de testtelefoons; gate 9 voor het domein "meldingen"; geen
  nieuwe migratie zonder uitleg en afzonderlijk akkoord (zie de tabel met gates).
- **Wat niet verandert:** het Productkompas en de beslissingen 1–12.
