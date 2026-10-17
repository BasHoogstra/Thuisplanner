# Thuisplanner KG-5H deel 2: bouwverslag (lokaal)

**Status:** lokaal gebouwd en getest (17 oktober 2026), op branch `thuisplanner-deel2`, in zes lokale commits. Er is
niets gepusht, gemerged of gedeployed. Er is niets gewijzigd aan een online database, aan staging, aan de bèta, aan
Huisplan of aan GitHub Pages.

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
3. **Geen geplande taak die mails verstuurt.** In plaats daarvan verstuurt de app wachtende mails bij het maken van een
   uitnodiging, bij "nog eens sturen" en zodra een beheerder het huishouden opent. Een geplande taak die zelf de Edge
   Function aanroept, vraagt een geheim in de database (Vault) en een uitgaande verbinding (`pg_net`). Dat is een eigen
   besluit. Gevolg: een mail die door een storing bij de aanbieder blijft wachten, gaat pas weer als een beheerder de app
   opent. De uitnodiging zelf blijft altijd geldig en zichtbaar na het inloggen.
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

| Testset | Uitkomst |
| --- | --- |
| RLS-matrix (lokale stack) | 72 van 72 |
| SQL-tegenproeven | 101 van 101 |
| Auth- en database-integratie (11 bestanden, waaronder poort, K1 en uitnodigingsmail) | 88 van 88 |
| K1- en D6-tegenproeven (sabotage per regel) | 17 van 17 |
| Sync-tegenproeven | 22 van 22 |
| Gelijktijdigheid (`run.sh --gelijktijdig`) | 6 van 6; in de tegenproefmodus 6 bewust overgeslagen (rijslot, zie `tegenproeven.txt`) |
| Statische controles | geslaagd |
| App-unittests | 188 van 188 |
| Lokale e2e (echte stack, Mailpit) | 24 geslaagd, 2 overgeslagen (screenshots) |
| Staging-e2e (stagingbuild, CSP, nagebootst project) | 5 van 5 |
| Demo-e2e | 138 geslaagd, 9 overgeslagen (screenshots) |
| Nacontrole tegen de lokale database | precies één afwijking, zoals bedoeld: "wachtwoordsessies zijn toegestaan" (alleen lokaal, via `seed.sql`) |

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

### 4.2 Alleen in een echte gehoste omgeving te toetsen

- **De echte mailaanbieder (EU, keuze B6) en een eigen domein (D1).** Er is nog geen adapter. Daarvoor zijn nodig:
  - een geverifieerd afzenderdomein met SPF, DKIM en DMARC;
  - de idempotentiesleutel bij de aanbieder;
  - de bounce-webhook (T18);
  - de bezorging: aankomsttijd, spamfilters, en of de mail binnen ongeveer 2 minuten aankomt.
- **De Send Email-hook in een gehost project**, met de geheimen van de Edge Functions, en de Auth-instellingen:
  - code van 10 cijfers;
  - 600 seconden geldig;
  - 60 seconden tussen aanvragen;
  - bevestigen verplicht;
  - dubbel bevestigen bij een adreswijziging.
- **De limieten van Supabase zelf** (e-mail en aanvragen per uur), en hoe die samenwerken met K1. Dat waren de metingen
  S1 en S2, die nog niet zijn uitgevoerd. IP-limieten zijn niet bewezen; de beveiliging leunt er niet op.
- **Turnstile met een echte sitekey** en de controle (`siteverify`) vanuit de Edge Function.
- **De CORS en de gateway van het gehoste project**, en de opstarttijd van de Edge Functions.
- **Het JWT van het gehoste project**: zitten `amr` en `session_id` er net zo in (ook met de nieuwe ondertekensleutels)?
  De poort is fail-closed, dus een afwijking geeft "geen toegang", nooit open toegang.
- **pg_cron in het gehoste project:** de vier taken. De nacontrole controleert ze.
- **Het gratis tegoed** (Edge Function-aanroepen, mails per dag).

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
| R-c | Een wachtende mail blijft wachten tot een beheerder de app opent (afwijking 3) | De uitnodiging blijft geldig en zichtbaar na het inloggen; delen via de link blijft |
| R-d | Supabase-limieten (S1/S2) zijn onbekend | Meten op staging vóór testers |
| R-e | Safari wist de sessie na 7 dagen | De gebruiker logt opnieuw in met een code; niets gaat verloren wat al bevestigd is |
| R-f | Een gestolen telefoon met open sessie | "Uitloggen op alle toestellen" werkt direct; R1/R2 (herstel met passkey) vóór de commerciële start |
| R-g | Supabase verraadt bij `signUp` met een wachtwoord of een adres bestaat (P2) | Valt buiten de app; de app gebruikt alleen `signInWithOtp` met `shouldCreateUser: true` (één antwoord) |
| R-h | Schermtests zijn traag onder volle belasting | Ruimere grens; zie §3. Geen invloed op de app |

## 6. Stappen vóór vrienden en kennissen kunnen testen

Elke stap met een eigen akkoord. De volgorde is een voorstel.

1. **Beoordeling van deel 2**: deze branch, de afwijkingen in §2, en een beveiligingsreview van K1, de poort en de
   uitnodigingsmail.
2. **Domein (D1) en mailaanbieder (D2/B6)** kiezen:
   - de EU-aanbieders vergelijken (gratis instap);
   - het domein registreren;
   - SPF, DKIM en DMARC instellen;
   - daarna de adapter bouwen, met de idempotentiesleutel en de bounce-webhook, en lokaal testen.
3. **Turnstile (Cloudflare, gratis)**: een sitekey en een geheim aanmaken.
4. **Push en PR** van `thuisplanner-deel2`.
5. **Staging bijwerken**:
   - `verbinding.ps1 -Bijwerken` voor de migraties 13 tot en met 15;
   - de nacontrole, met `KG_STAGING_ANON_KEY` erbij voor de Auth-instellingen.
6. **Edge Functions en Auth op staging**:
   - de drie functies deployen;
   - de geheimen zetten (`K1_PEPPER`, `K1_SLEUTEL`, `K1_HOOK_SECRET`, `MAIL_ADAPTER`, `APP_URL`, `TURNSTILE_SECRET`,
     `K1_CAPTCHA=aan`), door jou, nooit in de repository of de chat;
   - de Send Email-hook instellen;
   - de Auth-instellingen uit §4.2 zetten;
   - de andere inlogmethoden uit laten.
7. **Cloudflare Pages**:
   - een build met `VITE_TURNSTILE_SITEKEY`;
   - besluiten wat er met Cloudflare Access gebeurt: deel 2 had als doel "zonder extra Cloudflare-inlog", maar staging
     staat nu achter Access.
8. **De testpoort**: testers in `private.testers` zetten, of `huishouden_open`, volgens G1.
9. **Metingen S1 en S2 op staging**: de aankomsttijd van codes, de limieten, en het pad tot het huishouden binnen
   ongeveer 2 minuten.
10. **Proef op echte telefoons**: iPhone met Safari en Android met Chrome, met de lijst uit §4.3.
11. **Privacy**: een korte privacyverklaring en de verwerkersovereenkomst met de mailaanbieder. Dit gaat vóór er
    e-mailadressen van mensen buiten het gezin in komen.
12. **Bèta (B1)**: als vrienden en kennissen op een aparte bèta testen in plaats van op staging, dan dezelfde stappen 5
    tot en met 9 voor de bèta.
