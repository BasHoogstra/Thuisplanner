# Firebase Emulator-proeven

Geïsoleerde proeven voor stap 1.4.2 (besluit 9.4). Ze draaien uitsluitend tegen een lokaal gestarte
Firebase Realtime Database Emulator, met fictieve data. Ze lezen of schrijven nooit een echte planner,
gebruiken geen Firebase-project en publiceren geen regels.

| Bestand | Wat |
| --- | --- |
| `p1-3-proef.js` | P1-3: gedraagt de emulator zich bij ETag/if-match, lege locaties, schrijfvormen en regelevaluatie zoals productie? (NW-01) |
| `zonder-netwerk.py` | Hulpje voor `--netns`: zet loopback aan in een lege netwerknamespace en start de proef. |

## Eenmalig: de emulator-jar ophalen

Alleen de jar is nodig, geen login en geen project:

```
npx firebase-tools setup:emulators:database
```

Dat zet `firebase-database-emulator-v<versie>.jar` in `~/.cache/firebase/emulators/`. De proef
gebruikt de hoogste versie daar, of het pad uit `HUISPLAN_EMULATOR_JAR` of `--jar=<pad>`. Nodig: Java
11+ en Node 18+. Gemeten met v4.11.2 (sha256 `b70d9934…eb97f`, firebase-tools 15.32.1).

## Draaien

```
node tools/emulator/p1-3-proef.js --netns --out=tools/emulator/output
```

- `--netns` (aanbevolen, Linux): proef én emulator draaien in een eigen netwerknamespace zonder route
  naar buiten (`unshare -rn` + `python3`). Zonder deze optie geldt alleen de allowlist van het
  Node-proces; de emulator zelf is dan alleen door het luisteren op 127.0.0.1 begrensd.
- `--out=<map>`: schrijft `p1-3-rapport.md` en `p1-3-rapport.json` (de map `output/` staat niet in git).
- `--json`: alle resultaten als één JSON-regel (zo gebruikt `tests/emulatorproef.test.js` de proef).
- Exitcode 0 = alle harde controles geslaagd en geen afwijking van een bekende productieverwachting.

De proef draait ook mee in `node tests/run.js` (`tests/emulatorproef.test.js`), inclusief een
mutatietest die bewijst dat een te ruime regel echt wordt betrapt. Zonder jar slaat die test de
emulatordelen over.

## Isolatie

- **Allowlist in het proces:** elke socketverbinding naar iets anders dan `127.0.0.1:<emulatorpoort>`
  gooit een fout vóór er verbinding wordt gemaakt (controles N1–N3).
- **Netwerknamespace** (met `--netns`): ook een proces zonder allowlist, en de JVM van de emulator,
  kan niet naar buiten (controle N6).
- **Eigen namespace per run** in de emulator (`huisplan-p13-<willekeurig>`), fictieve data.
- `Authorization: Bearer owner` (beheerdersrechten van de emulator) wordt alleen gebruikt om de
  proefregels te laden, voor de opzet en voor controle-lezingen; nooit voor de gesimuleerde clients.

## Proefregels zijn geen voorstel

De regels in `p1-3-proef.js` (`PROEFREGELS`, met werknamen `bron`, `doel`, `ctl`) bestaan alleen om
de regelevaluatie van de emulator te meten. Ze zijn geen voorstel voor productie en worden nergens
gepubliceerd. Een voorstel voor regels en paden volgt pas na het E6-bewijs (NW-02), en het wijzigen
van Firebase-regels vraagt altijd een afzonderlijk, expliciet akkoord.
