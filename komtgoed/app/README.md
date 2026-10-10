# KomtGoed: prototype (KG-2 t/m KG-4)

Het klikbare prototype van de nieuwe gezinsapp. KG-2 bouwde het Vandaag-scherm; KG-3 maakte de
agenda, taken en boodschappen echt bruikbaar (openen, aanpassen, verwijderen, weekweergave). KG-4 maakte
er een volwaardige agenda van: dag-, week- en maandweergave, herhalende afspraken en een gezinsfilter. KomtGoed is een werknaam. Alles draait in de
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
| **Vandaag:** begroeting, datum, samenvatting in één zin, één nadruk op de eerstvolgende afspraak, agenda en taken van vandaag, boodschappen in één regel, Binnenkort | Werkt; elke wijziging elders staat er direct op |
| Vandaag: taken die vandaag zijn afgevinkt staan ingeklapt ("2 afgerond vandaag") en zijn daar weer open te zetten | Werkt (KG-3) |
| **Agenda:** weekweergave maandag t/m zondag met afspraken én taken per dag, vorige/volgende week, "Naar vandaag", een + per dag, taken zonder datum onderaan | Werkt (KG-3). Mobiel onder elkaar, desktop zeven kolommen |
| **Agenda-weergaven (KG-4):** Dag, Week en Maand met één schakelaar; vorige/volgende en "Naar vandaag" per weergave. Maand toont per dag subtiele stippen (afspraken, in de kleur van het lid) en een streepje voor open taken; op desktop de eerste titels. Een dag aantikken opent het dagoverzicht | Werkt |
| **Dagoverzicht (KG-4):** afspraken op tijdsvolgorde, taken van die dag, direct een afspraak of taak toevoegen op die datum | Werkt |
| **Herhalende afspraken (KG-4):** elke dag, week, maand of jaar, optioneel tot en met een datum. Bij openen kies je "Alleen deze" of "Hele reeks" om te wijzigen of te verwijderen | Werkt. Een reeks staat één keer opgeslagen; voorkomens worden berekend, dus nooit dubbel |
| **Gezinsfilter (KG-4):** Iedereen of één lid; geldt voor dag, week en maand en blijft staan als je wisselt van scherm. Vandaag blijft altijd het hele gezin | Werkt |
| **Afspraken** openen, aanpassen (titel, dag of andere datum, van/tot, plek, voor wie, privé) en verwijderen | Werkt (KG-3) |
| **Taken** afvinken en weer openen, aanpassen (titel, dag of "ooit", wie pakt het op) en verwijderen | Werkt (KG-3) |
| **Boodschappen** afvinken en terugzetten, naam aanpassen, verwijderen, meerdere tegelijk toevoegen; "Nog nodig" en "In het mandje" apart, mandje leegmaken | Werkt (KG-3). Dubbelingen worden herkend: wat al op de lijst staat komt er niet nog eens bij, wat in het mandje lag komt terug op "nog nodig" |
| Ongedaan maken | Werkt voor de laatste wijziging met een melding (toevoegen, aanpassen, verwijderen, taak afvinken, mandje leegmaken) |
| Meedenken: hooguit één rustig signaal ("Gymtas inpakken vanavond?"), alleen na jouw keuze op de lijst | Werkt, met een vaste regel op demodata; geen AI |
| **Privé:** een privé-afspraak van een ander staat er als "Bezet"; openen toont alleen tijd en persoon, zonder iets te kunnen wijzigen. Alleen de eigenaar kan iets privé of gedeeld maken | Werkt in de weergave. **Demo:** in de echte app moet de server dit afdwingen (gate 9) |
| Rustige dag | **Demo-schakelaar** onder Meer |
| Meer | Leden (ook kinderen zonder account), demo-uitleg, scenario wisselen |
| Inloggen, huishoudens, uitnodigen, synchroniseren, opslaan, meldingen, herhaling, maandweergave | **Niet gebouwd** |

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
    lib/store.ts           demo-staat (useReducer): wijzigingen, melding en één stap ongedaan maken
    lib/boodschappen.ts    boodschappen splitsen en toevoegen zonder dubbelingen
    lib/rechten.ts         wie mag wat in de demo (privé-afspraak van een ander: alleen "bezet")
    lib/herhaling.ts       herhalende afspraken: voorkomens berekenen, één keer of de hele reeks wijzigen
    lib/kalender.ts        maandraster, maanden bladeren, inhoud van een dag (met filter)
    lib/filter.ts          gezinsfilter: iedereen of één lid
    data/demo.ts           het verzonnen gezin en de voorbeelddata
    components/            navigatie, venster, item-venster (nieuw en bewerken), rijen, demobalk, iconen
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
- "Ongedaan maken" geldt voor één stap: de laatste wijziging met een melding. Een boodschap afvinken
  heeft bewust geen melding (dat doe je vaak achter elkaar) en is gewoon terug te vinken.
- Herhaling: alleen voor afspraken, niet voor taken. Er is geen "deze en alle volgende"; wel "alleen deze" en
  "hele reeks". Maandelijks op de 29e–31e slaat maanden zonder die dag over; jaarlijks op 29 februari komt
  alleen in schrikkeljaren voor.
- Een losgemaakt voorkomen (alleen deze gewijzigd) volgt latere wijzigingen van de hele reeks niet meer.
- Taken staan in de weekagenda en op Vandaag; er is (bewust) geen apart Taken-scherm.
- In de smalle weekkolommen op desktop worden lange samengestelde woorden afgebroken. Safari (Mac en
  iOS) zet daar een afbreekstreepje; Chromium op Linux breekt zonder streepje.
- De tijdvelden volgen de browser; in een Engelstalige browser kan "AM/PM" verschijnen.
- De invoer is een formulier. Vrije tekst zoals "morgen 16:00 kapper" volgt pas in fase F7.
- De lettertypen zijn systeemlettertypen, zodat de demo geen externe bronnen laadt. Daardoor oogt de
  demo per apparaat iets anders.
- Getest in Chromium (Playwright), ook met een breed systeemlettertype (zoals op de CI-runner).
  Safari en Firefox zijn niet automatisch getest.
