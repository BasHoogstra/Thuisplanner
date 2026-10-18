# Thuisplanner: een gescheiden mobiele testomgeving (onderzoek en stappenplan)

**Status:** 📝 voorstel (14 oktober 2026; op 15 oktober 2026 opnieuw gecontroleerd en aangevuld, zie §9).
Alleen onderzoek. Er is niets aangemaakt, gekoppeld,
gedeployd of in een database gewijzigd. Elke stap die dat wel doet, staat hieronder gemarkeerd met
**🔐 akkoord nodig**.

- **Hoort bij:** bouwstap KG-5J (staging) uit `docs/thuisplanner-bouwplan.md`, en de open besluiten
  **B2** (omgevingen) en **B3** (techniek en adres) uit `docs/roadmap.md`.
- **Gelezen:** `PRODUCT_PRINCIPLES.md`, `docs/productkompas-beslissingen.md`, `docs/roadmap.md`,
  `docs/thuisplanner-bouwplan.md`, `docs/thuisplanner-app.md`, `supabase/README.md`,
  `.github/workflows/`, `thuisplanner/app/` (Vite-configuratie en omgevingsbewaking).

## 1. Advies in één zin

Host de testapp op **Cloudflare Pages** (gratis), als een eigen project op een eigen adres
(`<naam>.pages.dev`), dat alleen bouwt vanaf één aparte branch. Zet **Cloudflare Access** ervoor, zodat
alleen uitgenodigde testers de app kunnen openen. De app praat uitsluitend met een **eigen
Thuisplanner-staging in Supabase**, niet met de bestaande Huisplan-projecten.

## 2. Eerst melden: twee botsingen

### 2.1 "Supabase staging" kan niet het bestaande stagingproject zijn, zonder apart besluit

- In `supabase/README.md` is "staging" het Huisplan-project `rfgmaqqsjvsuibfucdrp`, met het oude schema
  uit `supabase/`.
- De roadmap zegt (sectie "Ontwikkelrichting Thuisplanner"):
  - "Het bestaande schema en de bestaande projecten worden niet gebruikt of gewijzigd";
  - en "Geen verbinding met of migraties naar bestaande Supabase-projecten, en geen deploy, zonder apart
    besluit (B2)".
- Het bouwplan (stap 9) noemt "een nieuw Supabase-project in de EU, aangemaakt door jou".

Ik lees "uitsluitend Supabase staging" daarom als: **alleen een testproject, nooit productie**. Dat
testproject moet een eigen Thuisplanner-stagingproject zijn. Klopt die lezing niet, dan is dat besluit
B2 en moet het eerst genomen worden.

### 2.2 Een derde gratis Supabase-project past niet zomaar

> **Bijgewerkt op 15 oktober 2026:** beide Huisplan-projecten blijken al gepauzeerd (`INACTIVE`). Een
> nieuw gratis project past daardoor wél, zonder iets aan Huisplan te doen. Zie §10.2 en het nieuwe
> advies in §10.4. De tekst hieronder is de stand van 14 oktober.

- Een Supabase-account krijgt **twee gratis projecten in totaal**, over alle organisaties waarvan je
  eigenaar of beheerder bent. Gepauzeerde projecten tellen niet mee
  ([Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase)).
- De organisatie *Huisplan* heeft er al twee: productie en staging. Beide zijn leeg.
- Zonder betaald abonnement zijn er dus drie wegen. De keuze is aan jou (**B2**):

| Optie | Wat | Gevolg |
| --- | --- | --- |
| **A (advies)** | Eén van de twee lege Huisplan-projecten **pauzeren** en een nieuw project "Thuisplanner-staging" maken, in een eigen organisatie | Volledig gescheiden. De schema's en gegevens van het gepauzeerde project blijven bewaard, maar het project is niet bereikbaar tot het wordt hersteld. Controleer vóór het pauzeren de hersteltermijn in het dashboard. |
| B | Het lege Huisplan-staging **opnieuw inrichten** met het Thuisplanner-schema | Geen nieuw project nodig. Wel wordt het Huisplan-staging gewist en klopt `supabase/README.md` niet meer. De roadmap raadt dit af ("niet stil hergebruiken"). |
| C | Een betaald abonnement | Valt buiten deze opdracht (geen nieuwe betaalde diensten). |

## 3. Wat er nu is

| Onderdeel | Stand |
| --- | --- |
| Branch | Werk staat op `thuisplanner-toevoegen-rustiger`, gestapeld op `thuisplanner-lokaal-windows` en de open PR's. `thuisplanner/` staat **niet** op `main`. |
| Huisplan | GitHub Pages publiceert de **root van `main`** met Jekyll (geen workflow, geen `CNAME`). |
| Bescherming Huisplan-site | `_config.yml` sluit `thuisplanner/` uit van de Huisplan-site. Gemerged via PR #24 (`607d427`, zie §10.1). |
| Repository | Openbaar (`BasHoogstra/Thuisplanner`). `main` bevat alleen de Huisplan-bestanden (13 items in de root), geen `thuisplanner/` en geen `_config.yml`. |
| Thuisplanner-app | Vite 7 + React 19 + TypeScript in `thuisplanner/app`. De build is statisch (`vite build` naar `dist/`), met relatieve paden (`base: './'`). Routing gaat via `#/…`, dus er is geen server-fallback nodig. Op 15 oktober lokaal gebouwd: 2,4 s, `dist/` 524 kB (één JS-bundel van 504 kB, 146 kB gzip). |
| Afhankelijkheid buiten de app-map | Vite leest de sync-module uit `thuisplanner/sync` (`fs.allow: ['..']`). |
| Omgevingsbewaking | `src/lib/lokaal/sessie.ts` weigert elk Supabase-adres dat niet lokaal is. Voor staging is een eigen, strikte modus nodig (stap 3). |
| Inloggen | Nu met een wachtwoord voor fictieve accounts. Het lokale wachtwoord kan via `VITE_DEMO_WACHTWOORD` in de bundel terechtkomen. Inloggen met een e-mailcode (KG-5H, besluit B4) is nog niet gebouwd. |
| CI | `thuisplanner-app.yml` en `thuisplanner-db.yml` testen alles lokaal op de runner. Ze gebruiken geen secrets en deployen niets. |

## 4. Hostingopties vergeleken

Eisen: gratis, HTTPS (nodig voor een installeerbare app op de telefoon), een eigen adres los van
Huisplan, alleen bouwen vanaf een gekozen branch, eigen headers (CSP, `noindex`), toegang af te
schermen, en toegestaan voor een product dat later commercieel wordt.

| | **Cloudflare Pages** | Netlify (gratis) | Vercel Hobby | GitHub Pages (tweede site) | Firebase Hosting |
| --- | --- | --- | --- | --- | --- |
| Kosten | Gratis; statische verzoeken onbeperkt; 500 builds per maand, 1 tegelijk | Grens van 300 credits; een productiedeploy kost 15 credits (dus ongeveer 20 deploys); wat er bij nul credits gebeurt, staat niet op de prijspagina | Gratis, maar **alleen niet-commercieel** | Gratis voor publieke repo's | Gratis Spark-tegoed |
| Gescheiden van Huisplan | Ja, eigen domein `*.pages.dev` | Ja | Ja | **Nee:** zelfde origin `bashoogstra.github.io`, dus gedeelde `localStorage`, service workers en cookies met Huisplan | Ja, maar binnen het Firebase-account van Huisplan |
| Alleen één branch bouwen | Ja (productiebranch plus "geen previews") en watch paths per map | Ja | Ja | Eén site per repo; zou een aparte repo vereisen | Via CI |
| Eigen headers | `_headers`-bestand | `_headers` / `netlify.toml` | `vercel.json` | Nee | `firebase.json` |
| Toegang afschermen | **Cloudflare Access**, gratis tot 50 gebruikers | Wachtwoord alleen op betaalde plannen | Alleen testers met een eigen Vercel-account; een wachtwoord kost $20 per maand op Pro | Nee | Nee |
| Past bij de regels | Ja | Ja | **Nee** (commercieel gebruik vereist Pro) | **Nee** (raakt Huisplan) | **Nee:** wijzigingen aan Firebase-configuratie vragen een apart akkoord (besluit 7) en mengen de omgevingen |

**Waarom Cloudflare Pages:**
- het enige gratis plan met afscherming voor een kleine testgroep;
- geen creditlimiet die een testronde stil kan leggen;
- commercieel gebruik is toegestaan;
- het adres staat volledig los van Huisplan.

**Kanttekening:** Cloudflare raadt voor *nieuwe* projecten steeds vaker "Workers met statische
bestanden" aan. Pages blijft ondersteund, en voor een statische app is het eenvoudiger (branchbediening,
previews, `_headers`). Een latere overstap kost alleen de hostingconfiguratie, niet de app.

**Git-koppeling of handmatig uploaden?** Cloudflare Pages kan op twee manieren publiceren:

- **Git-koppeling (advies).** Cloudflare bouwt zelf vanaf de branch `thuisplanner-staging`. Er
  hoeft geen sleutel op jouw computer of in GitHub te staan, en wat online staat is altijd een
  commit. Nadeel: de Cloudflare-app krijgt toegang tot deze repository en zet een status bij commits
  op die branch.
- **Direct upload met `wrangler pages deploy`.** Er is geen koppeling met GitHub; je uploadt een
  lokaal gebouwde `dist/`. Nadeel: er is een Cloudflare-API-sleutel op jouw computer nodig, het is
  niet na te gaan welke commit online staat, en een project dat zo begint, kan later
  **niet** naar een Git-koppeling worden omgezet.

## 5. Stappenplan

Elke stap is klein en terug te draaien. Er wordt niets aan `main` gewijzigd en er wordt niets gemerged.

| # | Stap | Wie | Wijzigt |
| --- | --- | --- | --- |
| 0 | **Besluiten:** B2 (optie A, B of C uit §2.2); B3 bevestigen (Vite + React, statisch, Cloudflare Pages); de branchnaam (voorstel `thuisplanner-staging`); Access ja of nee; de testers (alleen jijzelf en een paar bekenden, alleen fictieve gegevens). | jij | niets |
| 1 | **Stagingmodus in de app (code, lokaal getest, geen deploy).** (a) Een Vite-modus `staging` die alleen precies het ene stagingadres accepteert (allowlist, geen `*.supabase.co`); bij een ander adres weigert de app op te starten, net als nu. (b) Een vaste, rustige markering "Testomgeving". (c) Een build die faalt als `VITE_DEMO_WACHTWOORD` of een service-role-sleutel in de omgeving staat. (d) Een `public/_headers` met CSP (`connect-src` alleen naar het stagingadres, `https` en `wss`), `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`, en `no-cache` voor `index.html`. (e) Tests: de weigering met tegenproef, en de headers. | Claude, op een eigen branch | alleen code op een branch |
| 2 | **Supabase-project aanmaken** volgens optie A of B. Regio **eu-central-1 (Frankfurt)**, in een eigen organisatie "Thuisplanner". | jij, in het dashboard 🔐 | nieuw project |
| 3 | **Schema naar staging:** `supabase link` vanuit `thuisplanner/` en `supabase db push` met de migraties uit `thuisplanner/supabase/migrations`. Daarna de RLS-matrix en de integratietests tegen staging, met alleen de databasegegevens die jij lokaal invult (nooit in de repo of in CI). | Claude, alleen na akkoord 🔐 | databasewijziging |
| 4 | **Auth-instellingen op staging:** nieuwe aanmeldingen **uit**; testaccounts alleen via een uitnodiging of de beheerder; Site URL en Redirect URL's op het Pages-adres; de rate limits laten zoals ze zijn. De ingebouwde e-mail van Supabase stuurt alleen naar teamleden, maximaal ongeveer 2 per uur. Dat is genoeg voor jezelf, niet voor andere testers. | jij 🔐 | projectinstellingen |
| 5 | **Cloudflare:** een gratis account. Een Pages-project via "Connect to Git"; de Cloudflare-app op GitHub **alleen voor deze repository**. Instellingen in §6. | jij 🔐 | nieuw account, GitHub-koppeling |
| 6 | **Cloudflare Access** op de productie- en preview-adressen van `*.pages.dev`. Een beleid "e-mail is een van …" met de testers; inloggen met een eenmalige code. De knop in de Pages-instellingen beschermt alleen de previews. Voor het productieadres: in de Access-applicatie die daarbij ontstaat het jokerteken uit de hostnaam halen en daarna de knop opnieuw aanzetten (Cloudflare "Known issues"). Controleer bij het aanmelden of Zero Trust om een betaalmethode vraagt. Is dat zo, dan eerst stoppen en overleggen. | jij 🔐 | Access-beleid |
| 7 | **Eerste deploy:** de branch `thuisplanner-staging` aanmaken vanaf de goedgekeurde stand en pushen. Cloudflare bouwt alleen die branch. | Claude, alleen na akkoord 🔐 | push en deploy |
| 8 | **Controle:** e2e tegen staging met fictieve accounts (twee contexten); de headers controleren; de proef met twee telefoons via het Pages-adres. | Claude en jij | niets |
| 9 | **Gate 9-review vóór echte persoonsgegevens:** tot die review akkoord is, alleen fictieve gegevens en geen andere testers dan jijzelf (bouwplan stap 9). Daarna een EU-SMTP-dienst kiezen voor de inlogcodes (B4). | review, daarna jij | — |

## 6. Benodigde instellingen

**Cloudflare Pages-project**

| Instelling | Waarde |
| --- | --- |
| Projectnaam | bijvoorbeeld `thuisplanner-test` (wordt het openbare adres `thuisplanner-test.pages.dev`; vermijd de definitieve merknaam) |
| Productiebranch | `thuisplanner-staging` |
| Previewbranches | **None** (anders bouwt Cloudflare elke branch en elke PR, en die zijn standaard openbaar) |
| Root directory | `thuisplanner/app` |
| Build command | `npm run build:staging` (nieuw in stap 1) |
| Build output | `dist` |
| Build watch paths | include `thuisplanner/app/*`, `thuisplanner/sync/*` |
| Omgevingsvariabelen | `NODE_VERSION=22`; `VITE_SUPABASE_URL` (staging-URL); `VITE_SUPABASE_ANON_KEY` (de publishable/anon key, die per ontwerp openbaar is). **Nooit** de service-role-sleutel, het databasewachtwoord of `VITE_DEMO_WACHTWOORD`. |
| Access policy | aan voor productie én previews (zie stap 6) |

**Supabase-staging**

| Instelling | Waarde |
| --- | --- |
| Regio | eu-central-1 (Frankfurt) |
| Organisatie | apart van *Huisplan* |
| Auth → nieuwe gebruikers toestaan | uit |
| Auth → Site URL / Redirect URL's | het Pages-adres, exact |
| Realtime | aan (nodig voor de seintjes) |
| Sleutels | alleen de anon/publishable key in Cloudflare; de service-role-sleutel alleen in jouw wachtwoordmanager |
| Pauzeren | een gratis project pauzeert na ongeveer 7 dagen zonder activiteit en moet dan met de hand worden herstart |

**GitHub**
- De Cloudflare Pages-app alleen voor de repository `BasHoogstra/Thuisplanner`.
- Geen wijziging aan de Pages-instellingen van Huisplan, en geen nieuwe secrets in GitHub. Bij de
  Git-koppeling bouwt Cloudflare zelf; er hoeft geen workflow te deployen.

## 7. Risico's

| Risico | Kans | Gevolg | Maatregel |
| --- | --- | --- | --- |
| Een previewdeploy van een andere branch komt openbaar online | middel | Ongeteste code bereikbaar | Previewbranches op **None**, plus Access op `*.pages.dev` |
| De testapp praat per ongeluk met een ander Supabase-project | laag | Verkeerde of echte gegevens | Exacte allowlist in de app (stap 1a) en `connect-src` in de CSP |
| Geheimen in de bundel | middel | Iedereen kan inloggen of beheren | De build faalt op `VITE_DEMO_WACHTWOORD` of service-sleutels (stap 1c); alleen de anon key in Cloudflare |
| De Huisplan-site publiceert per ongeluk `thuisplanner/` | laag nu, hoog bij een merge | Broncode en demo op de Huisplan-site | `thuisplanner/` niet naar `main` zolang `_config.yml` (branch `claude/pages-thuisplanner-uitsluiten`) niet op `main` staat. Dat is een eigen besluit. |
| Gate 9 nog niet gereviewd op een online project | middel | Privé-gegevens lekken | Alleen fictieve gegevens tot de review (stap 9); RLS-matrix ook tegen staging (stap 3) |
| Gratis Supabase-limiet (twee projecten) | zeker | Geen nieuw project mogelijk | Besluit B2 (§2.2) |
| Staging pauzeert na een week stilte | zeker | Testers zien een foutmelding | Herstarten in het dashboard; vóór een testronde controleren |
| E-mail van Supabase alleen voor het team, ongeveer 2 per uur | zeker | Andere testers kunnen geen code ontvangen | Eerst alleen jijzelf; daarna een SMTP-dienst in de EU (B4) |
| Zero Trust vraagt een betaalmethode | onbekend | Botst met "geen betaalde diensten" | Stoppen en overleggen; zonder Access blijft de app achter een inlog en RLS, maar is het app-skelet openbaar |
| Cloudflare bouwt met `thuisplanner/app` als root, maar de app leest ook `thuisplanner/sync` | laag | Build faalt | De repository wordt volledig opgehaald; bij de eerste build controleren, en anders de sync-module in de build kopiëren |
| Cloudflare verschuift van Pages naar Workers | laag | Later migreren | Alleen de hostingconfiguratie; de app is statisch |
| De tests draaien op een andere branch dan wat live staat | middel | Een fout komt online | Alleen naar `thuisplanner-staging` pushen vanaf een stand waarop de CI groen is |
| De Cloudflare-app op GitHub ziet de hele (openbare) repository en zet statussen bij commits | zeker | Meer zichtbare ruis bij PR's; een extra partij met toegang | App alleen voor deze repository; previews op **None**; de koppeling is in GitHub met één klik in te trekken |
| De pagina blijft na een update de oude versie tonen (cache) | middel | Testers testen een oude stand | `Cache-Control: no-cache` voor `index.html` in `_headers`; de bestanden in `assets/` hebben een hash in de naam |

## 8. Productkompas-toets (kort)

1. **Principes:** "Privacy volgt de situatie" en principe 10 (geen gegevens buiten de EU-staging; alleen
   fictieve gegevens tot de gate 9-review). Principe 8: dit maakt werkelijk gebruik mogelijk.
2. **Neemt het werk weg?** Indirect: zonder testomgeving is er geen echt gebruik om keuzes op te baseren.
3. **Organiseren, onthouden, uitvoeren?** Het is een randvoorwaarde, geen functie.
4. **Eenvoudiger?** Ja: één statische host, één branch, geen eigen server.
5. **Aandacht, controle, privacy?** Access, CSP, `noindex`, nieuwe aanmeldingen uit, alleen een EU-regio.
6. **Bewijs?** Dit is nodig om het te kunnen verzamelen.
7. **Ultieme toets:** maakt het mogelijk te toetsen of Thuisplanner het huishouden werk bespaart.

**Gates:** gate 9 geldt vóór echte persoonsgegevens (stap 9). De navigatiegate (beslissing 2) en de
importgates worden niet geraakt: er is geen Huisplan-data, er is geen Firebase-wijziging, en Huisplan
blijft ongewijzigd.

## 9. Gecontroleerd op 15 oktober 2026

| Wat | Uitkomst |
| --- | --- |
| Branch | `thuisplanner-toevoegen-rustiger`, 83 commits boven op `main`, geen upstream. Er is niets gepusht of gemerged. |
| `main` | Toen gecontroleerd tegen een verouderde lokale `main`; zie §10.1 voor de juiste stand. |
| Pages-instellingen van Huisplan | Niet uitgelezen: de API vraagt een login en `gh` staat niet op deze computer. De bewering "root van `main`, Jekyll" komt uit de repository, niet uit de instellingen. Controleer dit zelf in GitHub → Settings → Pages vóór stap 7. |
| Build | `npm run build` in `thuisplanner/app` slaagt lokaal; de sync-module in `../sync` wordt meegenomen. `dist/` is genegeerd door Git. |
| Omgevingsbewaking | `lokaleConfig()` in `src/lib/lokaal/sessie.ts` gooit een fout bij elk niet-lokaal adres. Een online build start dus nu niet; stap 1 is nodig. |
| Supabase | Nog steeds twee gratis projecten per account, over alle organisaties; gepauzeerde tellen niet mee. Ingebouwde e-mail: alleen teamleden, 2 per uur. |
| Cloudflare Pages | Gratis: 500 builds per maand, 1 tegelijk, 100 projecten, 20.000 bestanden. Productiebranch en "Preview branch control: None" zijn instelbaar. |
| Cloudflare Access | Gratis tot 50 gebruikers is volgens meerdere bronnen nog zo. **Niet bevestigd:** of aanmelden een betaalmethode vraagt. Daarom blijft stap 6 een stop-en-overlegpunt. |
| Vercel Hobby | Bevestigd (documentatie van 14 september 2026): alleen niet-commercieel, persoonlijk gebruik. |
| Netlify Free | Grens van 300 credits; een productiedeploy kost 15 credits. Wat er gebeurt bij nul credits staat niet op de prijspagina. |

## 10. Aanvulling 15 oktober 2026: drie controles vóór B2

Alleen gelezen. Er is niets gepusht, gemerged, gedeployd, gepauzeerd, hersteld of aangemaakt. De enige
wijziging is lokaal: de lokale branch `main` is vooruitgezet naar `origin/main` (zie 10.1).

### 10.1 GitHub

| Wat | Uitkomst |
| --- | --- |
| `origin/main` | `607d427` "Pages: map thuisplanner/ niet publiceren op de Huisplan-site (#24)". `_config.yml` staat erop en sluit `thuisplanner` uit. |
| Waarom de lokale `main` achterliep | De lokale `main` stond op `a48e3b6` (2 oktober, laatste `git pull --ff-only`). Sindsdien is alles via PR's op GitHub gemerged. `main` staat in geen enkele worktree uitgecheckt (de hoofdmap staat op `fase-1`), dus niemand heeft hem bijgewerkt. Hij liep **55 commits achter en 0 vóór**: er stond lokaal niets op dat niet ook op GitHub stond. |
| Bijgewerkt | `git fetch origin main:main`. Dat kan alleen vooruitspoelen en weigert als er iets verloren zou gaan. `main` = `607d427`. Andere branches, worktrees en ongecommitte bestanden zijn niet aangeraakt. |
| Huisplan-site | Antwoordt met 200. `/thuisplanner/README.md` geeft 404. |
| Let op | De werkbranch `thuisplanner-toevoegen-rustiger` is gebaseerd op een oudere `main` en bevat `607d427` niet. Dat is voor de testapp niet erg (`_config.yml` werkt alleen op `main`). Bij een latere PR naar `main` moet hij wel worden bijgewerkt. Er staat ook nog een tijdelijke worktree van een andere sessie op `claude/pages-thuisplanner-uitsluiten`; die branch is nu gemerged en kan later worden opgeruimd. |

### 10.2 De twee Supabase-projecten

Bron: `supabase projects list` en `supabase orgs list` (Supabase CLI, alleen lezen), `supabase/README.md`
en de repository. De databases zelf zijn **niet** bevraagd: ze staan uit, en ze aanzetten is een wijziging.

| | Productie | Staging |
| --- | --- | --- |
| Ref | `tmkhpiomdnneeoscsjge` | `rfgmaqqsjvsuibfucdrp` |
| Naam in het dashboard | de standaardnaam (met een e-mailadres erin) | `huisplan-staging` |
| Organisatie | *Huisplan* (de enige organisatie op het account) | *Huisplan* |
| Regio, Postgres | eu-west-1 (Ierland), 17.11 | eu-west-1, 17.11 |
| Aangemaakt | 2 oktober 2026 | 2 oktober 2026 |
| **Status nu** | **`INACTIVE` = gepauzeerd** | **`INACTIVE` = gepauzeerd** |
| Schema (volgens README) | het oude Huisplan-schema `supabase/`: drie migraties (`20261002064401`, `20261002064437`, `20261003090000`), vingerafdruk 169 / `2780289b…36b3` | hetzelfde, aantoonbaar gelijk op 3 oktober |
| Data (volgens README) | leeg op 3 oktober: 0 gebruikers, 0 rijen, lege privé-bucket | alleen testdata; de RLS-tests rollen terug |
| In gebruik? | **Nee.** Huisplan draait op Firebase; `index.html` op `main` gebruikt geen Supabase. De refs staan alleen in documentatie, `supabase/config.toml` en een test die controleert dat Thuisplanner ze **niet** gebruikt. | **Nee**, idem. |

**Gevolgen:**

- **Er hoeft niets gepauzeerd te worden.** Gepauzeerde projecten tellen niet mee voor de grens van
  twee gratis projecten. Er draaien nu nul projecten, dus een nieuw Thuisplanner-project past gratis.
- **Herstellen** kan met één klik in het dashboard, binnen de hersteltermijn. Volgens de
  documentatie is dat nu een jaar; het dashboard toont per project een aftelling, dus controleer daar
  de echte termijn. Bij herstel gaat Postgres naar de nieuwste kleine versie. Na de termijn kun je
  alleen nog een back-up en de bestanden downloaden.
- **Grens bij herstel:** met een actief Thuisplanner-project kan daarna nog maar **één** Huisplan-project
  tegelijk aan. Voor stap 1.12 (import) is dat een aandachtspunt, nu niet.
- Niet live gecontroleerd: of de schema's nog precies gelijk zijn aan de README. Dat kan alleen na
  herstel, en dat valt buiten deze opdracht.

### 10.3 Eerst een interfacedemo zonder backend

**Kan dat zonder tijdelijke code? Ja.** De app heeft al een demomodus (`DemoApp` in `src/App.tsx`).
Die start automatisch als `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` niet zijn gezet. Een gewone
`npm run build` zonder omgevingsvariabelen levert dus precies die demo op. De browsertests in CI
controleren al dat de demo geen enkele externe aanvraag doet.

| Werkt in de demo | Werkt niet in de demo |
| --- | --- |
| Vandaag, Agenda (dag, week, maand), Taken, Boodschappen, Meer | Inloggen, accounts, huishoudens, uitnodigen |
| Toevoegen, aanpassen, verwijderen, ongedaan maken, herhalende afspraken, het gezinsfilter | Opslaan: herladen zet alles terug; niets in `localStorage` |
| Het rustiger Toevoegen-venster (deel A) | Synchroniseren tussen twee telefoons (iedere telefoon heeft zijn eigen demo) |
| "Bezet" voor privé-afspraken (alleen in de interface; geen bewijs voor gate 9) | Realtime, meldingen, een echte e-mailcode |
| Telefoonbreedtes 360 en 390 en de donkere modus | Installeren als app: er is geen `manifest`; "Zet op beginscherm" geeft alleen een snelkoppeling |

**Nodig, maar geen tijdelijke code:** één klein, blijvend bestand `thuisplanner/app/public/_headers` met
`X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`, een CSP met
`connect-src 'self'` (de demo praat met niemand) en `no-cache` voor `index.html`. Dat bestand is later
ook voor staging nodig; dan komt alleen het stagingadres bij `connect-src`.

**Risico's van de demo:**
- Wordt er in Cloudflare per ongeluk een `VITE_SUPABASE_URL` naar een online project gezet, dan
  weigert de app op te starten met een foutmelding. Dat is een veilige fout.
- De bundel bevat `@supabase/supabase-js`, maar die wordt in de demo niet aangeroepen. Dat is geen
  risico, wel 500 kB.
- Testers kunnen denken dat iets is opgeslagen. Zet daarom in de uitnodiging "demo, herladen wist
  alles". De demobalk in de app zegt dat ook al.

### 10.4 Advies voor B2

**Een nieuw, eigen Supabase-project "thuisplanner-staging", in een nieuwe organisatie "Thuisplanner",
in de EU, gratis.** De twee Huisplan-projecten blijven precies zoals ze zijn: gepauzeerd, niet
hergebruikt, niet gewist.

- Dit volgt het advies uit de roadmap ("nieuwe projecten; de bestaande niet stil hergebruiken").
- Er hoeft niets gepauzeerd of verwijderd te worden.
- Regio: Frankfurt (eu-central-1) of Ierland (eu-west-1). Allebei EU. Ierland houdt alles in één
  regio met Huisplan; Frankfurt ligt iets dichter bij Nederland. Geen sterke voorkeur; advies Frankfurt,
  zoals in het bouwplan.
- **Maar nog niet nu nodig.** Voor de eerste mobiele testlink is geen Supabase nodig (10.3). B2 kan
  worden genomen; het project aanmaken hoeft pas bij de staging-stap.

### 10.5 Kortste veilige route naar een mobiele testlink

**Fase 1: de demo, zonder backend (advies, kortste route).**

| # | Stap | Wie | Akkoord |
| --- | --- | --- | --- |
| 1 | `public/_headers` toevoegen (zie 10.3), lokaal bouwen, en controleren dat de headers in `dist/` staan en de e2e-tests groen blijven. Commit op een eigen branch, niet gepusht. | Claude | nee (alleen lokaal) |
| 2 | Een gratis Cloudflare-account. Stoppen als Zero Trust om een betaalmethode vraagt. | jij | 🔐 |
| 3 | Publiceren met **direct upload**: `npx wrangler pages deploy dist --project-name thuisplanner-demo --branch main --commit-hash <hash>`. Inloggen doe je zelf met `wrangler login` (via de browser). Er wordt niets naar GitHub gepusht en er komt geen GitHub-koppeling. | Claude voert uit, alleen na akkoord | 🔐 deploy |
| 4 | Cloudflare Access op het project (productie- en previewadres, zie stap 6 in §5). Alleen jouw e-mailadres en die van de testers. Pas daarna de link delen. | jij | 🔐 |
| 5 | Op twee telefoons openen: het Access-inlogscherm verschijnt, daarna de demo; de headers controleren. | jij en Claude | nee |

Waarom direct upload voor de demo, en niet de Git-koppeling uit §4: er wordt niets gepusht, er krijgt
geen app toegang tot GitHub, en Huisplan wordt nergens geraakt. Het nadeel (een project met direct
upload kan later niet naar een Git-koppeling) is hier juist handig. De demo blijft een eigen project,
en staging wordt later een **apart** project met een Git-koppeling en een eigen adres. Zo worden demo
en staging nooit verward.

**Fase 2, later: staging met Supabase.** Dit is §5 vanaf stap 1, met B2 volgens 10.4: de stagingmodus in
de app, een nieuw project, het schema, de Auth-instellingen, de Git-koppeling op `thuisplanner-staging`
en een gate 9-review vóór echte persoonsgegevens.

## Bronnen

- [Supabase: About billing (twee gratis projecten, account-breed)](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase: gepauzeerde projecten herstellen](https://supabase.com/docs/guides/platform/upgrading)
- [Supabase: Custom SMTP (standaardmail alleen voor het team)](https://supabase.com/docs/guides/auth/auth-smtp)
- [Cloudflare Pages: preview deployments en Access](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Cloudflare Pages: limieten](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare Pages: branch build controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)
- [Cloudflare Pages: build watch paths](https://developers.cloudflare.com/pages/configuration/build-watch-paths/)
- [Cloudflare Pages: known issues (Access op `*.pages.dev`, Node-versie)](https://developers.cloudflare.com/pages/platform/known-issues/)
- [Cloudflare Pages: direct upload (kan later niet naar Git-koppeling)](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Cloudflare: Workers vs. Pages](https://developers.cloudflare.com/workers/static-assets/compatibility-matrix)
- [Vercel: Hobby alleen niet-commercieel](https://vercel.com/docs/plans/hobby)
- [Netlify: prijzen en credits](https://netlify.com/pricing.md)
- [Cloudflare Zero Trust: gratis plan (50 gebruikers)](https://blog.cloudflare.com/teams-plans)
