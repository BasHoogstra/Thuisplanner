# Thuisplanner: de publieke website (mijnthuisplanner.nl) en de gedeelde ontwerpbasis

**Status:** lokaal gebouwd en getest (18 oktober 2026), op branch `thuisplanner-deel2`. Er is niets gepubliceerd: geen
Pages-project, geen domeinkoppeling, geen DNS-wijziging. De publicatiebouw weigert zolang de bedrijfsgegevens leeg zijn.

**Akkoord van de eigenaar (18 oktober 2026):**
- de knop "Meedoen met de bèta", met uitleg dat deelname voorlopig op uitnodiging is; later eenvoudig naar de app;
- de belofte "Minder onthouden. Meer geregeld.";
- de prijstekst: "Tijdens de bèta gebruik je Thuisplanner gratis. Over abonnementen en prijzen informeren we je ruim van
  tevoren." Er is geen belofte van een blijvende gratis versie;
- een logo als voorstel, dat later eenvoudig te vervangen is;
- bedrijfsgegevens voorlopig leeg, met een blokkade op publicatie.

## 1. Productkompas-toets (roadmap, werkwijze)

| Vraag | Antwoord |
| --- | --- |
| Welke principes raakt dit? | 10 (het huishouden is de klant: geen tracking, geen advertenties, geen verkoop van gegevens), 6 (aandacht besparen: geen pop-ups, geen nieuwsbriefvenster), 2 (rust), en de regel om geen functies te beloven die nog niet bestaan |
| Neemt het werk of denkwerk weg? | Niet in het huishouden zelf. Het legt eerlijk uit wat Thuisplanner doet, zodat een gezin kan kiezen. Een website is geen productfunctie |
| Hoort het bij organiseren, onthouden of uitvoeren? | Indirect: het is de toegang tot het product |
| Kan het eenvoudiger? | Ja, en zo is het gebouwd: statische pagina's, geen JavaScript, geen formulieren, geen afhankelijkheden |
| Aandacht, controle en privacy beschermd? | Geen cookies, geen analyse, geen bronnen van buiten (de CSP dwingt dat af); alleen mailen als iemand dat zelf wil |
| Werkelijk gebruik of hypothese? | Hypothese. De teksten noemen alleen wat gebouwd is; vragen van testers bepalen wat er later bij komt |
| Ultieme toets | Het huishouden hoeft er niets extra's door te doen. De site belooft niets wat het later moet terugnemen |
| Gates | Geen gate van toepassing: geen huishouddata, geen database, geen import |

## 2. Structuur en scheiding

```
thuisplanner/
  ontwerp/        de gedeelde ontwerpbasis: tokens.css (kleuren licht en donker, typografie, vormen), pictogram.svg, logo.svg
  website/        de publieke website: geen database, geen geheimen, geen afhankelijkheden
    src/          de pagina's (index, privacy, mails, bedrijfsgegevens, 404), delen/ (kop, voet), stijl.css
    gegevens.json de instellingen: de knop (beta of app) en de bedrijfsgegevens
    bouw.mjs      de bouw (voorbeeld of --publicatie), naar dist/ (niet in git)
    voorbeeld.mjs een lokale server die zich gedraagt als Cloudflare Pages
    tests/        de bouwtests (node --test)
  app/            de app; laadt ontwerp/tokens.css; het tabbladpictogram komt bij het bouwen uit ontwerp/pictogram.svg
    e2e-website/  de browsertests van de website (Playwright van de app)
  omgevingen.json de online omgevingen (staging, bèta, productie, website), zonder geheimen
```

- **Website** (`thuisplanner-website`, later `mijnthuisplanner.nl`): een eigen Pages-project, los van de app en van
  staging.
- **App:**
  - staging (`thuisplanner-staging`, achter Cloudflare Access);
  - bèta en productie (`app.mijnthuisplanner.nl`).
  - Of de bèta een eigen project krijgt of meteen de toekomstige productieomgeving gebruikt, wordt besloten vóór
    stap 7.
- **Huisplan:** ongewijzigd. Het staat op GitHub Pages zonder eigen domein; de statische controle bewaakt de bestanden.

## 3. Inhoud: alleen wat er is

- **Opening:**
  - "In ontwikkeling · bèta op uitnodiging";
  - de belofte;
  - een uitleg in één zin;
  - de knop;
  - een rustig voorbeeld van Vandaag en de boodschappen, zonder echte gegevens.
- **Voordelen** (alle zes gebouwd en getest):
  - één plek voor iedereen;
  - privé als "bezet";
  - kinderen als huishoudlid zonder account;
  - rust op Vandaag;
  - inloggen met een code;
  - herhalende afspraken, met één keer anders.
- **Hoe het werkt:** huishouden aanmaken, uitnodigen (link of mail), samen plannen.
- **Privacy:**
  - geen advertenties en geen verkoop van gegevens;
  - alleen nodige mails;
  - geen cookies op de site.
  - **Niet** vermeld: waar de gegevens staan. Dat hangt af van het bèta- of productieproject, dat er nog niet is. Zet
    het er pas bij als dat vastligt.
- **Veelgestelde vragen:** de prijs (de afgesproken tekst), meedoen, privé, kinderen, wachtwoord, apparaten.
- **Meedoen met de bèta:** op uitnodiging; via iemand die al meedoet, of mail naar het contactadres. Dat adres staat
  nu nog als "nog in te vullen".
- **Pagina's:**
  - privacyverklaring van de website (verantwoordelijke, geen cookies of analyse, technische gegevens bij Cloudflare,
    mailen, rechten, de AP);
  - "Welke mails sturen wij?" (de codes, de uitnodiging zonder toegangslink, een nieuw adres bevestigen, een echte mail
    herkennen; nuttig voor ontvangers en voor Lettermint);
  - bedrijfsgegevens;
  - 404.

## 4. Techniek en beveiliging

- **Statisch, zonder JavaScript.** De bouw weigert `<script>`, frames, formulieren en event-handlers.
- **Headers** (`_headers`):
  - `Content-Security-Policy: default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests`;
  - nosniff, Referrer-Policy, Permissions-Policy, COOP en CORP;
  - HSTS voor een half jaar, **zonder** `includeSubDomains`. Dat wordt pas uitgebreid als ook `app.` en `mail.` op HTTPS
    vastliggen.
- **De stijl heeft zijn inhoud in de bestandsnaam** (`stijl.<hash>.css`) en mag een jaar in de cache. Een nieuwe versie
  is een nieuw bestand, dus nooit oude opmaak na een wijziging.
- **Voorbeeldbouw** (`node bouw.mjs`):
  - lege gegevens zichtbaar als "nog in te vullen";
  - `noindex` (meta, `X-Robots-Tag`, `robots.txt`);
  - een bestand `VOORBEELD-NIET-PUBLICEREN.txt` in `dist/`.
- **Publicatiebouw** (`node bouw.mjs --publicatie`):
  - weigert zonder naam, e-mail, KvK-nummer en adres (of afgeschermd adres);
  - weigert ongeldige waarden (KvK 8 cijfers, Nederlands btw-id, geen `<` of `>`);
  - vindbaar, met sitemap.
- **De knop:** `start.modus` in `gegevens.json`.
  - `beta`: naar `/#meedoen`.
  - `app`: naar `https://app.mijnthuisplanner.nl`; een ander adres wordt geweigerd.
- **Contrast:** alle tekstkleuren die de stijl gebruikt, halen in licht en donker minstens 4,5:1 (WCAG AA). De test
  vond twee te lichte tekstkleuren; die zijn aangepast.

## 5. Nog open vóór publicatie (elk met een eigen akkoord)

1. **Bedrijfsgegevens** in `gegevens.json` (door jou), daarna `node bouw.mjs --publicatie`.
2. **Deelafbeelding** (`og:image`): sociale netwerken tonen geen SVG; er is een PNG van 1200 × 630 nodig. Nog niet
   gemaakt.
3. **DNS-overstap** (DNSSEC uit via TransIP-support, dan de nameservers naar Cloudflare): zie
   `docs/thuisplanner-dns-overstap.md`.
4. **Het Pages-project** `thuisplanner-website` aanmaken, en de publicatiebouw uploaden (Direct Upload). Eerst
   bekijken op het `pages.dev`-adres.
5. **Het domein koppelen** (`mijnthuisplanner.nl` en `www`) en het certificaat controleren.
   - `www` stuurt door naar het hoofddomein, met een regel in Cloudflare (Redirect Rule of Bulk Redirect, gratis). Dat
     kan niet via `_redirects`, omdat dat alleen paden kent.
6. **Echte telefoons:** iPhone met Safari en Android met Chrome, licht en donker, en tekstvergroting.

## 6. Testresultaten (lokaal, 18 oktober 2026, na een volledige herstart en reset van de stack)

| Testset | Uitkomst |
| --- | --- |
| Website, bouw (`node --test`) | 8 van 8: de publicatieblokkade, de voorbeeldmarkering, het ontsnappen van gegevens, ongeldige instellingen, de knop in beide standen, geen scripts of bronnen van buiten, werkende links en ankers, de headers en de CSP, en het contrast in licht en donker |
| Website, browser (Playwright, 390 en 1280 px) | 13 geslaagd, 1 bewust overgeslagen (de toetsenbordtest op een aanraakscherm). Getoetst: geen horizontaal scrollen, niets van buiten, geen CSP-melding, geen JavaScript, geen cookies, de knop, de vragen, de voet, 404 en donker |
| Ontwerpbasis (unit) | 3 van 3: de app gebruikt alleen bestaande variabelen; licht, donker (systeem) en donker (handmatig) hebben dezelfde set; het pictogram is een geldige SVG |
| Lettermint-adapter en omgevingen | 8 van 8 |
| Statische controles | geslaagd (nieuw: de website, en de service-rol in Edge Functions) |
| App-unittests | 191 van 191 |
| App-builds | de gewone build, de losse build (met het pictogram ingebed) en de stagingbuild (in de staging-e2e) |
| RLS-matrix en tegenproeven | 75 van 75; 111 van 111 |
| Integratie (11 bestanden, met de Edge Functions op de nieuwe adapterlaag) | 95 van 95 |
| Sync-tegenproeven | 22 van 22 |
| Lokale e2e, staging-e2e, demo-e2e | 24 (2 overgeslagen); 5 van 5; 138 (9 overgeslagen) |

**Niet bewezen** (alleen online of met een apparaat):
- een echte mail via Lettermint en de bezorgmeldingen van Lettermint zelf;
- de idempotentie bij Lettermint;
- de website op Cloudflare Pages en de echte headers daar;
- de domeinkoppeling en het certificaat;
- weergave op echte telefoons;
- de deelafbeelding (die ontbreekt nog).
