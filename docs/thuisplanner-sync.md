# Thuisplanner KG-5D: synchronisatie tussen gezinsleden (bouwplan stap 3)

**Status:** gebouwd en lokaal getest op een eigen branch, als aparte PR boven op PR #21. Niet gemerged, niet gedeployd. Herstelronde 1 na de review van `3f3b7da` verwerkt (§7).

Technische map: `komtgoed/`; productnaam: Thuisplanner.

## 1. Scope en afwijking van het bouwplan

| Bouwplan (`docs/komtgoed-bouwplan.md`) | Deze stap |
| --- | --- |
| **Stap 3 (KG-5D):** realtime op de server. Een trigger naar `household:<id>` en het beleid op `realtime.messages`. | Volledig gebouwd (§3). |
| **Stap 4 (KG-5E):** de React-app herindelen met `@tanstack/react-query` en `react-router`, na akkoord op die bibliotheken. | **Niet gedaan.** Dat akkoord staat nog open, en het prototype uit PR #20 wordt bewust niet herbouwd. |
| **Stap 5–6 en 8 (KG-5F/G/I):** lezen, schrijven en realtime in de app. | De **kern** ervan is gebouwd als losse, framework-onafhankelijke module `komtgoed/sync/thuisplanner-sync.js`. Die kan straks zonder herbouw achter de opslag-interface van stap 4 worden gehangen. |
| **Stap 7 (KG-5H):** inloggen en nieuwe pagina's, na akkoord. | Geen nieuwe app-pagina's. Wel een **ontwikkelpagina** (`komtgoed/dev/`) met twee vaste, fictieve demo-accounts, zoals in de opdracht gevraagd. Het is uitdrukkelijk geen ontwerp. |

**Afwijking:** de opdracht vroeg om synchronisatie met een zichtbare demonstratie. Volgens het bouwplan valt de clientkant pas in stap 5–8. Ik heb de architectuur van het bouwplan aangehouden:

- realtime stuurt alleen seintjes;
- de client haalt daarna opnieuw op via RLS;
- schrijven gebeurt met UUID's van de app en versiecontrole.

Zo kan stap 4 later zonder herbouw volgen.

## 2. Architectuur

```
 Account A (browser)                         Supabase (lokaal)                          Account B (browser)
 ┌──────────────────────┐   schrijven via RLS   ┌───────────────────────────────┐        ┌──────────────────────┐
 │ demo/paneel.js       │ ───────────────────▶ │ tabellen + functies (KG-5C)    │        │ demo/paneel.js       │
 │  └ sync-module       │   (versiecontrole,    │  └ trigger → realtime.send()   │        │  └ sync-module       │
 │    - haalOp()        │    UUID van de app)   │      seintje {t,id,v,op}       │ ─────▶ │    - seintje → haalOp│
 │    - acties          │ ◀─── seintje ──────── │   op household:<id>:<epoch>    │ ws     │    - status/meldingen│
 └──────────────────────┘                       │  RLS op realtime.messages:     │        └──────────────────────┘
                                                │   alleen actieve leden luisteren│
                                                └───────────────────────────────┘
```

### Server (migraties `20261015120000_kg5d_realtime.sql` en `20261016120000_kg5d_herstel1.sql`)

- **Seintjes:** een trigger op `events`, `tasks`, `shopping_items`, `household_members` en `households` roept `realtime.send` aan op het private kanaal `household:<id>:<epoch>`.
  - Inhoud van het seintje: **alleen** `{t, id, v, op}`, dus tabel, id, versie en handeling (I/U/D).
  - Nooit titels, namen, notities of account-ID's.
  - Wordt het huishouden zelf verwijderd, dan volgt één seintje in plaats van één per rij.
  - Seintjes worden pas verstuurd na COMMIT (ze lopen via `realtime.messages`), dus bij een rollback gaat er niets uit.
- **Kanaalnaam met volgnummer (epoch):** verliest een account zijn actieve lidmaatschap (archiveren, vertrekken, account loskoppelen of verwijderen, lid verwijderen), dan verhoogt de trigger `household_members_rotate_channel` het volgnummer in `private.household_channels`. Daarna gaan alle seintjes naar het nieuwe kanaal; het oude krijgt niets meer, wat de client ook doet (§7, bevinding 2). De app vraagt de actuele naam op met `household_channel(p_household)` (alleen voor actieve leden).
- **Toegang:** RLS op `realtime.messages`.
  - Alleen `broadcast`, en alleen als de kanaalnaam exact `household:<uuid>:<epoch>` is, met het **actuele** volgnummer, van een huishouden waar je **actief** lid van bent (`private.may_listen`).
  - Er is geen insert-beleid: geen client kan zelf op een huishoudkanaal zenden. Alleen de database zendt.
  - Presence is uitgesloten.
- **`postgres_changes`** blijft uit: geen enkele tabel staat in een publicatie (KG-T27).

### Client (`komtgoed/sync/thuisplanner-sync.js`)

- **Online eerst.** Elke ophaalronde controleert eerst het lidmaatschap (`my_memberships`). Daarna haalt ze de kanaalnaam, boodschappen, taken, afspraken (`event_overview`) en leden op, alleen met expliciete kolommen en alleen wat RLS teruggeeft.
- **Paginering:** elke soort wordt per pagina van 1000 rijen opgehaald, op `id` (keyset: `id > laatste`), tot een lege pagina. Een rij die tijdens het ophalen bestaat, komt precies één keer mee, ook als er intussen rijen bijkomen of verdwijnen. De cache wordt pas vervangen als **alle** pagina's van **alle** soorten binnen zijn; faalt er één, dan blijft de oude cache staan en wordt de status `offline`. De volgorde op het scherm (aanmaakmoment, datum) zet de client zelf.
- **Levenscyclus (generaties):** `start()` begint een generatie; `stop()` en verlies van toegang beëindigen haar. Elk antwoord dat binnenkomt (ophalen, schrijven, terugdraaien, kanaalstatus, seintje) wordt eerst getoetst aan de generatie waarin het verzoek begon. Hoort het bij een beëindigde generatie, dan verandert het niets en meldt het niets.
- **Seintje → opnieuw ophalen:**
  - Debounce van 150 ms en één ronde tegelijk; seintjes tijdens een ronde leveren precies één extra ronde op.
  - Een seintje voor een versie die de client al heeft, wordt overgeslagen. Zo wordt niets dubbel verwerkt.
- **Volledig opnieuw ophalen gebeurt:**
  - na elke (her)verbinding (`SUBSCRIBED`);
  - bij `online`;
  - en elke 30 s als vangnet.

  Gemiste seintjes worden zo altijd ingehaald.
- **Verbindingsverlies:** bij `CHANNEL_ERROR`, `TIMED_OUT` of `CLOSED`, of bij een mislukte ophaalronde, gaat de status naar `offline` en verbindt de module opnieuw met exponentiële backoff (1–30 s).
  - Het oude kanaal wordt eerst echt opgeruimd.
  - Een dichte socket wordt actief opnieuw verbonden.
  - Beide waren nodig voor betrouwbaar herstel; dat is gevonden en gerepareerd met de tests.
- **Schrijven (online eerst, optimistisch):**
  - **Toevoegen** (boodschap, taak, nieuwe afspraak) is één opdracht met één vaste UUID. Komt er geen antwoord (netwerkfout, verbinding weg, time-out, fout van een tussenliggende server), dan is de uitkomst **onbekend**: het item blijft staan als "niet bevestigd", met de melding dat het nog niet bevestigd is (nooit "niet opgeslagen"). Opnieuw proberen, of dezelfde tekst opnieuw invoeren zolang hij niet bevestigd is, verstuurt dezelfde opdracht met **dezelfde UUID**. De server behandelt die als dezelfde: `add_shopping_items` geeft `al_verwerkt`; bij taken en afspraken betekent `23505` op dat id dat een eerdere poging al slaagde (de module controleert dat met een leesverzoek op het id). De eerstvolgende geslaagde ophaalronde bevestigt een item dat de server wel heeft, zonder tweede verzending.
  - **Herstart:** met de optie `opslag` (in de demo `sessionStorage`) wordt een opdracht vóór het versturen bewaard en pas na een zekere uitkomst verwijderd. Na herladen staat ze er weer, met dezelfde UUID. `stop()` en verlies van toegang wissen de opslag.
  - Er is **geen automatische wachtrij**: wat de server niet heeft, wordt pas opnieuw verstuurd als de gebruiker dat vraagt (bouwplan: zonder verbinding niet schrijven). Is het toestel aantoonbaar offline (`navigator.onLine === false`), dan wordt niets verstuurd en zegt de melding dat het niet is opgeslagen.
  - **Wijzigen, afvinken en verwijderen** van boodschappen en taken gebeuren met `... where id = x and version = v`. Raakt dat 0 rijen, dan is er een **conflict**: de module zet een melding, haalt de nieuwste stand op, en er gaat niets verloren.
  - **Afspraken** gaan via `save_event` en `delete_event`; `PT409` (HTTP 409) betekent conflict.
  - **Mislukt een wijziging** (of is de uitkomst onbekend), dan draait de module alleen haar eigen optimistische wijziging terug, op de huidige stand. Ze zet nooit een oude momentopname terug. Bij een onbekende uitkomst zegt de melding dat het niet zeker is; de volgende ophaalronde laat zien wat er echt staat. Een gewijzigde rij wordt niet automatisch opnieuw verstuurd (de versie zou dan al verouderd zijn).
  - supabase-js herhaalt een mislukte GET zelf (tot drie keer); schrijfverzoeken (POST/PATCH) niet.
- **Toegang weg** (vertrek, archiveren, huishouden verwijderd):
  - de ophaalronde ziet geen lidmaatschap meer;
  - de module beëindigt de generatie, wist **alle** gegevens en openstaande opdrachten uit het geheugen en de opslag, stopt het kanaal en zet de status op `geen-toegang`.
  - Het ledenseintje van de intrekking zelf brengt dit binnen seconden; het vangnet vangt een gemist seintje op.
- **Overstappen naar een nieuw kanaal:** geeft de ophaalronde een andere kanaalnaam (iemand verloor toegang), dan meldt de module zich af op het oude kanaal en aan op het nieuwe, en haalt ze na `SUBSCRIBED` alles opnieuw op.
- **Stoppen** (uitloggen, ander huishouden kiezen) beëindigt de generatie, wist alles (ook de opslag) en sluit het kanaal.
- **Geen inhoud in logboeken of meldingen:**
  - de module schrijft niets naar de console (statische controle);
  - meldingen zijn vaste Nederlandse teksten per foutcode;
  - het optionele `spoor` geeft alleen kanaalstatussen.

### Ontwikkelpagina (`komtgoed/dev/`)

| Bestand | Wat |
| --- | --- |
| `server.mjs` | Kleine webserver, **alleen op 127.0.0.1**. Serveert de pagina's, de sync-module, supabase-js (UMD) en een `config.json` met de lokale URL en de **publieke (anon) sleutel**; nooit de service-role-sleutel (statische controle). |
| `seed.mjs` | Zet de fictieve demo klaar: Anna en Bram, het huishouden "Familie Demo", boodschappen, een gedeelde afspraak en een privé-afspraak van Anna. Gebruikt de service-role-sleutel alleen in node, en alleen tegen een lokale stack. |
| `demo/index.html` | Twee panelen naast elkaar (account A en B, elk een eigen sessie). |
| `demo/paneel.html`, `demo/paneel.js` | Eén paneel:<br>- status ("Laden…", "Live verbonden", "Synchroniseren…", "Geen verbinding", "Geen toegang");<br>- boodschappenlijst (toevoegen, afvinken, wijzigen met versie, verwijderen; "niet bevestigd" met "Opnieuw proberen");<br>- afspraken ("Bezet" bij andermans privé);<br>- knop "Verbinding verbreken (simulatie)". |

## 3. Beveiligingskeuzes

| Risico | Keuze |
| --- | --- |
| Privé-inhoud via realtime | Alleen seintjes zonder inhoud; inhoud komt via `event_overview`/`event_details` met RLS (gate 9). `postgres_changes` staat uit. |
| Meeluisteren door een ander huishouden | RLS op `realtime.messages` met exacte kanaalnaam (actueel volgnummer) en actief lidmaatschap. Een buitenstaander krijgt een expliciete weigering. |
| Meeluisteren na intrekking met een open kanaal | Nieuw volgnummer bij elke intrekking; de server zendt niet meer naar het oude kanaal (§7, bevinding 2). |
| Nep-seintjes van een client | Geen insert-beleid: alleen de database zendt. |
| Oude gegevens na intrekking of wisseling | Lidmaatschapscontrole bij elke ophaalronde; bij verlies alles wissen. Ledenseintje plus vangnet van 30 s. Generaties: een laat antwoord van vóór het stoppen of de intrekking verandert niets (§7, bevinding 1). |
| Service-role-sleutel in de browser | Nooit; alleen in node (tests, seed). De server serveert alleen de anon-sleutel. |
| Lekken via foutmeldingen | Publieke functies geven geen DETAIL/HINT (KG-5C herstelronde 2). De client toont alleen vaste meldingen. |
| Dubbele verwerking | Eén vaste UUID per toevoeging, ook bij opnieuw proberen en na herstart; versies; het overslaan van bekende seintjes (§7, bevinding 3). |
| Ontbrekende gegevens bij grote lijsten | Paginering op id tot een lege pagina; geen halve cachevervanging (§7, bevinding 4). |
| Verloren updates | Versiecontrole bij elke wijziging; conflict = melding plus opnieuw ophalen. |

**Restpunt metadata:** een seintje vertelt leden dat een afspraak (ook een privé-afspraak van een ander, die als "Bezet" al zichtbaar is) een nieuwe versie heeft. Dat is gelijk aan wat een ophaalronde al laat zien, en bevat geen inhoud.

## 4. Lokale demonstratie (startinstructies)

Vereist: Docker en Node 22. Alles draait lokaal, met fictieve gegevens.

```sh
cd komtgoed
npx supabase@2.117.0 start          # lokale Supabase met alle migraties (eerste keer: images downloaden)
cd dev
npm ci                              # supabase-js en playwright (vastgezette versies)
npm run seed                        # demo-accounts Anna en Bram + "Familie Demo"
npm start                           # open http://127.0.0.1:5180
```

Wat je ziet en kunt doen:

1. **Twee panelen:** links Anna (account A), rechts Bram (account B). Beide staan op "Live verbonden".
2. **Live meekijken:** voeg links een boodschap toe, vink rechts iets af, of verwijder iets. Het andere paneel volgt binnen een seconde, zonder te verversen.
3. **Storing:** klik bij Bram op "Verbinding verbreken (simulatie)" (of zet de browser offline). De status wordt "Geen verbinding". Wijzig iets bij Anna en herstel daarna de verbinding bij Bram: de gemiste wijziging komt binnen en de status wordt weer "Live verbonden".
4. **Conflict:** klik bij beiden op "Wijzig" bij dezelfde boodschap. Bewaar eerst bij Anna, dan bij Bram. Bram krijgt "Iemand anders heeft dit net aangepast…" en ziet de versie van Anna.
5. **Privacy:** de tandartsafspraak is bij Anna volledig zichtbaar ("privé"), bij Bram alleen als "Bezet".
6. **Onbekende uitkomst:** de e2e-test laat een antwoord van de server wegvallen (Playwright `route.abort`). Het item staat er dan als "niet bevestigd". Na herladen is het bevestigd, of te bevestigen met "Opnieuw proberen", met dezelfde UUID en nooit dubbel.

Opnieuw beginnen: `npm run seed` (verwijdert de demo-accounts en maakt ze opnieuw aan). Afsluiten: `npx supabase@2.117.0 stop` in `komtgoed/`.

Schermafdrukken van de geautomatiseerde e2e-run staan in `docs/afbeeldingen/thuisplanner-sync-*.png`:

- `0-overzicht`: beide panelen;
- `2-live`: live meekijken;
- `3-offline`: geen verbinding;
- `4-conflict`: conflictmelding;
- `5-privacy`: privé bij Anna, "Bezet" bij Bram;
- `6-geen-toegang`: na intrekken van de toegang;
- `7-onbevestigd`: toevoegingen met onbekende uitkomst ("niet bevestigd", "Opnieuw proberen").

## 5. Tests

| Laag | Bestand | Wat |
| --- | --- | --- |
| Database | `rls_tests.sql` KG-T47 | Seintjes alleen `{t,id,v,op}`, zonder inhoud of account-ID's, voor boodschappen, afspraken (ook privé) en taken. Luisteren: lid ja; buitenstaander, gearchiveerd lid, afwijkende of lege kanaalnaam nee. Presence nee. Zelf zenden nee. |
| Database | `rls_tests.sql` KG-T48 | Catalogus: elke inhouds-, leden- en huishoudtabel zendt een seintje; de seintjesfuncties noemen geen inhoudskolommen; geen schrijfbeleid op `realtime.messages`. |
| Database | `rls_tests.sql` KG-T49 | Kanaalwissel: archiveren, vertrekken en accountverwijdering geven een nieuw volgnummer, een kind zonder account niet; het ledenseintje over de intrekking gaat nog naar het oude kanaal, alles daarna alleen naar het nieuwe; oud volgnummer, oude vorm en varianten geven geen toegang; wie toegang verloor, komt op geen enkel kanaal; `household_channel` alleen voor actieve leden. |
| Tegenproeven | `tegenproeven.txt` | KG-5D: een seintje met de hele rij, een open leesbeleid, een zendbeleid voor clients, een ontbrekende trigger. Herstelronde: geen kanaalwissel, beleid zonder volgnummer, kanaalwissel vóór het ledenseintje, kanaalnaam voor niet-leden, seintjes naar de oude vaste naam. |
| Synchronisatie | `integratie/sync.test.mjs` | Zeven tests met aparte accounts en sessies; zie het overzicht hieronder. |
| Herstelronde 1 | `integratie/herstel.test.mjs` | Twaalf regressietests voor de vier bevindingen, met "poorten" die lopende verzoeken in een vaste volgorde vasthouden, uitvoeren of zonder antwoord afbreken (§7). |
| Tegenproeven module | `integratie/sync-tegenproeven.mjs` | Elf mutaties van de module die één herstelde eigenschap terugdraaien; elke mutatie moet haar regressietest laten falen. |
| Realtime-meting | `integratie/realtime-meting.mjs` | Meet het eigen gedrag van Realtime bij intrekking (geen CI; uitkomst in §7). |
| Realtime-toegang | `integratie/integratie.test.mjs` | Buitenstaander krijgt een expliciete weigering, lid komt binnen (alleen met het actuele volgnummer), zelf zenden lukt niet. |
| Demo e2e | `komtgoed/dev/tests/demo.e2e.mjs` | Zes tests met twee **echte browsersessies** (Playwright, Chromium, eigen context per account); zie het overzicht hieronder. |
| Statisch | `statisch.js` | De browsercode noemt nooit de service-role-sleutel; de sync-module logt niet. |

**Synchronisatie (`sync.test.mjs`):**

- A voegt toe, vinkt af, hernoemt en verwijdert; B ziet het zonder verversen. Ook taken.
- Geen dubbele verwerking: herhaalde opdracht met dezelfde UUID, een salvo van seintjes (≤ 2 ophaalrondes), bekende versies worden overgeslagen.
- Gelijktijdig wijzigen: conflictmelding, gelijktijdig afvinken (precies één wint), afspraak met verouderde versie.
- Netwerk weg en terug: HTTP **en** websocket geblokkeerd, status offline, toevoeging zonder antwoord "niet bevestigd" en na herstel met dezelfde UUID precies één keer opgeslagen, gemiste wijziging na herstel binnen, daarna weer live.
- Huishoudisolatie: geen toegang, geen gegevens, kanaal geweigerd, geen seintjes uit een ander huishouden.
- Privacy: "Bezet" bij B; geen privé-tekst in de cache van B of in ruwe kanaalberichten; geen account-ID's in seintjes.
- Intrekking tijdens een sessie (archiveren): geen toegang, geheugen leeg, daarna niets meer binnen; stoppen wist alles.

**Demo e2e (`demo.e2e.mjs`):**

- Live A → B en B → A zonder verversen.
- Browsercontext offline en weer online, met de gemiste wijziging.
- Conflict via de wijzigknop.
- Privacy: scherm, HTML, clientcache en **elk HTTP-antwoord en websocketframe** naar Bram zonder privé-tekst.
- Antwoord verloren (met en zonder commit op de server), herladen, opnieuw proberen: "niet bevestigd", nooit "niet opgeslagen", dezelfde UUID, nooit dubbel.
- Intrekking tijdens de sessie: "Geen toegang", lege lijst, leeg geheugen.

In CI draaien de database-, integratie-, sync- en e2e-tests in de job `supabase-lokaal`, op een verse lokale stack.

## 6. Bekende grenzen en open punten

- **Realtime na intrekking:** zie §7, bevinding 2, voor wat de server wel en niet garandeert.
- **Geen offline-wachtrij:** zonder verbinding wordt er niet opgeslagen (bouwplan: "online eerst"). Alleen toevoegingen met een onbekende uitkomst blijven staan, met dezelfde UUID, tot ze bevestigd zijn of de gebruiker opnieuw probeert.
- **Opslag na herstart:** in de demo `sessionStorage` (blijft bij herladen, weg bij het sluiten van het tabblad). Dan staat de eigen, nog niet bevestigde invoer (bijv. een boodschap) tijdelijk in de browser. `stop()` en verlies van toegang wissen haar. Een sluiten zonder herladen verliest de "niet bevestigd"-markering; de server heeft de opdracht dan wel of niet, en opnieuw invoeren met een nieuwe UUID kan dan in het uiterste geval een dubbele taak geven (boodschappen niet: die ontdubbelt de server op naam).
- **De demo logt automatisch in** met vaste fictieve accounts en een lokaal wachtwoord. Het is alleen een ontwikkelpagina; inloggen met een e-mailcode is stap 7.
- **De demo toont boodschappen en afspraken.** Taken en afspraken bewerken kan via de module (en is getest), maar heeft geen eigen knoppen in de demo.
- **Nog niet gedaan:**
  - de herindeling van de React-app (stap 4, wacht op akkoord over de bibliotheken);
  - de koppeling met de schermen uit PR #20.

## 7. Herstelronde 1 (review van `3f3b7da`)

Vier bevindingen uit de onafhankelijke review. Per bevinding: oorzaak, oplossing, bewijs en beperking. De tests draaien tegen de echte lokale stack (Supabase CLI 2.117.0, PostgreSQL 17.6, Realtime v2.130). Tegenproef "oude module" betekent: dezelfde tests met `KG_SYNC_MODULE` naar de module uit `3f3b7da`.

### Bevinding 1 (hoog): cacheherstel na stoppen of intrekking

- **Oorzaak:** `schrijf()` bewaarde een momentopname (`vorige`) en zette die na een fout terug, ook als de module intussen gestopt was of de toegang kwijt was. Ophaalrondes keken alleen naar `gestopt`; na stoppen en opnieuw starten werd een oude, lopende ronde hergebruikt en gepubliceerd.
- **Oplossing:** generaties in de module. `stop()` en verlies van toegang verhogen de generatie en zetten de module "niet levend". Elk vervolg van een asynchroon verzoek (ophalen per pagina, schrijven, terugdraaien, kanaalstatus, herverbinden, seintjes) toetst eerst de generatie waarin het begon. `zet()` publiceert niets als de module niet levend is. Terugdraaien werkt op de huidige stand en raakt alleen de eigen wijziging.
- **Bewijs:** `herstel.test.mjs` B1a–B1d, met vastgehouden verzoeken:
  - B1a: stoppen terwijl een wijziging loopt; daarna faalt het verzoek.
  - B1b: intrekken terwijl een wijziging loopt.
  - B1c: stoppen, intrekken en opnieuw starten terwijl een oud ophaalantwoord nog onderweg is.
  - B1d: terugdraaien terwijl er intussen nieuwe gegevens binnenkwamen.

  Tegen de oude module falen alle vier (onder meer "gegevens na stoppen terug in de cache" en "een antwoord van vóór het stoppen werd na het stoppen gepubliceerd"). Mutatie-tegenproeven 1–4 vangen het terugzetten van elke maatregel.
- **Beperking:** een verzoek dat al bij de server is, wordt niet afgebroken. Alleen het antwoord wordt genegeerd.

### Bevinding 2 (middel): oude Realtime-abonnementen

- **Onderzoek** (`realtime-meting.mjs`, lokale stack, Realtime v2.130). De kanaalwissel stond voor deze meting uit. Een client blijft na archivering op het kanaal en Anna doet elke seconde een wijziging.

  | Situatie | Seintjes na intrekking | Kanaal |
  | --- | --- | --- |
  | Client doet niets (niet-meewerkend) | 7 van 8 in 8 s | blijft `joined` |
  | Client stuurt een vernieuwd token | 0 | `CLOSED` na 0,6 s |
  | Token verloopt na 15 s | 14, tot het verlopen | `CLOSED` na 15,0 s |

  Realtime controleert het beleid dus bij het aanmelden en bij een nieuw token, en sluit bij het verlopen van het token. Een client die niet meewerkt, blijft tot het verlopen van zijn token (lokaal `jwt_expiry` = 3600 s) seintjes ontvangen. De oude opzet leunde daarmee op vrijwillige medewerking.
- **Oplossing (server):** de kanaalnaam `household:<id>:<epoch>`. Bij elk verlies van een actief lidmaatschap met account verhoogt de database het volgnummer. Het ledenseintje over de intrekking gaat nog naar het oude kanaal, zodat de overgebleven leden weten dat ze moeten overstappen. Alles daarna gaat alleen naar het nieuwe kanaal. Het beleid laat alleen het actuele volgnummer en alleen actieve leden toe. De client stapt over zodra de ophaalronde een andere naam geeft.
- **Bewijs:**
  - B2 (echte Realtime): een niet-meewerkende client (rechtstreeks op het kanaal, nooit afmelden, geen nieuw token) blijft `joined`, maar ontvangt na de intrekking geen enkel inhoudsseintje. Een controle-lid op het nieuwe kanaal ontvangt ze wel. Anna's module stapt over en blijft live. Het gearchiveerde lid wordt op het nieuwe kanaal geweigerd.
  - Tegenproef `KG_TEGENPROEF=1`: zonder kanaalwissel ontvangt dezelfde client na de intrekking wél alle seintjes. Dat bewijst dat Realtime zelf niet intrekt, en dat de test dat ziet.
  - KG-T49 en vijf SQL-tegenproeven.
  - Mutatie-tegenproef 11: een client die niet overstapt.
- **Beperking:** wat een niet-meewerkende client nog krijgt, zijn de seintjes die in de intrekkende transactie zelf vóór de wissel zijn verstuurd. Dat is het ledenseintje over de intrekking (`{t:'household_members', id, op}`), zonder inhoud. Er is geen directe intrekking door Realtime zelf: het oude kanaal blijft technisch open tot het token verloopt, maar de server zendt er niets meer heen. Een wijziging van rol of naam wisselt het kanaal niet (geen verlies van toegang).

### Bevinding 3 (middel): dubbele toevoeging na antwoordverlies

- **Oorzaak:** elke aanroep van `taakToevoegen` (en een nieuwe afspraak zonder id) maakte een nieuwe UUID. Een netwerkfout werd gemeld als "niet opgeslagen", ook als de server de opdracht al had uitgevoerd. Opnieuw toevoegen gaf dan een tweede taak.
- **Oplossing:** toevoegingen zijn opdrachten met een vaste UUID:
  - **Onbekende uitkomst** = "niet bevestigd", nooit "niet opgeslagen".
  - **Opnieuw proberen**, of dezelfde tekst opnieuw invoeren zolang hij niet bevestigd is, gebruikt dezelfde UUID. `23505` op dat id telt als "al opgeslagen", na een controle op het id.
  - **Bevestiging zonder tweede verzending:** de eerstvolgende geslaagde ophaalronde bevestigt het item als de server het al heeft.
  - **Herstart:** met `opslag` blijft de opdracht bewaard en komt ze na herladen terug, met dezelfde UUID.
  - **Geen automatische wachtrij** (bouwplan).
- **Bewijs:**
  - B3a (taak: commit, antwoord weg, opnieuw invoeren = één taak, dezelfde UUID).
  - B3b (boodschap en afspraak).
  - B3c (commit, verbinding weg en terug: bevestigd zonder tweede verzending).
  - B3d (herstart met en zonder commit op de server, plus een laat binnenkomend oud verzoek: precies één keer).
  - Demo-e2e test 5 in de browser, met herladen.
  - Tegen de oude module falen B3a–B3d ("melding zegt dat het niet is opgeslagen…", na de herordening van B3a ook "dubbele taak").
  - Mutatie-tegenproeven 5–8.
- **Beperking:** zonder `opslag` (of na het sluiten van het tabblad bij `sessionStorage`) is de UUID na een herstart weg. Wijzigingen met versie worden bij een onbekende uitkomst niet opnieuw verstuurd; de volgende ronde toont de werkelijke stand.

### Bevinding 4 (middel): 1000-rijenlimiet

- **Oorzaak:** één `select` per soort; PostgREST geeft hoogstens `max_rows` = 1000 rijen terug. Daarna verving de module de hele cache door die afgekapte lijst.
- **Oplossing:**
  - **Keyset-paginering** op `id` voor boodschappen, taken, afspraken en leden, tot een lege pagina. Zo kapt ook een kleinere `max_rows` niets stilletjes af.
  - **Geen halve vervanging:** pas als alles binnen is, wordt de cache vervangen.
  - **Volgorde lokaal:** de module zet de volgorde voor het scherm zelf.
- **Bewijs:**
  - B4a: 1001 boodschappen, taken en afspraken en 1002 leden komen allemaal en één keer mee.
  - B4b: een mislukte tweede pagina (ook na de eigen herhalingen van supabase-js) laat de cache ongemoeid.
  - B4c: een verwijdering en een toevoeging tijdens het ophalen; geen rij die er de hele tijd was, ontbreekt, en de volgende ronde is gelijk aan de server.
  - Tegen de oude module faalt B4a (1000 in plaats van 1001); B4b en B4c komen daar niet voorbij het laden.
  - Mutatie-tegenproeven 9 (één pagina) en 10 (offset in plaats van keyset: slaat een rij over).
- **Beperking:**
  - Een ronde is geen momentopname van de hele database. Een rij die tijdens de ronde wijzigt, kan in de oude of de nieuwe stand meekomen. Het seintje van die wijziging geeft een extra ronde die het rechtzet.
  - Grote lijsten kosten meerdere verzoeken per ronde (één extra lege pagina per soort).

### Uitgevoerde controles

| Controle | Waar | Uitkomst |
| --- | --- | --- |
| SQL-matrix | PostgreSQL 16-stub en lokale Supabase (PG 17.6) | 49 van 49 (beide) |
| SQL-tegenproeven | lokale Supabase | 55 van 55 |
| Integratie (API, auth, realtime, gelijktijdigheid, sync, herstel) | lokale Supabase | 41 van 41 |
| Gelijktijdigheid, tegenproef | lokale Supabase | 6 gevangen, 6 overgeslagen (rijslot/unieke sleutel) |
| Herstel, realtime-tegenproef | lokale Supabase (echte Realtime) | 1 van 1 |
| Mutatie-tegenproeven module | lokale Supabase | 11 van 11 |
| Regressietests tegen de oude module (`3f3b7da`) | lokale Supabase | 12 van 12 falen, zoals bedoeld |
| Realtime-meting | lokale Supabase | zie tabel bij bevinding 2 |
| Demo e2e (Playwright, Chromium) | lokale Supabase | 6 van 6 |
| Statisch | — | geslaagd |
| Huisplan-tests | `test/index.html` en `index.html` | ongewijzigd groen (zie PR) |

**Niet uitgevoerd:** tests tegen een online Supabase-project (bewust niet), langdurige of belastingstests, en een meting met de standaardduur van een echt token van een uur. Het verlopen is gemeten met een lokaal getekend token van 15 s.
