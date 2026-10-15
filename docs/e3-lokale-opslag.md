# E3: cache en lokale opslag (NW-04)

**Status:** gebouwd in de testversie (`test/index.html`), niet live. Uitwerking van
`docs/identiteit-en-items.md` (3.2) en `docs/ontwerp-1.4.2.md` (3). Geen contract; bij
tegenstrijdigheid gaan die documenten voor. **Herzien na de Codex-review van PR #16**, bovenop de
gemergde E2 (PR #15); waar E3 en E2 botsen, wint E2.

- **Niet aangeraakt:** `index.html` (live), de Firebase-regels, Supabase en de serverdata. Er is geen
  migratie en geen slot. Het dataformaat op de server is gelijk gebleven.
- **Tests:** `tests/opslag.test.js` (T6–T8 en extra gevallen). Opslagfouten worden in de browser
  nagebootst; er wordt nooit echte data gebruikt.

## 1. Eén plek voor alle lokale opslag

Alle `localStorage`-toegang gaat via `bewaar(sleutel, waarde, niveau)` en `leesOpslag(sleutel)`.
Die gooien nooit een fout; ze geven het resultaat terug en zetten elke fout in een diagnose. Daarin
staat alleen de soort fout en de sleutelnaam, zonder inhoud. Een lang achtervoegsel dat een geheime
sleutel kan zijn, wordt weggelaten.

| Niveau | Wat | Bij een fout |
| --- | --- | --- |
| kritiek | cache, koppeling met de planner, ledenback-ups | altijd zichtbaar (zie 3) |
| belangrijk | identiteit van dit toestel (naam, lid, schakelaar) | één rustige melding per sessie |
| voorkeur | weergave-instellingen, "al gezien"-vlaggen | alleen in de diagnose |

Ook de leesacties bij het opstarten (naam, thema) gaan hierdoor. Een `localStorage` die bij lezen
een fout gooit, laat de app daardoor niet meer vastlopen.

`bewaarDuurzaam(sleutel, waarde)` schrijft en leest daarna terug. Alleen als het teruggelezen
resultaat exact gelijk is, geldt iets als duurzaam bewaard. Dit is de bouwsteen waarmee een
migratie kan stoppen als hersteldata niet duurzaam bewaard kan worden. Hij is via
`window.huisplanOpslag` te gebruiken (`bewaarDuurzaam`, `gezond()`, `diagnose()`).

## 2. Cache-identiteit (bovenop E2)

- **Sleutel:** `huisplanCache_` + de eerste 32 hexadecimale tekens van
  `SHA-256("huisplan-cache\n" + database-URL zonder slotslash + "\n" + plannersleutel + "\n" + opslaggeneratie)`.
  Opslaggeneratie 1 is de Firebase-planner vóór 1.5. De SHA-256 is getest tegen de standaard.
- **Record:** `{format: 2, gen, id, app, data, base, t, localGen, confirmedGen}` plus de E2-velden
  `inst`/`seq` (welk venster schreef hoe vaak), `db` en `jkey`/`jrev` (spiegel van welke
  journaalrevisie). Een niet-bevestigde generatie (`localGen > confirmedGen`) blijft na herladen
  niet-bevestigd, ook bij een lege of onbekende serverstand.
- **E2 blijft leidend.** De cache wordt alleen geschreven via `writeCacheRaw` (teruglezen, fencing,
  eerst het journaalrecord en dan de cache als spiegel). Lokaal bewaard is nooit "op de server". E3
  heeft geen eigen schrijfpad naar de server: ook "direct synchroniseren" gaat via `push()`
  (voorwaardelijk, met journaal). E3 verwijdert of overschrijft nooit journaalrecords.
- **Een andere planner, database of generatie** heeft een andere sleutel en wordt nooit gelezen of
  samengevoegd. Staat er onder de eigen sleutel een record van een andere generatie of in een onbekend
  formaat, dan wordt dat eerst duurzaam apart bewaard (zie 3).
- **Koppeling:** database en planner staan samen in één versie-record (`huisplanKoppeling`, één
  `setItem`), en alleen dát record wordt als koppeling vertrouwd. De losse sleutels
  `plannerDbUrl`/`plannerKey` worden door deze versie **nooit** geschreven (twee losse schrijfacties
  kunnen een gemengd paar achterlaten, en terugzetten of wissen kan ook mislukken). Ze worden alleen
  gelezen als er geen koppelrecord is én het paar aantoonbaar bij elkaar hoort: er staat een geldige
  E3-cache onder de sleutel die uit precies dat paar is afgeleid, of een oude cache van die planner die
  zelf die database noemt. Anders, of als het record niet te lezen of kapot is: koppeling onbekend
  (installatiescherm met melding; de deellink werkt altijd).

### 2.1 Oude cache (`plannerCache_<plannersleutel>`)

- **Herkomst:** een oude cache telt alleen als hij zelf een database noemt (`db`, sinds E2) die gelijk
  is aan de huidige. De live-versie schrijft geen `db`: zo'n cache wordt **nooit** gebruikt,
  samengevoegd of geüpload, want dezelfde plannersleutel kan in een andere database bestaan.
- **Eigen oude cache zonder nieuwe cache:** in drie duurzame stappen (elk geschreven én
  teruggelezen): markering `huisplanOudeCacheVerwerkt_<id>` = `{h: hash van precies die inhoud,
  s: 'gereserveerd'}`, dan de nieuwe cache, dan de markering op `'klaar'`. Lukt de eerste stap niet,
  dan wordt niet overgenomen. Dezelfde inhoud wordt dus hooguit één keer automatisch ingelezen, ook als
  de nieuwe cache later beschadigd raakt of verdwijnt: niets kan herrijzen. Blijft de markering op
  `'gereserveerd'` staan (overname niet aantoonbaar afgerond), dan wordt de oude cache **elke sessie**
  gemeld en als bestand aangeboden, ook als er inmiddels een nieuwe cache is, maar nooit opnieuw
  ingelezen. Dat geldt ook in de E2-herstelroute (journaal).
- **Markering vierwaardig (vierde Codex-review, B2):** de markering is óf aantoonbaar afwezig, óf een
  geldige `'gereserveerd'`, óf een geldige `'klaar'`, óf aanwezig maar onbekend (onbekende toestand,
  kapotte JSON, verkeerde structuur, ontbrekende of ongeldige velden) of niet te lezen. **Alleen
  aantoonbare afwezigheid** start de overname. Bij onbekend of onleesbaar: nooit importeren, oude cache
  en markering onaangeroerd, melding met herstelgegevens (die nu ook de markering bevatten), en na elke
  herstart opnieuw zolang de onzekerheid blijft. Een geldige markering van andere inhoud (de oude cache
  is na verwerking vervangen) telt evenmin als afwezig: melden, niet automatisch inlezen.
- **Alle andere gevallen** met mogelijk niet-opgeslagen inhoud (geen of andere herkomst, of naast een
  bestaande nieuwe cache, of onleesbaar, of een twijfelachtige vorm zoals een lijst met gaten of een
  object met numerieke sleutels, P1-11): niet gebruikt, niet samengevoegd, niet verwijderd. De app
  meldt het één keer per sessie en biedt aan de herstelgegevens als bestand te bewaren.
- **Nooit verwijderd.** `localStorage` heeft geen atomisch "verwijder als nog hetzelfde"; de
  live-versie kan de oude cache intussen opnieuw schrijven. Opruimen wacht op een veilig protocol.

### 2.2 Herstelbewijs en het concurrency-contract (vijfde Codex-review)

**Gedeelde oorzaak.** De blockers uit de vierde en vijfde review hadden één oorzaak. Een
veiligheidsbesluit ("verliesvrij" of "geblokkeerd") bestond alleen in het geheugen van één venster. Het
gold daarna stilzwijgend ook voor een latere serverversie, of voor een ander venster dat er niets van
wist.

**De regels.**
1. **Bewijs per serverversie.**
   - Inhoud uit een hervatte of herstelde cache die misschien niet op de server staat, blijft
     *onbevestigd herstel*. Dat duurt tot de server de generatie met die inhoud bevestigt.
   - Zolang dat zo is, gaat **elke** samenvoeging met een serverstand door dezelfde E2-controle
     `losslessMerge`, tegen precies die serverstand. Dat geldt voor de eerste lezing, na elke `412` en
     na een lezing zonder ETag.
   - Is de samenvoeging niet verliesvrij: geen winnaar, niets ervan versturen, conflictbewijs en een
     melding. Daarna werkt de app verder op de serverstand.
   - Journaal-first, de voorwaardelijke PUT, generaties/ACK en de afhandeling van een onbekende
     uitkomst zijn ongewijzigd. De onbekende uitkomst had al haar eigen verliesvrije controle.
2. **Conflictbewijs als gedeeld, duurzaam feit.**
   - Elk bewijs krijgt een **nieuwe, unieke** sleutel:
     `huisplanCacheConflict_<id>_<tijd>_<willekeurig>`.
   - Die sleutel wordt alleen geschreven als hij nog niet bestaat. Hij wordt teruggelezen en **nooit
     overschreven**. Er is dus geen gedeelde, veranderlijke plek waarop twee vensters kunnen botsen.
   - Elk venster ziet de sleutel. Zolang er één is, verschijnt bij elke start een melding en wordt
     "Opgeslagen"/"Bijgewerkt" in elk venster "Lokale kopie niet samengevoegd".
   - Een bewijs verdwijnt alleen als een verse serverstand aantoonbaar alles bevat wat erin staat
     (dezelfde controle). Nooit door een keuze, een herstart of een ander venster.
   - Lukt het bewijs niet, dan schrijft dit venster geen cache meer.
3. **Bewaakte cache (`bewaakCache`).**
   - Vóór **elke** cache-opslag leest een venster de huidige cache. Het vervangt die alleen als één van
     deze dingen geldt:
     - de cache-stand is van dit venster zelf, of in zijn stand opgenomen;
     - de cache-stand heeft geen onbevestigde inhoud;
     - de inhoud staat in een bestaand journaalrecord;
     - de inhoud zit volgens `losslessMerge` in de nieuwe stand;
     - er bestaat een conflictbewijs van precies die inhoud.
   - Anders wordt eerst zo'n bewijs gemaakt. Lukt dat niet, dan wordt er niet geschreven (status
     "Lokaal bewaren mislukt"). De gegevens blijven dan in de cache, het journaal en het geheugen.
4. **Race tussen lezen en schrijven.**
   - `localStorage` kent geen atomische vergelijk-en-schrijf. Tussen de controle (3) en het schrijven
     kan een ander venster de cache nog wijzigen.
   - Daarom luistert elk venster naar het `storage`-event van de cache. Wordt zijn eigen laatste
     opslag vervangen door een stand die zijn onbevestigde inhoud niet bevat (en die inhoud staat niet in
     zijn journaal), dan legt het die oude waarde (`oldValue`) alsnog als conflictbewijs vast.

### 2.3 Crashveilig lokaal bewaren (zesde Codex-review)

**Het gat.** De vijfde review bouwde op de gedeelde cache plus een controle vóór het schrijven, aangevuld
met het `storage`-event. Dat is niet transactioneel:
- venster B is zijn controle voorbij;
- venster C schrijft W in de cache;
- B overschrijft de cache;
- C krijgt geen event en crasht.

W stond toen alleen in de cache en was weg. Een unieke sleutel voorkomt botsingen, maar een controle
plus een schrijfactie op een gedeelde sleutel blijft een race.

**Het model nu: de cache is nooit meer het enige exemplaar.** Elke onbevestigde lokale stand krijgt
**eerst** een eigen duurzaam exemplaar: het E2-journaalrecord van dat venster
(`plannerJournal_<planner>_<instantie>`). De nieuwe toestand daarvoor heet `lokaal`: een lokale stand
die nog niet verstuurd is, met `local` en de basis `oldBase`. Pas daarna wordt de gedeelde cache
bijgewerkt.
- **Volgorde:** record schrijven en teruglezen, dan pas de cache. Lukt het record niet, dan ook de cache
  niet. De wijziging geldt dan niet als bewaard: status "Lokaal bewaren mislukt" of "Niet bewaard", en
  een waarschuwing bij sluiten.
- **Eén record per venster:** de sleutel bevat het willekeurige instantie-id. Alleen de eigenaar
  schrijft of verwijdert het (E2-fencing met `myRaw` en epoch). Een ander venster neemt het alleen over
  als de eigenaar aantoonbaar weg is (Web Locks, onder een claim-lock). Twee vensters kunnen dus
  elkaars enige exemplaar niet overschrijven of verwijderen.
- **Gedeeltelijke writes:** elk record wordt na het schrijven teruggelezen. Bij het lezen wordt alles
  gevalideerd: versie, context (database, planner, generatie), sleutel = id, eigenaar en toestand.
  Een onleesbaar of ongeldig record blokkeert (E2: `journal-invalid`) en wordt nooit verwijderd.
- **Koppeling:** de context van elk record noemt database, planner en opslaggeneratie. Een record van
  een andere combinatie telt als ongeldig en blokkeert, maar wordt nooit gebruikt.
- **Ontdekken bij herstart:**
  - de poort leest alle records;
  - een `lokaal`-record van een aantoonbaar levend ander venster blokkeert niet;
  - één verweesd record wordt overgenomen (`adopt`), en de stand daarvan gaat bij de eerste lezing
    door `losslessMerge`;
  - zijn er meer verweesde `lokaal`-records, dan neemt het venster ze in rust één voor één over en
    voegt ze samen met de huidige stand (dezelfde controle; ook tussendoor gemaakte wijzigingen
    blijven). Bij een conflict komt er een conflictbewijs, nooit een winnaar; lukt het bewijs niet, dan
    blijft het record precies staan;
  - verweesde records in een andere toestand (onderweg, onbekend) wachten op de E2-herstart;
  - zolang er zulke records zijn, toont de status "Nog een onafgeronde lokale stand" in plaats van
    "Opgeslagen".
- **Opruimen** gebeurt alleen:
  - na een door de server bevestigde opslag;
  - na een lezing waarbij de lokale stand gelijk is aan de server;
  - of nadat een conflictbewijs met precies die inhoud is geschreven en teruggelezen.

  Na een `412`, een weigering of een mislukte PUT blijft het record `lokaal` (niet opgeruimd).
- **Toestand opnieuw gecontroleerd onder het claim-lock (zevende review):** de selectie van een
  verweesd record gebeurt vóór een wachttijd. In die tijd kan een ander venster het overnemen en
  versturen (`lokaal` → `unknown`). Daarom neemt de rustroute een record alleen over als het **onder
  het claim-lock opnieuw gelezen** record nog `lokaal` is. `neemSamen()` controleert dat nog eens.
  Elke andere toestand blijft precies staan voor het E2-herstel bij een herstart (met de bestaande
  vraag bij een onbekende uitkomst). De status toont dan "Nog een onafgeronde lokale stand".
- **Twee betekenissen van "afgehandeld" (zevende review):**
  - *duurzaam lokaal vastgelegd*: het record `lokaal` is geschreven en teruggelezen;
  - *afhandeling van een eerdere PUT afgerond*: record én cache-spiegel staan.

  Komt de overgang naar `lokaal` uit de afhandeling van een PUT (bijvoorbeeld een vertraagde ACK
  terwijl er al een nieuwere generatie is), en mislukt dan de cache, dan geldt de E2-stopvoorwaarde:
  `pendingSettle`, de volgende generatie vertrekt niet, en de status zegt "Lokaal bewaren mislukt".
  Een gewone lokale wijziging zonder eerdere PUT blokkeert het versturen niet, zoals in E2.
- **Die stopvoorwaarde is duurzaam (achtste review):** ze staat in het eigen record als
  `cacheWacht: true`.
  - Het veld wordt gezet in dezelfde schrijfactie die het `lokaal`-record vastlegt, dus vóór de
    cachepoging.
  - Het wordt pas weggehaald nadat de cache-spiegel geschreven en teruggelezen is. Dat wissen is
    zelf ook een teruggelezen recordschrijfactie; mislukt die, dan blijft de barrière staan.
  - `adopt()` (na herladen of overnemen) en de rustroute (`neemSamen()` → `settle()`) nemen het veld
    over. Er wordt dus niets verstuurd tot de cache aantoonbaar klopt, ook niet na herhaald herladen
    tijdens dezelfde opslagstoring. De status zegt dan "Lokaal bewaren mislukt", met een
    waarschuwing bij sluiten.
  - Zodra de cache weer werkt, wordt de barrière opgeheven en gaat de stand één keer, voorwaardelijk,
    via het journaal naar de server.
  - Een record dat verstuurd wordt (`sending`), draagt het veld nooit.
- **Conflict zonder bewijs:** het record en de cache blijven precies staan. Dit venster schrijft dan
  geen record, cache of PUT meer.
- **Het `storage`-event** is alleen nog een extra melding (status intrekken, conflict melden). Het is
  nooit nodig voor de duurzaamheid.
- **Status:** elk venster beoordeelt zijn status opnieuw bij een nieuw (of opgeruimd) conflictbewijs
  van een ander venster, en bij terugkeren naar het venster. Een al getoonde "Opgeslagen" wordt
  ingetrokken.

**Garanties.**
- **Een gemaakte wijziging staat in het eigen record** van het venster vóórdat de gedeelde cache
  verandert, als het venster haar als bewaard beschouwt. Geen enkel ander venster kan dat record
  overschrijven of verwijderen zolang de eigenaar leeft.
- **Na een crash** neemt een volgend venster het record alleen over met Web Locks-bewijs dat de eigenaar
  weg is.
- **Een overschreven cache verliest niets meer:** de inhoud staat in het record van de schrijver.
- **Een onderbroken schrijfactie laat altijd een geldige toestand achter:** het vorige record blijft
  staan, of het nieuwe record staat er (teruggelezen).
- **Zonder Web Locks** wordt een record van een ander venster nooit overgenomen. De E2-regel blijft:
  de app blokkeert eerlijk en de gegevens blijven staan.

**Wat níet gegarandeerd is.**
- **Wat alleen in het geheugen staat:** de wijziging waarvoor het record nog niet geschreven is (de
  paar milliseconden binnen dezelfde synchrone stap), of waarvoor het record mislukte (opslag vol).
  Dat laatste meldt de app eerlijk, met een waarschuwing bij sluiten.
- **Zonder Web Locks** blijft een verweesd record staan tot de gebruiker het via de herstelgegevens
  oplost. Dat wordt dus vaker zichtbaar dan voorheen, omdat nu ook offline wijzigingen een record
  hebben.
- **Een verweesd record in de toestand "onderweg" of "onbekend"** wordt pas bij een volgende herstart
  verwerkt. De status zegt dat.
- **De browser zelf:** `localStorage` is per sleutel atomisch in Chromium, Firefox en Safari. Een
  schrijfactie die de browser bevestigt maar die na een crash van het besturingssysteem niet op schijf
  blijkt te staan, valt buiten wat een webapp kan garanderen.

## 3. Gedrag per foutsituatie

| Situatie | Gedrag | Test |
| --- | --- | --- |
| Cache schrijven mislukt (bijv. vol), met wijzigingen die nog niet op de server staan | Het journaalrecord (E2) houdt de nieuwste stand duurzaam vast; de statusregel zegt "Lokaal bewaren mislukt" (of "Niet bewaard" zonder verbinding); nooit "Opgeslagen"; waarschuwing bij sluiten. Zonder wachttijd naar de server, via het journaal. **E2:** na een geslaagde PUT wordt pas weer verstuurd als de afgehandelde toestand ook in de cache staat (zie 5). | T7a, E2-contract |
| Netwerk én opslag weg | "Niet bewaard — … Houd de app open"; waarschuwing bij sluiten; herstel zodra beide weer werken. | T7b |
| Lege of onbekende serverstand + wijziging alleen in het geheugen | Telt als niet opgeslagen (niet-bevestigde generatie); waarschuwing en eerlijke status. | B3 |
| Cache lezen gooit een fout | Onbekend, niet leeg: niet overschrijven; bij elke poging opnieuw gekeken (een tijdelijke fout blokkeert het E2-herstel niet). Wordt hij later weer leesbaar en bevat hij iets wat (misschien) niet op de server staat, dan is dat **geen** toestemming om te overschrijven: zolang die kandidaat er is, weigert elke cache-schrijfactie. Opnemen gebeurt alleen synchroon aan het begin van `save()`, tegen de actuele stand (nooit een eerder berekende stand na een asynchrone grens): eerst duurzaam apart bewaard, dan samengevoegd, en alleen als de E2-controle `losslessMerge` de samenvoeging aantoonbaar verliesvrij vindt. Anders (conflict, lijst zonder id aan beide kanten veranderd, twijfelachtige vorm, apart bewaren mislukt): blokkeren, niets overschrijven, melding met herstelgegevens, nooit "opgeslagen". Dekt een journaalrecord hem (E2-herstel), dan is het record de waarheid. | T7c, R2-B1, R3-B1, R3-B2 |
| 412 terwijl er onbevestigd herstel is (de server veranderde tussen controle en PUT), ook herhaald | Opnieuw lezen en opnieuw dezelfde controle tegen die serverstand; onafhankelijk = samenvoegen en opnieuw proberen; conflict = conflictbewijs, geen winnaar, melding, nooit "opgeslagen" (ook niet na herladen). | R5-B1 |
| Twee vensters offline; B voorbij de controle, C schrijft W, B overschrijft, géén event, C crasht | W staat in C's eigen 'lokaal'-record; bij de volgende start overgenomen en (verliesvrij of met conflictbewijs) verwerkt; meerdere verweesde records één voor één. | R6-1, R6-2, R6-4 |
| Verweesd 'lokaal'-record wordt tijdens de wachttijd door een ander venster overgenomen en verstuurd (unknown), server verwijdert W | Niet opnieuw versturen; record blijft 'unknown'; bij herstart de E2-vraag; nooit "Opgeslagen". | R7-1 |
| Vertraagde ACK van generatie 1, generatie 2 intussen, cache faalt | Generatie 2 vertrekt niet (pendingSettle), "Lokaal bewaren mislukt", waarschuwing; na herstel van de cache alsnog verstuurd. | R7-2 |
| Vertraagde ACK, G2 intussen, cachestoring blijft, herladen (herhaald) | Geen extra PUT zolang de storing duurt (cacheWacht in het record), G2 blijft in het record en in de app, eerlijke status; na herstel G2 precies één keer. | R8-1 |
| Herstelrecord niet te schrijven (opslag vol) | Geen cache-opslag, geen "Opgeslagen", waarschuwing bij sluiten; zodra het weer lukt, staat alles in het record. | R6-3 |
| Nieuw conflictbewijs in een ander venster | Elk venster trekt een getoonde "Opgeslagen" in (storage-event, terugkeer naar het venster, herladen). | R6-5 |
| Herstart met tijdelijke leesfout op het journaal, of zonder Web Locks | Blokkeren, niets verwijderen, nooit "Opgeslagen"; na de leesfout gewoon verder. Record blijft staan tot de inhoud bevestigd is. | R6-6, R6-7 |
| Tweede venster schrijft terwijl de gedeelde cache onbevestigde inhoud van een ander bevat | Eerst conflictbewijs (write-once), dan pas overschrijven; lukt dat niet, niet overschrijven. Melding in elk venster en na elke herstart; nooit "opgeslagen". Race tussen lezen en schrijven: het overschreven levende venster legt zijn stand alsnog vast. | R5-B2 |
| Hervatten uit een cache met onbevestigde inhoud (elke start, ook na een eerder vastgesteld herstelconflict, met of zonder journaal) | Een vastgesteld conflict bestaat nooit alleen in het geheugen (vierde Codex-review, B1). Zonder journaal gaat de eerste geslaagde lezing na het hervatten door dezelfde E2-controle `losslessMerge` in plaats van dat `mergeData` een winnaar kiest. Niet verliesvrij: niets van de cache-stand toegepast of verstuurd, de cache blijft onaangeroerd (dat is het duurzame bewijs, plus één aparte kopie), melding met herstelgegevens, verder werken op de serverstand, nooit "opgeslagen". Na elke herstart volgt dezelfde controle en dezelfde blokkade. Met journaal beslist de E2-poort (cache van een ander venster met eigen wijzigingen: "Twee onafgeronde standen"). Onafhankelijke wijzigingen worden gewoon samengevoegd. | R4-B1 |
| De allereerste opslagactie faalt (vóór de rest van het script) | Geen crash: de opslaghulpjes gebruiken geen variabelen die pas later een waarde krijgen. | R2 |
| Cache onleesbaar of onbekend formaat | Eerst duurzaam apart bewaard (`huisplanCacheApart_<id>_<tijd>_<willekeurig>`, nooit over een bestaande kopie heen); lukt dat niet, dan onaangeroerd en deze sessie geen cache. | T7d, T7e, T8, quarantaine |
| Koppeling niet (volledig) op te slaan | Sessie werkt via de link; melding; nooit een gemengd paar. | T7g, koppeling |
| Veiligheidskopie vóór de ledenmigratie niet duurzaam te bewaren | Migratie start niet; melding. Een back-up telt alleen met de `scope` van deze planner; een vreemde back-up blijft staan en de eigen komt onder `…_<scope>`. | T6d, ledenback-up |
| Diagnose | Alleen vaste sleutelnamen leesbaar; van alle andere alleen het deel vóór de eerste `_`. | diagnose |

## 4. Wat later naar productie moet (niet in deze stap)

De livegang gaat via een aparte PR, na akkoord, samen met E2: de opslagmodule, de cache per
database/planner/generatie met de oude-cache-regels, de koppeling als één record, de statusregel en de
waarschuwing bij sluiten, en het vangnet bij de ledenmigratie.

## 5. Bekende risico's en open punten

- **Cache onbruikbaar = na één PUT niets meer versturen (E2-contract).** Mislukt het vastleggen in de
  cache, dan houdt E2 verdere verzending tegen tot `settle()` lukt. De wijzigingen staan dan duurzaam in
  het journaalrecord en de status zegt het eerlijk, maar ze gaan niet naar de server. Bij een blijvend
  onleesbare cache blokkeert de herstelpoort na herladen. Veilig, maar niet functioneel. Een
  versoepeling (verzenden toestaan zolang het journaalrecord lukt) lijkt veilig sinds het record de
  waarheid is (vierde Codex-review), maar is een E2-wijziging en vraagt een eigen besluit en review.
- **Oude caches worden niet opgeruimd** (zie 2.1); ze kosten opslagruimte.
- **De journaalsleutel bevat de plannersleutel** (`plannerJournal_<sleutel>_<id>`, E2); die staat
  sowieso leesbaar in `plannerKey`. Aanpassen is een E2-wijziging.
- **Quarantainekopieën worden niet opgeruimd** en niet begrensd (wel: geen nieuwe kopie als precies
  dezelfde inhoud al apart staat).
- **Conflictbewijs blijft tot de server het bevat.** Er is nog geen knop om bewust één stand te kiezen
  of een bewijs los te laten (productbesluit). Tot dan meldt elke start het conflict en toont de
  statusregel "Lokale kopie niet samengevoegd".
- **Herstelconflict na hervatten blokkeert tot de gebruiker ingrijpt.** Zolang de cache-stand niet
  verliesvrij samen te voegen is, komt de melding bij elke start terug en schrijft deze sessie geen
  cache (status "Lokaal bewaren mislukt"). Er is nog geen knop om bewust één stand te kiezen of de
  lokale kopie los te laten; dat vraagt een eigen productbesluit. Ook offline gemaakte wijzigingen die
  na herladen botsen met een wijziging van een ander, worden nu zo behandeld (strenger dan de
  samenvoeging binnen één sessie, die ongewijzigd is).
- **Wijzigingen uit de live-versie** (oude cache zonder herkomst) komen niet automatisch in de
  testversie; alleen via het bewaarde bestand.
- **Open data-veiligheidspunt P1-11** valt buiten E3 en is hier niet opgelost; E3 laat zulke vormen
  alleen onaangeroerd.
