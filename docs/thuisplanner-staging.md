# Thuisplanner-staging: inrichting en handelingen

**Status:** de lokale voorbereiding is gebouwd (16 oktober 2026, branch `thuisplanner-staging`, niet gepusht). Er bestaan
nog geen Supabase-organisatie, geen Supabase-project en geen Cloudflare-project. Huisplan, de Huisplan-database en GitHub
Pages zijn niet geraakt.

**Besluiten van de producteigenaar (16 oktober 2026):**

| Onderwerp | Besluit |
| --- | --- |
| Hosting | Cloudflare Pages, project `thuisplanner-staging` |
| Database | Een eigen Supabase-project in de organisatie *Thuisplanner*, regio Frankfurt (eu-central-1) |
| Afscherming | Cloudflare Access aan |
| Testers | De producteigenaar en zijn vriendin; alleen verzonnen gegevens |
| Kosten | Alleen gratis abonnementen |
| Branch | `thuisplanner-staging`, boven op de geteste keten van PR #26 |

Achtergrond, de vergelijking van hostingopties en de risico's staan in het eerdere onderzoek (lokaal,
`docs/thuisplanner-staging-hosting.md`).

## 1. Wat er in de app is gebouwd

| Onderdeel | Hoe | Waar |
| --- | --- | --- |
| Omgevingen | `demo` (geen backend), `lokaal` (dit toestel of eigen netwerk) en `staging`. Staging alleen via `npm run build:staging`; een gewone build kan het niet worden | `src/lib/omgeving.ts`, `src/lib/lokaal/sessie.ts` (`appConfig`) |
| Alleen het bedoelde project | De app en de build accepteren precies `https://<20 letters>.supabase.co`: geen http, geen poort, geen pad, geen andere schrijfwijze, en nooit een Huisplan-project (de build vergelijkt via SHA-256, zodat de kenmerken nergens in `thuisplanner/` staan). Zonder de stagingmarkering blijft elke online URL geweigerd | `src/lib/omgeving.ts`, `scripts/staging-build.ts` |
| Geen geheimen | De stagingbuild faalt bij `VITE_DEMO_*`, bij elke `VITE_*SERVICE*`/`*SECRET*`-variabele, bij een service-rol-JWT of `sb_secret_`-sleutel, en achteraf als er in de gebouwde bestanden een geheime sleutel, een ander Supabase-project of een Huisplan-project staat | `scripts/staging-build.ts` |
| Beveiligingsheaders | Elke build krijgt `_headers` voor Cloudflare Pages: een strenge CSP (`connect-src` alleen de eigen site plus precies het stagingproject, via https en wss), `noindex`, `no-referrer`, `nosniff`, `frame-ancestors 'none'`, `no-cache` voor `index.html` en `immutable` voor `assets/*` | `scripts/staging-build.ts` (`headersBestand`) |
| Markering | Vast bovenaan "Testomgeving · Alleen om te testen · verzonnen gegevens", ook op het inlogscherm. Het tabblad heet "Thuisplanner (testomgeving)" | `src/components/Lokaal.tsx`, `scripts/staging-build.ts` |
| Inloggen | E-mail en wachtwoord van een testaccount. Geen demo-accounts, geen vooraf ingevuld wachtwoord, en een nette foutmelding | `src/components/Lokaal.tsx` |
| Sessie op de telefoon | Staging: in `localStorage`, dus na het sluiten van de app blijf je ingelogd; uitloggen wist de sessie. Lokaal: per tabblad, zoals voorheen. Nooit een sessie uit de URL overnemen (`detectSessionInUrl: false`) | `src/lib/lokaal/sessie.ts` (`authOpties`) |
| Testers koppelen | Een SQL-script voor het dashboard dat de gewone functies gebruikt (`create_household`, `create_invite` als beheerder, `accept_invite`). Geen service-rolsleutel nodig | `thuisplanner/supabase/staging/testers.sql` |
| Verwijdering na 30 dagen controleren | Twee scripts voor het dashboard: verzonnen proefleden klaarzetten (31 en 29 dagen gearchiveerd), en na de nachtelijke run alleen-lezend controleren | `thuisplanner/supabase/staging/archief-proef.sql`, `archief-controle.sql` |

**Bewust niet veranderd:**
- Onbevestigde wijzigingen blijven na het uitloggen op het toestel bewaard (besluit P2 staat nog open). Voor twee
  testers op hun eigen telefoon is dat geen probleem; op een gedeeld toestel wel.
- De app kiest het eerste huishouden; elke tester heeft er maar één.
- Er is nog geen inloggen met een e-mailcode (KG-5H).

## 2. Tests (lokaal, 16 oktober 2026)

| Test | Uitkomst |
| --- | --- |
| Unittests | 136 van 136, waarvan 9 nieuw in `tests/omgeving.test.ts` (allowlist, Huisplan-weigering, geheimen, buildbewaking, headers, sessie-opslag) |
| Stagingbuild in de browser (`npm run e2e:staging`, 390 px) | 5 van 5: markering en leeg formulier; CSP zonder overtredingen; verkeer naar een ander Supabase-project en een willekeurige site geblokkeerd; verkeerd wachtwoord; ingelogd blijven na sluiten en heropenen; een token in de adresbalk wordt genegeerd |
| Tegenproeven op de browsertest | Met `detectSessionInUrl: true` faalt de adresbalktest; met de sessie per tabblad faalt de telefoontest |
| Buildbewaking | Acht onjuiste configuraties geweigerd (demowachtwoord, service-rol-JWT, `sb_secret_`, Huisplan-project, http, andere schrijfwijze, poort, `VITE_SERVICE_ROLE_KEY`); een gewone build met `VITE_OMGEVING=staging` geweigerd |
| `testers.sql` op de lokale stack | Tester 1 eigenaar, tester 2 beheerder. Een ontbrekende tester geeft een duidelijke fout zonder tweede huishouden |
| `archief-proef.sql` en `archief-controle.sql` op de lokale stack, en `pg_cron` zelf (tijdelijke taak elke minuut) | `succeeded`; precies het 31-dagenlid opgeruimd; het 29-dagenlid, de gedeelde afspraken en de profielen blijven |
| Regressie | Typecontrole, demo-e2e (138 geslaagd) en statische controles groen. De lokale e2e (lokale modus, echte stack) 15 van 15 in één keer |

In CI komt de browsertest erbij als stap in `thuisplanner-app.yml`. Die gebruikt dezelfde verzonnen projectnaam, dus
er is geen online project nodig.

## 3. Wat er online nodig is, in volgorde

Elke stap hieronder voer jij uit of geef jij apart vrij. Er staat bij wie wat doet.

### Stap 1 — Supabase: organisatie en project (jij)
1. Op [supabase.com/dashboard](https://supabase.com/dashboard) een nieuwe organisatie: **Thuisplanner**, plan **Free**.
2. Daarin een nieuw project: naam `thuisplanner-staging`, regio **Central EU (Frankfurt)**. Het databasewachtwoord
   alleen in je wachtwoordmanager.
3. Bewaar uit Project Settings → API: de **Project URL** (`https://<kenmerk>.supabase.co`) en de **anon/publishable key**.
   De service-rolsleutel heb je niet nodig; geef die nooit door.

Waarom dit gratis past: Supabase geeft twee gratis projecten, over alle organisaties samen, en gepauzeerde projecten
tellen niet mee. Beide Huisplan-projecten staan gepauzeerd (`INACTIVE`), dus dit wordt het enige actieve project. Haal
je later één Huisplan-project terug, dan zijn het er twee; meer gaat niet gratis.

### Stap 2 — Supabase: instellingen (jij, in het dashboard)

| Waar | Instelling |
| --- | --- |
| Authentication → Sign In / Providers → Email | **Allow new users to sign up: uit**. E-mail en wachtwoord blijven aan. "Confirm email" mag aan blijven: de beheerder bevestigt bij het aanmaken |
| Authentication → URL Configuration | Site URL: `https://thuisplanner-staging.pages.dev`. Geen extra Redirect URL's |
| Project Settings → Data API | Exposed schemas: alleen `public` (dus **niet** `private`, en `graphql_public` mag weg) |
| Database → Extensions | `pg_graphql` uit (niet gebruikt). `pg_cron` zet de migratie zelf aan; controleer dat in stap 3 |
| Realtime → Settings | "Allow public access" **uit** (alleen privékanalen) |

### Stap 3 — Schema naar staging (Claude, alleen na jouw akkoord: online databasewijziging)
**Geen `supabase link`, geen CLI-inlog.** De Supabase CLI op deze computer is ingelogd op een ander account (dat van
Huisplan) en ziet het stagingproject niet. Dat blijft zo. De verbinding loopt alleen via `--db-url` met de session pooler
van dit ene project.

Controle en dry-run, in een tab van het Terminal-paneel, vanuit de repository:

```
powershell -NoProfile -ExecutionPolicy Bypass -File .\thuisplanner\supabase\staging\verbinding.ps1 -Ref mcyjpnnjqxlqfwqhkqrl
```

Het script vraagt twee dingen:
- de session-pooler-URI, met `[YOUR-PASSWORD]` erin (geen geheim);
- het databasewachtwoord, bij een verborgen prompt. Het komt niet in de geschiedenis, op het scherm of in een bestand;
  het staat alleen in `PGPASSWORD` van dat ene proces, en wordt aan het eind gewist.

Daarna doet het script:
1. Vóór het verbinden weigert het alles behalve gebruiker `postgres.<kenmerk>`, de pooler in eu-central-1, poort 5432 en
   database `postgres`, en elke verwijzing naar Huisplan.
2. Alleen lezend (read-only transactie): is dit het lege project, met `pg_cron` beschikbaar?
3. `db push --dry-run`.
4. Alleen lezend: is er niets veranderd?

`-ExecutionPolicy Bypass` geldt alleen voor dat ene proces; de Windows-instelling verandert niet. De echte push volgt pas
na een apart akkoord.

**TLS:** de pooler gebruikt een eigen CA van Supabase ("Supabase Root 2021 CA"). Die staat niet in de standaardlijst van
Node.js of Windows, dus gewone certificaatcontrole geeft `self-signed certificate in certificate chain`. Er wordt **niets**
uitgeschakeld:
- `thuisplanner/supabase/staging/supabase-root-ca.crt` bevat de Supabase-roots uit de officiële Supabase CLI
  (`github.com/supabase/cli`, `prod-ca-2021.crt` en `prod-ca-2025.crt`);
- hun SHA-256-vingerafdrukken staan vast in `verbinding-controle.mjs`; een ander of aangevuld bestand wordt geweigerd;
- de controle (Node) en de dry-run (CLI, `sslmode=verify-full`) vertrouwen alleen die roots en controleren keten én
  hostnaam.

Gecontroleerd op 16 oktober 2026: de root die de pooler aanbiedt, heeft dezelfde vingerafdruk als `prod-ca-2021`
(`80:70:25:AD…CA:FA`). Met deze root slaagt de controle, met een verkeerde hostnaam of een nep-root faalt hij, en zonder
deze root komt de oorspronkelijke fout terug.

Daarna controle, alleen lezend: de migratielijst, `select jobname, schedule from cron.job` (moet
`thuisplanner-archief-opruimen` tonen) en de beveiligingsadviseur in het dashboard. De RLS-matrix draait niet op
staging; die rolt altijd terug, maar maakt testaccounts aan. Lukt het aanmaken van `pg_cron` via `db push` niet, dan
eerst `pg_cron` aanzetten in Database → Extensions en de push herhalen. Dit is nog een **aanname**; het wordt pas hier
zichtbaar.

### Stap 4 — Twee testers (jij)
1. Authentication → Users → **Add user → Create new user**, voor beide testers: e-mailadres, een sterk wachtwoord
   en **Auto Confirm User** aan. Dit werkt ook met registratie uit: alleen de beheerder kan dit.
2. SQL Editor → de inhoud van `thuisplanner/supabase/staging/testers.sql` plakken, de e-mailadressen en namen invullen,
   en op Run klikken. Klaar als de laatste regel "testhuishouden klaar … (2 leden met account)" toont.
3. De wachtwoorden geef je zelf door aan je vriendin. Wil ze er later uit, dan verwijder je haar account in
   Authentication → Users.

### Stap 5 — Cloudflare: account en Pages-project (jij)
1. Een gratis Cloudflare-account. Vraagt Cloudflare om een betaalmethode, stop dan en overleg eerst.
2. Workers & Pages → Create → Pages → **Connect to Git** → GitHub. Geef de Cloudflare-app **alleen** toegang tot
   `BasHoogstra/Thuisplanner`.
3. Instellingen:

| Instelling | Waarde |
| --- | --- |
| Projectnaam | `thuisplanner-staging` |
| Productiebranch | `thuisplanner-staging` |
| Framework preset | None |
| Root directory | `thuisplanner/app` |
| Build command | `npm ci && npm run build:staging` |
| Build output directory | `dist` |
| Omgevingsvariabelen (Production) | `NODE_VERSION` = `22`; `VITE_SUPABASE_URL` = de Project URL uit stap 1; `VITE_SUPABASE_ANON_KEY` = de anon/publishable key. Niets anders |
| Settings → Builds → Branch control | Automatic deployments voor de productiebranch aan; **Preview branches: None** |
| Build watch paths | Include `thuisplanner/app/*` en `thuisplanner/sync/*` |

De eerste build start pas als de branch op GitHub staat (stap 7). Een verkeerde of ontbrekende variabele laat de build
falen met een duidelijke melding; er komt dan niets online.

### Stap 6 — Cloudflare Access (jij)
1. Zero Trust (in het Cloudflare-dashboard) → bij de eerste keer een teamnaam kiezen, plan **Free**.
2. Pages-project → Settings → General → **Enable access policy**. Dat maakt een Access-applicatie aan, maar die
   beschermt alleen de previewadressen (`*.thuisplanner-staging.pages.dev`).
3. Zero Trust → Access → Applications → die applicatie → Edit → bij de hostnames het jokerteken weghalen, zodat
   **`thuisplanner-staging.pages.dev`** zelf beschermd is. Opslaan, en dan in de Pages-instellingen de access policy
   opnieuw aanzetten, zodat ook de previews een eigen beleid houden (Cloudflare "Known issues").
4. Beleid: **Allow**, Include → **Emails**: jouw adres en dat van je vriendin. Login method: **One-time PIN**.
   Session duration: bijvoorbeeld 1 maand, zodat de telefoon niet elke dag om een code vraagt.
5. Controle: het adres openen in een privévenster laat het Access-scherm zien, en een ander e-mailadres krijgt geen code.

### Stap 7 — Branch pushen (Claude, alleen na jouw akkoord)
`git push -u origin thuisplanner-staging`. Cloudflare bouwt alleen die branch. Huisplan (`main`, GitHub Pages) verandert
niet.

### Stap 8 — Proef op de telefoons (jij en je vriendin)
`https://thuisplanner-staging.pages.dev` openen, de Access-code invoeren, inloggen met het testaccount, en via de
browser "Zet op beginscherm" kiezen. Controleren:
- de markering "Testomgeving" staat bovenaan;
- een boodschap van de een verschijnt bij de ander;
- een privé-afspraak is bij de ander "Bezet";
- na het sluiten en heropenen ben je nog ingelogd.

### Stap 9 — De automatische verwijdering controleren (na jouw akkoord: online databasewijziging, alleen verzonnen gegevens)
1. Authentication → Users → **Add user**: twee proefaccounts, bijvoorbeeld `proef31@example.com` en
   `proef29@example.com` (Auto Confirm User aan). Niemand hoeft ermee in te loggen.
2. SQL Editor → `thuisplanner/supabase/staging/archief-proef.sql` plakken, het e-mailadres van de eigenaar invullen, en op
   Run klikken. Het script zet de twee proefleden klaar, met elk een privé- en een gedeelde afspraak, archiveert ze, en
   zet de archiefdatum op 31 en 29 dagen. Het laat zien: Proef 31 en Proef 29, elk met 1 privé-afspraak.
3. De volgende dag, na 03:17 UTC (05:17 Nederlandse zomertijd, 04:17 wintertijd): SQL Editor →
   `thuisplanner/supabase/staging/archief-controle.sql`. Verwacht:
   - de taak `thuisplanner-archief-opruimen` staat erin, met een laatste run `succeeded`;
   - Proef 31 heeft 0 privé- en 1 gedeelde afspraak; Proef 29 heeft er nog 1 en 1.
4. Het project moet in die tijd actief zijn. Een gratis project kan na zeven dagen met weinig activiteit worden
   gepauzeerd, en in een gepauzeerd project draait `pg_cron` niet. Supabase zegt niet of `pg_cron` zelf als activiteit
   telt.

**Lokaal al bewezen (16 oktober 2026):** beide scripts tegen de lokale stack, en `pg_cron` zelf. Een tijdelijke taak
die elke minuut draaide, gaf `succeeded` en ruimde precies Proef 31 op; die taak is daarna weer verwijderd. Op staging
moet nog blijken dat de taak daar op het geplande tijdstip draait.

## 4. Kosten

Nu € 0: Supabase Free, Cloudflare Pages en Cloudflare Access (gratis tot 50 gebruikers). Grenzen van gratis:
- het project pauzeert na een week met weinig activiteit, en is daarna met één klik te herstellen;
- er zijn geen back-ups met herstel naar een tijdstip;
- de ingebouwde e-mail is alleen voor teamleden, ongeveer 2 per uur. Dat is niet nodig zolang er met een wachtwoord
  wordt ingelogd.

## Bronnen
- [Supabase: twee gratis projecten; gepauzeerde tellen niet mee](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase: pauzeren van gratis projecten](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Cloudflare Pages: Access op previews](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Cloudflare Pages: Access op het productieadres (known issues)](https://developers.cloudflare.com/pages/platform/known-issues/)
