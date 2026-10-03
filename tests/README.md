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
| `supabase.test.js` | Migraties, lokale RLS-tests, geen geheime sleutels, app gebruikt nog geen Supabase. |
| `schema.test.js` | Testdata en opgeslagen data voldoen aan `docs/dataformaat-v1.schema.json`; `meta.schemaVersion` wordt alleen toegevoegd, nooit overschreven, en de live-versie laat het staan. |

Opties van `openApp` voor synchronisatietests: `state` (één nagebootste database delen tussen twee
toestellen, zie `sharedDb`), `log` (verloop van de verzoeken) en `exposeETag` (de app kan de ETag
lezen en slaat dan voorwaardelijk op met `if-match`; standaard niet, zoals voorheen). Let op:
Playwright beantwoordt onderschepte verzoeken ook als de browser offline staat; de store-tests maken
de database daarom zelf onbereikbaar.

`diffPaths` in `lib.js` negeert één ding: een nieuw toegevoegde `meta.schemaVersion: 1`
(stap 0.13). Met `{ strictMeta: true }` telt die wel mee.
