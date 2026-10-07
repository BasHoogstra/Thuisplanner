# Tests

Draaien vanuit de map van de repo:

```
node tests/run.js                 # testversie (test/index.html)
node tests/run.js --target=root   # live-versie (index.html)
node tests/run.js roundtrip       # alleen tests waarvan de naam 'roundtrip' bevat
```

Benodigd: Node 18+ en Playwright met Chromium (`npm i -g playwright`, of de vooraf
geïnstalleerde versie in de cloudomgeving).

- De app draait tegen een **nagebootste Firebase-database**; er wordt nooit echte data
  gelezen of geschreven, en al het overige netwerkverkeer (weer, kaarten) is geblokkeerd.
- De datum staat vast op vrijdag 2 oktober 2026, 10:00, zodat de tests elke dag hetzelfde zien.
- `fixtures/huishouden.json` is een volledig gevuld gezin (alle onderdelen, foto's).
  `fixtures/legacy.json` bevat oude toewijzingen ('me'/'partner'). `fixtures/leden-oud.json` heeft
  namen in elk bekend naamveld, schrijfvarianten en een twijfelgeval (verzonnen gezin).
  `fixtures/leden-praktijk.json` en `-v14.json` volgen de praktijk van 1.4.0 (paard en categorie als
  paklijstkolom); de inhoud is verzonnen.
- Schermafbeeldingen komen in `tests/output/` (niet in git).

| Bestand | Wat het bewaakt |
|---|---|
| `roundtrip.test.js` | Laden, herladen, iets toevoegen of afvinken verandert alleen wat de gebruiker veranderde. |
| `smoke.test.js` | Alle schermen openen zonder JavaScript-fouten, zonder horizontaal scrollen, en alleen kijken verandert geen data. |
| `guard.test.js` | Verhuisde planner of te oude app: niets meer opslaan, lokale wijzigingen blijven bewaard. |
| `fixes.test.js`, `texts.test.js` | Losse bugfixes en teksten uit de audit (0.3, 0.10). |
| `delete.test.js` | Verwijderen met ongedaan maken herstelt de data exact; scrollen verwijdert niets. |
| `oldtasks.test.js` | Oude, open taken blijven zichtbaar en zijn te verplaatsen. |
| `dayview.test.js`, `month.test.js`, `forms.test.js`, `screens.test.js` | Vernieuwde schermen werken en slaan hetzelfde op als voorheen. |
| `options.test.js` | Extra lagen op Vandaag zijn per toestel uit te zetten. |
| `store.test.js` | Opslaglaag (1.3): alleen `FirebaseStore` praat met Firebase; laden, opslaan, 412-conflict, offline, cache, achtergrond, 403, deellink en installeren gedragen zich exact als de oude code; twee browsers tegelijk verliezen niets. |
| `toevoeger.test.js` | Bestaand gedrag rond de toevoeger: boodschappen en eigen lijsten bewaren `addedBy` en tonen "door <naam>" alleen bij iemand anders; taken tonen de auteur altijd; zonder toestelnaam wordt niemand opgeslagen. |
| `leden.test.js` | Ledenregister (1.4): alle naambronnen, geen namen verloren, varianten en twijfel, stabiele ID's, twee toestellen tegelijk, `plannerMemberId`, toestel zonder identiteit, schakelaar, oude versie bewaart het register, terugdraaien. Het rekenblok wordt los in Node getest. |
| `leden-praktijk.test.js` | Ledenregister 1.4.1: vakantielabels (paard, categorie, oma) zijn geen huishoudlid zonder bevestiging; een 1.4.0-register met zes leden wordt vier leden met dezelfde ID's; vakantiegegevens en `plannerMemberId` blijven; twee toestellen; oudere versie zet labels niet terug. |
| `supabase.test.js` | Migraties, lokale RLS-tests, geen geheime sleutels, app gebruikt nog geen Supabase. |
| `schema.test.js` | Testdata en opgeslagen data voldoen aan `docs/dataformaat-v1.schema.json`; `meta.schemaVersion` wordt alleen toegevoegd, nooit overschreven, en de live-versie laat het staan. |
| `emulatorproef.test.js` | P1-3 (NW-01): de emulatorproef uit `tools/emulator/` draait in een eigen proces (zonder jar alleen de statische controles): alleen lokaal, geen productieadressen of regelbestanden in de repo, alle harde controles geslaagd, geen afwijking van bekend productiegedrag, en een mutatietest die bewijst dat een open bronregel wordt betrapt. Zie `docs/p1-3-emulatorproef.md`. |
| `schrijven.test.js` | 1.4.2, E2 (NW-03), alleen testversie: één voorwaardelijke PUT (`putIfMatch`) en geen terugval zonder if-match; T1 twee toestellen, T2 verbinding weg vóór de server / verwerkt maar antwoord kwijt / offline→online, T3 herhaald 412 met begrensde pogingen en later herstel, T4 vertraagde leesactie en trage flush (nooit twee schrijfacties tegelijk, niets teruggezet), T5 geen leesbare ETag = niet schrijven en melden. |
| `journaal.test.js` | E2, tweede Codex-herreview (alleen testversie). Reload-veiligheid met het schrijfjournaal: herladen tijdens een PUT (wel of niet verwerkt), na een verloren antwoord met een hangende of mislukte herstellezing, en met een wijziging of verwijdering elders; meerdere verloren bevestigingen, ook met herladen ertussen; journaal niet te bewaren. Verder: een hangende body (met `tests/nepdb.js`), gelijke hypothesen met verlies (lijst zonder id), de vraag (serverwijziging tussen tonen en keuze, onzekere set, latere lokale wijzigingen), status terwijl bevestiging wordt tegengehouden, herstellezing zonder ETag, geen snelle lus, en een lokale bewerking plus een verwijdering elders. |
| `journaal3.test.js` | E2, derde Codex-review (alleen testversie). Journaal fail-safe: tijdelijke leesfout, kapotte JSON, onbekende versie, ongeldige `sent`/`oldBase`/toestand, andere database/planner/generatie (blokkeren, niets aanraken); open journaal met ontbrekende, kapotte of oudere cache; cache-opslag mislukt (vóór een verloren bevestiging en na een geslaagde PUT); veilig afgehandeld X+Y, daarna verwijdert de server X, herladen (ook met een opslagfout tussen elke stap van het afhandelen); de keuze met onafhankelijke wijzigingen (lijst zonder id, genest/gemengd, geschiedenis aan twee kanten, bewerking/verwijdering tussen tonen en antwoorden, meerdere latere lokale wijzigingen); twee vensters (wachten, eigen records, verweesd record overnemen met Web Locks). Vierde Codex-review: B1 (oudere cache vervangt nooit het nieuwere record, met storingen bij herstel), B2 (fencing; met Web Locks wordt een gepauzeerd venster nooit overgenomen; twee gelijktijdige claims). Vijfde Codex-review: R5 (A pauzeert na de eigenaarscontrole vóór record, cache of opruimen; B probeert over te nemen; A hervat) en zonder Web Locks nooit overnemen (open, gesloten, gecrasht). |
| `verliesvrij.test.js` | E2, tweede en derde Codex-review: `losslessMerge`, `flattenPaths`, `changedPaths`, `normalizeLoses` en `describeChanges` los in Node (lijsten zonder id, geneste gegevens, bewerken/verwijderen aan twee kanten, veilige gevallen, dubbele id's, lijst met gaten, tekstlijsten als geheel, typewisselingen, volgorde in id-lijsten, toestemming alleen voor losse waarden, volgorde per paar inclusief nieuwe id's: prepend, append, invoegen, herordenen + toevoegen). |
| `opslag.test.js` | 1.4.2, E3 (NW-04) bovenop E2, alleen testversie: opslagmodule en SHA-256; T6–T8 (cache per database+planner+generatie met E2-velden en `localGen`/`confirmedGen`, quota, netwerk én opslag weg, leesfout, beschadigde cache, koppeling, vreemde caches); Codex-review #16: oude cache uit database A nooit in B (ook met de echte live-versie), oude cache zonder/andere herkomst, lijst-met-gaten-vormen nooit verwijderd of gebruikt, vervangen oude cache niet verborgen, niets herrijst na verwerking, verlieswaarschuwing bij lege/onbekende serverstand, ledenback-up met scope, koppeling nooit gemengd, diagnose zonder gevoelige delen, quarantaine zonder botsing, opslagfout + synchroniseren altijd via het journaal, oude bevestiging maakt nieuwere generatie niet veilig. Zie `docs/e3-lokale-opslag.md`. |

Opties van `openApp` voor synchronisatietests: `state` (één nagebootste database delen tussen twee
toestellen, zie `sharedDb`), `log` (verloop van de verzoeken), `exposeETag` (de app kan de ETag
lezen en slaat dan voorwaardelijk op met `if-match`; standaard aan, zoals de echte Firebase sinds de
controle van 3 oktober 2026; met `false` schrijft de testversie sinds 1.4.2 niet) en `onRequest`
`allowUrl` (een extra lokaal adres, bv. `tests/nepdb.js`), `onRequest`
(per verzoek ingrijpen: `'abort'`, `'lost'`, `'hang'` of `{ delay, snapshot, commitFirst, noETag }`;
`onDone` meldt wanneer een PUT is afgehandeld; `timeouts` verlaagt de tijdslimieten van de app; zie
`lib.js`). Let op:
Playwright beantwoordt onderschepte verzoeken ook als de browser offline staat; de store-tests maken
de database daarom zelf onbereikbaar.

Opslagfouten (1.4.2, E3): `openApp` met `opslagFout: { schrijven, lezen, verwijderen }` (regex op de
sleutelnaam) laat `localStorage` een QuotaExceededError of SecurityError geven; tijdens een test aan te
passen met `zetOpslagFout(page, cfg)`. `dbOnbereikbaar: true` maakt de nagebootste database vanaf de
start onbereikbaar, tot `state.onbereikbaar = false`.

`diffPaths` in `lib.js` negeert één ding: een nieuw toegevoegde `meta.schemaVersion: 1`
(stap 0.13). Met `{ strictMeta: true }` telt die wel mee.
