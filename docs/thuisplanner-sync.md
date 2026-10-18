# Thuisplanner KG-5D: synchronisatie tussen gezinsleden (bouwplan stap 3)

**Status:** gebouwd en lokaal getest op een eigen branch, als aparte PR boven op PR #21. Niet gemerged, niet gedeployd. Herstelronde 1 na de review van `3f3b7da` (§7) en herstelronde 2 na de review van `79a5852` (§8) en herstelronde 3 na de review van `89e58c5` (§9) verwerkt.

Technische map: `thuisplanner/`; productnaam: Thuisplanner.

## 1. Scope en afwijking van het bouwplan

| Bouwplan (`docs/thuisplanner-bouwplan.md`) | Deze stap |
| --- | --- |
| **Stap 3 (KG-5D):** realtime op de server. Een trigger naar `household:<id>` en het beleid op `realtime.messages`. | Volledig gebouwd (§3). |
| **Stap 4 (KG-5E):** de React-app herindelen met `@tanstack/react-query` en `react-router`, na akkoord op die bibliotheken. | **Niet gedaan.** Dat akkoord staat nog open, en het prototype uit PR #20 wordt bewust niet herbouwd. |
| **Stap 5–6 en 8 (KG-5F/G/I):** lezen, schrijven en realtime in de app. | De **kern** ervan is gebouwd als losse, framework-onafhankelijke module `thuisplanner/sync/thuisplanner-sync.js`. Die kan straks zonder herbouw achter de opslag-interface van stap 4 worden gehangen. |
| **Stap 7 (KG-5H):** inloggen en nieuwe pagina's, na akkoord. | Geen nieuwe app-pagina's. Wel een **ontwikkelpagina** (`thuisplanner/dev/`) met twee vaste, fictieve demo-accounts, zoals in de opdracht gevraagd. Het is uitdrukkelijk geen ontwerp. |

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

### Client (`thuisplanner/sync/thuisplanner-sync.js`)

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
  - **Toevoegen** (boodschap, taak, nieuwe afspraak) is één opdracht met één vaste UUID. Komt er geen antwoord (netwerkfout, verbinding weg, time-out, fout van een tussenliggende server), dan is de uitkomst **onbekend**: het item blijft staan als "niet bevestigd", met de melding dat het nog niet bevestigd is (nooit "niet opgeslagen"). Opnieuw proberen is een expliciete actie op de **opdrachtidentiteit** (`opnieuwProberen(id)`) en verstuurt dezelfde opdracht met **dezelfde UUID**. Een nieuwe toevoeging is altijd een nieuwe opdracht; staat er een onbevestigde opdracht met precies dezelfde inhoud (bij taken: titel én overige velden zoals de datum), dan verstuurt de module niets en vraagt ze eerst een keuze: opnieuw proberen of bewust als nieuwe toevoegen (`{ bewustNieuw: true }`). Inhoud wordt nooit hergebruikt voor een andere opdracht. De server behandelt die als dezelfde: `add_shopping_items` geeft `al_verwerkt`; bij taken en afspraken betekent `23505` op dat id dat een eerdere poging al slaagde (de module controleert dat met een leesverzoek op het id). De eerstvolgende geslaagde ophaalronde bevestigt een item dat de server wel heeft, zonder tweede verzending.
  - **Bewaren:** een opdracht staat in het geheugen van de pagina (overleeft `stop()`/`start()` en een React-unmount) en, met de optie `opslag` (in de demo `localStorage`), duurzaam: één sleutel per opdracht, met account en huishouden in sleutel én inhoud. Zo overleeft ze herladen, sluiten, opnieuw inloggen en meerdere tabbladen. Ze verdwijnt alleen na aantoonbare bevestiging, na een zekere weigering van de eerste poging, of via de expliciete actie `vergeten(id)` (§8).
  - **Staten:** `verzenden`, `onzeker` (misschien al opgeslagen; blijft tot bevestiging, ook bij een latere fout of verlopen sessie) en `geweigerd` (eerste poging zeker niet uitgevoerd door een verlopen sessie; bewaard voor na het inloggen).
  - Er is **geen automatische wachtrij**: wat de server niet heeft, wordt pas opnieuw verstuurd als de gebruiker dat vraagt (bouwplan: zonder verbinding niet schrijven). Is het toestel aantoonbaar offline (`navigator.onLine === false`), dan wordt niets verstuurd en zegt de melding dat het niet is opgeslagen.
  - **Wijzigen, afvinken en verwijderen** van boodschappen en taken gebeuren met `... where id = x and version = v`. Raakt dat 0 rijen, dan is er een **conflict**: de module zet een melding, haalt de nieuwste stand op, en er gaat niets verloren.
  - **Afspraken** gaan via `save_event` en `delete_event`; `PT409` (HTTP 409) betekent conflict.
  - **Mislukt een wijziging** (of is de uitkomst onbekend), dan draait de module alleen haar eigen optimistische wijziging terug, op de huidige stand. Ze zet nooit een oude momentopname terug. Bij een onbekende uitkomst zegt de melding dat het niet zeker is; de volgende ophaalronde laat zien wat er echt staat. Een gewijzigde rij wordt niet automatisch opnieuw verstuurd (de versie zou dan al verouderd zijn).
  - supabase-js herhaalt een mislukte GET zelf (tot drie keer); schrijfverzoeken (POST/PATCH) niet.
- **Toegang weg** (vertrek, archiveren, huishouden verwijderd):
  - de ophaalronde ziet geen lidmaatschap meer;
  - de module beëindigt de generatie, wist **alle** gegevens uit de cache, stopt het kanaal en zet de status op `geen-toegang`. Onbevestigde eigen opdrachten blijven op het toestel (alleen hun aantal is zichtbaar, met de mogelijkheid ze te vergeten).
  - Het ledenseintje van de intrekking zelf brengt dit binnen seconden; het vangnet vangt een gemist seintje op.
- **Overstappen naar een nieuw kanaal:** geeft de ophaalronde een andere kanaalnaam (iemand verloor toegang), dan meldt de module zich af op het oude kanaal en aan op het nieuwe, en haalt ze na `SUBSCRIBED` alles opnieuw op.
- **Stoppen** (uitloggen, ander huishouden kiezen, unmount) beëindigt de generatie, wist de cache en sluit het kanaal. Onbevestigde opdrachten blijven bewaard.
- **Geen inhoud in logboeken of meldingen:**
  - de module schrijft niets naar de console (statische controle);
  - meldingen zijn vaste Nederlandse teksten per foutcode;
  - het optionele `spoor` geeft alleen kanaalstatussen.

### Ontwikkelpagina (`thuisplanner/dev/`)

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
cd thuisplanner
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
6. **Onbekende uitkomst:** de e2e-test laat een antwoord van de server wegvallen (Playwright `route.abort`). Het item staat er dan als "niet bevestigd". Na herladen of sluiten en heropenen is het bevestigd, of te bevestigen met "Opnieuw proberen", met dezelfde UUID en nooit dubbel. Dezelfde tekst opnieuw invoeren geeft eerst een keuze. "Vergeten" haalt het alleen van dit toestel.

Opnieuw beginnen: `npm run seed` (verwijdert de demo-accounts en maakt ze opnieuw aan). Afsluiten: `npx supabase@2.117.0 stop` in `thuisplanner/`.

Schermafdrukken van de geautomatiseerde e2e-run staan in `docs/afbeeldingen/thuisplanner-sync-*.png`:

- `0-overzicht`: beide panelen;
- `2-live`: live meekijken;
- `3-offline`: geen verbinding;
- `4-conflict`: conflictmelding;
- `5-privacy`: privé bij Anna, "Bezet" bij Bram;
- `6-geen-toegang`: na intrekken van de toegang;
- `7-onbevestigd`: toevoegingen met onbekende uitkomst ("niet bevestigd", "Opnieuw proberen");
- `8-keuze`: na sluiten en heropenen, opnieuw proberen via de keuze bij een mogelijk dubbele invoer.

## 5. Tests

| Laag | Bestand | Wat |
| --- | --- | --- |
| Database | `rls_tests.sql` KG-T47 | Seintjes alleen `{t,id,v,op}`, zonder inhoud of account-ID's, voor boodschappen, afspraken (ook privé) en taken. Luisteren: lid ja; buitenstaander, gearchiveerd lid, afwijkende of lege kanaalnaam nee. Presence nee. Zelf zenden nee. |
| Database | `rls_tests.sql` KG-T48 | Catalogus: elke inhouds-, leden- en huishoudtabel zendt een seintje; de seintjesfuncties noemen geen inhoudskolommen; geen schrijfbeleid op `realtime.messages`. |
| Database | `rls_tests.sql` KG-T49 | Kanaalwissel: archiveren, vertrekken en accountverwijdering geven een nieuw volgnummer, een kind zonder account niet; het ledenseintje over de intrekking gaat nog naar het oude kanaal, alles daarna alleen naar het nieuwe; oud volgnummer, oude vorm en varianten geven geen toegang; wie toegang verloor, komt op geen enkel kanaal; `household_channel` alleen voor actieve leden. |
| Tegenproeven | `tegenproeven.txt` | KG-5D: een seintje met de hele rij, een open leesbeleid, een zendbeleid voor clients, een ontbrekende trigger. Herstelronde: geen kanaalwissel, beleid zonder volgnummer, kanaalwissel vóór het ledenseintje, kanaalnaam voor niet-leden, seintjes naar de oude vaste naam. |
| Synchronisatie | `integratie/sync.test.mjs` | Zeven tests met aparte accounts en sessies; zie het overzicht hieronder. |
| Herstelronde 1 | `integratie/herstel.test.mjs` | Twaalf regressietests voor de vier bevindingen, met "poorten" die lopende verzoeken in een vaste volgorde vasthouden, uitvoeren of zonder antwoord afbreken (§7). |
| Database | `rls_tests.sql` KG-T50 | Herhaalde boodschappenopdracht (zelfde ID) zonder tweede bijwerking, ook na afvinken; bewust nieuw volgt de productregels; ID van een ander huishouden geweigerd; register niet leesbaar (herstelronde 3). |
| Herstelronde 3 | `integratie/herstel3.test.mjs` | Overlappende geweigerde herhaling (R1a/R1b) en Melk opnieuw proberen na afvinken (R2), met tegenproef op de oude databasefunctie (§9). |
| Herstelronde 2 | `integratie/herstel2.test.mjs` | Twaalf regressietests voor de drie idempotentieproblemen: verlopen sessie, dezelfde titel, opdrachtverlies (§8). Gedeelde testhulp in `integratie/testhulp.mjs`. |
| Tegenproeven module | `integratie/sync-tegenproeven.mjs` | 22 mutaties van de module die één herstelde eigenschap terugdraaien; elke mutatie moet haar regressietest laten falen. |
| Realtime-meting | `integratie/realtime-meting.mjs` | Meet het eigen gedrag van Realtime bij intrekking (geen CI; uitkomst in §7). |
| Realtime-toegang | `integratie/integratie.test.mjs` | Buitenstaander krijgt een expliciete weigering, lid komt binnen (alleen met het actuele volgnummer), zelf zenden lukt niet. |
| Demo e2e | `thuisplanner/dev/tests/demo.e2e.mjs` | Zeven tests met twee **echte browsersessies** (Playwright, Chromium, eigen context per account); zie het overzicht hieronder. |
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
- Sluiten en heropenen, keuze bij een mogelijk dubbele invoer, offline invoer terug in het veld, waarschuwing bij een browser die opslag weigert.
- Intrekking tijdens de sessie: "Geen toegang", lege lijst, leeg geheugen.

In CI draaien de database-, integratie-, sync- en e2e-tests in de job `supabase-lokaal`, op een verse lokale stack.

## 6. Bekende grenzen en open punten

- **Realtime na intrekking:** zie §7, bevinding 2, voor wat de server wel en niet garandeert.
- **Geen offline-wachtrij:** zonder verbinding wordt er niet opgeslagen (bouwplan: "online eerst"). Alleen toevoegingen met een onbekende uitkomst (of een door een verlopen sessie geweigerde eerste poging) blijven staan, met dezelfde UUID, tot ze bevestigd zijn, de gebruiker opnieuw probeert of ze vergeet.
- **Opslag op het toestel:** zie §8 voor wat wel en niet gegarandeerd is.
- **Datum van afvinken (K1, 15 oktober 2026):** `taakAfvinken(taak, vandaag)` legt de dag vast die de app als
  "vandaag" toont. Zonder die parameter gebruikt de module de lokale datum van het toestel (`lokaleDatum`),
  nooit de UTC-datum. Vroeger kreeg een taak die in Nederland tussen 00:00 en 02:00 werd afgevinkt, de datum
  van gisteren. De tijdzone van het huishouden (`households.timezone`) wordt nog niet gebruikt.
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

## 8. Herstelronde 2 (review van `79a5852`)

Drie resterende idempotentieproblemen. De tests staan in `integratie/herstel2.test.mjs` (H1–H3) en draaien tegen de echte lokale stack. Tegenproef "oude module" betekent: dezelfde tests met `KG_SYNC_MODULE` naar de module uit `79a5852`. Alle twaalf falen daar, met de bedoelde reden.

### 1. Verlopen sessie na een onbekende uitkomst

- **Oorzaak:** elke zekere fout van een poging verwijderde de opdracht, ook een `401` (verlopen JWT) bij een herhaalpoging na een eerder verloren antwoord. Dan ging de identiteit verloren terwijl de eerste poging misschien wel was opgeslagen.
- **Oplossing:** opdrachten krijgen een staat. Na één onbekende uitkomst (`ooitOnzeker`) verwijdert geen enkele latere fout de opdracht meer; ze blijft `onzeker` tot aantoonbaar vastgesteld is of ze bestaat:
  - de server geeft het id terug in een geldige ophaalronde;
  - of een poging slaagt (of meldt "al verwerkt" of `23505` op hetzelfde id).

  Onderscheid tussen een eerste en een latere poging:
  - **Eerste poging, verlopen sessie** (`401`/`PGRST30x`, dus zeker niet uitgevoerd): staat `geweigerd`, bewaard met dezelfde UUID voor na het inloggen.
  - **Eerste poging, zeker geweigerd om de inhoud of het lidmaatschap** (ongeldig, geen lid): weg, met een melding.

  Een ophaalronde met een verlopen sessie meldt "log opnieuw in; je invoer blijft bewaard". Een opdracht wordt alleen verstuurd met de sessie van het account waarvoor ze gemaakt is.
- **Bewijs:**
  - H1a: commit, antwoord weg, sessie verloopt (echt verlopen JWT tegen PostgREST), herhaalpoging `401`. De opdracht en opslag blijven; na opnieuw inloggen bevestigt de eerste geldige ronde haar: één rij met dezelfde UUID.
  - H1b: zonder commit; na inloggen opnieuw proberen geeft één rij.
  - H1c: eerste poging met een verlopen sessie wordt bewaard en na inloggen opgeslagen. Een te lange titel is direct weg met de melding "ongeldig".
  - Mutatie-tegenproeven 12–13.
- **Beperking:** wie nooit opnieuw inlogt, houdt de opdracht als "niet bevestigd" op het toestel tot hij die vergeet.

### 2. Verschillende taken met dezelfde titel

- **Oorzaak:** opnieuw invoeren werd herkend op titel alleen en hergebruikte dan de oude opdracht (met de oude inhoud). "Gymtas" op 14 oktober werd zo stil de onbevestigde "Gymtas" van 13 oktober.
- **Oplossing:**
  - **Opnieuw proberen** gaat alleen nog via de stabiele opdrachtidentiteit (`opnieuwProberen(id)`).
  - **Een nieuwe toevoeging** is altijd een nieuwe opdracht.
  - **Mogelijk dubbel:** staat er een onbevestigde opdracht met exact dezelfde inhoud (titel én alle overige velden), dan verstuurt de module niets en geeft ze `mogelijkDubbel: <id>` met een keuze terug. Opnieuw proberen gebruikt dezelfde UUID; bewust nieuw (`{ bewustNieuw: true }`) maakt een eigen UUID. Inhoud wordt nooit stil samengevoegd of hergebruikt.
  - **Afspraken:** een opgegeven `id` is zelf de identiteit.
- **Bewijs:**
  - H2a: "Gymtas" op 13 (antwoord verloren) en op 14 oktober geeft twee taken met eigen UUID's; opnieuw proberen van de eerste blijft twee.
  - H2b: twee bewust identieke taken geven twee rijen. Bij een onbevestigde gelijke volgt eerst de keuze (niets verstuurd); bewust nieuw geeft een eigen rij; opnieuw proberen van de eerste maakt niets dubbel.
  - E2e: de keuze in de demo.
  - Mutatie-tegenproeven 14–15.
- **Beperking:** de keuze kost een extra stap als iemand echt twee identieke dingen wil terwijl de eerste nog onbevestigd is.

### 3. Opdrachtverlies bij stop(), tabblad sluiten of opslagproblemen

- **Oorzaak:**
  - `stop()` en verlies van toegang wisten opdrachten en opslag;
  - de demo gebruikte `sessionStorage` (weg bij sluiten);
  - alle opdrachten stonden in één sleutel (tabbladen overschreven elkaar);
  - een geweigerde opslag bleef stil.
- **Oplossing:**
  - **Paginageheugen** (per account en huishouden): overleeft `stop()`/`start()` en een unmount.
  - **Duurzame opslag** (`localStorage`), **één sleutel per opdracht** (`thuisplanner-opdracht:<account>:<huishouden>:<uuid>`). Account en huishouden staan ook in de inhoud en worden bij het lezen gecontroleerd. Bij elke ophaalronde worden geheugen en opslag gelijkgetrokken, zodat andere tabbladen meedoen.
  - **Opruimen** alleen na aantoonbare bevestiging, na een zekere weigering van een eerste poging, of via `vergeten(id)` (ook na `stop()` of zonder toegang). `stop()` en verlies van toegang ruimen niets op.
  - **Opslag geweigerd of niet beschikbaar** (proef bij `start()`, of een fout bij schrijven): `toestand.opslagDuurzaam = false` en een zichtbare waarschuwing in de demo. Dan is er **geen** garantie na herladen of sluiten.
  - **Gevoelige inhoud:** van een **privé-afspraak** komt alleen de identiteit in de opslag, nooit titel, plek of notities ("Privacy volgt de situatie": een toestel kan gedeeld zijn). In dezelfde pagina blijft de inhoud in het geheugen. Na herladen staat de afspraak er als "inhoud niet op dit toestel bewaard"; opnieuw invoeren met dezelfde identiteit maakt hem af, zonder dubbel.
- **Bewijs:**
  - H3a: `stop()`/`start()` en een nieuwe sync in dezelfde pagina, ook zonder opslag.
  - H3b: sluiten en heropenen in een nieuwe pagina en sessie, met en zonder commit.
  - H3c: drie tabbladen; gelijktijdig toevoegen overschrijft niets en gelijktijdig opnieuw proberen geeft één rij. Een elders bevestigde opdracht ruimt het andere tabblad op.
  - H3d: geweigerde opslag en geen opslag geven `opslagDuurzaam = false`.
  - H3e: een ander account op dezelfde browser neemt niets over en verstuurt niets, ook niet een vervalst record onder de eigen sleutel; een ander huishouden van hetzelfde account ook niet.
  - H3f: geen privé-inhoud in de opslag; na herladen dezelfde identiteit; één afspraak.
  - H3g: vergeten.
  - E2e: sluiten en heropenen, offline invoer terug in het veld, waarschuwing bij een browser die opslag weigert.
  - Mutatie-tegenproeven 16–21.
- **Beperkingen:**
  - `localStorage` is niet versleuteld. Eigen, nog niet bevestigde boodschappen, taken en gedeelde afspraken staan leesbaar op het toestel tot bevestiging of vergeten. Een ander account op dezelfde browser kan ze met ontwikkelaarsgereedschap lezen, maar de app neemt ze niet over.
  - Zonder werkende opslag (privémodus met geweigerde opslag, volle opslag) geldt de idempotentie alleen binnen de pagina; dat wordt getoond.
  - Na verlies van toegang blijven eigen opdrachten op het toestel tot ze vergeten worden. Komt de toegang terug, dan worden ze weer nagekeken.
  - Meerdere tabbladen worden gelijkgetrokken bij elke ophaalronde, niet direct (geen `storage`-gebeurtenis).

### Uitgevoerde controles (herstelronde 2)

De volledige tabel met uitkomsten staat in de PR-beschrijving. Lokaal uitgevoerd:

- de SQL-matrix en tegenproeven (stub en lokale Supabase);
- integratie, inclusief `herstel.test.mjs` en `herstel2.test.mjs`;
- de tegenproeven voor gelijktijdigheid en realtime, en de 21 mutatie-tegenproeven;
- `herstel2.test.mjs` tegen de module uit `79a5852` (12 van 12 falen);
- de demo-e2e;
- de statische controles en de Huisplan-tests.

**Niet uitgevoerd:**
- andere browsers dan Chromium;
- echte privémodus van een browser (nagebootst met een opslag die schrijven weigert);
- een echt verlopen token na een uur (nagebootst met een verlopen, lokaal getekend JWT op elk REST-verzoek).

## 9. Herstelronde 3 (review van `89e58c5`)

Twee idempotentiefouten en een onderzoek naar de privacy van de lokale opslag. De tests staan in `integratie/herstel3.test.mjs` en `rls_tests.sql` (KG-T50), tegen de echte lokale stack.

### Fout 1: overlappende geweigerde herhaalpoging

- **Oorzaak:** de staat van een opdracht hield geen rekening met pogingen die nog onderweg waren. Liep de eerste poging nog (al gecommit, antwoord onderweg) en kreeg een overlappende herhaling een zekere fout (`42501`), dan gold die herhaling als "enige poging, zeker geweigerd". De opdracht werd opgeruimd terwijl de eerste poging misschien al was opgeslagen.
- **Oplossing:** een opdracht telt haar lopende pogingen (`lopend`). Een zekere fout ruimt de opdracht alleen op als geen andere poging meer loopt én er nooit een onbekende uitkomst was. Anders blijft ze onderweg en daarna "onzeker", met dezelfde UUID. Alleen een bevestiging (de server heeft het id, of een poging slaagt) of de gebruiker ("vergeten") ruimt haar op. Eén regel extra in de bestaande afhandeling; verder niets veranderd.
- **Bewijs:**
  - R1a, in deze volgorde: eerste poging gecommit met het antwoord tegengehouden; Bram gearchiveerd; overlappende herhaling krijgt `42501`; het antwoord van de eerste poging gaat verloren; de toegang wordt hersteld (nieuwe uitnodiging); stop/start. De identiteit blijft in geheugen en opslag. Na herstel bevestigt de eerste geldige ronde de opdracht. Opnieuw proberen verstuurt niets meer: precies één rij, dezelfde UUID.
  - R1b: dezelfde volgorde zonder commit; na herstel geeft opnieuw proberen één rij.
  - Tegen de module uit `89e58c5` falen R1a en R1b ("de geweigerde herhaling verwijderde de opdracht terwijl de eerste poging nog liep").
  - Mutatie-tegenproef 22.

### Fout 2: opnieuw proberen van boodschappen

- **Oorzaak:** `add_shopping_items` zocht eerst op naam en opende een afgevinkte boodschap opnieuw ("terug"), vóór het keek of dezelfde opdracht-ID al verwerkt was. Een herhaalde opdracht kon dus een tweede bijwerking hebben. Bij de uitkomst "terug" of "al op de lijst" werd de ID bovendien nergens vastgelegd.
- **Oplossing** (migratie `20261017120000_kg5d_herstel3.sql`): een register `private.shopping_commands` met opdracht-ID, huishouden, uitkomst en de boodschap waarop ze uitkwam (geen namen).
  - **Eerst vastleggen:** per boodschap legt de functie eerst de opdracht-ID vast (`insert … on conflict do nothing`). Een gelijktijdige herhaling wacht op de eerste en ziet daarna haar uitkomst.
  - **Bekende ID:** is ze al verwerkt, dan komt de oorspronkelijke uitkomst terug, **zonder enige bijwerking**.
  - **Nieuwe ID:** alleen een nieuwe ID volgt de productregels (staat er al, afgevinkt komt terug, of nieuw). Zo blijft het verschil tussen opnieuw proberen (dezelfde UUID) en een nieuwe gebruikersintentie (nieuwe UUID, in de app via de keuze uit §8) ook op de server bewaard.
  - **Oude boodschap:** een boodschap met dezelfde ID van vóór het register telt als "al verwerkt".
  - **Ander huishouden:** een ID uit een ander huishouden geeft een algemene fout.
- **Bewijs:**
  - R2: Melk toevoegen; het antwoord gaat verloren; Anna vinkt Melk af; de oorspronkelijke opdracht wordt opnieuw geprobeerd. Melk blijft afgevinkt, ook bij nog een rechtstreekse herhaling. Een bewust nieuwe toevoeging (nieuwe UUID) opent Melk wel ("terug").
  - Tegenproef (`KG_TEGENPROEF=1`): met de oude databasefunctie opent de herhaling Melk wél opnieuw.
  - KG-T50: herhalen na afvinken, bewust nieuw, herhalen van "terug" en van "al op de lijst", een oude ID, een ID van een ander huishouden, en het register niet leesbaar.
  - KG-T38 is aangepast: een herhaalde opdracht geeft nu de oorspronkelijke uitkomst in plaats van een nieuwe beoordeling op naam.
  - Twee SQL-tegenproeven: de oude functie wordt gevangen door KG-T38; een leesrecht op het register door KG-T50.
- **Beperking:** het register groeit met elke toegevoegde boodschap en heeft nog geen bewaartermijn (zie beslissing P5).

### Privacy van de lokale opslag (onderzoek; beslissingen nodig)

**Wat er nu op het toestel staat** (feiten, ongewijzigd in deze ronde):

| Laag | Inhoud | Levensduur |
| --- | --- | --- |
| Paginageheugen | Volledige opdracht (ook privé-afspraken) | Tot het tabblad sluit |
| `localStorage` (alleen als de app `opslag` meegeeft) | Identiteit, soort, account-ID, huishouden-ID, staat, plus de **inhoud** van boodschappen, taken en gedeelde afspraken. Van privé-afspraken alleen de identiteit. | Tot bevestiging of "vergeten"; overleeft uitloggen en een accountwissel |

**Wat de account-ID in de sleutel wel en niet doet:** het voorkomt alleen dat de **app** opdrachten van een ander account overneemt of verstuurt (getest in H3e). Het is **geen beveiliging**: iedereen die dezelfde browser gebruikt, kan alles in `localStorage` lezen met ontwikkelaarsgereedschap, en elke code op dezelfde oorsprong ook. Versleutelen met een sleutel die op hetzelfde toestel staat, is schijnveiligheid; dat doen we dus niet.

**Vier situaties apart:**

1. **Veilige ontwikkelmodus met fictieve gegevens** (`thuisplanner/dev`, alleen `127.0.0.1`, alleen `@test.invalid`-accounts). Inhoud in `localStorage` is hier aanvaardbaar en handig om herstel te laten zien. Zo staat het nu.
2. **Normale accountwisseling en uitloggen.** Nu ruimt `stop()` niets op: onbevestigde opdrachten (met inhoud) blijven na uitloggen op het toestel staan. Ze zijn leesbaar voor de volgende gebruiker van die browser, maar de app neemt ze niet over. Uitloggen is een bewuste privacyhandeling van de gebruiker; een unmount, een verlopen sessie of een herstart is dat niet.
3. **Herstelbare opdrachten bewaren.** Om dubbelingen te voorkomen is alleen de **identiteit** nodig: daarmee bevestigt de eerste geldige ronde na een herstart een opdracht die de server al heeft, en blijft dezelfde UUID beschikbaar. De **inhoud** is alleen nodig om opnieuw te kunnen versturen zonder opnieuw te typen. Dat is gemak, geen voorwaarde voor idempotentie.
4. **Privacy op gedeelde apparaten.** De browser is geen grens tussen mensen die één browserprofiel delen. Echte bescherming is alleen: niets gevoeligs op het toestel bewaren, of aparte profielen of accounts op het toestel.

**Voorgestelde productbeslissingen (vragen jouw akkoord; niet gebouwd in deze ronde):**

- **P1 — Productiestand: alleen de identiteit duurzaam.**
  - Voorstel: in de echte app gaan, net als nu bij privé-afspraken, alleen identiteit, soort, staat en huishouden naar `localStorage`. De inhoud blijft in het paginageheugen.
  - Na een herstart bevestigt de app wat de server al heeft. Wat de server niet heeft, toont ze als "niet bevestigd, inhoud niet bewaard; voer opnieuw in", met dezelfde identiteit. Dat vraagt een kleine API-uitbreiding om bij taken en boodschappen een bestaande identiteit opnieuw in te voeren (afspraken kunnen dit al).
  - Alternatief: inhoud wel bewaren (gemakkelijker, minder privé).
- **P2 — Uitloggen wist onbevestigde opdrachten, na een waarschuwing.**
  - Voorstel: zijn er onbevestigde opdrachten, dan toont uitloggen eerst "N toevoegingen zijn nog niet bevestigd". De gebruiker kiest: eerst laten nakijken (online), of van dit toestel wissen. Daarna wordt alles van dat account op het toestel gewist.
  - Een accountwissel is uitloggen. Een unmount, een verlopen sessie of een herstart wist niets.
- **P3 — De demo blijft zoals ze is** (inhoud in `localStorage`, fictieve gegevens, alleen lokaal), duidelijk gemarkeerd als ontwikkelmodus.
- **P4 — Geen automatisch wissen zonder bevestiging** van onbevestigde identiteiten op het toestel (bijvoorbeeld na 30 dagen). Voorstel: niet automatisch, wel tonen. Wissen zonder bevestiging kan bij een later opnieuw invoeren tot een dubbele taak leiden.
- **P5 — Bewaartermijn van het serverregister** `private.shopping_commands`. Na het opruimen van een registerregel kan een héél late herhaling weer een bijwerking hebben. Voorstel: 90 dagen bewaren; daarna opruimen in de periodieke onderhoudstaak (nog te bouwen).

Tot er een besluit is, slaat deze ronde geen nieuwe gegevens op het toestel op. Het nieuwe serverregister bevat geen namen.
