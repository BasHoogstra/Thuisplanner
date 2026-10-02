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
  `fixtures/legacy.json` bevat oude toewijzingen ('me'/'partner').
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
| `schema.test.js` | Testdata en opgeslagen data voldoen aan `docs/dataformaat-v1.schema.json`; `meta.schemaVersion` wordt alleen toegevoegd, nooit overschreven, en de live-versie laat het staan. |

`diffPaths` in `lib.js` negeert één ding: een nieuw toegevoegde `meta.schemaVersion: 1`
(stap 0.13). Met `{ strictMeta: true }` telt die wel mee.
