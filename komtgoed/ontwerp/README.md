# Thuisplanner: gedeelde ontwerpbasis

Eén bron voor de uitstraling van de app (`komtgoed/app`) en de website (`komtgoed/website`).

| Bestand | Wat | Gebruikt door |
| --- | --- | --- |
| `tokens.css` | Kleuren (licht en donker), typografie, schaduw, afronding | De app (`app/src/styles/app.css`, via `@import`); de website (gekopieerd door `website/bouw.mjs`) |
| `pictogram.svg` | Het pictogram: een huis met een vinkje ("geregeld") | Het tabbladpictogram van de app en de website |
| `logo.svg` | Pictogram met woordmerk, voor plekken waar alleen een afbeelding kan | Deelafbeelding, mails (later) |

## Vervangen

- **Logo of pictogram:** vervang het bestand met dezelfde naam. App en website nemen het bij de volgende bouw over; de
  tests controleren dat het bestand bestaat en een geldige SVG is. Het is een voorstel van 18 oktober 2026.
- **Kleuren:** pas `tokens.css` aan. Houd voor tekst op `--bg` en `--vlak` minstens contrast 4,5:1 (WCAG AA); de
  websitetests controleren de hoofdkleuren.
- Geen kleurwaarden buiten `tokens.css`. Uitzondering: het pictogram zelf. Een SVG-bestand kan geen CSS-variabelen van
  de pagina lezen.
