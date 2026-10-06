# P1-3: emulatorproef (NW-01)

**Status: onderzoek afgerond; besloten (optie A, zie 5).** Dit document beantwoordt de
onderzoeksvraag P1-3 uit `docs/ontwerp-1.4.2.md` (sectie 10) en voorwaarde 4 uit sectie 7.7. Het is
geen contract. Op 6 oktober 2026 heeft de producteigenaar optie A goedgekeurd: de Firebase Emulator is
de bewijsomgeving voor P1-3, binnen de beperkingen en onbekenden die hieronder zijn beschreven.

- **Uitgevoerd:** 6 oktober 2026, nachtwerkpakket NW-01.
- **Niet aangeraakt:** echte Firebase-projecten of plannerdata, Firebase-regels, Supabase, de app
  (`index.html`, `test/index.html`). Geen migratie.
- **Volledige meting:** `docs/p1-3-emulatorproef-meting.md` (gegenereerd, 74 controles).
- **Reproduceren:** `node tools/emulator/p1-3-proef.js --netns --out=tools/emulator/output`
  (zie `tools/emulator/README.md`). Draait ook mee in `node tests/run.js`.

## 1. Hervatting: de eerdere proefbestanden

Het nachtwerkplan vraagt eerst de onafgemaakte P1-3-proefbestanden te controleren. Die zijn **niet
teruggevonden**: niet in de werkmap, niet op `main` en niet op een van de remote branches (doorzocht
op emulator-, `firebase.json`- en regelbestanden). Ze stonden waarschijnlijk alleen in de
tijdelijke omgeving van een eerdere sessie. De proef is daarom opnieuw en reproduceerbaar opgezet,
met de twee eerdere harnascorrecties uit het nachtwerkplan als harde regels:

1. **Een leeg object is geen geldige persisted-control.** `PUT {}` geeft in de emulator 200, maar
   er wordt niets opgeslagen (controles L1, L1b, S1, S1b). Een proef mag `{}` dus nooit als gezet
   slot of control-gedeelte tellen.
2. **Weigering = aantoonbaar, niet "HTTP 401".** Elke weigering wordt getoetst als: geen 2xx-status
   én een controle-lezing toont exact dezelfde data als ervoor. Dat is nodig omdat een weigering ook
   als 412 kan binnenkomen (E13).

Bij het opnieuw opzetten is één nieuwe harnasfout gevonden en hersteld: een controle-lezing op een
verkeerd pad gaf een foutobject terug, waardoor "data ongewijzigd" altijd waar zou zijn. De
controle-lezing faalt nu hard bij elk antwoord anders dan 200.

## 2. Opzet

- Firebase Realtime Database Emulator v4.11.2, lokaal gestart, luistert alleen op 127.0.0.1.
- Harde lokale netwerkallowlist in het proefproces, plus (met `--netns`) een eigen
  netwerknamespace zonder route naar buiten voor proef én emulator.
- Eigen willekeurige namespace per run; alleen fictieve data.
- Proefregels met de werknamen uit het ontwerp (`bron`, `doel`, `ctl` met `slot`). Die regels zijn
  alleen meetinstrument, geen voorstel (zie `tools/emulator/README.md`).
- **Mutatietest:** dezelfde proef met een open bronregel moet mislukken, en doet dat (17 controles
  mislukt). Zo is aangetoond dat de proef een te ruime regel echt betrapt.
- **Stabiliteit:** 6 opeenvolgende runs geslaagd, 4 mutatieruns telkens met dezelfde 17 fouten.
  Eén eerdere run tijdens de ontwikkeling stopte met `ECONNREFUSED` en was niet te reproduceren.
  Daarom zijn toegevoegd: een gereedheidscontrole (eerst een geslaagd verzoek, dan pas meten) en
  de emulatorlog in de foutmelding als de emulator stopt.

## 3. Uitkomst

| Oordeel | Aantal | Betekenis |
| --- | --- | --- |
| geslaagd | 43 | Harde controles van de proef (isolatie; weigering aantoonbaar zonder datawijziging). |
| gelijk | 23 | Emulator = bekende productieverwachting. |
| onbekend | 7 | Productiegedrag niet bekend; emulatorgedrag vastgelegd. |
| emulator | 1 | Bewust emulator-eigen (beheerdersrechten). |
| afwijkend | 0 | Geen afwijking van een bekende productieverwachting gevonden. |
| mislukt | 0 | |

**Bron van de productieverwachting.** Slechts vier punten zijn in productie zelf gemeten (handmatig,
3 oktober 2026, `docs/fase1-notities.md`, 9): de ETag is via CORS leesbaar, de preflight staat een
PUT met `If-Match` toe, en een PUT met een actuele `If-Match` geeft 200 (E3, E4, E6). De overige
"gelijk"-oordelen vergelijken met de Firebase-documentatie, **niet met een meting in productie**.

### 3.1 Wat in de emulator gelijk is aan de bekende productieverwachting

- **ETag:** `X-Firebase-ETag: true` geeft een ETag; zonder die header niet. Een lege locatie geeft
  `null` met ETag `null_etag`. Het antwoord op een PUT geeft de nieuwe ETag. Een PUT met een
  verouderde `if-match` geeft 412, laat de data ongewijzigd en stuurt de actuele waarde en ETag mee.
  `if-match: null_etag` werkt als "alleen schrijven als leeg" (E1–E8).
- **Lege locaties:** `{}`, geneste lege objecten en lege lijsten worden niet opgeslagen; `null` wist;
  lijsten met gaten komen terug als lijst met `null` of als object, afhankelijk van hoeveel sleutels
  er zijn (L1–L6).
- **Regels:** cascade (een toestemming hoger in de boom is niet lager in te trekken); een schrijfactie
  op een ouder kijkt alleen naar regels op dat pad en erboven; `.validate` van kinderen telt mee,
  maar niet bij verwijderen; een PATCH op meerdere paden is atomair en wordt per pad beoordeeld;
  `root` is de stand vóór de schrijfactie; weigering is 401 "Permission denied" (R1–R7, R10).
- **Schrijfvormen tegen een proefslot:** na het zetten van het slot zijn alle 19 onderzochte
  schrijfvormen op de bron aantoonbaar geweigerd: PUT (met en zonder `if-match`, met
  `print=silent`), PATCH, PATCH met `null`, DELETE (met en zonder `if-match`), subpad
  (PUT/PATCH/DELETE), **POST** (de historische sendBeacon-vorm, ook als `text/plain`) op de bron en
  op een subpad, PUT/PATCH op de ouder, PATCH op meerdere paden (via ouder en root, ook gemengd
  met een toegestaan doelpad), PUT en DELETE op root. Het slot zelf kon niet leeg, dubbel, via de
  ouder, via PATCH of via een subpad worden gezet, gewijzigd of gewist (S0–S31).

### 3.2 Verschillen tussen emulator en productie (benoemd)

| # | Verschil | Gevolg |
| --- | --- | --- |
| V1 | `Authorization: Bearer owner` omzeilt in de emulator alle regels (R9). Productie kent dit niet. | De proef gebruikt dit alleen voor opzet en controle-lezingen. |
| V2 | Regels worden in de emulator direct via `/.settings/rules.json` geladen; productie via console of CLI. | Niet relevant voor het gedrag; het laden van regels in productie is hier uitdrukkelijk niet gedaan. |
| V3 | Geen TLS; database gekozen via `?ns=`; elke namespace bestaat vanzelf. Productie: één URL per database-instantie. | Alleen transport; geen invloed op de gemeten semantiek. |
| V4 | De emulator weerspiegelt elke `Origin` in CORS. In productie is alleen bevestigd dat de ETag leesbaar is. | Toegestane origins in productie niet onderzocht; niet nodig voor P1-3. |
| V5 | Limieten en quota (grootte van een schrijfactie, aantal verbindingen, snelheid) zijn niet onderzocht en worden niet nagebootst. | Relevant voor een migrator die een hele planner in één keer schrijft; los te toetsen. |
| V6 | Of de regelmotor van de emulator exact die van productie is, is hier niet te verifiëren. | De "gelijk"-oordelen zijn gelijk aan de documentatie, niet aan een productiemeting. |

### 3.3 Productiegedrag onbekend (vastgelegd in de emulator)

| ID | Emulator | Ontwerpregel die het onbekende omzeilt |
| --- | --- | --- |
| E9 | De ETag hangt alleen af van de inhoud: na A→B→A geldt de oude ETag weer; ander pad met dezelfde inhoud geeft dezelfde ETag. | Een slot of migratiestatus nooit op een ETag laten leunen, alleen op regels. Een ETag beschermt tegen inhoudsverschil, niet tegen een tussentijdse schrijfactie die op dezelfde inhoud uitkomt. |
| E10 | `if-match` bij PATCH en POST geeft 400 ("not supported with GET, PATCH or POST"). | Alle voorwaardelijke schrijfacties (E2 en de migrator) zijn PUT (of DELETE); geen voorwaardelijke PATCH. |
| E11 | DELETE met `if-match` is voorwaardelijk (412 / 200). | Niet op leunen tot het in productie is bevestigd. |
| E12 | Een onzinnige `if-match` geeft 412. | Geen. |
| E13 | Een verouderde `if-match` op een pad zonder schrijfrecht geeft 412 als het pad leesbaar is, en 401 als het niet leesbaar is (zonder datalek, E14). | De client (E2, regel 9) leest bij 412 én bij 401/403 opnieuw en controleert dan het slot; een 412 is niet per se "alleen een conflict". |
| L7 | Lijst met precies de helft van de sleutels over komt terug als lijst. | Migrator en classificatie (E5) kunnen beide vormen aan. |
| L8 | `""` wordt opgeslagen als lege tekst. | Geen. |

## 4. Bevindingen voor het ontwerp

1. **Plaats van het slot hangt af van de werkelijke regels (P1-1).** Regels cascaderen (R1): staat
   in productie boven de bron een `.write` die toestemming geeft (bijvoorbeeld op
   `planners/$key`), dan kan geen enkele regel lager in de boom die toestemming intrekken. Het slot
   moet dus worden afgedwongen op of boven het hoogste pad dat nu schrijven toestaat. Het E6-ontwerp
   (NW-02) moet daarom aansluiten op de uitkomst van P1-1 (de werkelijke regels; eerder onderzocht).
2. **`.validate` beschermt niet tegen verwijderen** (R4). Het slot en de bron moeten met `.write`
   worden beschermd.
3. **Slot en doel kunnen niet in één schrijfactie** (R7): `root` in een regel is de stand vóór de
   schrijfactie. Dat past bij de statusvolgorde uit het ontwerp (eerst slot, dan zelftest, dan doel).
4. **Een oude POST-schrijver** (sendBeacon) overschrijft niet maar voegt een volledige kopie toe
   onder een push-ID (S0b). Het slot moet POST op de bron en elk subpad net zo weigeren; in de proef
   doet het dat (S21, S22). In de git-geschiedenis van deze repository (vanaf 1 oktober 2026) staat
   geen `navigator.sendBeacon`-aanroep meer; of er nog een versie met deze schrijver in gebruik kan
   zijn, volgt uit de (eerder uitgevoerde) inventarisatie van oude clients (P1-2).
5. **Open data-veiligheidspunt: lijst met gaten (buiten NW-01, niet hersteld). Moet vóór 1.5 zijn
   opgelost of aantoonbaar onschadelijk zijn bewezen** (zie ook `docs/ontwerp-1.4.2.md`, P1-11).
   Firebase geeft een lijst waarin minder dan de helft van de sleutels over is terug als object
   (L6). `normalizeData` in de app zet zo'n object niet terug naar een lijst, maar vervangt een lijst
   op het hoogste niveau (bijvoorbeeld `boodschappen`) door `[]`. Nagespeeld met de nagebootste
   database: zowel `test/index.html` als `index.html` schrijven bij de eerste keer laden zo'n lijst
   leeg terug. Zo'n lijst ontstaat alleen als de server gaten in een lijst krijgt (bijvoorbeeld door
   een andere schrijver die één element verwijdert, of `null`-elementen vooraan); de app zelf
   schrijft altijd hele lijsten. Voorstel: meenemen in E5 (classificatie: komen lijsten als object
   voor?) en in E2/E3 (object met numerieke sleutels terugzetten naar een lijst in plaats van
   leegmaken), als apart pakket met eigen tests. Niet stil aangepast, omdat dit de live-app raakt.
   Het besluit over P1-3 verandert hier niets aan: dit punt blijft open.

## 5. Besluit P1-3: optie A (6 oktober 2026)

**Genomen door de producteigenaar:** de Firebase Emulator is aanvaard als bewijsomgeving voor P1-3,
onder de beschreven beperkingen en onbekenden. Daarbij geldt:

- het E6-bewijs leunt alleen op gedrag met het oordeel "gelijk" (3.1), niet op de onbekende punten
  uit 3.3; de ontwerpregels in 3.3 worden onderdeel van E2 en E6;
- de verschillen V1–V6 (3.2) zijn de bekende beperkingen van deze bewijsomgeving;
- het bewijs geldt alleen voor regels die aantoonbaar dezelfde vorm hebben als de werkelijke regels
  (P1-1, eerder onderzocht; zie bevinding 1).

**Wat dit besluit niet toestaat:** geen wijziging aan of publicatie van productie-Firebase-regels, geen
productiedata, geen Supabase-wijziging, en geen migratie of activering van een slot. Daarvoor blijft
telkens een afzonderlijk, expliciet akkoord nodig (besluiten 7, 8 en 9.3). Een echt Firebase-testproject
(de verworpen optie B) vraagt eveneens een afzonderlijk akkoord.

**Niet gekozen:** optie B, aanvullend meten in een echt, leeg Firebase-testproject.

**Gevolg:** P1-3 wacht niet meer op een besluit. NW-02 (het E6-bewijs) is nog niet gestart; de start
gebeurt pas op aanwijzing van de producteigenaar. Het open data-veiligheidspunt uit bevinding 5 staat
los van dit besluit en blijft open.
