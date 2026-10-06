# Ontwerp 1.4.2: voorbereiding 1.5

**Status: ontwerp, niet vastgesteld.** Dit document beschrijft hoe stap 1.4.2 de voorwaarden E1 t/m
E6 uit `docs/identiteit-en-items.md` (5.1) wil waarmaken. Het is geen contract.

- **Bindend** is alleen wat in `docs/identiteit-en-items.md` staat, met de besluiten 1 t/m 9
  (sectie 7 en 7.1). Bij tegenstrijdigheid gaat het contract voor.
- **Niet vastgesteld** in dit document, en pas voor te stellen na het E6-bewijs: concrete
  Firebase-regels, padnamen, het exacte slotformaat en de werking van `resolveLocation()`. Waar die
  hieronder voorkomen, zijn het werknamen of voorbeelden.
- **Plaats in de leesvolgorde:** stap 4 uit `CLAUDE.md` (fase- en technische documentatie), na het
  contract.
- **Opgesteld:** 6 oktober 2026, op basis van het implementatieplan voor 1.4.2 en de review daarvan
  door Codex, verwerkt via besluit 9.
- **Er is nog niets gebouwd.** Dit document wijzigt geen code, geen Firebase- of
  Supabase-configuratie, geen productiegegevens, en de live- of testplanner niet.

**Werknamen in dit document**

| Werknaam | Betekenis |
| --- | --- |
| **bron** | De plek waar een planner nu staat en die door een verhuisslot wordt afgesloten. |
| **doel** | De nieuwe plek waar de migratie de planner neerzet (in 1.5 binnen Firebase, in 1.12 Supabase). |
| **control-gedeelte** | Een beschermde plek buiten de data voor het slot, de migratiestatus en de gereedstatus. |
| **opslaggeneratie** | Welke opslag een planner gebruikt: vóór 1.5 (generatie 1), na 1.5 (generatie 2), Supabase na 1.12 (generatie 3). |
| **generatie van een wijziging** | Een oplopend volgnummer per lokale wijziging op een toestel (E2). Niet te verwarren met opslaggeneratie. |

## 1. Uitgangspunten uit besluit 9

| # | Besluit | Gevolg voor dit ontwerp |
| --- | --- | --- |
| 9.1 | Zonder bruikbare ETag niet schrijven | E2 kent geen terugval meer; de bestaande tests voor de variant zonder leesbare ETag krijgen een andere verwachting. |
| 9.2 | Afzonderlijk contract voor `same`/`different` | E4 heeft één logboekmotor met twee onderwerptypen en gescheiden effectregels. |
| 9.3 | Optie A is de onderzoeksrichting | E6 werkt optie A uit; niets wordt geactiveerd. |
| 9.4 | Emulator met harde lokale netwerkallowlist | Alle E6-bewijzen en hersteloefeningen draaien lokaal. |
| 9.5 | Werkelijke regels vooraf alleen-lezend controleren | Voorwaarde vóór het E6-bewijs; actie van de producteigenaar. |
| 9.6 | Projecten en historische clientversies inventariseren | Bepaalt welke oude clients in het bewijs meedoen. |
| 9.7 | E5 lokaal, geanonimiseerd, ook ruwe data, caches en bases | E5 is een lokaal hulpmiddel dat alleen vormen en aantallen rapporteert. |
| 9.8 | Geen praktijktest E2/E3 op echte data; herstelprotocol eerst | De testversie gaat niet naar de echte planner voordat het herstelprotocol klaar en geoefend is. |
| 9.9 | Namespace en invoercodering UUIDv5 vooraf vast en getest | E4 levert een voorstel met testvectoren ter goedkeuring. |

## 2. E2: één schrijfcoördinatiemodel

### 2.1 Probleem in de huidige code

Opslaan (`push`), wegzetten (`flush`), laden (`load`), herpogingen en periodiek ophalen hebben elk
hun eigen vlaggen (`pushing`, `pendingSave`, `saveSeq`, `saveGen`, `noConditional`). Daardoor:

- kan een vertraagd antwoord van een `flush()` of van een `load()` de basis of de ETag terugzetten
  naar een oudere stand;
- kan een `flush()` tegelijk met een gewone opslag onderweg zijn;
- staat na één netwerkfout de terugval zonder ETag de hele sessie aan.

### 2.2 Model

Eén coördinator per planner en opslaggeneratie houdt deze toestand bij:

| Veld | Betekenis |
| --- | --- |
| `localGen` | Generatie van de nieuwste lokale wijziging. Loopt op bij elke wijziging. |
| `confirmedGen` | Hoogste generatie waarvan de server de opslag heeft bevestigd. |
| `serverEtag` | ETag van de laatst bekende serverstand. Leeg = geen bruikbare ETag. |
| `base` | Laatst bekende serverstand (voor samenvoegen en voor het herkennen van verwijderingen). |
| `inflight` | De ene schrijfactie die onderweg is: `{gen, etagSent, kind: 'push' or 'flush', id}`, of leeg. |
| `readSeq` | Volgnummer van de laatst gestarte leesactie. |

**Regels:**

1. **Hooguit één schrijfactie onderweg.** `flush()` schrijft alleen als er niets onderweg is. Is er
   wel iets onderweg, dan doet `flush()` niets; de cache houdt de wijziging vast.
2. **Altijd voorwaardelijk.** Elke schrijfactie stuurt `if-match` met `serverEtag`. Is er geen
   bruikbare ETag, dan wordt niet geschreven: status "Opslaan nu niet veilig mogelijk", lokaal blijft
   alles bewaard (besluit 9.1).
3. **Antwoorden horen bij een generatie.** Een geslaagd antwoord op schrijfactie `gen = g` zet
   `confirmedGen`, `base` en `serverEtag` alleen als `g > confirmedGen`. Een antwoord voor een oudere
   generatie wordt genegeerd voor data, basis, ETag en cache.
4. **Leesacties horen bij een volgnummer.** Een `load()`-antwoord wordt alleen verwerkt als zijn
   `readSeq` het nieuwste is én er sinds het starten geen schrijfactie is begonnen of bevestigd.
   Anders wordt het weggegooid; de volgende poll haalt opnieuw op.
5. **Onbekende uitkomst.** Bij een netwerkfout tijdens een schrijfactie is onbekend of de server
   haar heeft verwerkt. De coördinator haalt dan eerst de serverstand en ETag op, voegt samen met de
   `base`, en probeert daarna opnieuw voorwaardelijk. Een schrijfactie die toch was verwerkt, leidt zo
   tot hooguit een 412 en een samenvoeging, nooit tot een dubbele wijziging.
6. **Herpogingen.** Oplopende wachttijd. Na een vast aantal mislukte pogingen: blijvende status
   "Niet opgeslagen", zonder `pendingSave` te wissen. Een `online`-gebeurtenis, de volgende poll of
   het heropenen van de app probeert het opnieuw.
7. **412.** Ophalen, samenvoegen, opnieuw proberen met de nieuwe ETag. Een vast maximum per
   generatie; daarna dezelfde blijvende status als bij regel 6.
8. **Poll.** Geen leesactie zolang er een schrijfactie onderweg is of een opslag gepland staat.
9. **Bewaking (0.2) en verhuisslot.** Een 412 of 401/403 leidt altijd tot opnieuw lezen. Daarbij
   worden de bewaking en (na E6) het verhuisslot gecontroleerd.
10. **Migratieschrijven.** Een aparte functie voor voorwaardelijk schrijven (werknaam
    `putIfMatch`) geeft `ok`, `conflict` of `error` terug en kent geen enkele terugval.

**Geen datamigratie.** Het dataformaat blijft gelijk; alleen het transport verandert.

## 3. E3: cache-identiteit en opslagfouten

### 3.1 Cache-identiteit

- Elke cache hoort bij precies één **database**, **planner** en **opslaggeneratie**. De sleutel van
  de cache is daaruit afgeleid, zonder de geheime plannersleutel of database-URL leesbaar op te
  slaan (bijvoorbeeld via een hash).
- Het cacherecord bevat ten minste: de opslaggeneratie, het dataformaat, de appversie, `data`,
  `base`, `localGen` en `confirmedGen`.
- De bestaande cache van vóór 1.4.2 (`plannerCache_<sleutel>`, zonder deze velden) blijft leesbaar en
  geldt als generatie 1.
- Een cache van een andere database, planner of generatie wordt nooit rechtstreeks samengevoegd.
  Alleen een expliciete omzetting (in 1.5 met dezelfde mapping, contract 3.1, eis 3) mag dat.

### 3.2 Bewaren tot bevestigd

- Een oude cache wordt pas opgeruimd als zijn inhoud aantoonbaar is verwerkt: omgezet, samengevoegd,
  voorwaardelijk geschreven en teruggelezen.
- Tot dan staat hij als "nog te verwerken" gemarkeerd. Mislukt die markering, dan blijft hij gewoon
  staan.
- Mislukt het opruimen, dan is dat onschadelijk. Het wordt gemeld in de diagnose, niet als foutmelding
  aan de gebruiker.

### 3.3 Fouten

| Fout | Gedrag |
| --- | --- |
| Schrijven naar de cache mislukt, met niet-gesynchroniseerde wijzigingen | Blijvende melding "Je wijzigingen zijn nog niet veilig bewaard"; direct synchroniseren; geen claim "opgeslagen". |
| Schrijven naar de cache mislukt, zonder lokale wijzigingen | Geen melding aan de gebruiker; wel in de diagnose. |
| Lezen van de cache gooit een fout | Cache geldt als "onbekend", niet als "leeg". Niet overschrijven. Melding. |
| Cache onleesbaar (geen geldige JSON of onbekend formaat) | Onaangeroerd laten of apart bewaren; melding; niet overschrijven. |
| Verwijderen mislukt | Onschadelijk; diagnose. |
| Netwerk én opslag tegelijk weg | Duidelijke status "Niet bewaard"; in het geheugen houden; blijven proberen; waar mogelijk waarschuwen vóór het sluiten. |
| `plannerDbUrl`/`plannerKey` niet op te slaan | De sessie werkt verder via de link; melding dat dit toestel de koppeling niet kan onthouden. |

- Alle `localStorage`-schrijfacties gaan via één functie die het resultaat teruggeeft, met een
  niveau: `kritiek` (cache, koppeling, ledenback-ups), `belangrijk` (identiteit van dit toestel) of
  `voorkeur`. Alleen bij `voorkeur` mag een fout stil blijven.
- De melding "Back-up gedownload" na een export verdwijnt; de bevestiging hoort bij E1.

## 4. E1: herstelprotocol

**Eerst ontwerpen, dan oefenen** (besluit 9.8). Geen oefening of praktijktest op echte
huishouddata.

### 4.1 Wat een herstelkopie bevat

| Onderdeel | Waarom |
| --- | --- |
| Ruwe serverdata met ETag en hash | Onbekende velden blijven bewaard; de hash maakt controle mogelijk. |
| Lokale `data` en `base` van dit toestel | Lokale wijzigingen én lokale verwijderingen zijn alleen te herkennen tegen de basis. |
| `localGen`, `confirmedGen` | Laat zien of er niet-bevestigde wijzigingen zijn. |
| Ledenback-ups van dit toestel | Het bestaande terugdraaien van het register. |
| Opslagidentiteit | Database, planner en opslaggeneratie als vingerafdruk (geen geheimen). Een kopie kan niet in een andere planner of generatie worden teruggezet. |
| UUID-mapping (na de migratie) | Nodig om wijzigingen tussen de generaties te vertalen. |
| Appversie, tijdstip, checksum over het geheel | Controle bij het teruglezen. |

**Bevestigd** is een kopie pas als de app haar heeft teruggelezen en de checksum klopt: de
gebruiker kiest het gedownloade bestand opnieuw, of de serverkopie wordt teruggelezen.

### 4.2 Toestellen

- **Vóór het activeren van een slot:** een checklist voor het huishouden. Elk toestel opent de app
  online, synchroniseert, en maakt waar mogelijk een bevestigde kopie.
- **Toestellen die offline zijn of niet meedoen:** hun cache blijft bestaan (contract 3.1, eis 3).
  Na de update wordt hij omgezet en samengevoegd. Lukt dat niet, dan blijft hij onaangeroerd en
  meldt de app dat; de inhoud is dan nog met de hand te herstellen uit die cache.

### 4.3 Herstelsituaties

| Situatie | Herstel |
| --- | --- |
| **R0: vóór het slot** | Niets te herstellen; de gewone back-up geldt. |
| **R1: slot actief, gereedstatus nog niet gezet** | De beheerder heft het slot buiten de app op; het doel wordt genegeerd of gewist. De bron is ongewijzigd. |
| **R2: na de gereedstatus, nog geen wijzigingen in het doel** | Als R1, plus de gereedstatus terugzetten (alleen door de beheerder). |
| **R3: na de gereedstatus, met wijzigingen in het doel** | Zie hieronder. Wijzigingen gaan nooit stil verloren. |
| **R4: toestel met kapotte of onomzetbare cache** | De cache blijft onaangeroerd; herstel uit die cache met de hand of met een hulpmiddel. |

**R3 vraagt een keuze die vóór het activeren van een slot moet zijn vastgelegd** (open vraag P1-4):

- **R3a, vooruit herstellen (voorkeur):** het doel blijft leidend. De fout wordt in het doel
  hersteld, met de afgesloten bron en de mapping als referentie.
- **R3b, terug naar de bron:** de wijzigingen uit het doel worden met de mapping terugvertaald
  (UUID naar label) en in de bron verwerkt nadat het slot is opgeheven. Dat vraagt een tweede,
  geteste omzetting.
- **R3c, terug naar de bron met een export van de doelwijzigingen:** de wijzigingen worden niet
  automatisch teruggezet, maar apart bewaard en zichtbaar gemaakt. Ze gaan niet verloren, maar
  moeten met de hand worden verwerkt.

### 4.4 Oefeningen

Alle oefeningen draaien in de emulator met fictieve data:

- R1, R2 en R3 met de gekozen variant; R4 met een opzettelijk kapotte cache;
- de uitkomst is aantoonbaar: de hash van de herstelde stand is gelijk aan de verwachte stand, en geen
  enkele wijziging uit de testopzet ontbreekt zonder melding.

## 5. E4: beslislogboek, `same`/`different` en UUIDv5

### 5.1 Eén motor, twee onderwerptypen

- **Gedeelde motor:** het bijhouden van `opId`, `basedOn`, koppen, conflicten en idempotentie.
- **Onderwerptypen:**
  - lidmaatschap: onderwerp = één genormaliseerd label; uitkomsten `member`/`notMember`;
  - identiteitspaar: onderwerp = een gesorteerd paar van twee genormaliseerde labels; uitkomsten
    `same`/`different`.
- Elke beslissing noemt haar onderwerptype expliciet. Een `basedOn`-verwijzing naar een beslissing
  van een ander onderwerp is ongeldig.
- **Effectregels** staan in aparte functies per onderwerptype, plus één functie die ze combineert
  volgens contract 2.4. Er is geen effect zonder expliciete regel.

### 5.2 Hetzelfde `opId` met andere inhoud

- Vóór het samenvoegen worden lokale en ontvangen beslissingen met hetzelfde `opId` vergeleken op hun
  canonieke inhoud.
- Bij een verschil: harde fout. Het onderwerp krijgt de uitkomst `null`, de fout wordt gemeld, en de
  gewone samenvoeging mag die beslissing niet tot een mengvorm maken. Een migratie stopt.

### 5.3 Wat 1.4.2 wel en niet doet

- **Wel:** de motor, de effectregels, `resolveMember()` en de omzetfuncties voor 1.4.1-antwoorden als
  pure functies, getest met fictieve data.
- **Niet:** naar echte data schrijven. 1.4.1-clients bouwen `meta.members` bij elke registerupdate
  opnieuw op en zouden een logboek wissen. Dat wordt pas veilig na het verhuisslot (1.5).
- **Wel, als voorbereiding:** 1.4.2 laat bij het bijwerken van `meta.members` onbekende sleutels staan,
  zodat 1.4.2-clients een later logboek niet wissen.

### 5.4 UUIDv5: voorstel ter goedkeuring (besluit 9.9)

Nog niet vastgesteld. Te beslissen en daarna nooit meer te wijzigen:

- **Namespace:** één vaste UUID voor Huisplan-leden, eenmalig gegenereerd en vastgelegd.
- **Invoercodering:** een vaste tekst, bijvoorbeeld een versielabel, de plannersleutel en het
  `m_`-ID, gescheiden door een teken dat in geen van de delen kan voorkomen. Alle tekst wordt eerst
  Unicode-genormaliseerd (NFC) en daarna als UTF-8 gecodeerd.
- **Te beslissen:**
  - welke vorm van de plannersleutel de invoer is (letterlijk, of genormaliseerd);
  - of het `m_`-ID of de genormaliseerde naam de invoer is (het `m_`-ID is zelf al een afgeleide);
  - de deterministische `opId`'s voor omgezette beslissingen volgen hetzelfde patroon, met een eigen
    versielabel per onderwerptype.
- **Testvectoren:** een vaste set invoer met verwachte UUID's, inclusief tekens buiten ASCII,
  hoofdletters, spaties en een lege of ontbrekende waarde (die moet een fout geven). Ook de algemene
  UUIDv5-testvector uit de standaard.
- **Implementatie:** synchroon (een eigen SHA-1), omdat de omzetting in samenvoegpaden draait.

## 6. E5: classificatie

- **Hulpmiddel:** een lokaal script (werknaam `tools/classificeer.js`) dat bestanden leest en alleen
  vormen, aantallen en anonieme kenmerken rapporteert.
- **Invoer** (verzameld door de producteigenaar op een eigen toestel):
  - een export via Instellingen;
  - de ruwe serverdata (via de herstelkopie uit E1, of een gelijkwaardige ruwe download);
  - per toestel de lokale cache en de basis (via de herstelkopie uit E1).
- **Uitvoer per veld:**
  - de vorm;
  - het percentage elementen met een `id`;
  - de uniekheid van de `id`'s;
  - of de lijst gemengd is;
  - samenvoeggedrag (per element, als verzameling of "lokaal wint");
  - persoonsverwijzingen;
  - categorie en actie;
  - blokkade ja/nee;
  - het verschil tussen ruw en genormaliseerd.
- **Acceptatie:** de criteria uit contract 3.4.
- **Eerst op fictieve fixtures**, daarna door de producteigenaar op de eigen data. Alleen het rapport
  wordt gedeeld.

## 7. E6: optie A uitgewerkt (onderzoeksrichting)

**Niets hiervan wordt geactiveerd.** De vorm hieronder is een werkhypothese voor het bewijs in de
emulator. Concrete regels en paden worden pas na het bewijs voorgesteld.

### 7.1 Opbouw

- **Bron:** de huidige plek van de planner. Na het slot weigert de server elke schrijfactie daar.
- **Doel:** een nieuwe plek, alleen beschrijfbaar als het slot van de bron bestaat.
- **Control-gedeelte:** een aparte plek buiten de data, per planner. Daarin het slot, de
  migratiestatus en de gereedstatus.

### 7.2 Beoogde eigenschappen van de serverregels (te bewijzen, niet vastgesteld)

| # | Eigenschap |
| --- | --- |
| A1 | Schrijven op de bron wordt geweigerd zodra het slot bestaat: PUT, PATCH, verwijderen, op de bron zelf en op elk pad eronder. |
| A2 | Een schrijfactie op een hoger pad (een PUT of PATCH op een ouder, of een PATCH met meerdere paden) kan de bron of het control-gedeelte niet wijzigen. |
| A3 | Het slot kan maar één keer worden gezet en niet via de app worden gewist of gewijzigd. |
| A4 | De migratiestatus kan alleen vooruit; de gereedstatus kan alleen worden gezet als het slot bestaat. |
| A5 | Het doel is alleen beschrijfbaar als het slot van de bron bestaat. |
| A6 | Wie alleen de data kan schrijven, kan het control-gedeelte niet wijzigen. Zonder accounts betekent dat: alleen via de vaste regels hierboven, niet via de inhoud van de data. |

Een bekende beperking zonder accounts: iedereen met de plannersleutel kan in principe het slot zetten
(open vraag P1-9).

### 7.3 Migratiestatus (werknamen)

`geen` → `slot` → `zelftest-ok` → `doel-geschreven` → `gecontroleerd` → `gereed` (of `gestopt`).

| Stap | Wie | Wat |
| --- | --- | --- |
| 1 | migrator (na akkoord) | Optioneel: de bestaande bewakingsmarkering zetten, zodat apps vanaf 0.2 "verhuisd" tonen. |
| 2 | migrator | Slot zetten. |
| 3 | migrator | Zelftest: een onschuldige schrijfactie op de bron (PUT én PATCH) moet worden geweigerd. Zo niet: `gestopt`. |
| 4 | migrator | Pas nu de bron lezen. |
| 5 | migrator | Het doel veilig initialiseren en beschrijven (7.4). |
| 6 | migrator | Teruglezen en vergelijken met de berekening. |
| 7 | migrator | Gereedstatus zetten. Daarna gebruiken nieuwe apps het doel. |

### 7.4 Veilige doelinitialisatie, twee migratoren, hervatten

- **Initialisatie:** het doel wordt geschreven met de voorwaarde dat het leeg is. Is het niet leeg,
  dan wordt het gelezen. Het mag alleen verder als het aantoonbaar van dezelfde migratie is (zelfde
  bron-hash, zelfde mapping). Anders: `gestopt`.
- **Twee migratoren:** door de deterministische UUID's en `opId`'s berekenen beide hetzelfde doel. De
  eerste schrijft; de tweede krijgt een conflict, leest het doel en vergelijkt het. Gelijk: alleen
  controleren. Ongelijk: `gestopt`.
- **Hervatten:** omdat de bron onveranderlijk is, begint een hervatting bij de status op het
  control-gedeelte en berekent opnieuw. Het resultaat is gelijk aan dat van een ononderbroken
  migratie.

### 7.5 Clients

- **Nieuwe client (werknaam `resolveLocation()`):** leest het control-gedeelte en bepaalt daaruit
  waar de planner staat en of het doel gereed is. Tot de gereedstatus is de planner alleen-lezen.
  Het exacte gedrag wordt pas na het bewijs vastgelegd.
- **Oude client:** krijgt een weigering van de server. Apps vanaf 0.2 tonen "verhuisd" als de
  bewakingsmarkering is gezet; oudere apps tonen "Toegang geweigerd". De cache blijft staan.
- **Een 1.4.2-client** herkent na een weigering het slot en toont "Planner is verhuisd · app
  vernieuwen", zonder zijn cache te wissen.

### 7.6 Rollback

Zie E1 (4.3). Opheffen van het slot en terugzetten van statussen kan alleen door de beheerder,
buiten de app.

### 7.7 Voorwaarden vóór het bewijs

1. De werkelijke Firebase-regels van de betrokken projecten alleen-lezend controleren (besluit 9.5).
2. De betrokken Firebase-projecten en de historische clientversies inventariseren (besluit 9.6).
3. De emulator opzetten met een harde lokale netwerkallowlist (besluit 9.4).
4. Aantonen dat de emulator zich bij ETag, `if-match`, lege plekken, PUT, PATCH en regelevaluatie
   gedraagt zoals productie. Waar hij afwijkt, wordt dat benoemd en volgt een besluit.

## 8. Testplan

**Isolatie.** Fictieve data; verse browsercontexten; geen productieconfiguratie. Elke test faalt bij
een verzoek naar een ander adres dan de lokale mock of emulator.

| # | Scenario | Waar | Verwacht |
| --- | --- | --- | --- |
| T1 | Twee clients tegelijk | mock | Beide wijzigingen bewaard; elke schrijfactie voorwaardelijk. |
| T2 | Netwerkonderbreking (vóór de server; verwerkt maar antwoord verloren; offline → online) | mock | Alleen voorwaardelijke herpogingen; geen dubbele wijziging; geen onterechte "opgeslagen". |
| T3 | ETag-conflict, ook herhaald | mock | Samengevoegd; daarna een blijvende status; later herstel zonder verlies. |
| T4 | Vertraagd antwoord (push, flush, load) na een nieuwere generatie | mock | De nieuwere generatie blijft staan in data, basis, ETag en cache. |
| T5 | Geen bruikbare ETag | mock | Er wordt niet geschreven; lokaal bewaard; melding. |
| T6 | Hervatten na een fout | mock + emulator | Samenvoegen vanuit de cache; een onvolledige herstelkopie geldt niet als bevestigd. |
| T7 | Opslagfouten: quota, leesfout, verwijderfout, onleesbare cache, netwerk én opslag weg | mock | Gedrag volgens 3.3; niets overschreven; geen onterechte claim. |
| T8 | Cache van een andere database, planner of generatie | mock | Niet samengevoegd; bewaard tot verwerkt. |
| T9 | Tegenstrijdige lidmaatschapsbeslissingen; afwijkende klokken; opvolger vóór voorganger | unit | Volgens contract 2.4. |
| T10 | `same`/`different` met tegenstrijdig lidmaatschap; conflict tussen paarbeslissingen | unit | Geen impliciete effecten; `null` en één vraag. |
| T11 | Hetzelfde `opId` met andere inhoud | unit + mock | Harde fout; geen mengvorm. |
| T12 | UUIDv5-testvectoren | unit | Exacte overeenkomst. |
| T13 | Oude client met gekopieerde markering | emulator, met de echte oude code | Geweigerd; serverdata ongewijzigd. |
| T14 | Schrijfactie van een oude client onderweg tijdens het slot | emulator | Na het slot geweigerd; wat eerder aankwam, zit in de gelezen bron. |
| T15 | Oude offline client keert terug | emulator | Geweigerd; cache onaangeroerd; nieuwe app toont "verhuisd". |
| T16 | PUT, PATCH, verwijderen op bron, ouder en subpad; PATCH met meerdere paden | emulator | A1 en A2. |
| T17 | Control-gedeelte via de data wijzigen of het slot wissen | emulator | A3, A4 en A6. |
| T18 | Doel met vreemde inhoud; twee migratoren; hervatten vanaf elke status | emulator | Volgens 7.4. |
| T19 | Hersteloefeningen R1 t/m R4 | emulator | Volgens 4.4. |

**Oude clients** zijn de echte oude versies uit de git-geschiedenis, volgens de inventarisatie
(besluit 9.6), niet alleen nagebootste verzoeken.

## 9. Volgorde

1. De voorwaarden uit 7.7 (inventarisatie, alleen-lezende controle van de regels, emulator,
   getrouwheid van de emulator).
2. Het E6-bewijs (T13 t/m T18) en een voorstel voor regels en paden, ter besluit.
3. E2 (T1 t/m T5).
4. E3 (T6 t/m T8).
5. Het herstelprotocol uit E1 vaststellen (inclusief de keuze voor R3), daarna de code en oefeningen
   (T19).
6. E4, na goedkeuring van de UUIDv5-namespace en -codering (T9 t/m T12).
7. E5: eerst op fixtures; daarna draait de producteigenaar het lokaal.
8. Testversie met de volledige testsuite; geen praktijktest op echte huishouddata (besluit 9.8).
9. Live alleen via een aparte PR, na akkoord.

## 10. Open vragen (P1)

| # | Vraag | Wie |
| --- | --- | --- |
| P1-1 | Hoe zien de werkelijke Firebase-regels eruit? Alleen-lezende controle per project (besluit 9.5). | producteigenaar |
| P1-2 | Welke Firebase-projecten en welke historische clientversies doen mee (besluit 9.6)? In het bijzonder: zijn er nog apps van vóór 0.2 in gebruik? | producteigenaar |
| P1-3 | Gedraagt de emulator zich bij ETag, `if-match`, lege plekken, PATCH en regelevaluatie zoals productie? Zo niet: welke afwijking is aanvaardbaar, of is een afzonderlijk akkoord voor een echt testproject nodig? | **Besloten (6 okt 2026): optie A.** De emulator is de bewijsomgeving, binnen de beperkingen en onbekenden in `docs/p1-3-emulatorproef.md` (onderzoek NW-01). Geen toestemming voor productieregels, productiedata, Supabase of slotactivering. |
| P1-4 | Welke variant voor herstel ná wijzigingen in het doel (R3a, R3b of R3c)? Moet vóór het activeren van een slot vaststaan. | producteigenaar |
| P1-5 | Kloppen de effectregels voor `same` bij tegenstrijdig lidmaatschap (contract 2.4)? | producteigenaar |
| P1-6 | Goedkeuring van de UUIDv5-namespace en de exacte invoercodering, inclusief de keuzes in 5.4 (besluit 9.9). | producteigenaar |
| P1-7 | Hoe verzamelt de producteigenaar de ruwe data, caches en bases van alle toestellen voor E5, zonder dat er data naar buiten gaat? | producteigenaar |
| P1-8 | Hoe wordt vóór het slot gecontroleerd dat alle toestellen zijn gesynchroniseerd, en wat gebeurt er met een toestel dat dat niet doet? | ontwerp + producteigenaar |
| P1-9 | Zonder accounts kan iedereen met de plannersleutel het slot zetten (een planner afsluiten). Is dat aanvaardbaar, gegeven dat dezelfde sleutel nu al alle data kan wijzigen? | producteigenaar |
| P1-10 | De migrator is gewone appcode; de regels kunnen hem niet onderscheiden van andere nieuwe clients. Is de volgorde van statussen (A4) als bescherming voldoende? | onderzoek |
| P1-11 | **Data-veiligheid, open; moet vóór 1.5 zijn opgelost of bewezen.** Firebase geeft een lijst met gaten (minder dan de helft van de sleutels over) terug als object; `normalizeData` vervangt zo'n lijst op het hoogste niveau door `[]`, en de app schrijft die bij de eerste keer laden leeg terug (nagespeeld in test- en live-versie; `docs/p1-3-emulatorproef.md`, bevinding 5). Op te lossen in de app (object met numerieke sleutels terug naar lijst, met tests) en/of aan te tonen via de classificatie (E5) dat het niet voorkomt. | onderzoek + besluit |
