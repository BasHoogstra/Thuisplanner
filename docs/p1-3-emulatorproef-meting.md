# P1-3 emulatorproef: rapport

Gegenereerd door `node tools/emulator/p1-3-proef.js`. Alleen fictieve data; harde lokale netwerkallowlist.

- Emulator: `firebase-database-emulator-v4.11.2.jar`
- Node: v22.22.0
- Namespace: willekeurig per run (`huisplan-p13-…`)
- Eigen netwerknamespace (--netns): ja

| Oordeel | Aantal |
| --- | --- |
| geslaagd | 43 |
| gelijk | 23 |
| onbekend | 7 |
| emulator | 1 |
| niet-uitgevoerd | 0 |
| afwijkend | 0 |
| mislukt | 0 |


## N · netwerkisolatie

| ID | Controle | Verwachting | Bron | Emulator | Oordeel |
| --- | --- | --- | --- | --- | --- |
| N1 | Verzoek naar een niet-lokaal adres | AllowlistFout vóór verbinding | harde controle van de proef | AllowlistFout | geslaagd |
| N2 | Rechtstreekse socket naar een niet-lokaal adres (globale bewaking) | AllowlistFout | harde controle van de proef | AllowlistFout | geslaagd |
| N3 | Lokaal, maar een andere poort dan de emulator | AllowlistFout | harde controle van de proef | AllowlistFout | geslaagd |
| N4 | Emulator luistert alleen op loopback | 127.0.0.1 | harde controle van de proef | 127.0.0.1 | geslaagd |
| N6 | Eigen netwerknamespace: ook buiten de allowlist (en voor de JVM) geen route naar buiten | geen verbinding (bijv. ENETUNREACH) | harde controle van de proef | ENETUNREACH | geslaagd |
| N5 | Eigen, willekeurige namespace voor deze run | huisplan-p13-<willekeurig> | harde controle van de proef | huisplan-p13-<willekeurig> | geslaagd |

## E · ETag en if-match

| ID | Controle | Verwachting | Bron | Emulator | Oordeel |
| --- | --- | --- | --- | --- | --- |
| E1 | GET op lege locatie met X-Firebase-ETag | 200, body null, ETag "null_etag" | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | 200, body null, ETag null_etag | gelijk |
| E2 | GET zonder X-Firebase-ETag | geen ETag-header | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | geen ETag-header | gelijk |
| E3 | CORS: ETag leesbaar voor de browser-app | Access-Control-Expose-Headers: ETag | productie, handmatig bevestigd 3 okt 2026 (docs/fase1-notities.md, 9) | ETag | gelijk |
| E4 | CORS-preflight voor PUT met if-match | toegestaan (anders kon de app in productie geen PUT met If-Match doen) | productie, handmatig bevestigd 3 okt 2026 (docs/fase1-notities.md, 9) | 200, methods OPTIONS,GET,POST,PUT,DELETE,PATCH, headers content-type,if-match,x-firebase-etag | gelijk |
| E5 | PUT-antwoord geeft de nieuwe ETag, gelijk aan die van een GET daarna | gelijk | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | gelijk | gelijk |
| E6 | PUT met actuele if-match | 200 en opgeslagen | productie, handmatig bevestigd 3 okt 2026 (docs/fase1-notities.md, 9) | 200 | gelijk |
| E7 | PUT met verouderde if-match | 412, data ongewijzigd, antwoord bevat de actuele waarde en ETag | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | 412, data ongewijzigd, body = actuele waarde: true, ETag actueel: true | gelijk |
| E8 | PUT met if-match: null_etag ("alleen als leeg") | leeg: 200; daarna niet-leeg: 412 | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | 200 / 412 | gelijk |
| E9 | ETag hangt alleen af van de inhoud (A→B→A; ander pad) | productie: onbekend | productiegedrag onbekend | A→B→A zelfde ETag: true; ander pad zelfde ETag: true; PUT met de ETag van vóór A→B→A: 200 | onbekend |
| E10 | if-match bij PATCH en POST | productie: onbekend (emulatorfout noemt "not supported with GET, PATCH or POST") | productiegedrag onbekend | PATCH 400, POST 400 "The 'if-match' header is not supported with GET, PATCH or POST requests" | onbekend |
| E11 | DELETE met if-match (verouderd / actueel) | productie: onbekend | productiegedrag onbekend | 412 (data bleef staan) / 200 | onbekend |
| E12 | PUT met onzinnige if-match-waarde | productie: onbekend | productiegedrag onbekend | 412 | onbekend |
| E13 | Verouderde if-match op pad zonder schrijfrecht (leesbaar / niet leesbaar) | productie: onbekend | productiegedrag onbekend | leesbaar: 412; niet leesbaar: 401 (lekt geen data) | onbekend |
| E14 | 412 op een niet-leesbaar pad lekt geen data | geen inhoud in antwoord | harde controle van de proef | lekt niet | geslaagd |

## L · lege locaties

| ID | Controle | Verwachting | Bron | Emulator | Oordeel |
| --- | --- | --- | --- | --- | --- |
| L1 | PUT {} op een lege locatie | wordt niet opgeslagen (locatie blijft leeg) | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | 200, ETag null_etag, daarna null | gelijk |
| L1b | Leeg object is geen geldige persisted-control (harnascorrectie) | PUT {} geeft wel 2xx maar niets bestaat daarna; een proef mag {} nooit als gezet slot tellen | harde controle van de proef | 200 en daarna null | geslaagd |
| L2 | Geneste lege objecten en lege lijsten | verdwijnen; alleen {c:1} blijft (zoals canonVal in de app) | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | {"c":1} | gelijk |
| L3 | PATCH met null wist dat kind | {y:2} | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | {"y":2} | gelijk |
| L4 | PUT null wist de locatie | leeg | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | 200, daarna null | gelijk |
| L5 | Lijst met een gat, 3 van 4 sleutels over | lijst met null op de plek van het gat | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | [null,"b","c","d"] | gelijk |
| L6 | Lijst met een gat, 1 van 3 sleutels over | object {"2": …} in plaats van een lijst | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | {"2":"c"} | gelijk |
| L7 | Lijst met een gat, precies de helft over (1 van 2) | productie: onbekend (grensgeval van "meer dan de helft") | productiegedrag onbekend | [null,"b"] | onbekend |
| L8 | Lege tekst "" | productie: onbekend | productiegedrag onbekend | "" | onbekend |

## R · regelevaluatie

| ID | Controle | Verwachting | Bron | Emulator | Oordeel |
| --- | --- | --- | --- | --- | --- |
| R1 | Regels cascaderen: kind-.write:false kan een toestemming van de ouder niet intrekken | toegestaan | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | 200 | gelijk |
| R2 | Schrijven op een ouder telt alleen regels op dat pad en erboven | geweigerd (kind-toestemming geldt niet voor een schrijfactie op de ouder) | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | 401 | gelijk |
| R3 | .validate van een kind telt ook bij schrijven op de ouder | beide geweigerd | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | 401 / 401 | gelijk |
| R4 | .validate wordt niet uitgevoerd bij verwijderen (ook niet via een ouder-PUT) | beide toegestaan; kind weg | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | 200 / 200, kind daarna null | gelijk |
| R5 | PATCH op meerdere paden is atomair: één geweigerd pad weigert alles | geweigerd; ook het toegestane pad niet geschreven | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | 401, vrij/mp ongewijzigd | gelijk |
| R6 | PATCH op meerdere paden: elk pad apart beoordeeld (geen root-.write nodig) | toegestaan | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | 200 | gelijk |
| R7 | `root` in regels is de stand vóór de schrijfactie (slot + doel in één PATCH) | geweigerd: doel ziet het nog niet bestaande slot niet | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | 401 (slot niet gezet) | gelijk |
| R8 | Een client zonder beheerdersrechten kan de regels niet wijzigen | geweigerd; proefregels ongewijzigd | harde controle van de proef | 403, regels ongewijzigd | geslaagd |
| R9 | "Authorization: Bearer owner" omzeilt alle regels | alleen in de emulator; de proef gebruikt dit uitsluitend voor opzet en controle-lezingen, nooit voor de gesimuleerde clients | emulator-eigen | 200 | emulator |
| R10 | Statuscode en tekst bij weigering | productie (REST): 401 "Permission denied" | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | 401 "Permission denied" | gelijk |

## S · schrijfvormen tegen een proefslot

| ID | Controle | Verwachting | Bron | Emulator | Oordeel |
| --- | --- | --- | --- | --- | --- |
| S0 | Nulmeting zonder slot: PUT (if-match), PATCH, subpad, DELETE en POST op de bron | alle 2xx | harde controle van de proef | put 200, patch 200, sub 200, del 200, post 200 | geslaagd |
| S0b | POST (historische sendBeacon-vorm, text/plain) op de planner | maakt een nieuw kind met een push-ID in plaats van te overschrijven | Firebase-documentatie (REST API / Security Rules); niet zelf in productie gemeten | nieuwe push-sleutels: 1, antwoord {name: <push-ID>}: true | gelijk |
| S0c | Doel vóór het slot (A5) | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S1 | Slot zetten met een leeg object {} | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S1b | Na {} bestaat er geen slot | slot bestaat niet | harde controle van de proef | null | geslaagd |
| S2 | Slot zetten via de ouder (ctl/p) | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S3 | Slot zetten op ctl/p/slot | 2xx en slot bestaat | harde controle van de proef | 200, {"door":"migrator-proef","sinds":1} | geslaagd |
| S4 | Slot een tweede keer zetten (andere inhoud) | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S5 | Slot wissen met DELETE | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S6 | Slot wissen met PUT null | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S7 | Slot wissen via de ouder (PUT ctl/p {}) | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S8 | Slot wissen via PATCH op de ouder | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S9 | Slot wissen via PATCH op root (meerdere paden) | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S10 | Slot wijzigen via een subpad | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S11 | Na het slot: PUT op de bron met actuele if-match | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S12 | Na het slot: PUT op de bron zonder if-match (oude terugval) | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S13 | Na het slot: PUT op de bron met ?print=silent | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S14 | Na het slot: PATCH op de bron | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S15 | Na het slot: PATCH op de bron met null (verwijderen via PATCH) | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S16 | Na het slot: DELETE op de bron | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S17 | Na het slot: DELETE op de bron met actuele if-match | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S18 | Na het slot: PUT op een subpad | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S19 | Na het slot: PATCH op een subpad | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S20 | Na het slot: DELETE op een subpad | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S21 | Na het slot: POST op de bron (sendBeacon-vorm, text/plain) | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S22 | Na het slot: POST op een subpad | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S23 | Na het slot: PUT op de ouder (bron) | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S24 | Na het slot: PATCH op de ouder (bron) met het hele kind | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S25 | Na het slot: PATCH op de ouder (bron) met een dieper pad | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S26 | Na het slot: PATCH op root met een pad in de bron | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S27 | Na het slot: PUT op root | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S28 | Na het slot: DELETE op root | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S29 | Na het slot: PATCH op root, doel (mag) + bron (mag niet) samen | geweigerd (geen 2xx) en data ongewijzigd | harde controle van de proef | HTTP 401 "Permission denied"; data ongewijzigd | geslaagd |
| S30 | Bron na alle pogingen gelijk aan de stand bij het zetten van het slot | zelfde hash | harde controle van de proef | 9cc1aa1988a7b553 vs 9cc1aa1988a7b553 | geslaagd |
| S31 | Doel na het slot: eerste init "alleen als leeg" slaagt, tweede krijgt 412 | 2xx, daarna 412; doel = eerste | harde controle van de proef | 200 / 412, doel {"v":1} | geslaagd |

## Gevolgen voor het ontwerp

- **E9:** If-match beschermt tegen inhoudsverschil, niet tegen tussentijdse schrijfacties die op dezelfde inhoud uitkomen. Een verhuisslot mag daarom nooit op een ETag leunen, alleen op regels.
- **E10:** Er bestaat geen voorwaardelijke PATCH of POST. Alle voorwaardelijke schrijfacties (E2, migrator) moeten PUT (of DELETE) zijn.
- **E13:** Een weigering kan dus ook als 412 binnenkomen. De client (E2, regel 9) moet bij 412 én 401/403 opnieuw lezen en het slot controleren; de proef telt elke niet-2xx met ongewijzigde data als weigering.
- **L7:** Of een lijst als lijst of als object terugkomt, hangt af van hoeveel sleutels er zijn (L5–L7). Let op: normalizeData in de app zet zo'n object niet terug naar een lijst, maar vervangt een lijst op het hoogste niveau die als object binnenkomt door [] (index.html). Een lijst met gaten (bijv. door een DELETE op een element door een andere schrijver, of null-elementen vooraan) kan dus bij de volgende opslag leeg worden geschreven. Niet nagespeeld in de app; bevinding voor E2/E5. De migrator en de classificatie (E5) moeten beide vormen aankunnen.
- **R1:** Staat in productie ergens boven de bron een .write die toestemming geeft (bijv. op planners/$key), dan kan een slotregel lager in de boom niets meer blokkeren. Daarom eerst P1-1 (werkelijke regels).
- **R4:** .validate kan een slot dus niet beschermen tegen verwijderen; dat moet met .write.
- **R10:** De proef eist geen 401 maar een aantoonbare weigering (niet-2xx + data ongewijzigd), zie E13 en harnascorrectie A5.2.
- **S0b:** Een oude POST-schrijver vervuilt de bron met een volledige kopie onder een push-ID. Het slot moet POST op de bron en elk subpad dus net zo weigeren als PUT.
