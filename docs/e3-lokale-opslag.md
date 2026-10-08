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

## 3. Gedrag per foutsituatie

| Situatie | Gedrag | Test |
| --- | --- | --- |
| Cache schrijven mislukt (bijv. vol), met wijzigingen die nog niet op de server staan | Het journaalrecord (E2) houdt de nieuwste stand duurzaam vast; de statusregel zegt "Lokaal bewaren mislukt" (of "Niet bewaard" zonder verbinding); nooit "Opgeslagen"; waarschuwing bij sluiten. Zonder wachttijd naar de server, via het journaal. **E2:** na een geslaagde PUT wordt pas weer verstuurd als de afgehandelde toestand ook in de cache staat (zie 5). | T7a, E2-contract |
| Netwerk én opslag weg | "Niet bewaard — … Houd de app open"; waarschuwing bij sluiten; herstel zodra beide weer werken. | T7b |
| Lege of onbekende serverstand + wijziging alleen in het geheugen | Telt als niet opgeslagen (niet-bevestigde generatie); waarschuwing en eerlijke status. | B3 |
| Cache lezen gooit een fout | Onbekend, niet leeg: niet overschrijven; bij elke poging opnieuw gekeken (een tijdelijke fout blokkeert het E2-herstel niet). Wordt hij later weer leesbaar en bevat hij iets wat (misschien) niet op de server staat, dan is dat **geen** toestemming om te overschrijven: zolang die kandidaat er is, weigert elke cache-schrijfactie. Opnemen gebeurt alleen synchroon aan het begin van `save()`, tegen de actuele stand (nooit een eerder berekende stand na een asynchrone grens): eerst duurzaam apart bewaard, dan samengevoegd, en alleen als de E2-controle `losslessMerge` de samenvoeging aantoonbaar verliesvrij vindt. Anders (conflict, lijst zonder id aan beide kanten veranderd, twijfelachtige vorm, apart bewaren mislukt): blokkeren, niets overschrijven, melding met herstelgegevens, nooit "opgeslagen". Dekt een journaalrecord hem (E2-herstel), dan is het record de waarheid. | T7c, R2-B1, R3-B1, R3-B2 |
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
