# Thuisplanner · één keer inloggen, daarna gewoon dagelijks gebruik (advies)

**Status:** onderzoek en advies, 26 november 2026. Lokaal, niet gecommit. Er is niets gewijzigd aan Cloudflare Access,
Pages, Supabase Auth, de database of de code.
**Doel van Bas:** één inlogmoment, daarna normaal dagelijks gebruik zonder onnodige onderbrekingen. Een langere
Access-sessie is alleen een tijdelijke overbrugging. Dit wordt een acceptatievoorwaarde voor de besloten bèta op
14 december.

**Bronnen.** Documenten: `PRODUCT_PRINCIPLES.md`, `docs/productkompas-beslissingen.md`, `docs/roadmap.md`,
`docs/thuisplanner-registratie-inloggen.md` (§3, §4, §6.4, §13, §17a, §20.4, §25, §26),
`docs/thuisplanner-beta-voorbereiding.md` (§2.3, §9a, O2/O3), `docs/thuisplanner-staging.md`. Code:
`thuisplanner/app/src/lib/lokaal/sessie.ts`, `thuisplanner/supabase/config.toml`,
`thuisplanner/supabase/migrations/20261021120000_toegangspoort.sql`,
`20261125120000_besloten_beta_registratie.sql` en `thuisplanner/omgevingen.json` op de integratiebranch
`thuisplanner-besloten-beta` (f0a9134); `public/sw.js`, `src/pwa/registreer.ts`, `public/manifest.webmanifest` en
`index.html` op `origin/thuisplanner-pwa-basis` (PR #57); `@supabase/auth-js` 2.117.2 in `node_modules`.
Een eigen meting op de lokale stack `thuisplanner_k12` (niet de bèta-teststack), daarna opgeruimd.

---

## Kort antwoord

1. **Access kan van de dagelijkse omgeving af, maar niet "zomaar" van staging.** De dagelijkse omgeving wordt de
   bèta-omgeving op `app.mijnthuisplanner.nl` (Pages-project `thuisplanner-app`, dat al zo in `omgevingen.json` staat,
   met toegang `code-inlog-en-testpoort`). Daar beschermen Supabase Auth met de codelaag, de toegangspoort, RLS en de
   registratie op uitnodiging (P2). Access beschermt nu geen gegevens: de Supabase-API is ook vandaag al zonder Access
   bereikbaar. Access gaat daar pas uit na de Access-poort (besluit O3/C van 28 oktober) en een apart akkoord.
2. **Supabase vernieuwt sessies automatisch en betrouwbaar**, zonder einddatum, zolang er geen tijdslimiet of
   inactiviteitslimiet wordt ingesteld. Gemeten: na vernieuwen blijft de code-sessie een code-sessie (`amr: otp`,
   dezelfde `session_id`) en geeft de toegangspoort `ok`.
3. **Ingelogd blijven na updates, inactiviteit en afsluiten: ja, met twee voorwaarden.** (a) Altijd hetzelfde adres
   (origin): een ander adres is een andere opslag en dus opnieuw inloggen. (b) Op de iPhone als echte beginscherm-app.
   Die werkt pas betrouwbaar met de manifest en de `apple-mobile-web-app-capable`-tag uit PR #57; die staan **nog niet**
   op staging en niet op de integratiebranch.
4. **De technische testomgeving houdt Access**: staging (`thuisplanner-staging.pages.dev` met al zijn previews), plus
   bij het bèta-project de technische hostnamen (`thuisplanner-app.pages.dev` en previews). Alleen
   `app.mijnthuisplanner.nl` is zonder Access.

---

## Vraag 1 · Kan Cloudflare Access voor de dagelijkse omgeving veilig vervallen zodra registratie op uitnodiging klaar is?

### Bevinding

- **Access beschermt alleen de Pages-site (de statische app), niet de gegevens.** De app praat rechtstreeks met
  `https://<ref>.supabase.co`; die API (Auth, REST, Realtime, Edge Functions) staat niet achter Access en is nu al voor
  iedereen bereikbaar. Het stagingkenmerk staat bovendien in `thuisplanner/omgevingen.json` in de repository. De echte
  grens was dus altijd al Auth, de poort en RLS (zo ook `thuisplanner-registratie-inloggen.md` §13 en
  `thuisplanner-beta-voorbereiding.md` §2.3).
- **Wat nu al zonder Access de deur dichthoudt:**
  - inloggen alleen met een e-mailcode via de eigen codelaag (K1, §26): 6 cijfers, 10 minuten, hoogstens 5 pogingen
    per code, Turnstile;
  - de toegangspoort `private.toegang_status()`: alleen een sessie met `amr = otp` die nog in `auth.sessions` staat.
    Een wachtwoord-, herstel- of uitnodigingssessie krijgt niets (`code-nodig`). Getest in `poort.test.mjs`, ook na
    vernieuwen;
  - RLS en huishoudscheiding (de testmatrix, en straks het API-scheidingsscript van P5 met tegenproef);
  - G1: alleen adressen op de testerslijst maken een huishouden; `huishouden_open` staat uit;
  - **P2** (migratie `20261125120000`): een nieuw account krijgt alleen een code als het adres op de testerslijst staat
    of een open uitnodiging heeft. Anders hetzelfde antwoord als "registratie dicht", zonder adresverraad. Herstel,
    herbevestiging en uitnodigen via Auth geven een stil succes zonder mail. Er zijn grenzen per adres, per uitnodiger
    en per ontvanger.
- **P2 staat alleen op de lokale integratiebranch**, nog niet op staging en niet online. Access kan dus pas vervallen na
  de uitrol en de Access-poort online.

### Wat zonder Access openkomt, en hoe het gedekt is

| Wat Access nu afschermt | Zonder Access | Dekking zonder Access | Restrisico |
| --- | --- | --- | --- |
| De app zelf (HTML/JS) | Iedereen kan de app openen | Bevat geen gegevens of geheimen (de buildbewaking weigert geheimen); `noindex` | Laag: de opbouw van de app is zichtbaar |
| Het aanmeldscherm (codes aanvragen) | Iedereen kan een code aanvragen | P2: een onbekend adres krijgt geen account en geen bruikbare code; Turnstile; grenzen per adres en per uur; noodstop 1 en 2 (§25) | Mailtegoed (Lettermint 300 per maand), deels gedekt door de uitlegmail van hoogstens 1 per adres per 24 uur |
| Wachtwoord-reset / herstel (`/recover`) | Al vandaag bereikbaar via de API, mét en zonder Access | Geen wachtwoorden; een herstelsessie krijgt van de poort niets; P2 geeft een stil succes zonder mail | Geen |
| Aanmelden met een wachtwoord (`/signup`) | Al vandaag bereikbaar via de API | De bevestigingsmail loopt via de hook (P2: geen mail); een wachtwoordsessie krijgt van de poort niets | Een leeg, onbevestigd account kan ontstaan (opruimen via het dagoverzicht) |
| Of een adres een account heeft | Al vandaag via de Auth-API te zien (M1: `/otp`, `/recover`, `/signup`) | Turnstile en Auth-limieten | **Geaccepteerd restrisico M1** (besluit Bas, 25 november) |
| Preview- en branch-builds (`*.thuisplanner-staging.pages.dev`) | Open als Access van het hele project gaat | **Niet van toepassing in het advies**: staging houdt Access | — |
| Previews van het bèta-project (`*.thuisplanner-app.pages.dev`) | Standaard **openbaar** bij Pages, en ze zouden met de bèta-database (straks productie) praten | Previews uit, of Access op de previews (zie de inrichting) | Hoog als je niets doet |
| `thuisplanner-app.pages.dev` (het tweede adres van de bèta) | Open, met een eigen opslag (een tweede inlog als iemand dat adres gebruikt) | Access op dat adres, zodat er maar één adres werkt | Laag |

### Conclusie vraag 1

**Ja, voor de dagelijkse omgeving `app.mijnthuisplanner.nl`**, mits:
1. P2 online staat (op de bèta-database);
2. de Access-poort uit `thuisplanner-beta-voorbereiding.md` §2.3 online groen is: authenticatie, autorisatie,
   huishoudscheiding via de API met tegenproef, H1–H19, S1/S2 en de verwijderproef;
3. previews en het `pages.dev`-adres van het bèta-project afgeschermd zijn;
4. Bas apart akkoord geeft.

**Nee voor staging.** Daar komen onafgemaakte migraties, proefscripts en preview-builds; dat blijft achter Access
(besluit B1). Dit advies verandert niets aan O3/C. Het voegt alleen de afscherming van de technische hostnamen toe.

---

## Vraag 2 · Vernieuwt Supabase Auth de sessies automatisch en betrouwbaar?

### Bevinding

- **De instellingen in de app** (`sessie.ts`, `authOpties`): online `persistSession: true`, `autoRefreshToken: true`,
  `detectSessionInUrl: false`, opslag `localStorage`, sleutel `thuisplanner-auth`. Lokaal per tabblad
  (sessionStorage), alleen voor tests.
- **De instellingen in Auth** (`config.toml` en de lokale Auth-container): `jwt_expiry = 3600` (toegangstoken 1 uur),
  rotatie van refresh-tokens aan, een herhaalmarge van 10 seconden, en een grens van 150 vernieuwingen per 5 minuten
  per IP. Er is **geen** tijdslimiet en **geen** inactiviteitslimiet voor sessies. Een refresh-token heeft geen
  einddatum. De sessie loopt dus door tot iemand uitlogt, de sessie wordt ingetrokken of de opslag op het toestel
  verdwijnt.
- **supabase-js 2.117.2:**
  - vernieuwt op de achtergrond zolang de app zichtbaar is;
  - stopt de klok als de app naar de achtergrond gaat, en vernieuwt direct bij terugkeer (`visibilitychange`);
  - vernieuwt bij elke aanroep als het token binnen 90 seconden verloopt;
  - stemt tabbladen op elkaar af met een lock.
- **Netwerkfouten en serverstoringen loggen niemand uit.** Status 0, 500–504 en 520–530 tellen in auth-js als
  "opnieuw proberen"; de sessie blijft bewaard. De app toont dan de fase `verbinding` en probeert het elke 5 seconden
  opnieuw (`herstel`/`wachtOpVerbinding`). Bij een mislukte vroege vernieuwing met een nog geldig token blijft de sessie
  ook bewaard.
- **Eigen meting (lokaal, 26 november):** een code-sessie drie keer vernieuwd. Steeds `amr: ["otp"]`, dezelfde
  `session_id` en `mijn_toegang = ok`. De toegangspoort blijft dus na vernieuwen open. Dat stond nog niet als
  geautomatiseerde test vast; die test bestond alleen voor wachtwoordsessies. Het oude refresh-token werkte binnen de
  herhaalmarge nog (S4 in §20.4: ook na 12 seconden, zolang het opvolgende token ongebruikt is).

### Wanneer wél opnieuw inloggen (bewust of als risico)

| Oorzaak | Bewust? | Kans | Maatregel |
| --- | --- | --- | --- |
| "Uitloggen" of "Uitloggen op alle toestellen" | ja | — | — |
| Adreswijziging (andere toestellen worden uitgelogd, W4) | ja | zelden | — |
| Noodstop 3 of verwijderde sessies | ja | zelden | — |
| Verhuizing naar een ander Supabase-project (sessies gaan bewust niet mee in de export) | ja | één keer | Plannen op het overstapmoment (zie de overbrugging) |
| Een tijdslimiet, inactiviteitslimiet of "één sessie per gebruiker" in Auth (pas op Pro beschikbaar) | **nee** | klein, maar de bèta komt op Pro | Uit laten; opnemen in de checklist en de nacontrole |
| **Status 429 bij vernieuwen terwijl het token al verlopen is**: auth-js telt 429 niet als netwerkfout en wist dan de sessie | nee | zeer klein (150 per 5 minuten per IP, alleen Thuisplanner-verkeer) | De grens "Token refresh" in Auth niet verlagen; als restrisico vastleggen |
| Een oud refresh-token hergebruikt na de herhaalmarge, terwijl het opvolgende token al gebruikt is (diefstaldetectie) | nee | zeer klein (één opslag per origin, met lock) | — |

### Conclusie vraag 2

**Ja, automatisch en betrouwbaar**, met de huidige instellingen. Er is één klein restrisico (429). Twee kleine
verbeteringen zijn het overwegen waard (elk een eigen akkoord):
- een test die het vernieuwen van een code-sessie met de poort vastlegt;
- een nette overgang naar het inlogscherm als de server de sessie echt intrekt. De app luistert nu niet naar
  `onAuthStateChange`/`SIGNED_OUT` (T24); dat is alleen voor het gemak, niet voor het ingelogd blijven.

---

## Vraag 3 · Blijven gebruikers ingelogd na updates, langdurige inactiviteit en het afsluiten van de app?

| Situatie | Bevinding | Bron |
| --- | --- | --- |
| **App-update (nieuwe Pages-build)** | Ja. Een update verandert alleen JS/HTML; `localStorage` van hetzelfde adres blijft. De service worker uit PR #57 heeft geen fetch-handler en geen cache, neemt met `skipWaiting` direct over en raakt geen opslag. Alleen een wijziging van de `storageKey` of van het adres zou iedereen uitloggen | `sessie.ts`, `sw.js`, `registreer.ts` |
| **Database-update (migratie)** | Ja. Sessies staan in `auth.sessions` en blijven. Behalve bij een verhuizing naar een ander project | `toegangspoort.sql`, §9a |
| **App afsluiten / telefoon herstarten** | Ja, getest in `e2e-staging` en `e2e-beta` ("blijft bewaard na sluiten en heropenen") | `staging.spec.ts:71`, `beta.spec.ts:66` |
| **Dagen of weken niet geopend: Android, Chrome en Edge op de desktop** | Ja. `localStorage` blijft; bij openen wordt eerst vernieuwd | auth-js, §17a |
| **iPhone, beginscherm-app (standalone)** | Ja. WebKit telt voor een beginscherm-app alleen de dagen dat je de app zelf gebruikt; de 7-dagenregel van Safari wist daar niets. **Maar** zonder manifest en `apple-mobile-web-app-capable` opent het pictogram (afhankelijk van de iOS-versie) gewoon in Safari, met de opslag van Safari. Die tags staan alleen op `thuisplanner-pwa-basis` (PR #57), **niet** op staging en niet op de integratiebranch | `index.html` op drie branches, §6.4 |
| **iPhone, in een Safari-tabblad, meer dan 7 dagen niet geopend** | **Nee.** Safari (ITP) wist de opslag van de site; opnieuw een code nodig (6 handelingen). Dit geldt ook voor Safari op de Mac | §6.4, §17a |
| **Safari tegenover de beginscherm-app** | Twee aparte opslagen: één keer inloggen in de beginscherm-app. In Safari inloggen telt niet voor de app | §17a |
| **Browser van WhatsApp of Gmail** | Opslag kan bij het sluiten weg zijn; alleen voor aanmelden en accepteren | §17a |
| **Ander adres** (bijvoorbeeld van `thuisplanner-staging.pages.dev` naar `app.mijnthuisplanner.nl`, of het `pages.dev`-adres naast het eigen domein) | **Nee.** Een ander adres heeft een eigen opslag: opnieuw inloggen, en op de iPhone het pictogram opnieuw op het beginscherm zetten | webplatform (same-origin) |
| **Offline openen** | Ja. De fase `verbinding`, geen inlogscherm. Na een mislukte vernieuwing 60 seconden afkoeling (S2); de app blijft dan wachten | `sessie.ts`, §20.4 |
| **Browsergegevens gewist of opslag vol** | Uitgelogd. Bij weinig opslagruimte kan een browser een site wissen; `navigator.storage.persist()` vraagt dat te voorkomen. Dat wordt nu niet gevraagd | — |
| **Cloudflare Access verlopen (alleen staging)** | Het Access-scherm verschijnt. Op de iPhone-beginscherm-app gaat dat via een ander domein (`*.cloudflareaccess.com`); dat is onhandig en de oorzaak van de "onnodige" inlog. Ook het manifest en `sw.js` vragen dan een Access-cookie | `staging.md` stap 6, `index.html` (PR #57, `use-credentials`) |

### Conclusie vraag 3

**Ja, met drie voorwaarden:**
1. één vast adres zonder Access;
2. op de iPhone de beginscherm-app met de manifest uit PR #57;
3. een eenmalige, rustige beginschermhint voor wie in een Safari-tabblad werkt. De beginschermkaart uit §15.3 is nog
   niet gebouwd.

---

## Vraag 4 · Hoe houden we de technische testomgeving wél achter Access?

Twee Pages-projecten, met elk eigen hostnamen. Access per hostnaam, niet per project:

| Hostnaam | Project | Database | Access | Voor wie |
| --- | --- | --- | --- | --- |
| `app.mijnthuisplanner.nl` | `thuisplanner-app` (productiebranch, bijvoorbeeld `thuisplanner-beta`) | bèta (straks productie, O2) | **Nee** | Bas, Sanne, de testgezinnen |
| `thuisplanner-app.pages.dev` | idem | idem | **Ja** (of een redirect naar het eigen domein) | niemand; voorkomt een tweede adres met een eigen sessie |
| `*.thuisplanner-app.pages.dev` (previews) | idem | idem | **Ja**, of previews uit ("Preview deployments: none") | Advies: **uit**. Een preview met de productiedatabase is onwenselijk; testen gebeurt op staging |
| `thuisplanner-staging.pages.dev` + `*.thuisplanner-staging.pages.dev` | `thuisplanner-staging` | staging | **Ja, blijft** (zoals nu, met de bestaande policy) | Bas (technisch testen), Claude-proeven met verzonnen gegevens |

- In Zero Trust is een Access-applicatie per hostnaam in te stellen. Voor `app.mijnthuisplanner.nl` komt er dan geen
  applicatie (of wordt die verwijderd); voor de `pages.dev`-namen wel. Zo blijft er één openbaar adres, en de rest is
  technisch en afgeschermd.
- **Kanttekening (te verifiëren in het dashboard):** de knop "Enable access policy" in Pages beschermt standaard alleen
  de previews (`*.project.pages.dev`). Het hoofdadres moet je apart in de Access-applicatie zetten (zo gedaan bij
  staging, `thuisplanner-staging.md` stap 6). Voor het bèta-project gebeurt het omgekeerde: het eigen domein blijft
  bewust buiten Access.
- Staging verandert niet. Bas en Sanne gebruiken staging daarna niet meer dagelijks, dus de Access-sessieduur daar
  stoort niet meer.

---

## Aanbevolen inrichting

1. **De dagelijkse omgeving = de bèta-omgeving op `app.mijnthuisplanner.nl`**, zoals al vastgelegd in
   `omgevingen.json` en §13 (B1). Bas en Sanne verhuizen daarheen als eerste gezin, op of vlak vóór 14 december. Ze
   loggen daar **één keer** in; dat is het ene inlogmoment op het definitieve adres. Daarna nooit meer van adres
   wisselen. Bij de lancering wordt dit project productie (O2), zonder nieuwe inlog, omdat adres en project gelijk
   blijven.
2. **PR #57 (de manifest en de beginscherm-tags) in de bèta-build** vóór 14 december. Zonder die tags is de
   iPhone-voorwaarde niet hard te maken. De pushproef zelf hoeft niet mee; alleen manifest, pictogrammen en meta-tags
   zijn nodig. De service worker mag mee (hij raakt de sessie niet).
3. **Auth-instellingen van de bèta vastleggen in de checklist en de nacontrole:**
   - JWT-expiry 3600;
   - rotatie aan, herhaalmarge 10 seconden;
   - geen time-box, geen inactiviteitstime-out, geen "single session per user";
   - de grens "Token refresh" niet lager dan 150 per 5 minuten.
4. **Afscherming van de technische hostnamen** van het bèta-project: previews uit, en `thuisplanner-app.pages.dev`
   achter Access (of een redirect).
5. **Kleine app-verbeteringen** (code, lokaal te bouwen, elk een eigen akkoord):
   - een eenmalige beginschermhint op de iPhone in een Safari-tabblad (§15.3);
   - `navigator.storage.persist()` na het inloggen;
   - een integratietest "code-sessie na vernieuwen blijft `ok`";
   - optioneel een `SIGNED_OUT`-luisteraar voor een nette overgang (T24);
   - geautomatiseerde varianten van T21 en T23. Die vond ik niet als test.
6. **Staging blijft achter Access**, voor techniek en proeven.

### Tijdelijke overbrugging (tot de verhuizing naar de bèta)

- Op staging de Access-sessieduur (applicatie en policy) op het maximum zetten (1 maand; de precieze maximale waarde is
  te verifiëren in het dashboard). Daarna één Access-inlog per toestel. Die overbrugt de periode tot 14 december. Het
  blijft een tijdelijke maatregel, zoals Bas wil.
- Op de iPhone staging nu als beginscherm-app openen. Zonder manifest helpt dat alleen op iOS-versies die elk
  pictogram als web-app openen; anders blijft het Safari met de 7-dagenregel. Daarom zo nodig PR #57 eerst op staging
  (eigen akkoord).
- Niet doen: Access van staging halen, of het Supabase-stagingproject met Access proberen af te schermen. Dat kan niet
  en is ook niet nodig.

---

## Acceptatievoorwaarde voor 14 december (meetbaar)

**Voorwaarde "Eén keer inloggen".** Op `app.mijnthuisplanner.nl`, zonder Cloudflare Access, ziet een gebruiker na één
code-inlog per toestel in de volgende situaties **geen enkel inlogscherm en geen Access-scherm**: na een app-update, na
het afsluiten en herstarten van app en toestel, na offline openen, en na **minstens 8 dagen** niet openen. Dit geldt
voor een iPhone-beginscherm-app en voor een desktopbrowser (Chrome of Edge); Android Chrome als het toestel er is.
Geslaagd = alle testpunten hieronder groen, met datum en tijd vastgelegd.

> Waarom 8 dagen: net over de 7-dagenregel van Safari. Bij een start op 14 december moet de 8-dagenproef uiterlijk
> **5 december** beginnen. Dat kan alleen op de definitieve hostnaam als die dan al bestaat (achter Access voor het
> inrichten, zonder Access voor de eindproef). Lukt dat niet, dan meten we de 8 dagen op de iPhone met een vergelijkbare
> opzet (een PWA met manifest op staging), en herhalen we het korter op de bèta (testpunt 9).

| # | Testpunt | Toestel | Verwacht | Wie |
| --- | --- | --- | --- | --- |
| 1 | Eerste inlog met een code in de beginscherm-app | iPhone (Bas en Sanne) | Binnen 2 minuten ingelogd; geen Access-scherm | Bas, Sanne |
| 2 | App uit de app-wisselaar vegen en heropenen; telefoon herstarten | iPhone | Direct het huishouden, geen inlogscherm | Bas, Sanne |
| 3 | Nieuwe build uitrollen (app-update), app daarna openen en herladen | iPhone + desktop | Ingelogd; nieuwe versie zichtbaar | Claude (uitrol na akkoord), Bas |
| 4 | Database-migratie uitrollen, daarna openen | iPhone + desktop | Ingelogd | Claude (na akkoord), Bas |
| 5 | Vliegtuigmodus aan, app openen, na 2 minuten weer online | iPhone | "Geen verbinding", nooit het inlogscherm; daarna vanzelf verder (binnen 60 tot 90 seconden) | Bas |
| 6 | Minstens 8 dagen niet openen, daarna openen | iPhone-beginscherm-app | Ingelogd, geen code nodig | Bas of Sanne (één toestel bewust laten liggen) |
| 7 | Minstens 8 dagen niet openen | desktop Chrome of Edge (browser gesloten) | Ingelogd | Bas |
| 8 | Browser en computer herstarten | desktop | Ingelogd | Bas |
| 9 | Toegangstoken verlopen (meer dan 1 uur dicht) en daarna openen | iPhone + desktop | Ingelogd, hoogstens kort "Even geduld" | Bas |
| 10 | Tegenproef: "Uitloggen op alle toestellen" op toestel A | A en B | B is bij de volgende actie uit (TPA02), A ook; opnieuw inloggen kan met een code | Bas |
| 11 | Tegenproef: `app.mijnthuisplanner.nl` in een privévenster | desktop | Geen Access-scherm; wel het codescherm. `thuisplanner-app.pages.dev` en een preview geven het Access-scherm (of bestaan niet) | Claude (zonder inlog) |
| 12 | Auth-instellingen van de bèta | dashboard | JWT 3600; rotatie aan; herhaalmarge 10 s; geen time-box, inactiviteitstime-out of single session | Bas (schermafdruk), Claude legt vast |
| 13 | Geautomatiseerd (lokaal en in CI): code-sessie na vernieuwen `ok`; heropenen bewaard (bestaat); T21 en T23 | — | Groen, met tegenproef | Claude |

---

## Handelingen die elk een apart akkoord van Bas vragen

1. Access-sessieduur op staging verlengen (tijdelijke overbrugging).
2. PR #57 (of alleen de manifest en de tags) samenvoegen naar staging, en later naar de bèta.
3. De kleine app-verbeteringen bouwen en committen (beginschermhint, `storage.persist`, de test, `SIGNED_OUT`,
   T21/T23).
4. P2 en de integratiebranch pushen, de Draft PR maken en naar staging zetten (staat al in het voortgangsoverzicht).
5. Het bèta-Supabase-project aanmaken (Pro, eigen organisatie) en de Auth-instellingen zetten volgens punt 3 van de
   inrichting.
6. Het Pages-project `thuisplanner-app` en het eigen domein `app.mijnthuisplanner.nl` (DNS) koppelen.
7. Previews van `thuisplanner-app` uitzetten, en Access op `thuisplanner-app.pages.dev` (en eventueel de previews)
   zetten.
8. Access tijdelijk op `app.mijnthuisplanner.nl` tijdens het inrichten (O3/C), en **Access daar uitzetten** na de
   groene Access-poort.
9. Migraties en functies op de bèta-database, en de uitrol van de app.
10. De verhuizing van Bas en Sanne van staging naar de bèta: export en import van hun verse gegevens, en één nieuwe
    code-inlog per toestel.
11. De 8-dagenproef starten (welk toestel bewust blijft liggen, en vanaf welke datum).
12. Het restrisico "429 bij vernieuwen" vastleggen in `docs/thuisplanner-restrisico-besloten-beta.md`.

Niets hiervan is uitgevoerd.
