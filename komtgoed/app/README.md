# KomtGoed: prototype Vandaag (KG-2)

Het eerste klikbare prototype van de nieuwe gezinsapp. KomtGoed is een werknaam. Alles draait in de
browser, met een **verzonnen gezin** (Familie De Boer: Eva, Thomas, Lotte en Daan). Er is geen
backend, geen account, geen Supabase en geen verbinding met de Huisplan-app of haar gegevens.

De ontwerpkeuzes en de toets aan het Productkompas staan in [`ONTWERP.md`](ONTWERP.md).

## Openen

**Zonder installatie:** open de gepubliceerde demo (privé-link in de PR), of maak zelf een los bestand
(zie hieronder) en dubbelklik erop.

**Met Node.js 20+ (aanbevolen voor ontwikkelen):**

```sh
cd komtgoed/app
npm ci              # eenmalig, installeert de vastgepinde versies uit package-lock.json
npm run dev         # open http://127.0.0.1:5180
```

| Opdracht | Wat het doet |
| --- | --- |
| `npm run dev` | Ontwikkelserver met automatisch herladen, op `http://127.0.0.1:5180`. |
| `npm run build` | Typecontrole en productie-build in `dist/`. |
| `npm run preview` | Toont de build op `http://127.0.0.1:5181`. |
| `npm run losbestand` | Bouwt één los bestand `dist-los/komtgoed-demo.html`, met CSS en JS erin. Werkt door erop te dubbelklikken, ook offline. |
| `npm test` | Unit- en componenttests (Vitest + Testing Library). |
| `npm run e2e` | Browsertests (Playwright) op 360 px, 390 px en desktop (1280 px). |
| `npm run screenshots` | Maakt de screenshots in `screenshots/` opnieuw. |

**Tip:** met `?nu=2026-10-10T11:20` in de adresbalk zet je de demo-klok vast. De tests en de
screenshots gebruiken dat. Zonder die parameter volgt de demo de echte tijd. De voorbeelddata staan
altijd rond "vandaag".

## Wat werkt er echt, en wat is demo?

| Onderdeel | Status |
| --- | --- |
| Vandaag: begroeting op tijdstip, datum, een samenvatting in één zin | Werkt |
| Eén nadruk: de eerstvolgende afspraak ("Straks" of "Hierna"); voorbije afspraken worden lichter | Werkt (op de demo-klok) |
| Agenda vandaag, Te doen (met "sinds gisteren"), Boodschappen in één regel, Binnenkort (lege dagen weggelaten) | Werkt |
| Centrale toevoegknop: afspraak (dag, tijd, voor wie, privé), taak (dag of "ooit", wie pakt het op), boodschap (meerdere met komma's) | Werkt, alleen lokaal |
| Afvinken van taken en boodschappen; ongedaan maken van de laatste stap | Werkt, alleen lokaal |
| Meedenken: hooguit één rustig signaal ("Gymtas inpakken vanavond?"), alleen na jouw keuze op de lijst | Werkt, met een vaste regel op demodata; geen AI |
| Privé: een privé-afspraak van een ander zie je alleen als "Bezet" | Werkt in de weergave. **Demo:** in de echte app moet de server dit afdwingen (gate 9). |
| Rustige dag | **Demo-schakelaar** onder Meer |
| Agenda-scherm | Eenvoudige lijst van twee weken; **geen** volledige agenda |
| Boodschappen-scherm | Lijst, snel toevoegen, afvinken, opruimen |
| Meer | Leden (ook kinderen zonder account), demo-uitleg, scenario wisselen |
| Inloggen, huishoudens, uitnodigen, synchroniseren, opslaan, meldingen, herhaling | **Niet gebouwd** |

Alles staat in het geheugen van het tabblad. Herladen zet de demo terug. Er gaat niets naar een server.
De browsertests controleren dat er geen enkele externe aanvraag wordt gedaan.

## Opbouw

```
komtgoed/app/
  index.html               ingang voor Vite
  src/
    main.tsx, App.tsx      opstart, schermkeuze (#/vandaag, #/agenda, ...), demo-klok, meldingen
    lib/types.ts           prototypemodel: lid ≠ account, zichtbaarheid per item (volgt KG-1)
    lib/datum.ts           lokale datums, Nederlandse labels, begroeting
    lib/vandaag.ts         wat Vandaag toont (pure functies, los getest)
    lib/store.ts           demo-staat (useReducer) met één stap ongedaan maken
    data/demo.ts           het verzonnen gezin en de voorbeelddata
    components/            navigatie, invoervenster, rijen, demobalk, iconen
    screens/               Vandaag, Agenda, Boodschappen, Meer
    styles/app.css         tokens (licht en donker), mobiel eerst, zijbalk vanaf 960 px
  tests/                   Vitest: logica en component
  e2e/                     Playwright: gedrag, schermbreedtes, privacy, screenshots
  scripts/losbestand.mjs   bouwt het losse HTML-bestand
  screenshots/             mobiel 360/390 en desktop, licht en donker
```

**Bewust eenvoudig:** geen router, geen state-bibliotheek en geen CSS-framework. Er zijn twee
runtime-afhankelijkheden (React en React DOM). Alle versies staan vast in `package.json`.

## Bekende beperkingen

- De demo-staat verdwijnt bij herladen. Er is bewust geen opslag, ook niet in `localStorage`.
- Het meedenk-signaal is één vaste regel (een voorbereiding de dag ervoor). Het is geen lerend of
  slim systeem.
- Een afspraak bewerken of verwijderen kan nog niet; een taak afvinken en ongedaan maken wel.
- De invoer is een formulier. Vrije tekst zoals "morgen 16:00 kapper" volgt pas in fase F7.
- De lettertypen zijn systeemlettertypen, zodat de demo geen externe bronnen laadt. Daardoor oogt de
  demo per apparaat iets anders.
- Getest in Chromium (Playwright). Safari en Firefox zijn niet automatisch getest.
