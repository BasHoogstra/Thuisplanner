# Dataformaat Huisplan — versie 1

Dit beschrijft de data zoals de app die vandaag (testversie 1.0.19, live-versie gelijkwaardig)
leest en schrijft. Het is het vertrekpunt voor de verhuizing in fase 1. Het bijbehorende
JSON-schema staat in [`dataformaat-v1.schema.json`](dataformaat-v1.schema.json) en wordt door
`tests/schema.test.js` gecontroleerd tegen de testdata en tegen wat de app werkelijk opslaat.

## Opslag

- Eén JSON-document per huishouden: Firebase Realtime Database, `/planners/{plannersleutel}.json`.
  Iedereen met de sleutel (de deellink) kan lezen en schrijven.
- Opslaan = het hele document vervangen (PUT) met een ETag (`if-match`). Bij een conflict (412)
  haalt de app de nieuwste versie op, voegt per veld samen (`merge3`, lijsten per `id`) en probeert
  opnieuw.
- Elk toestel bewaart een kopie in `localStorage` onder `plannerCache_{sleutel}` en controleert
  elke 15 seconden op wijzigingen.
- **Firebase bewaart geen `null`, lege tekst, lege lijsten of lege objecten.** Wat leeg is, komt
  niet terug. De app vult dat bij het laden aan (`normalizeData`). Lezers van deze data moeten
  er dus altijd van uitgaan dat een veld kan ontbreken.
- Bekend gedrag: op een toestel zonder lokale kopie slaat de eerste keer laden het document één
  keer terug (inhoud gelijk). Zie `docs/fase1-notities.md`.

## Afspraken

| Wat | Vorm |
|---|---|
| Datum | `"JJJJ-MM-DD"` in lokale tijd (bv. `"2026-10-02"`). Ook als sleutel in `tasks`, `notes`, `recurringDone`, `gewoontenDone`, `maaltijdplan`, `wieIsWaar`. |
| Verjaardag | `"MM-DD"`, met los `jaar` (mag ontbreken). |
| Tijdstempel | `ts` in milliseconden (huisgeheugen) of ISO-tekst (`inbox.addedAt`). |
| `id` | Tekst, door de app gemaakt (`Date.now` in base36 + 5 willekeurige tekens). Uniek binnen het document. Oudere data kan andere id's hebben. |
| Persoon | De **naam** zoals ingesteld (bv. `"Bas"`). Oude data kan `"me"`/`"partner"` bevatten; de app zet die bij het laden om naar namen (zie `tests/roundtrip.test.js`). |
| Prioriteit | `"hoog"`, `"normaal"`, `"laag"`. |
| Onbekende velden | Blijven staan. Elke app-versie moet velden die zij niet kent ongemoeid laten. |

## `meta` (nieuw in schemaversie 1)

| Veld | Betekenis |
|---|---|
| `schemaVersion` | `1`. De testversie (vanaf 1.0.19) zet dit **alleen mee bij een opslag die toch al gebeurt**; alleen openen veroorzaakt geen extra schrijfactie. Een bestaande waarde wordt nooit overschreven. De live-versie laat het veld staan (getest). |
| `migratedTo` | `{ url }` — gezet door de verhuizing in fase 1. Vanaf 1.0.1 stopt de app dan met opslaan en toont een melding. |
| `minAppVersion` | bv. `"1.1.0"` — is de app ouder, dan stopt die met opslaan en vraagt om te verversen. |
| `members` | Vanaf 1.4.0: `{version: 1, migratedAt, app, decisions}`. Status van het ledenregister; `decisions` bevat de antwoorden op twijfelgevallen (`"lois\|loïs": "same"` of `"different"`). |

## Velden

Alle velden zijn optioneel (zie Firebase hierboven). Tussen haakjes de standaard die de app invult.

### Planning
- **`tasks`** (`{}`) — per datum een lijst taken: `id`, `text`, `done`, `category`, `priority`,
  `assignedTo`, `author`, `orderStatus` (`open`/`besteld`/`geleverd`/null), optioneel `period`
  (`ochtend`/`middag`/`avond`), `reminder` `{date,time}`, `reactions` `{emoji: [namen]}`,
  `movedFrom` (oorspronkelijke datum, vanaf 1.0.4).
- **`notes`** (`{}`) — per datum een dagnotitie (tekst).
- **`recurring`** (`[]`) — vaste taken: `id`, `text`, `interval` (`week` (standaard)/`biweek`/`month`/`year`),
  `days` (0 = maandag … 6 = zondag), `everyWeeks`, `anchorDate`, `dayOfMonth`, `koppelgesprek`,
  `category`, `priority`, `createdAt`.
- **`recurringDone`** (`{}`) — per datum de id's van vaste taken die gedaan of overgeslagen zijn.
- **`multiDayTasks`** (`[]`) — zoals een taak, plus `startDate` en `endDate`.
- **`inbox`** (`[]`) — "+ Toevoegen": `id`, `text`, `addedBy`, `addedAt`.
- **`backlog`** (`[]`) — "Ooit": `id`, `text`, `category`, `priority`, `addedDate`.

### Boodschappen en lijsten
- **`boodschappen`** (`[]`) — `id`, `text`, `done`, `cat`, `winkel`, `addedBy`, `addedDate`, optioneel `qty`.
- **`vasteBoodschappen`** (`[]`) — `id`, `text`.
- **`boodschappenHistory`** (`[]`) — `text`, `norm`, `date` (voor suggesties; zonder id).
- **`boodCatOverrides`** (`{}`) — genormaliseerde naam → categorie.
- **`winkels`**, **`winkelsSet`** — winkellijst en of die is ingesteld.
- **`lijsten`** (`[]`) — eigen lijsten: `id`, `naam`, `items` (`id`, `text`, `done`, `addedBy`, `addedDate`).
  Vaste id's `te-bestellen` en `overige-winkels`. **`lijstenSeeded`** voorkomt dat ze opnieuw worden aangemaakt.
- **`bestellingen`** (`[]`) — `id`, `text`, `status` (`open`/`besteld`/`geleverd`), `category`,
  `assignedTo`, `addedDate`, `expectedDate`, `note`, `tracking`, `addedBy`.

### Huis
- **`onderhoud`** (`[]`) — `id`, `text`, `lastDone`, `intervalDays`, `intervalLabel`, `category`,
  `note`, `foto` (data-URL), `log` (`[{date,note}]`).
- **`garanties`** (`[]`) — `id`, `text`, `gekocht`, `verloopt`, `winkel`, `serienummer`, `note`, `foto`.
- **`vervaldata`** (`[]`) — Kluis: `id`, `naam`, `categorie`, `vervaldatum`, `herinnering` (dagen), `notitie`.
- **`huisgeheugen`** (`[]`) — `id`, `type`, `tekst`, `datum`, `auteur`, `ts`. Nieuwste eerst.
- **`budget`** (`[]`) — vaste lasten: `id`, `cat`, `naam`, `instantie`, `periode`, `bedrag`,
  `bedragNieuw`, `advies`. **`budgetCustomCats`**, **`budgetSeeded`**.

### Gezin
- **`vakanties`** (`[]`) — `id`, `naam`, `startDatum`, `bestemming`, `paklijst` (`{persoon: [items]}`),
  `todos`, `notes`, `budget` `{bedrag, uitgaven:[{desc,amount,date}]}`, en `_tab` (schermstand,
  zie fase-1-notities).
- **`vakantiePersonen`** (standaard: de twee ingestelde namen) — namen voor paklijsten en Wie is waar.
- **`members`** (vanaf 1.4.0, ontbreekt tot de migratie) — ledenregister: `id` (`m_` + 16 hex, afgeleid van de
  genormaliseerde naam en daarna vast), `name`, `kind` (`adult`/`child`/`unknown`; bij de migratie
  `unknown`), `color`, optioneel `aliases` (andere schrijfwijzen die als dezelfde persoon zijn bevestigd).
  De namen in de rest van de data blijven ongewijzigd (omzetten naar ID's is stap 1.5).
- **`wieIsWaar`** (`{}`) — per datum `{naam: status}`; status o.a. `thuis`, `werk`, `reis`, `sporten`, `afwezig`.
- **`verjaardagen`** (`[]`) — `id`, `naam`, `datum` (`MM-DD`), `jaar`.
- **`verlanglijstjes`** (`{}`) — per naam: `id`, `text`, `claimedBy`, `addedAt`.
- **`gewoonten`** (`[]`) — `id`, `text`, `icon`, `createdDate`. **`gewoontenDone`** (`{}`) — per datum id's.
- **`recepten`** (`[]`) — `id`, `naam`, `categorie`, `link`, `notitie`, `ingredienten` (teksten).
- **`maaltijdplan`** (`{}`) — per datum `{type:'recept', receptId, naam, ingredienten}` of `{type:'vrij', tekst}`.
- **`notities`** (`[]`) — `id`, `titel`, `tekst`, `editedBy`, `editedAt`.
- **`notitieboek`**, **`notitieboekMeta`** — oud vrij notitieboek (tekst).

### Niet meer zichtbaar, wel bewaard
- **`cadeaus`** — oude cadeaulijst (`id`, `text`, `done`).
- **`briefjes`** — oude koelkastbriefjes. De code die ze toonde werd al niet meer aangeroepen en is
  in 1.0.18 verwijderd; de data blijft onaangeroerd.

## Alleen op het toestel (niet gedeeld)

`localStorage`: `plannerDbUrl`, `plannerKey`, `plannerMyName`, `plannerPartnerName`, `plannerCity`,
`plannerCache_{sleutel}`, kleuren (`plannerAccent…`), schermvoorkeuren (`plannerHeroPills`,
`plannerLijstDicht`, `plannerBoodDoneOpen`, `plannerMeerClicks`), `plannerOpt…` (extra lagen op
Vandaag, 1.0.17), en "al gezien"-markeringen (`briefingShown`, `seasonDismissed_…`,
`weekScoreDismissed_…`, `iosBannerDismissed`, `plannerSecWarned`).
Vanaf 1.4.0: `plannerMemberId` (wie ben jij op dit toestel: het `id` uit `members`),
`plannerLedenregister` (`aan` = dit toestel mag het register aanmaken/aanvullen) en
`plannerLedenBackup` (vangnet van vóór de eerste migratie op dit toestel).
