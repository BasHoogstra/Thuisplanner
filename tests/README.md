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
