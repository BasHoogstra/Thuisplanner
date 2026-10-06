# E3: cache en lokale opslag (NW-04)

**Status:** gebouwd in de testversie (`test/index.html`), niet live. Uitwerking van
`docs/identiteit-en-items.md` (3.2) en `docs/ontwerp-1.4.2.md` (3). Geen contract; bij
tegenstrijdigheid gaan die documenten voor.

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

## 2. Cache-identiteit

- **Sleutel:** `huisplanCache_` + de eerste 32 hexadecimale tekens van
  `SHA-256("huisplan-cache\n" + database-URL zonder slotslash + "\n" + plannersleutel + "\n" + opslaggeneratie)`.
  De plannersleutel staat dus niet leesbaar in de naam. Opslaggeneratie 1 is de Firebase-planner
  vóór 1.5. De SHA-256 is getest tegen de standaard.
- **Record:** `{format: 2, gen, id, app, data, base, t}`, plus `legacy: 'te-verwerken'` zolang er een
  oude cache bestaat. Wordt E2 (NW-03) geïntegreerd, dan komen `localGen` en `confirmedGen` erbij
  (ontwerp 3.1).
- **Oude cache** (`plannerCache_<plannersleutel>`, van vóór 1.4.2): blijft leesbaar als generatie 1 en
  wordt bij opstarten gebruikt als er nog geen nieuwe cache is. Hij wordt pas verwijderd na een verse
  serverlezing zonder lokale wijzigingen, en alleen als zijn eigen wijzigingen ten opzichte van zijn
  basis niets meer toevoegen aan de serverstand. Mislukt het verwijderen, dan is dat onschadelijk;
  het staat in de diagnose.
- **Een andere planner, database of generatie** heeft een andere sleutel en wordt nooit gelezen of
  samengevoegd. Staat er onder de eigen sleutel een record van een andere generatie of in een onbekend
  formaat, dan wordt dat behandeld als een beschadigde cache (zie 3).

## 3. Gedrag per foutsituatie

| Situatie | Gedrag | Test |
| --- | --- | --- |
| Cache schrijven mislukt (bijv. vol), met wijzigingen die nog niet op de server staan | Statusregel: "Je wijzigingen zijn nog niet veilig bewaard". Direct synchroniseren, zonder de wachttijd van 400 ms. "Opgeslagen" pas na bevestiging door de server. | T7a |
| Cache schrijven mislukt, zonder openstaande wijzigingen | Geen melding; wel in de diagnose. | T7a (na bevestiging) |
| Netwerk én opslag weg | Statusregel "Niet bewaard — … Houd de app open; we blijven het proberen". De wijziging blijft in het geheugen. Waarschuwing bij sluiten (`beforeunload`). Nooit "Opgeslagen" of "wordt bewaard". Herstel zodra er weer verbinding is. | T7b |
| Cache lezen gooit een fout | De cache geldt als "onbekend", niet als "leeg": hij wordt deze sessie niet overschreven. Melding; de app laadt van de server en slaat daar op. | T7c |
| Cache onleesbaar (kapotte JSON, onbekend formaat, andere generatie) | Eerst duurzaam apart bewaard (`huisplanCacheApart_<id>_<tijd>`), met een melding. Daarna mag de sleutel opnieuw gebruikt worden. | T7d, T8 |
| Onleesbare cache die niet apart bewaard kan worden | Blijft onaangeroerd; deze sessie wordt geen cache geschreven. | T7e |
| Verwijderen mislukt | Onschadelijk; diagnose. Geen foutmelding aan de gebruiker. | T7f |
| Koppeling (`plannerDbUrl`/`plannerKey`) niet op te slaan | De sessie werkt verder via de link, met de melding dat dit toestel de koppeling niet kan onthouden. | T7g |
| Veiligheidskopie vóór de ledenmigratie (1.4.1) niet duurzaam te bewaren | De migratie start niet. Er komt een melding, en de vragen komen deze sessie niet terug. | T6d |
| Hervatten na een fout | Een niet-opgeslagen wijziging in de cache wordt na heropenen samengevoegd en opgeslagen. | T6a, T6b, T6c |

Ook aangepast: na een export meldt de app niet meer "Back-up gedownload ✓". Of het bestand echt
bewaard is, kan de app niet zien; de bevestiging hoort bij E1 (herstelkopie).

## 4. Wat later naar productie moet (niet in deze stap)

De livegang gaat via een aparte PR, na akkoord, en het liefst samen met E2 (NW-03). Over te nemen in
`index.html`:

1. de opslagmodule (`bewaar`, `leesOpslag`, `bewaarDuurzaam`, diagnose, `sha256Hex`) en het
   omzetten van alle `localStorage`-toegang;
2. de cache per database, planner en generatie, met het overnemen en veilig opruimen van de oude
   cache;
3. de statusregel en de waarschuwing bij sluiten (`cacheRisk`, `showSyncStatus`);
4. het vangnet bij de ledenmigratie (`bewaarDuurzaam` vóór de migratie).

Bij het samenvoegen met E2 (PR #15) verandert de cache-opbouw. `writeCache` en `readCache` raken
beide; `localGen` en `confirmedGen` horen dan in het cacherecord.

## 5. Bekende risico's en open punten

- **Test- en live-versie delen op hetzelfde toestel `localStorage`** (zelfde origin). De testversie
  ruimt de oude cache alleen op als alles daaruit op de server staat. Gebruikt iemand daarna weer de
  live-versie, dan schrijft die opnieuw `plannerCache_…`; de testversie neemt dat bij de volgende
  opening veilig opnieuw mee. Dat is onschadelijk, maar wel dubbel werk.
- **De oude cache bevat geen database-URL.** Hij wordt aan de planner gekoppeld via de sleutel in de
  naam. Een planner met dezelfde sleutel in een andere database is in theorie mogelijk (een
  willekeurige sleutel van 32 tekens), maar niet uitgesloten.
- **Ledenvragen vóór het vangnet.** Bij een volle opslag stelt de app eerst de ledenvragen en merkt
  daarna pas dat de veiligheidskopie niet lukt; de antwoorden worden dan niet gebruikt. Een
  opslagcontrole vóór de vragen (`gezond()`) zou dat voorkomen. Dat is niet gebouwd: het is een
  UX-keuze, en de schakelaar voor deze migratie staat alleen op toestellen van de producteigenaar.
- **Een geslaagde opslagproef zegt niets over grote records.** Een migratie moet daarom
  `bewaarDuurzaam` gebruiken op de echte herstelkopie zelf, niet alleen `gezond()`.
- **Open data-veiligheidspunt P1-11** (een lijst met gaten wordt door `normalizeData` leeg
  teruggeschreven; zie PR #15) valt buiten E3. Het is hier niet opgelost.
