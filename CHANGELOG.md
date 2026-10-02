# Changelog Huisplan

Elke stap uit de roadmap krijgt hier een regel. Wijzigingen staan eerst in de testversie
(`test/index.html`) en gaan pas na de tests naar de live-versie (`index.html`).

## 1.0.0 — Fase 0, stap 0.1 (testversie)
- Testvangnet in `tests/`: data-roundtrip, oude toewijzingen, rooktest van alle schermen
  (licht en donker, 390 px breed). Draaien met `node tests/run.js` (testversie) of
  `node tests/run.js --target=root` (live-versie).
- Versienummer `APP_VERSION` in de app.
