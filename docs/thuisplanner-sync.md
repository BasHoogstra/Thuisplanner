# Thuisplanner KG-5D: synchronisatie tussen gezinsleden (bouwplan stap 3)

**Status:** gebouwd en lokaal getest op een eigen branch, als aparte PR boven op PR #21. Niet gemerged, niet gedeployd.

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
 │    - acties          │ ◀─── seintje ──────── │      op household:<id>         │ ws     │    - status/meldingen│
 └──────────────────────┘                       │  RLS op realtime.messages:     │        └──────────────────────┘
                                                │   alleen actieve leden luisteren│
                                                └───────────────────────────────┘
```

### Server (migratie `20261015120000_kg5d_realtime.sql`)

- **Seintjes:** een trigger op `events`, `tasks`, `shopping_items`, `household_members` en `households` roept `realtime.send` aan op het private kanaal `household:<id>`.
  - Inhoud van het seintje: **alleen** `{t, id, v, op}`, dus tabel, id, versie en handeling (I/U/D).
  - Nooit titels, namen, notities of account-ID's.
  - Wordt het huishouden zelf verwijderd, dan volgt één seintje in plaats van één per rij.
  - Seintjes worden pas verstuurd na COMMIT (ze lopen via `realtime.messages`), dus bij een rollback gaat er niets uit.
- **Toegang:** RLS op `realtime.messages`.
  - Alleen `broadcast`, en alleen als de kanaalnaam exact `household:<uuid>` is van een huishouden waar je **actief** lid van bent (`private.my_household_ids()`).
  - Er is geen insert-beleid: geen client kan zelf op een huishoudkanaal zenden. Alleen de database zendt.
  - Presence is uitgesloten.
- **`postgres_changes`** blijft uit: geen enkele tabel staat in een publicatie (KG-T27).

### Client (`komtgoed/sync/thuisplanner-sync.js`)

- **Online eerst.** Elke ophaalronde controleert eerst het lidmaatschap (`my_memberships`). Daarna haalt ze boodschappen, taken, afspraken (`event_overview`) en leden op, alleen met expliciete kolommen en alleen wat RLS teruggeeft.
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
  - **Toevoegen** gaat met een UUID van de client; een herhaalde opdracht slaat niets dubbel op.
  - **Wijzigen, afvinken en verwijderen** van boodschappen en taken gebeuren met `... where id = x and version = v`. Raakt dat 0 rijen, dan is er een **conflict**: de module zet een melding, haalt de nieuwste stand op, en er gaat niets verloren.
  - **Afspraken** gaan via `save_event` en `delete_event`; `PT409` (HTTP 409) betekent conflict.
  - **Zonder verbinding** wordt er niet opgeslagen (melding "Geen verbinding…"), en een optimistische wijziging wordt teruggedraaid. Een wachtrij voor offline wijzigingen komt later, volgens het bouwplan.
- **Toegang weg** (vertrek, archiveren, huishouden verwijderd):
  - de ophaalronde ziet geen lidmaatschap meer;
  - de module wist **alle** gegevens uit het geheugen, stopt het kanaal en zet de status op `geen-toegang`.
  - Het ledenseintje van de intrekking zelf brengt dit binnen seconden; het vangnet vangt een gemist seintje op.
- **Stoppen** (uitloggen, ander huishouden kiezen) wist alles en sluit het kanaal.
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
| `demo/paneel.html`, `demo/paneel.js` | Eén paneel:<br>- status ("Laden…", "Live verbonden", "Synchroniseren…", "Geen verbinding", "Geen toegang");<br>- boodschappenlijst (toevoegen, afvinken, wijzigen met versie, verwijderen);<br>- afspraken ("Bezet" bij andermans privé);<br>- knop "Verbinding verbreken (simulatie)". |

## 3. Beveiligingskeuzes

| Risico | Keuze |
| --- | --- |
| Privé-inhoud via realtime | Alleen seintjes zonder inhoud; inhoud komt via `event_overview`/`event_details` met RLS (gate 9). `postgres_changes` staat uit. |
| Meeluisteren door een ander huishouden | RLS op `realtime.messages` met exacte kanaalnaam en actief lidmaatschap. Een buitenstaander krijgt een expliciete weigering. |
| Nep-seintjes van een client | Geen insert-beleid: alleen de database zendt. |
| Oude gegevens na intrekking of wisseling | Lidmaatschapscontrole bij elke ophaalronde; bij verlies alles wissen. Ledenseintje plus vangnet van 30 s. Realtime controleert het beleid bij het (her)verbinden: een gearchiveerd lid kan na een herverbinding niet meer luisteren. |
| Service-role-sleutel in de browser | Nooit; alleen in node (tests, seed). De server serveert alleen de anon-sleutel. |
| Lekken via foutmeldingen | Publieke functies geven geen DETAIL/HINT (KG-5C herstelronde 2). De client toont alleen vaste meldingen. |
| Dubbele verwerking | UUID's van de client, versies en het overslaan van bekende seintjes. |
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

Opnieuw beginnen: `npm run seed` (verwijdert de demo-accounts en maakt ze opnieuw aan). Afsluiten: `npx supabase@2.117.0 stop` in `komtgoed/`.

Schermafdrukken van de geautomatiseerde e2e-run staan in `docs/afbeeldingen/thuisplanner-sync-*.png`:

- `0-overzicht`: beide panelen;
- `2-live`: live meekijken;
- `3-offline`: geen verbinding;
- `4-conflict`: conflictmelding;
- `5-privacy`: privé bij Anna, "Bezet" bij Bram;
- `6-geen-toegang`: na intrekken van de toegang.

## 5. Tests

| Laag | Bestand | Wat |
| --- | --- | --- |
| Database | `rls_tests.sql` KG-T47 | Seintjes alleen `{t,id,v,op}`, zonder inhoud of account-ID's, voor boodschappen, afspraken (ook privé) en taken. Luisteren: lid ja; buitenstaander, gearchiveerd lid, afwijkende of lege kanaalnaam nee. Presence nee. Zelf zenden nee. |
| Database | `rls_tests.sql` KG-T48 | Catalogus: elke inhouds-, leden- en huishoudtabel zendt een seintje; de seintjesfuncties noemen geen inhoudskolommen; geen schrijfbeleid op `realtime.messages`. |
| Tegenproeven | `tegenproeven.txt` | Vier nieuwe: een seintje met de hele rij, een open leesbeleid, een zendbeleid voor clients, een ontbrekende trigger. |
| Synchronisatie | `integratie/sync.test.mjs` | Zeven tests met aparte accounts en sessies; zie het overzicht hieronder. |
| Realtime-toegang | `integratie/integratie.test.mjs` | Buitenstaander krijgt een expliciete weigering, lid komt binnen, zelf zenden lukt niet. |
| Demo e2e | `komtgoed/dev/tests/demo.e2e.mjs` | Vijf tests met twee **echte browsersessies** (Playwright, Chromium, eigen context per account); zie het overzicht hieronder. |
| Statisch | `statisch.js` | De browsercode noemt nooit de service-role-sleutel; de sync-module logt niet. |

**Synchronisatie (`sync.test.mjs`):**

- A voegt toe, vinkt af, hernoemt en verwijdert; B ziet het zonder verversen. Ook taken.
- Geen dubbele verwerking: herhaalde opdracht met dezelfde UUID, een salvo van seintjes (≤ 2 ophaalrondes), bekende versies worden overgeslagen.
- Gelijktijdig wijzigen: conflictmelding, gelijktijdig afvinken (precies één wint), afspraak met verouderde versie.
- Netwerk weg en terug: HTTP **en** websocket geblokkeerd, status offline, mislukte toevoeging teruggedraaid, gemiste wijziging na herstel binnen, daarna weer live.
- Huishoudisolatie: geen toegang, geen gegevens, kanaal geweigerd, geen seintjes uit een ander huishouden.
- Privacy: "Bezet" bij B; geen privé-tekst in de cache van B of in ruwe kanaalberichten; geen account-ID's in seintjes.
- Intrekking tijdens een sessie (archiveren): geen toegang, geheugen leeg, daarna niets meer binnen; stoppen wist alles.

**Demo e2e (`demo.e2e.mjs`):**

- Live A → B en B → A zonder verversen.
- Browsercontext offline en weer online, met de gemiste wijziging.
- Conflict via de wijzigknop.
- Privacy: scherm, HTML, clientcache en **elk HTTP-antwoord en websocketframe** naar Bram zonder privé-tekst.
- Intrekking tijdens de sessie: "Geen toegang", lege lijst, leeg geheugen.

In CI draaien de database-, integratie-, sync- en e2e-tests in de job `supabase-lokaal`, op een verse lokale stack.

## 6. Bekende grenzen en open punten

- **Realtime controleert toegang bij het verbinden.** Een lid dat tijdens een open verbinding wordt gearchiveerd, kan tot de volgende herverbinding nog **seintjes** ontvangen (zonder inhoud). De client merkt de intrekking bij de eerstvolgende ophaalronde en wist alles. Het ledenseintje zorgt dat dat binnen seconden gebeurt.
- **Geen offline-wachtrij:** zonder verbinding wordt er niet opgeslagen (bouwplan: "online eerst").
- **De demo logt automatisch in** met vaste fictieve accounts en een lokaal wachtwoord. Het is alleen een ontwikkelpagina; inloggen met een e-mailcode is stap 7.
- **De demo toont boodschappen en afspraken.** Taken en afspraken bewerken kan via de module (en is getest), maar heeft geen eigen knoppen in de demo.
- **Nog niet gedaan:**
  - de herindeling van de React-app (stap 4, wacht op akkoord over de bibliotheken);
  - de koppeling met de schermen uit PR #20.
