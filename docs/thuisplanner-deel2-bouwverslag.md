# Thuisplanner KG-5H deel 2: bouwverslag (lokaal)

**Status:** lokaal gebouwd en getest (17 oktober 2026), op branch `thuisplanner-deel2`, in zes lokale commits. Er is
niets gepusht, gemerged of gedeployed. Er is niets gewijzigd aan een online database, aan staging, aan de bèta, aan
Huisplan of aan GitHub Pages.

**Aanvulling na de afrondende beoordeling (17 oktober 2026):**
- §3: welke tests tegen wat draaiden;
- §4.2: wat gehost getest moet worden;
- §6: bèta als vaste keuze;
- §7: bewaking van de toegangspoort;
- het voorstel voor automatische verzending: `docs/thuisplanner-uitnodigingsmail-verzending.md`.

Ook dit is alleen lokale documentatie.

**Voortbouwend op:**
- `docs/thuisplanner-deel2-bouwscope.md` (de goedgekeurde bouwscope);
- `docs/thuisplanner-k1-ontwerp.md` (de eigen codelaag);
- `docs/thuisplanner-registratie-inloggen.md` §15 (D6, M1 en M2).

## 1. Wat er gebouwd is

| Commit | Onderdeel | Belangrijkste punten |
| --- | --- | --- |
| 1/6 | Toegangspoort (AMR) en testpoort (G1) | `private.uid()` geeft alleen een gebruiker bij een codesessie (`amr` alleen `otp`/`totp`), een bestaande sessie in `auth.sessions` en geen onderhoud. Alle toegangsfuncties, RLS, RPC's en Realtime leunen erop. Fail-closed. Codes TPA01–TPA03 en TPB01 |
| 2/6 | K1, de eigen codelaag | Send Email-hook `stuur-code` (zes cijfers, HMAC met pepper, `token_hash` versleuteld); `controleer-code` met atomaire grenzen (per code 5, per account 100, onbekende context 30, per toestel 10, hoogstens 5 toestellen); toestel-tokens die bij elk succes wisselen; Supabase zelf geeft de sessie uit (`verifyOtp`). Codes TPK00–TPK06 |
| 3/6 | De app | Codescherm (e-mailadres, zes cijfers, vanzelf verder, aftellen, hulp, ander adres); M1 (de aanvraag overleeft herladen, 10 minuten); M2 (altijd zien met welk adres); netwerkfout = wachten, nooit uitloggen; onderhoud = wachten; Account (uitloggen hier of overal, adres wijzigen met twee codes); besloten test op het welkomstscherm; naam één keer; Turnstile alleen met een sitekey |
| 4/6 | Uitnodigingsmail (D6) en nacontrole | Wachtrij in de database, zonder adres of token; hoogstens één mail per rij; "nog eens sturen" hoogstens 3 keer, één per 10 minuten, 20 per huishouden per dag (TPM01–TPM04); status bij de uitnodiger; `stuur-uitnodiging` alleen voor een beheerder met een codesessie. De nacontrole kent de 15 migraties, het schema, de vier geplande taken, de schakelaars van de poort, Storage en de Auth-instellingen |
| 5/6 | Herstel van de testinfrastructuur | De sync-tegenproeven op Windows (regeleinden) en onder Node 24 (TAP-rapport); de publieke functies van D6 volgens KG-T46 |
| 6/6 | Documentatie | Dit verslag, roadmap en changelog |

## 2. Afwijkingen van de bouwscope (ter beoordeling)

1. **Geen wachtwoord overschrijven in K1.** Gemeten: een wachtwoordwijziging via de Admin-API maakt de openstaande
   bevestiging ongeldig en trekt alle sessies in. De toegangspoort maakt een vooraf gezet wachtwoord onschadelijk (een
   wachtwoordsessie krijgt nergens toegang; getest via REST, RPC, Realtime en de Edge Function).
2. **CORS `*` op `controleer-code` en `stuur-uitnodiging`.** Geen cookies of inloggegevens via de browser; de lokale
   gateway zet zelf `*`. CORS is hier geen beveiligingsgrens. De bescherming zit in de grenzen, de captcha, de eenmalige
   `token_hash` en (bij de uitnodigingsmail) de sessiecontrole via de database.
3. **Geen geplande taak die mails verstuurt (opgelost op 18 oktober 2026: zie §8).** Nu verstuurt de app wachtende mails:
   - bij het maken van een uitnodiging;
   - bij "nog eens sturen";
   - zodra een beheerder het huishouden opent.

   Een mail die door een storing blijft wachten, gaat dus pas weer als een beheerder de app opent. **Dit is geen
   definitieve oplossing** (besluit van 17 oktober 2026). Het voorstel voor automatische verzending (een trigger en een
   geplande taak met `pg_net` en Vault, met foutafhandeling en bewaking) staat in
   `docs/thuisplanner-uitnodigingsmail-verzending.md`. Tot dat gebouwd is, gaat de uitnodigingsmail niet naar externe
   testers.
4. **De bounce-webhook (T18) is alleen in de database gebouwd.** `uitnodigingsmail_niet_bezorgd(bericht-id)` en de
   status werken en zijn getest. De webhook zelf hangt af van de mailaanbieder (B6), en die is nog niet gekozen.
5. **"Onzeker" wordt nooit automatisch opnieuw verstuurd.** Een time-out na het versturen kan betekenen dat de mail al
   weg is. Dan liever geen tweede mail (T16) en een duidelijke status met "Mail nog eens sturen" en de link.
6. **Namen in de uitnodigingsmail.** Een naam van een uitnodiger of huishouden die op een link of adres lijkt (`@`,
   `www.`, `.nl`, schuine strepen), langer dan 40 tekens is of onzichtbare tekens bevat, komt er niet in. De mail zegt
   dan "Iemand" of "een huishouden". Zo is de mail geen kanaal voor reclame of phishing.
7. **De testgrens van de schermtests is 20 seconden** (was 5). Onder volle parallelle belasting met de Docker-stack
   duurden enkele schermtests in jsdom langer; afzonderlijk zijn ze ruim binnen 1 seconde (zie §3, kanttekening).

Gevonden en hersteld tijdens de bouw:
- De `rpc`-hulp van de Edge Functions faalde op een functie zonder resultaat (204 zonder body). Dat raakte ook het
  foutpad van `stuur-code` (`k1_code_vervalt`). De mail was op dat moment al weg en de rij bleef "bezig": de garantie
  "hoogstens één mail" hield stand.
- Een regex met onzichtbare tekens brak het laden van de Edge Function. Nu alleen ASCII (`\p{Cc}\p{Cf}\p{Zl}\p{Zp}`).

## 3. Testresultaten (lokaal, 17 oktober 2026)

**Geen enkele test hieronder draaide tegen een online omgeving.**
- Er is geen verbinding gemaakt met de bestaande staging (Supabase-project of Cloudflare Pages), met een bèta of met
  Huisplan.
- Alles draaide op deze computer.

De kolom "Waartegen" zegt per testset tegen wat precies.

| Testset | Waartegen | Uitkomst |
| --- | --- | --- |
| RLS-matrix | Lokale Supabase-stack in Docker (echte PostgreSQL 17) | 75 van 75 (met de poortcatalogus, §7.4) |
| SQL-tegenproeven | Idem | 111 van 111 |
| Auth- en database-integratie (11 bestanden, waaronder poort, K1 en uitnodigingsmail) | Lokale stack: echte GoTrue, PostgREST, Realtime, Edge Runtime en Mailpit | 88 van 88 |
| K1- en D6-tegenproeven (sabotage per regel) | Idem | 17 van 17 |
| Sync-tegenproeven | Idem | 22 van 22 |
| Gelijktijdigheid (`run.sh --gelijktijdig`) | Idem | 6 van 6; in de tegenproefmodus 6 bewust overgeslagen (rijslot, zie `tegenproeven.txt`) |
| Statische controles | Alleen de bestanden in de repository | geslaagd |
| App-unittests | jsdom, met nagebootste clients | 188 van 188 |
| Lokale e2e | Een lokale build van de app tegen de lokale stack, met Mailpit | 24 geslaagd, 2 overgeslagen (screenshots) |
| **Staging-e2e** | **Een lokale simulatie, niet de online staging** (zie hieronder) | 5 van 5 |
| Demo-e2e | De demomodus zonder database | 138 geslaagd, 9 overgeslagen (screenshots) |
| Nacontrole (`leesNa`, `naFouten`, `authFouten`) | De lokale database en de lokale Auth-instellingen | precies één afwijking, zoals bedoeld: "wachtwoordsessies zijn toegestaan" (alleen lokaal, via `seed.sql`) |

**Wat de staging-e2e wel en niet toetst.** De vijf tests (`e2e-staging/staging.spec.ts`, configuratie
`playwright.staging.config.ts`) bouwen de app in de stagingmodus en serveren die op `127.0.0.1:5182`.
- De app krijgt een **verzonnen projectadres**: `https://abcdefghijklmnopqrst.supabase.co`, met een verzonnen,
  ongetekende anon-sleutel.
- Elk verzoek naar dat adres onderschept de test (`page.route`) en beantwoordt hij zelf:
  - `/otp`, `/verify` en `controleer-code`;
  - de RPC's.
- De beveiligingsheaders komen uit het eigen `dist-staging/_headers`. Ze worden toegepast zoals Cloudflare Pages dat
  zou doen, maar Cloudflare zelf komt er niet aan te pas.

Getoetst wordt dus:
- de stagingbuild zelf;
- de markering "Testomgeving";
- het ontbreken van demo-accounts en wachtwoordveld;
- de CSP, die alles behalve het eigen project blokkeert;
- het verloop van het codescherm tot het welkomstscherm;
- dat de sessie bewaard blijft;
- dat een sessie in de adresbalk nooit wordt overgenomen.

**Niet** getoetst wordt:
- het echte stagingproject;
- de echte Cloudflare Pages en Access;
- echte Edge Functions;
- echte mail.

**Kanttekening:** één eerdere volledige ronde liep op een overbelaste machine. Daarin:
- haalden 2 schermtests van de demo de grens van 20 seconden niet (`app.test`, `toevoegen-rustig`);
- faalden 4 lokale sync-e2e-tests;
- duurde de lokale e2e 15 minuten in plaats van 2.

De oorzaak lag niet in de code:
- de Auth-container kreeg in die tijd geen verbinding met de database (time-outs van 10 seconden);
- daarna waren er geen hangende transacties of vergrendelingen;
- direct daarna, op een rustige machine, was alles groen (de cijfers hierboven).

Deze schermtests zijn gevoelig voor belasting. Het is goed om dat in CI te volgen.

## 4. Wat lokaal bewezen is, en wat niet

### 4.1 Lokaal bewezen (echte Supabase-stack: GoTrue v2.197.0, PostgreSQL 17, Edge Runtime 1.77.4, Mailpit)

**Toegangspoort**
- Vooraf kapen en een achterdeurwachtwoord: de wachtwoordsessie krijgt via REST, RPC en Realtime niets; de codesessie
  alles.
- "Uitloggen op alle toestellen" werkt direct, ook met een nog geldig toegangstoken (TPA02).
- Ook de nieuwe Edge Function `stuur-uitnodiging` weigert een wachtwoordsessie (401, TPA01).
- Er is geen Storage in gebruik; de nacontrole bewaakt dat.

**De eigen codelaag**
- Het hele pad: code aanvragen, mail, zes cijfers, `token_hash`, sessie.
- De grenzen houden stand onder gelijktijdige verzoeken en verzonnen toestellen.
- De harde grens per account houdt stand.
- Een blokkadepoging van onbekenden houdt de eigenaar met een bekend toestel niet buiten.
- Adres wijzigen met twee codes, en de koppeling van de codes aan het oude en het nieuwe adres.
- Geen adres, code of token in de logboeken van de containers.
- Elke regel is gesaboteerd en gevangen.

**De app**
- Van e-mailadres tot huishouden: 6 handelingen.
- Een uitnodiging accepteren via de link en een code: 6 handelingen, de link meegeteld (de grens is 9).
- M1 na herladen.
- Een foute code geeft een melding en een leeg veld.
- De sessie blijft na sluiten en heropenen.
- Een netwerkfout logt niet uit.
- De Content Security Policy laat alleen het eigen project toe, en Turnstile alleen met een sitekey.

**Uitnodigingsmail**
- Eén mail, zonder token.
- T16: een herhaling en een poging die halverwege stopte, en nooit een tweede mail.
- T17: hoogstens 3, één per 10 minuten, ook onder 10 gelijktijdige verzoeken.
- De daglimiet.
- Een gesloten uitnodiging krijgt geen mail.
- De wachtrij bevat geen adres.
- T18: de database zet "niet bezorgd".
- Alleen een beheerder met een codesessie kan laten versturen.

### 4.2 Wat gehost getest moet worden voordat we het betrouwbaar noemen

Lokaal is de logica bewezen. In een gehoste omgeving draait dezelfde code op andere infrastructuur:
- de gateway van Supabase;
- de JWT-ondertekening;
- de limieten;
- de koude start van de Edge Functions;
- een echte mailaanbieder.

De onderstaande punten zijn pas betrouwbaar als ze daar geslaagd zijn. **Eerst op de interne staging** (achter
Cloudflare Access, alleen jij), **daarna dezelfde lijst op de bèta**, vóór de eerste externe tester. Elke test heeft een
eigen akkoord nodig, want ze maken accounts en mails aan in een online project.

**Toegangspoort (de belangrijkste groep: als hier iets afwijkt, is de rest niet te vertrouwen)**

| # | Test | Geslaagd als |
| --- | --- | --- |
| H1 | Een codesessie bekijken: zitten `amr` (`otp`) en `session_id` in het JWT van het gehoste project, ook met de ondertekensleutels van dat project? | `mijn_toegang` geeft `ok`. Een afwijking geeft "geen toegang", nooit open toegang (fail-closed), maar blokkeert dan iedereen |
| H2 | De wachtwoordroutes uit `poort.test.mjs` (vooraf kapen, achterdeurwachtwoord) via de gehoste REST, RPC, Realtime en `stuur-uitnodiging` | De wachtwoordsessie krijgt overal niets (TPA01) |
| H3 | Uitloggen op alle toestellen | Een nog geldig toegangstoken krijgt direct niets meer (TPA02), ook via Realtime |
| H4 | Welke schema's zijn via de API bereikbaar ("Exposed schemas" in het dashboard)? | Alleen `public` en `graphql_public`; `private` geeft PGRST106 (zie §7: `private` is alleen veilig zolang het niet via de API bereikbaar is) |
| H5 | Storage en GraphQL | Geen buckets en geen Storage-policies. GraphQL ziet alleen wat RLS (en dus de poort) toelaat |

**Inloggen met een code (K1)**

| # | Test | Geslaagd als |
| --- | --- | --- |
| H6 | De Send Email-hook in het gehoste project, met de geheimen | Een code komt aan; ongeldige handtekening → 401; de interne code van 10 cijfers wordt nooit gemaild |
| H7 | De Auth-instellingen: OTP van 10 cijfers, 600 s geldig, 60 s tussen aanvragen, bevestigen verplicht, dubbel bevestigen, alleen e-mail | De nacontrole met `KG_STAGING_ANON_KEY` geeft geen afwijking |
| H8 | **S1:** de aankomsttijd van codes bij de echte aanbieder, naar Gmail, Outlook en iCloud | Ruim binnen het acceptatiecriterium van deel 2 (het hele pad binnen ongeveer 2 minuten); niet in de spam; geen code in het onderwerp |
| H9 | **S2:** de limieten van Supabase zelf (mails per uur, aanvragen per IP), samen met K1 | De meldingen van K1 komen eerder dan die van Supabase, en een gebruiker ziet nooit een Engelse melding |
| H10 | De pogingentellers onder echte gelijktijdigheid via de gehoste gateway (de proef uit `k1.test.mjs`, met eigen testadressen) | Hoogstens 5 pogingen per code; de harde grens houdt; geen 5xx |
| H11 | Turnstile met een echte sitekey en `siteverify` vanuit de Edge Function | Zonder geldige captcha TPK06; met wel; de CSP laat alleen `challenges.cloudflare.com` erbij |
| H12 | De koude start van `controleer-code` en `stuur-code` | Het hele pad tot het huishouden binnen ongeveer 2 minuten, ook na een uur zonder gebruik |
| H13 | De logboeken van het gehoste project (Edge Functions, Auth) | Geen adres, code, token of `token_hash` |

**Uitnodigingsmail (pas na het voorstel voor automatische verzending)**

| # | Test | Geslaagd als |
| --- | --- | --- |
| H14 | V1 tot en met V8 uit `docs/thuisplanner-uitnodigingsmail-verzending.md`, met de echte aanbieder | Binnen een minuut één mail; storingen vanzelf opnieuw; nooit dubbel |
| H15 | De bounce-webhook (T18) | Een mail naar een niet-bestaand adres geeft "niet bezorgd" bij de uitnodiger |

**Omgeving**

| # | Test | Geslaagd als |
| --- | --- | --- |
| H16 | pg_cron: de vier taken (straks vijf) | De nacontrole ziet ze actief; na een nacht is de opruiming gedraaid (verlopen adressen weg) |
| H17 | De echte Cloudflare Pages-headers (CSP en de andere headers) op het eigen adres | Dezelfde CSP als in de staging-e2e; geen overtredingen in de browser |
| H18 | Het gratis tegoed na een week testen | Ruim binnen de grenzen voor Edge Functions, mails en database |
| H19 | De automatische verzending (§8): pg_net, Vault, de vijfde taak, een mail zonder dat iemand de app open heeft, en het gedrag na pauzeren en hervatten (bèta) | De mail komt binnen een minuut; de nacontrole meldt geen afwijking; na het hervatten draaien de taken weer |

### 4.3 Alleen op echte telefoons te toetsen

- De code automatisch invullen vanuit de mail:
  - iOS Mail en Safari (`autocomplete="one-time-code"`);
  - Android met Gmail.
- Wisselen tussen de mail-app en de app (M1 is bewezen met herladen in een browser, niet met een echte app-wissel of het
  opruimen van een tabblad door het systeem).
- De sessie op de telefoon op lange termijn:
  - Safari wist na 7 dagen zonder bezoek de opslag van een website die niet op het beginscherm staat;
  - een app op het beginscherm;
  - een slechte verbinding.
- Turnstile op een kleine telefoon (zichtbaar, niet storend).
- De leesbaarheid van de mails in echte mailprogramma's.

## 5. Resterende risico's

| # | Risico | Wat het beperkt |
| --- | --- | --- |
| R-a | Geen mailaanbieder en geen domein: online komt er nog geen code aan | Een blokkade vóór testers; zie §6 stap 2 |
| R-b | Supabase verandert de `amr`-claim of de hook-API | Fail-closed poort; de integratietests vangen het bij elke update van de CLI of GoTrue |
| R-c | Opgelost (§8). Was: een wachtende mail blijft wachten tot een beheerder de app opent (afwijking 3) | Geen definitieve oplossing. Het voorstel voor automatische verzending staat in `docs/thuisplanner-uitnodigingsmail-verzending.md`; tot dan gaat de mail niet naar externe testers. De uitnodiging blijft geldig en zichtbaar na het inloggen, en de link delen blijft |
| R-d | Supabase-limieten (S1/S2) zijn onbekend | Meten op staging en daarna op de bèta, vóór testers (H8 en H9) |
| R-e | Safari wist de sessie na 7 dagen | De gebruiker logt opnieuw in met een code; niets gaat verloren wat al bevestigd is |
| R-f | Een gestolen telefoon met open sessie | "Uitloggen op alle toestellen" werkt direct; R1/R2 (herstel met passkey) vóór de commerciële start |
| R-g | Supabase verraadt bij `signUp` met een wachtwoord of een adres bestaat (P2) | Valt buiten de app; de app gebruikt alleen `signInWithOtp` met `shouldCreateUser: true` (één antwoord) |
| R-h | Schermtests zijn traag onder volle belasting | Ruimere grens; zie §3. Geen invloed op de app |
| R-i | Een toekomstige functie, policy of view omzeilt de poort (§7.2, P-1 tot en met P-8) | Gebouwd als positieve eis (§7.4): KG-T71 en KG-T73 tot en met KG-T75, de statische controle en de nacontrole. Nog over: CI verplicht maken voor `main` |

## 6. Stappen vóór vrienden en kennissen kunnen testen

**Vaste keuze (17 oktober 2026, bevestigd):** er komen drie gescheiden omgevingen, en externe testers komen nooit op
staging.

| Omgeving | Voor wie | Opbouw |
| --- | --- | --- |
| Lokaal | Ontwikkelen en alle tests | Docker-stack, fictieve accounts, Mailpit |
| Staging | Alleen intern (jij) | Het bestaande Supabase-project en het Cloudflare Pages-project `thuisplanner-staging`, **blijft achter Cloudflare Access** |
| Bèta | Externe testers (vrienden en kennissen) | **Een eigen, nieuw Supabase-project en een eigen Cloudflare Pages-project**, met eigen geheimen, een eigen Turnstile-sitekey en een eigen afzender. Zonder Cloudflare Access: de toegang loopt via de code-inlog, de toegangspoort en de testpoort (G1) |

Elke stap heeft een eigen akkoord. De volgorde is een voorstel.

**A. Vóór er iets online gaat**
1. **Beoordeling van deel 2:**
   - deze branch;
   - de afwijkingen in §2;
   - een beveiligingsreview van K1, de poort en de uitnodigingsmail.
2. **Versterking van de poortbewaking:** lokaal gebouwd (§7.4); nog over is CI als verplichte controle voor `main`.
3. **Automatische verzending van uitnodigingsmails** (`docs/thuisplanner-uitnodigingsmail-verzending.md`):
   - akkoord op het voorstel;
   - bouwen;
   - lokaal testen (V1 tot en met V9).
4. **Domein (D1) en mailaanbieder (D2/B6)** kiezen. De criteria zijn: EU, gratis instap, idempotentiesleutel en een
   ondertekende bounce-webhook. Daarna:
   - SPF, DKIM en DMARC instellen;
   - de adapter bouwen en lokaal testen.
5. **Push en PR** van `thuisplanner-deel2` (en van de stappen 2 tot en met 4).

**B. Staging, intern (achter Cloudflare Access)**

6. **Staging bijwerken:**
   - `verbinding.ps1 -Bijwerken` voor de nieuwe migraties;
   - de nacontrole met `KG_STAGING_ANON_KEY`.
7. **Edge Functions en Auth op staging:**
   - deployen;
   - de geheimen zetten (door jou, nooit in de repository of de chat);
   - de Send Email-hook en de Auth-instellingen (H7);
   - Turnstile (een sitekey voor staging);
   - het wachtrijgeheim en Vault.
8. **De gehoste tests H1 tot en met H18 op staging** (§4.2), met jouw eigen adressen.

**C. Bèta, voor externe testers**

9. **Bèta opzetten:**
   - een nieuw Supabase-project (Frankfurt, gratis, in de organisatie Thuisplanner);
   - een nieuw Cloudflare Pages-project;
   - een eigen Turnstile-sitekey;
   - een eigen `APP_URL`.

   De scripts `verbinding.ps1` en `verbinding-controle.mjs` zijn nu op staging ingericht (`KG_STAGING_*`). Voor de
   bèta komt er een eigen omgevingsnaam bij, met dezelfde weigeringen (onder meer nooit een Huisplan-project). Dat is een
   kleine, aparte wijziging.
10. **Migraties, functies, geheimen en Auth op de bèta**, zoals in de stappen 6 en 7, en daarna **H1 tot en met H18
    opnieuw op de bèta**.
11. **Metingen S1 en S2 op de bèta** (H8 en H9): het gedrag dat testers echt krijgen.
12. **Proef op echte telefoons** met de bèta: iPhone met Safari en Android met Chrome, met de lijst uit §4.3.
13. **Privacy:**
    - een korte privacyverklaring;
    - de verwerkersovereenkomst met de mailaanbieder;
    - een verwijderroute voor testers.

    Dit gaat vóór er e-mailadressen van mensen buiten het gezin in komen.
14. **De testpoort op de bèta:** testers in `private.testers` zetten (G1), en `huishouden_open` uit laten.

## 7. Bewaking van de toegangspoort bij toekomstige functies, policies en migraties

### 7.1 Wat de poort nu automatisch bewaakt

| Bewaking | Wat | Waar en wanneer |
| --- | --- | --- |
| **KG-T71** (RLS-matrix) | Geen functie in `public` of `private` gebruikt `auth.uid()` of `auth.jwt()`, behalve de poort zelf (`uid`, `require_uid`, `toegang_status`). Geen policy (in welk schema ook) gebruikt `auth.uid()` of `auth.jwt()`. Instellingen en testerslijst niet via de API bereikbaar. Geen Storage-policies | `tests/rls_tests.sql`; in CI (`komtgoed-db.yml`) bij elke PR en push die `komtgoed/` raakt, op de nabootsing én op een echte lokale stack. Tegenproeven KG-T71 in `tegenproeven.txt` (een lekkende functie, een grant op de instellingen) |
| **KG-T46** | Elke functie in `public` is `security invoker` en geeft fouten door zonder DETAIL of HINT. Rechten lopen dus altijd via `private` | Idem |
| **De integratietests** | Met echte tokens: de wachtwoordsessie krijgt via REST, RPC, Realtime en de Edge Function niets (`poort.test.mjs`, `uitnodigingsmail.test.mjs`) | Idem (de `supabase-lokaal`-job) |
| **Statische controles** | RLS aan op elke tabel in `public`; `security definer` alleen in `private` | `statisch.js`, in CI |
| **De nacontrole** | Geen `security definer` in `public`, RLS en policies op elke tabel, `anon` niet in `private`, Storage leeg, geen wachtwoordsessies | `verbinding-controle.mjs na`, na elke push naar staging (en straks de bèta) |

Op het huidige schema heb ik nagemeten:
- alleen de drie poortfuncties lezen `auth.uid()` of `auth.jwt()`;
- geen policy gebruikt ze;
- de enige view (`event_overview`) heeft `security_invoker=true`.

### 7.2 Waar de bewaking nu nog gaten heeft

Een nieuwe functie of policy kan de poort nog omzeilen zonder dat een test faalt:

| # | Gat | Voorbeeld van een omzeiling die nu niet gevangen wordt |
| --- | --- | --- |
| P-1 | KG-T71 zoekt alleen de letterlijke tekst `auth.uid()` en `auth.jwt()` | `auth.role()`, `auth.email()`, `current_setting('request.jwt.claims')`, `current_setting('request.jwt.claim.sub')`, of `"auth"."uid"()` |
| P-2 | KG-T71 kijkt alleen in de schema's `public` en `private` | Een functie in een nieuw schema dat aan de API wordt toegevoegd |
| P-3 | Er is geen **positieve** eis voor policies | Een nieuwe policy `using (true)` voor `authenticated`, of een policy die een kolom met de eigen gebruiker vergelijkt zonder de poort: geen `auth.uid()`, dus KG-T71 ziet niets |
| P-4 | Er is geen positieve eis voor functies die `authenticated` mag aanroepen | Een nieuwe `security definer`-functie in `private` die een `p_user` als parameter vertrouwt en nooit `private.require_uid()` aanroept |
| P-5 | Views worden niet bewaakt | Een nieuwe view in `public` zonder `security_invoker` leest met de rechten van de eigenaar en omzeilt RLS |
| P-6 | `private` is alleen veilig zolang het niet via de API bereikbaar is | Lokaal geeft `private` PGRST106 (gemeten); online hangt dat af van "Exposed schemas" in het dashboard (H4). `private.lock_household` is bijvoorbeeld `security definer`, uitvoerbaar door `authenticated` en zonder eigen poort. Dat is onschadelijk, maar alleen zolang `private` dicht blijft |
| P-7 | Edge Functions met de service-rol | Een nieuwe functie die met de service-rol werkt zonder eerst de sessie via de database te controleren (zoals `stuur-uitnodiging` dat wel doet) |
| P-8 | De Realtime-policy wordt alleen in de nacontrole op naam gecontroleerd | Een tweede policy op `realtime.messages` geeft de nacontrole wel ("onverwachte Realtime-policies"), maar pas ná een push |

### 7.3 Voorstel: van "zoek verboden tekst" naar "bewijs de poort" (gebouwd, zie §7.4)

Dit is een lokale testwijziging, zonder migratie en zonder online stap. Akkoord gegeven op 17 oktober 2026.

1. **KG-T72, catalogus van policies (P-3, P-8).** Elke policy voor `authenticated` (of `public`) op een tabel in
   `public`, op `realtime.messages` en op `storage.objects` moet een van de poortfuncties aanroepen:
   - `has_role`;
   - `is_active_member`;
   - `my_household_ids`;
   - `is_my_event`;
   - `may_listen`;
   - of `uid`.

   Uitzonderingen alleen via een expliciete lijst in de test, met een reden per regel.
2. **KG-T73, catalogus van functies (P-4).** Elke functie die `authenticated` mag uitvoeren:
   - roept zelf de poort aan;
   - of staat op een expliciete lijst van functies zonder rechten (zoals `clean_name`) of met een bewezen poort via een
     andere functie (zoals `lock_event`).

   Een nieuwe functie die op geen van beide past, laat de test falen totdat iemand bewust kiest.
3. **KG-T71 verbreden (P-1, P-2).**
   - Zoeken in alle schema's behalve de systeemschema's.
   - Op `auth.`-functies in het algemeen: `auth.uid`, `auth.jwt`, `auth.role` en `auth.email`.
   - Op `request.jwt` in `current_setting`.
   - Zoeken met een reguliere uitdrukking die ook `"auth"."uid"` en spaties vangt.
4. **KG-T74, views (P-5).** Elke view in een API-schema heeft `security_invoker=true`.
5. **De nacontrole (P-6).** Eén HTTP-verzoek met `Accept-Profile: private` moet PGRST106 geven. Hetzelfde voor elk
   ander schema buiten `public` en `graphql_public`.
6. **Statische controle voor Edge Functions (P-7).** Een functie die `SUPABASE_SERVICE_ROLE_KEY` gebruikt, moet op een
   lijst staan:
   - `stuur-code` (alleen met de handtekening van de hook);
   - `controleer-code` (vóór het inloggen, met de grenzen);
   - `stuur-uitnodiging` (eerst de sessie via de database).

   Een nieuwe functie op die lijst vraagt een bewuste wijziging en review.
7. **Tegenproeven voor elk van de bovenstaande punten:**
   - een policy `using (true)`;
   - een definer-functie zonder poort;
   - `current_setting('request.jwt.claim.sub')`;
   - een view zonder `security_invoker`;
   - een extra Edge Function met de service-rol.

   Elk moet gevangen worden.
8. **Proces.** Een korte regel in `komtgoed/supabase/README.md`: "Gebruik nooit `auth.uid()`; gebruik
   `private.require_uid()` of een van de poortfuncties." Daarnaast moet CI een verplichte controle zijn voor `main`.
   Dat laatste is een instelling in GitHub en vraagt jouw akkoord.

Met deze versterking faalt CI bij elke nieuwe functie, policy of view die de poort niet aantoonbaar gebruikt. Dat
gebeurt vóór de wijziging staging of de bèta bereikt.

### 7.4 Gebouwd en lokaal bewezen (17 oktober 2026)

De versterking uit §7.3 is lokaal gebouwd. Omdat KG-T72 al bestond (K1), heten de nieuwe scenario's anders dan in §7.3:

| Voorstel §7.3 | Gebouwd als | Wat het eist | Tegenproeven (moeten als eerste falen in dit scenario) |
| --- | --- | --- | --- |
| 3 | **KG-T71, verbreed** | Geen functie in een eigen schema, en geen policy, leest het token buiten `private.uid`/`require_uid`/`toegang_status`. Gezocht wordt naar `auth.uid`, `auth.jwt`, `auth.role` en `auth.email` (ook met aanhalingstekens en spaties) en naar `request.jwt`. Eigen schema's zijn alles behalve de systeemschema's en die van Supabase, dus ook een nieuw schema. Functies van extensies tellen niet mee | `current_setting('request.jwt.claim.sub')` in `private`; `"auth"."uid" ()` in een nieuw schema `kg_api`; `auth.role()` |
| 1 | **KG-T73**, policies | Elke policy op een eigen tabel, op `realtime.messages` en op Storage roept een poortfunctie aan. De poortfuncties worden afgeleid: `private.uid` en `private.require_uid`, plus elke functie in `private` die er (via andere functies) een aanroept. Alleen de policies van de extensie pg_cron vallen erbuiten | Een policy `to anon using (…)` op `households` en op `shopping_items`, zonder poort |
| 2 | **KG-T74**, functies | Elke functie die `authenticated` of `anon` mag uitvoeren, in elk eigen schema, gaat via de poort. Er zijn vijf uitzonderingen, elk met een reden in `kg_zonder_poort`: `toegang_status`, `mijn_toegang`, `clean_name`, `lock_household` en `lock_household_shared`. Een uitzondering die niet meer bestaat, laat de test ook falen | Een `security definer`-functie die een `p_user` vertrouwt; een functie in een nieuw schema die alle huishoudens geeft |
| 4 | **KG-T75**, relaties | Elke view in een eigen schema is `security_invoker`. Geen materialized view, en geen tabel zonder RLS, die `authenticated` of `anon` kan lezen | Een view zonder `security_invoker`; een materialized view; een tabel zonder RLS in `private` met leesrecht |
| 6 | **statisch.js**, Edge Functions | De service-rol (`SUPABASE_SERVICE_ROLE_KEY` of `rpc` uit `_gedeeld/k1.ts`) alleen in `stuur-code` (met de handtekening), `controleer-code` (met de grenzen) en `stuur-uitnodiging` (met de sessiecontrole via de database). Elk met het bewijs in de broncode (`SERVICE_ROL_TOEGESTAAN`) | Zes, ingebouwd in de controle zelf: een nieuwe functie met `rpc`, een nieuwe functie met de sleutel, elk van de drie zonder zijn bewijs, en gedeelde code met de sleutel |
| 5 | **De nacontrole** (`schemaFouten`) | Een verzoek met `Accept-Profile: private` geeft PGRST106, en de blootgestelde schema's zijn precies `public` en `graphql_public`. Draait mee met `KG_STAGING_ANON_KEY` | Lokaal nagespeeld: `private` bereikbaar (200) en een extra schema `api`; beide gevonden |
| 8 | **README** | De regels staan in `komtgoed/README.md`, onder "Regels voor nieuwe databasecode en Edge Functions" | – |

**Uitkomsten (lokale stack, na een reset):**
- RLS-matrix 75 van 75;
- SQL-tegenproeven 111 van 111 (waarvan 10 nieuw);
- statische controles geslaagd (met de 6 ingebouwde tegenproeven).

**Kanttekeningen**
- **De tegenproeven vragen een schone database.** Na de e2e- en integratietests (met hun achtergebleven testgegevens)
  vielen vier oude tegenproeven eerst in een ander scenario. Ze werden dus wel gevangen, maar niet door het verwachte
  scenario. Na een reset waren het er 111 van 111. CI begint altijd schoon.
- **De matrix op de nabootsing** (een lege PostgreSQL met `supabase_stub.sql`, de eerste CI-job) kon ik hier niet
  draaien: er is geen PostgreSQL 16 op deze computer. De nabootsing maakt alleen objecten in `auth`, `storage`,
  `realtime` en `extensions`, en die vallen buiten de eigen schema's. CI draait die job na een push.
- **De Huisplan-testrunner** (`tests/komtgoed.test.js`) vraagt een globale Playwright. Het Thuisplanner-deel daarvan
  (statisch en matrix) is hierboven rechtstreeks gedraaid.
- **Nog niet gebouwd** (punt 8, tweede helft): CI als verplichte controle voor `main`. Dat is een instelling in GitHub en
  vraagt je akkoord.

## 8. Automatische verzending van uitnodigingsmails (lokaal gebouwd, 18 oktober 2026)

Akkoord op 18 oktober 2026 met de architectuur, de limieten en de wachttijden uit
`docs/thuisplanner-uitnodigingsmail-verzending.md`. Gebouwd als migratie 16 (`20261024120000_uitnodigingsmail_automatisch`).
Daarbij horen:
- een verwisselbare koppeling met de mailaanbieder (`functions/_gedeeld/aanbieder.ts`);
- de nieuwe Edge Function `mail-bezorging`;
- `stuur-uitnodiging` in wachtrijmodus;
- de app, die alleen nog de stand toont.

Afwijking 3 uit §2 is hiermee opgelost. De uitwerkingen W1 tot en met W8 en de beschikbaarheid online (pg_net, pg_cron,
Vault, kosten en afhankelijkheden) staan in dat document, §6 en §7.

### 8.1 De zes voorwaarden van het akkoord

| # | Voorwaarde | Hoe | Bewijs (lokaal) |
| --- | --- | --- | --- |
| 1 | pg_net, pg_cron en Vault beschikbaar en geschikt voor staging, bèta en productie; afhankelijkheden en kosten vastgelegd | Nagegaan in de documentatie van Supabase (§6 van het verzenddocument). Geschikt, met drie afhankelijkheden: pauzeren van gratis projecten (productie vraagt een betaald abonnement), pg_net is bèta, Vault gaat niet mee bij een herstel naar een nieuw project | Lokaal met dezelfde onderdelen (pg_net 0.20.4, pg_cron 1.6.4, Vault 0.3.1). Online pas te bewijzen (H19) |
| 2 | De koppeling met de mailaanbieder verwisselbaar | Eén interface; adapters `mailpit` en `test`. Een echte aanbieder wordt een extra adapter | De integratietests draaien met beide adapters, en de wachtrij weet niet welke |
| 3 | Onderscheid tussen aangenomen, bezorgd en niet bezorgd | Drie toestanden met eigen tijdstippen. Alleen een ondertekende melding maakt een mail bezorgd of niet bezorgd; een bounce gaat voor | V1 (ook een valse handtekening en een onbekend bericht); unit (de teksten) |
| 4 | Geen dubbele verzending zolang de aanbieder geen bewezen idempotentie heeft; vooral getest: mogelijk verstuurd, antwoord verloren | Een onzekere poging blijft "onzeker" tenzij de adapter idempotent is. Elke adapter is nu niet idempotent, behalve de idempotente testaanbieder. Twee wegen getest: het antwoord gaat verloren (time-out na het versturen), en de functie stopt halverwege (een vastgelopen poging) | T16 (geen tweede mail, ook na rondes en "later"); T16 met idempotentie (dezelfde sleutel, precies één mail); tegenproeven 14, 16, 17, 18 en 26 |
| 5 | Betrouwbaar bij storingen, gelijktijdige verzoeken en herstarts | Seintje en vangnet; SKIP LOCKED; een termijn op "bezig"; de wachtrij in gewone (gelogde) tabellen | Gelijktijdig (30 mails, 5 extra aanroepen: elke mail precies één keer); de functie weg (container gestopt); Vault leeg; het seintje verloren (de echte pg_cron pakt het op); een herstart van de database |
| 6 | De bestaande beveiligingscontroles behouden; alle relevante tests uitvoeren | De poortcatalogus (KG-T71 en KG-T73 tot en met KG-T75) dekt de nieuwe functies. De statische controle kent `mail-bezorging` en het nieuwe bewijs van `stuur-uitnodiging`. Geen gebruikersroute meer | §8.2 |

### 8.2 Testresultaten (lokale stack, na een reset)

| Testset | Uitkomst |
| --- | --- |
| RLS-matrix | 75 van 75 (de poortcatalogus dekt de nieuwe functies) |
| SQL-tegenproeven | 111 van 111 |
| Statische controles | geslaagd (4 Edge Functions met de service-rol op de lijst, 7 ingebouwde tegenproeven) |
| Integratie (11 bestanden) | 95 van 95 (waarvan 14 voor de uitnodigingsmail) |
| K1- en D6-tegenproeven | 26 van 26 (waarvan 13 nieuw voor de automatische verzending) |
| Sync-tegenproeven | 22 van 22 |
| Nacontrole (lokaal) | alleen de bedoelde afwijking (lokale wachtwoordsessies); 6 gerichte afwijkingen nagespeeld en alle gevonden |
| App-unittests | 188 van 188 |
| Lokale e2e | 24 geslaagd, 2 overgeslagen (screenshots). De eerste run direct na een reset van de database gaf 3 fouten: `lokaal.mjs seed` liep vast en de run duurde 5 minuten in plaats van 2. Dat is hetzelfde patroon als in §3 (de stack is vlak na een reset traag). Direct daarna was alles groen |
| Staging-e2e (lokale simulatie, niet de online staging) | 5 van 5 |
| Demo-e2e | 138 geslaagd, 9 overgeslagen |

De integratietest `uitnodigingsmail.test.mjs` (14 tests) toetst:

| Test | Wat |
| --- | --- |
| V1 | Niemand opent de app, met het vangnet even uit: alleen het seintje verstuurt. Aangenomen ≠ bezorgd. T18 alleen met een geldige handtekening |
| Mailpit | De lokale ontwikkelstand: de mail zonder token, met vaste tekst |
| T16 | Het antwoord gaat verloren na het versturen; een vastgelopen poging; een late uitkomst; een trage weigering. Steeds "onzeker" en nooit een tweede mail |
| T16 met idempotentie | Na een verloren antwoord dezelfde sleutel: precies één mail |
| Opnieuw proberen | Na 1, 4 en 9 minuten, daarna mislukt; 429 met de wachttijd van de aanbieder; een 4xx meteen mislukt |
| T17 en de daglimiet | Als in deel 2, nu met automatische verzending |
| Ingetrokken | Ingetrokken en opnieuw uitnodigen; de wachtrij bevat geen adres |
| Gelijktijdig | 30 uitnodigingen en 5 extra aanroepen |
| Teruggedraaid | Een teruggedraaide uitnodiging geeft geen seintje |
| Poort | Alleen het wachtrijgeheim. Geen gebruiker, geen service-rolsleutel als token, geen anon-sleutel en geen wachtwoordsessie |
| Herstel | De functie gestopt; Vault leeg |
| Vangnet | De echte pg_cron, tot 90 s |
| Herstart | Een herstart van de database |

### 8.3 Resterende risico's van de automatische verzending

| # | Risico | Wat het beperkt |
| --- | --- | --- |
| A-1 | Zonder bewezen idempotente aanbieder blijft een verloren antwoord "onzeker": de genodigde krijgt dan misschien geen mail, en de uitnodiger moet zelf kiezen | Bewust: liever geen mail dan twee. De uitnodiger ziet het, en de uitnodiging zelf blijft zichtbaar na het inloggen |
| A-2 | Een gratis project wordt na een week rust gepauzeerd; de verzending staat dan stil | Staging intern: acceptabel. Bèta: H19. Productie: een betaald abonnement |
| A-3 | pg_net is bij Supabase bèta; een wijziging van de API stopt het seintje en het vangnet | De mails blijven wachten (niets kwijt, niets dubbel); de nacontrole slaat alarm |
| A-4 | Bezorgmeldingen hangen af van de aanbieder; zonder webhook blijft het bij "aangenomen" | De tekst zegt eerlijk "Nog geen bevestiging dat hij is aangekomen" |
| A-5 | Een herstel naar een nieuw project neemt Vault niet mee | Toegevoegd aan het herstelprotocol (H0, vereiste 6); de nacontrole meldt het |
| A-6 | De testaanbieder is code in de Edge Function | Alleen met een lokale `TESTAANBIEDER_URL` én een databaseinstelling; online staat de URL niet en eist de nacontrole dat de instelling leeg is |
| A-7 | In CI (Linux) moet de testaanbieder op 0.0.0.0 luisteren, en `host.docker.internal` moet vanuit de containers werken. Dat geldt ook voor de bestaande Auth-hook | `TESTAANBIEDER_ADRES` in de workflow. Pas bewezen bij de eerste CI-run na een push |

### 8.4 Gehoste tests erbij (vóór de bèta)

- **H19, de eerste keer per omgeving:**
  - pg_net en Vault aan;
  - de vijfde taak actief;
  - de twee Vault-waarden gezet;
  - een uitnodiging zonder dat iemand de app open heeft: de mail komt binnen een minuut;
  - het gedrag van de taken na het pauzeren en hervatten van een gratis project (de bèta).
- **H14 en H15** (zie §4.2) gelden nu voor deze opzet: V1 tot en met V9 met de echte aanbieder, en de bezorgmeldingen
  via `mail-bezorging`.

### 8.5 Beslissingen voor jou

1. **De mailaanbieder (B6)**, met als harde eisen:
   - EU;
   - een HTTP-API (geen SMTP; die poorten zijn geblokkeerd);
   - een gedocumenteerde idempotentiesleutel, die we ook zelf bewijzen voordat de adapter zich idempotent mag noemen;
   - een ondertekende bezorg- en bounce-webhook;
   - een gratis instap.
2. **Het Supabase-abonnement voor productie.** Een betaald abonnement is nodig, omdat gratis projecten pauzeren en er
   hoogstens twee gratis projecten zijn (staging en bèta). Het besluit kan later, maar vóór productie.
3. **De bèta op het gratis plan:** het risico van pauzeren accepteren (H19 meet het), of de bèta al op een betaald plan.
