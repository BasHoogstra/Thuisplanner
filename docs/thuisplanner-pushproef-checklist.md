# Pushproef: checklist voor Bas en Sanne

De pushproef van besluit 16 en 20 (W0 in `docs/thuisplanner-personalisatie-beta-plan.md` §3). De vraag is één ding:
**komt een webpushmelding betrouwbaar aan op onze iPhones, en opent tikken de app op het goede scherm?** Er gaan geen
gegevens uit de planning mee; de melding is een vaste testtekst. Faalt de iPhone, dan stoppen en melden (plan §3.3).

Techniek en opdrachten: `thuisplanner/app/README.md`, sectie "PWA en pushproef (PR P0)".

## Vooraf (elk met een eigen akkoord van Bas)

| # | Wat | Wie | Klaar |
| --- | --- | --- | --- |
| V1 | PR #57 gemerged in `thuisplanner-staging` | Bas | ☐ |
| V2 | Het **definitieve** VAPID-sleutelpaar voor staging (= bèta, plan §2.10) gemaakt. Private sleutel alleen in de wachtwoordkluis en in `thuisplanner/app/.env.pushproef.local` op de computer van de proef | Bas | ☐ |
| V3 | In Cloudflare Pages (`thuisplanner-staging`): `VITE_PUSHPROEF` = `1` en `VITE_VAPID_PUBLIC_KEY` = de publieke sleutel | Bas | ☐ |
| V4 | Nieuwe uitrol van staging; op staging staat boven de app de regel **Pushproef** | Bas | ☐ |
| V5 | Een computer met Node 22+ en deze repository (voor het verzendscript) | Bas | ☐ |

## Per toestel: aanmelden

**iPhone (iOS 16.4 of nieuwer; Instellingen → Algemeen → Info → iOS-versie)**

1. Open staging in **Safari** (niet in Chrome of een andere app) en log in bij Cloudflare Access.
2. Tik op Deel → **Zet op beginscherm** → Voeg toe.
3. Open **Thuisplanner vanaf het beginscherm**. Die app heeft eigen cookies: log daar opnieuw in bij Access en in de app.
4. Tik op **Pushproef**. Bij "Geopend als" moet **App op het beginscherm** staan, bij "Service worker" **Actief**.
5. Tik op **Meldingen aanzetten**, lees de uitleg, tik op **Doorgaan** en dan op **Sta toe**.
6. Tik op **Abonnement maken** en dan op **Kopiëren**. Stuur de tekst naar de computer via AirDrop of een notitie die
   je daarna weer verwijdert (niet per mail of chatapp: wie de tekst heeft, kan dit toestel meldingen sturen).

**Desktop (Chrome, Edge of Safari)**: dezelfde stappen 4–6 in een gewoon tabblad.

Op de computer: zet de tekst in een bestand buiten de repository, bijvoorbeeld `~/pushproef/iphone-bas.json`, en
controleer eerst zonder te versturen:

```sh
cd thuisplanner/app
node --env-file=.env.pushproef.local scripts/pushproef-stuur.mjs ~/pushproef/iphone-bas.json --droog
```

## Per toestel: de proeven

Stuur telkens: `node --env-file=.env.pushproef.local scripts/pushproef-stuur.mjs <bestand> --adres '#/agenda'`.
Het script meldt `201: Verstuurd` als de pushdienst hem heeft aangenomen. Noteer per proef: ✓ (binnen een halve minuut
aangekomen), ✗ (niet aangekomen), of de vertraging.

| # | Situatie | Wat moet gebeuren | iPhone Bas | iPhone Sanne | Desktop |
| --- | --- | --- | --- | --- | --- |
| P1 | **Lokale testmelding** (knop op de proefpagina, zonder server) | Melding verschijnt | | | |
| P2 | App **open** op het scherm | Melding verschijnt (banner) | | | |
| P3 | App **op de achtergrond** (andere app open) | Melding verschijnt | | | |
| P4 | App **helemaal dicht** (omhoog vegen uit de appkiezer) | Melding verschijnt | | | |
| P5 | Scherm **vergrendeld** | Melding op het vergrendelscherm, met titel en tekst | | | |
| P6 | **Tikken** op de melding (vanuit P4 en P5) | De app opent op de **Agenda** | | | |
| P7 | Tikken terwijl de app al open staat op een ander scherm | De app springt naar de **Agenda** | | | |
| P8 | Na een **herstart** van het toestel (zonder de app te openen) | Melding verschijnt | | | |
| P9 | **Een dag later** (de app tussendoor niet geopend) | Melding verschijnt | | | |
| P10 | Met **Focus/Niet storen** aan | Geen geluid; melding staat daarna in het berichtencentrum | | | |
| P11 | Access-sessie **verlopen** en dan tikken | Eerst de Access-inlog, daarna de app (bekend, K8) | | | |

## Afsluiten

| # | Wat | Klaar |
| --- | --- | --- |
| A1 | Op elk toestel op de proefpagina **Opzeggen**; daarna geeft het script `410: Dit abonnement bestaat niet meer` | ☐ |
| A2 | De abonnementbestanden op de computer en de notities op de telefoon verwijderd | ☐ |
| A3 | Uitkomst vastgelegd (deze tabel ingevuld, met iOS-versies) en gemeld aan de regie | ☐ |
| A4 | `VITE_PUSHPROEF` weer weg uit Cloudflare Pages en opnieuw uitgerold (de service worker blijft; de proefregel verdwijnt) | ☐ |

**Geslaagd** als P2–P9 op beide iPhones ✓ zijn. P10 en P11 zijn informatie voor het ontwerp (stille uren, K8), geen
voorwaarde. Een ✗ op een iPhone: niet opnieuw proberen met andere instellingen, maar stoppen en melden, met de
uitvoer van het script en wat de proefpagina toont.
