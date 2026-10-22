# Thuisplanner: interne beveiligingsreview vóór de besloten staging (stap 3a)

**Status:** review uitgevoerd op 21 oktober 2026, op `thuisplanner-deel2` @ `2286dad`. Er is alleen gelezen: er is geen
code gewijzigd en online niets aangeraakt. Uitgevoerd door Claude, intern, met vier deelreviews die parallel liepen. De
belangrijkste bevindingen zijn daarna zelf in de code nagelopen (zie "Nagelopen").

**Waarvoor deze review geldt.** De besloten staging (`docs/thuisplanner-staging-overstap.md`):
- precies twee echte gebruikers: de producteigenaar en Sanne, in één huishouden;
- Cloudflare Access voor de app, Supabase Free in Frankfurt, Lettermint voor de mail.

De producteigenaar heeft op 21 oktober 2026 besloten dat de review voor deze test **intern** mag. Een **onafhankelijke
beveiligingsreview** blijft nodig vóór een bredere bèta of externe gebruikers (zie het laatste deel).

**Wat er is bekeken:**
- K1, de eigen codelaag: `migrations/20261022120000_k1_codelaag.sql`, `functions/stuur-code`, `functions/controleer-code`
  en `functions/_gedeeld/k1.ts`;
- de toegangspoort en de testpoort: `20261021120000_toegangspoort.sql`;
- RLS en de `security definer`-functies in alle 16 migraties;
- de uitnodigingsmail: `20261023…`, `20261024…`, `functions/stuur-uitnodiging`, `functions/mail-bezorging`,
  `_gedeeld/aanbieder.ts` en `mails.ts`;
- de app, de build en de deployment: `app/src`, `scripts/staging-build.ts`, `scripts/staging-kenmerk.mjs`, de sync-module,
  de stagingscripts en de GitHub-workflows.

**Herstel (21 oktober 2026, lokaal, met akkoord):** R1, R2, R3 en L3 zijn gerepareerd in de migraties 13
(`toegangspoort`) en 14 (`k1_codelaag`) en in `controleer-code`. Die migraties staan nog op geen enkele online
omgeving.

| Bevinding | Reparatie | Bewijs |
| --- | --- | --- |
| R1 | De poort en K1 gaan dicht zonder instellingenrij (`if not found`); `mag_huishouden_maken` met `coalesce(…, false)`; triggers weigeren `delete` en `truncate` op `private.instellingen` | RLS-matrix KG-T69 (vervolg) en 3 nieuwe RLS-tegenproeven; K1-test "zonder instellingenrij" en 2 K1-tegenproeven |
| R2 | Zonder actieve code meteen `fout` (TPK01, zelfde antwoord), zonder te tellen en zonder rij; onder de vergrendeling nogmaals gecontroleerd | K1-test "zonder actieve code" (35 pogingen, daarna logt de echte gebruiker in) en 2 K1-tegenproeven, waaronder het oude gedrag |
| R3 | Standaard hoogstens 8 codes per adres per dag (was 20; het K1-ontwerp noemde 10). De Auth-captcha en een tegoedmelding in Lettermint zijn online stappen | K1-test "standaardgrenzen" |
| L3 | `K1_CAPTCHA=uit` werkt alleen als de functie op een lokale stack draait; online geeft het een storing in plaats van een omweg | `tests/functies/k1-captcha.test.mjs` |

## Uitgangspunten die de beoordeling bepalen

- **Cloudflare Access beschermt alleen de app, niet de Supabase-API.** De Auth-API, de REST-API en de Edge Functions met
  `verify_jwt = false` zijn vanaf internet bereikbaar.
- **De repository is openbaar.** Het projectkenmerk staat in `thuisplanner/omgevingen.json`, en de anon-sleutel is een
  publieke sleutel. Wie de API wil aanroepen, kan dat dus.
- **Aanmelden staat in Supabase Auth aan.** Dat moet: anders krijgt een genodigde geen code. Iedereen kan dus een account
  aanmaken. Een eigen huishouden kan alleen wie op de testerslijst staat; op staging is dat alleen de eigenaar.
- **Het mailtegoed is 300 mails per maand (Lettermint Free).** Inlogcodes en uitnodigingen delen dat tegoed.

## Samenvatting

Er zijn geen kritieke of hoge bevindingen. Er is geen route gevonden waarmee een buitenstaander gegevens kan lezen of
wijzigen. Ook kan een lid de privé-afspraken van de ander niet inzien, en kan niemand zijn rechten verhogen. De
bevindingen gaan vooral over:
1. één echte fail-open in de poort, die alleen optreedt als de instellingenrij ontbreekt;
2. beschikbaarheid: wie het adres kent, kan het inloggen een dag blokkeren of het mailtegoed opmaken;
3. instellingen die alleen online te controleren zijn.

| Ernst | Aantal | Vóór de online migraties (stap 4) |
| --- | --- | --- |
| Kritiek / hoog | 0 | – |
| Middel | 5 | R1–R3 voorgesteld als kleine reparatie (eigen akkoord); R4 vóór de bèta; R5 is een lokale handeling |
| Laag | 9 | Een deel samen met R1–R3, de rest voor de bèta of als geaccepteerd risico |
| Online te controleren | 10 | In stap 6 en 9 van het uitvoeringsplan |

## Bevindingen (middel)

### R1. De poort gaat open als de instellingenrij ontbreekt — **nagelopen, bevestigd**
- **Waar:**
  - `20261021120000_toegangspoort.sql:60-79` (`toegang_status`);
  - `:223-228` (`mag_huishouden_maken`);
  - `20261022120000_k1_codelaag.sql:102-104, 150-151` (`codes_aan`, `registratie_open`).
- **Wat:** `select * into inst … where id = 1` zonder rij laat alle velden NULL. In PL/pgSQL slaat `if NULL` de tak over:
  - een sessie met een **wachtwoord** krijgt dan toch `ok`;
  - de sessiecontrole valt weg;
  - iedereen mag een huishouden maken;
  - de noodstop werkt niet.
- **Wanneer dat kan:** de migratie zet de rij en niets in de app verwijdert hem. Een fout bij handwerk in de SQL-editor
  of bij een herstel kan hem wel weghalen. Het herstel uit stap 2b leegt bijvoorbeeld alle tabellen en zet de export terug.
- **Reparatie (klein):**
  - in alle vier functies `if not found then` → dicht (`onderhoud`, `codes-uit`);
  - `coalesce` met de veilige waarde;
  - een trigger die `delete` en `truncate` op `private.instellingen` weigert;
  - de nacontrole meldt een ontbrekende rij;
  - een RLS-test (KG-T…) met tegenproef.

### R2. Inloggen blokkeren zonder code (K1)
- **Waar:** `20261022120000_k1_codelaag.sql:171-185`.
- **Wat:** ook een poging zonder actieve code telt mee voor `totaal` en `onbekend`. Er is dan geen captcha en er wordt
  geen mail gestuurd.
- **Scenario:** wie het adres kent, stuurt 30 verzoeken naar `controleer-code`. Daarna kan de echte gebruiker 24 uur niet
  inloggen vanaf een **onbekend** toestel. Bij de eerste inlog op staging is elk toestel onbekend, en na de wisbeurt van
  Safari (7 dagen) weer.
- **Reparatie:** zonder actieve of geldige code meteen `fout` teruggeven, zonder iets te tellen. Pas daarna de captcha,
  de reservering en de teller.
  - Hetzelfde antwoord (TPK01) blijft, dus er ontstaat geen nieuw verschil naar buiten.
  - Geen `k1_accounts`-rij aanmaken voor een adres zonder code (lost ook L2 op).
  - Met integratietest en tegenproef.

### R3. Codes aanvragen: blokkade voor 24 uur en het mailtegoed (K1)
- **Waar:** `20261022120000_k1_codelaag.sql:31-32, 113-116`; client `app/src/lib/lokaal/sessie.ts:393-394`.
- **Wat:**
  - 20 aanvragen per adres per dag, ongeacht het toestel. Na 20 keer `signInWithOtp` (één per 60 seconden) krijgt de echte
    gebruiker een dag lang "te vaak".
  - Elke aanvraag is een echte mail: twee adressen × 20 per dag maakt het tegoed van 300 in ongeveer 8 dagen op.
  - De enige rem vooraf is de captcha die Supabase Auth op `signInWithOtp` afdwingt, en alleen als die in het dashboard
    aan staat (online te controleren).
- **Reparatie:**
  - de daggrens naar 8 (in `k1_grenzen`);
  - de Auth-captcha (Turnstile) verplicht aan, en H11 toetst dat;
  - in Lettermint een melding bij bijvoorbeeld 200 mails per maand.
  - Een uitzondering voor bekende toestellen bij het aanvragen hoort bij de bèta.

### R4. Het mailtegoed via uitnodigingen (alleen voor wie op de testerslijst staat)
- **Waar:**
  - `20261023120000_uitnodigingsmail.sql:46-53` (20 per huishouden per dag);
  - `20261020120000_uitnodigingen_op_email.sql:178-183` (opnieuw uitnodigen begint weer bij 1);
  - `toegangspoort.sql:243` (10 huishoudens per eigenaar).
- **Wat:** een account op de testerslijst kan tot 10 × 20 = 200 mails per dag laten versturen, ook steeds naar hetzelfde
  adres. Dat raakt ook de inlogcodes, die hetzelfde tegoed gebruiken.
- **Op staging:** alleen het account van de eigenaar staat op de lijst. Het risico is dus een overgenomen account van de
  eigenaar. **Laag voor staging, middel voor de bèta.**
- **Reparatie (vóór de bèta):**
  - een grens voor de hele omgeving per dag;
  - een grens per ontvanger (via een HMAC van het adres, omdat het adres na het sluiten wordt gewist);
  - een deel van het tegoed vrijhouden voor inlogcodes.

### R5. De export van stap 2b bevat onversleutelde persoonsgegevens
- **Waar:** `C:\Users\Bas\Thuisplanner-exports\staging-2026-10-21`: twee adressen en de wachtwoordhashes uit `auth.users`.
- **Wat:** wie de laptop of een back-up in handen krijgt, heeft die gegevens.
- **Reparatie (lokaal, door de producteigenaar):**
  - de map alleen voor het eigen account leesbaar maken (`icacls … /inheritance:r /grant:r %USERNAME%:F`);
  - controleren dat BitLocker aan staat;
  - de export na stap 11 verwijderen (staat in het plan).

## Bevindingen (laag)

| # | Wat | Waar | Voorstel |
| --- | --- | --- | --- |
| L1 | Bij "registratie dicht" gaat er per aanvraag een uitlegmail weg, zonder grens per adres (en dat verraadt via de grenzen welke adressen een account hebben) | `k1_codelaag.sql:104`, `stuur-code/index.ts:27-30` | De controle ná de grenzen; hoogstens één uitlegmail per adres per dag. Op staging blijft registratie open, dus nu niet actief |
| L2 | Elke onbekende aanvraag bij `controleer-code` maakt een rij in `k1_accounts` (pas na 30 dagen opgeruimd) | `k1_codelaag.sql:152, 234` | Opgelost met R2 |
| L3 | `K1_CAPTCHA=uit` is een omweg zodra iemand het online zet; alleen de nacontrole vangt dat | `controleer-code/index.ts:26, 48` | In de functie `uit` weigeren als `SUPABASE_URL` niet lokaal is; `remoteip` en `hostname` meesturen naar siteverify |
| L4 | Geen geheugen voor webhook-id's: een opgevangen verzoek (TLS gebroken) is 5 minuten opnieuw te gebruiken | `k1.ts:79-87`, `aanbieder.ts:234-236` | Een tabel met gezien-id's. Klein risico; vóór de bèta |
| L5 | Het Vault-adres van de wachtrij mag `http://` zijn | `uitnodigingsmail_automatisch.sql:255` | Online alleen `https://`; ook in de nacontrole |
| L6 | Het namenfilter in mails laat Unicode-punten (`evil．com`) en telefoonnummers door | `mails.ts:312-315` | NFKC normaliseren vóór de controle |
| L7 | Op staging blijft de sessie in `localStorage` (bewust: ingelogd blijven op de telefoon) | `sessie.ts:85` | Geaccepteerd voor twee eigen telefoons; "overal uitloggen" werkt direct |
| L8 | De kenmerkcontrole loopt alleen via `npm run build:staging`, niet bij een losse `vite --mode staging` | `package.json:10` | Ook in `controleerOmgeving`, met een expliciete uitzondering voor de offline e2e |
| L9 | Ontwikkelpakketten met bekende kwetsbaarheden: vite 7.1.12 (bestanden lezen via de dev- en preview-server) en vitest (alleen tijdens het testen) | `npm audit` | Bijwerken naar een gepatchte versie. De kijkversie op poort 5181 is op 21 oktober gestopt |

## Info

- **De noodstop (`onderhoud = dicht`) stopt de wachtrij voor uitnodigingsmails niet.** pg_cron en de service-rol gaan
  langs de poort. Voorstel: de wachtrij laten kijken naar `onderhoud`, of dit vastleggen in het herstelplan (dan ook
  `MAIL_ADAPTER` leegmaken).
- **Realtime:** een socket die al verbonden is, krijgt tijdens `onderhoud` nog seintjes zonder inhoud, tot het token
  ververst. Er is geen test voor een kanaal met `private: false`; online moet "Allow public access" uit staan.
- **De markering op staging** zegt "Alleen om te testen · verzonnen gegevens" (`Lokaal.tsx:89`). Bij echt gebruik klopt dat
  niet. Dat is een beslissing van de producteigenaar, en een kleine tekstwijziging.
- **Kleuren (`style={{ background: l.kleur }}`):** geen risico (CSSOM, CSP). Toch beter aan de serverkant controleren dat
  het een hexkleur is.
- **AES-GCM zonder AAD in K1:** alleen relevant voor iemand die al in de database kan schrijven.
- **Actions alleen vastgezet op hoofdversie** (`@v4`): overweeg een vaste SHA.

## Nagelopen en in orde

**K1 (de codelaag):**
- De code bestaat uit 6 cijfers uit `crypto.getRandomValues`, met correcte afwijzing van te hoge waarden.
- De HMAC's hebben eigen voorvoegsels en de pepper staat alleen in de functie.
- AES-256-GCM gebruikt een willekeurige IV en de sleutellengte wordt gecontroleerd.
- De webhookhandtekening wordt in constante tijd vergeleken, met een tijdgrens.
- De pogingentellers zijn atomair (de adresrij wordt vergrendeld, dus geen race voorbij 5 of H).
- "Geen code" en "verkeerde code" geven hetzelfde antwoord.
- De `token_hash` komt alleen terug bij een goede code.
- De logboeken bevatten geen adres, code of token.
- Een ontbrekende instelling of een onbekende adapter geeft een weigering (fail-closed).

**De poort (mét instellingenrij):**
- `otp` is verplicht en er mag niets anders dan `otp` of `totp` in de `amr` staan.
- De `session_id` moet nog bestaan.
- De noodstop gaat voor alles.
- `auth.uid()` komt alleen nog voor in `toegang_status`, `uid` en `require_uid`.
- Alle `security definer`-functies hebben `search_path = ''`.
- Niets is aan anon toegekend.

**Een nieuw account zonder lidmaatschap:**
- ziet alleen het eigen profiel;
- ziet geen huishoudens, leden of uitnodigingen;
- `my_invites` werkt alleen op het eigen, bevestigde adres;
- kan geen kanaal openen.

**Privé-afspraken:**
- details zijn alleen zichtbaar voor de eigenaar (`event_details_visible`);
- `event_overview` heeft `security_invoker` en geen `owner_user_id`;
- elke schrijfroute weigert andermans privé-afspraak;
- realtime-seintjes bevatten alleen `{t, id, v, op}`.

**Rollen:**
- `guard_member` en kolomrechten zijn in orde;
- een uitnodiging als beheerder kan alleen de eigenaar maken, en de rechten worden opnieuw gecontroleerd bij het
  accepteren;
- `owner` kan geen uitnodigingsrol zijn.

**Uitnodigingstokens:**
- 32 willekeurige bytes, alleen als SHA-256 bewaard, eenmalig, verlopen afgedwongen, intrekbaar;
- gebonden aan het e-mailadres op beide routes;
- het token staat alleen in het URL-fragment en wordt meteen weggehaald;
- er staat geen token in de mail.

**Scheiding tussen huishoudens:** samengestelde sleutels op `(household_id, id)`.

**Wat de anon-sleutel kan:** niets in de wachtrij, niets in de bezorgmeldingen, niets in de testaanbieder (alles
service-rol). `stuur-uitnodiging` zonder geheim geeft 401.

**Mails:**
- er is geen SSRF-route (de adressen van de aanbieder staan op een vaste lijst);
- HTML wordt overal ge-escaped;
- in het onderwerp zijn geen regeleinden mogelijk.

**App:**
- er is geen `innerHTML`, `dangerouslySetInnerHTML` of `eval`;
- de CSP is streng: geen `unsafe-inline`, `connect-src` alleen het eigen project, en `frame-ancestors 'none'`;
- in de bundel staat geen geheim (gecontroleerd vóór en na de build);
- online is er geen wachtwoordknop.

**Scripts:**
- het wachtwoord gaat alleen via de verborgen prompt naar `PGPASSWORD` en wordt daarna gewist;
- TLS gebruikt alleen de vastgepinde root, en de CLI `verify-full`;
- de export leest alleen en schrijft alleen buiten de repository;
- het herstel werkt alleen op een database op deze computer.

**GitHub Actions:** `contents: read`, `pull_request` (geen `_target`), geen geheimen en geen deploy.

**Nagelopen door Claude zelf (niet alleen via de deelreviews):**
- R1 (`toegangspoort.sql:60-79`): de NULL-logica bij een ontbrekende rij geeft `ok` voor een wachtwoordsessie;
- R2 (`k1_codelaag.sql:171-185`): de teller loopt op zonder actieve code;
- de openbaarheid van de repository (GitHub-API: `visibility: public`);
- de verminkte paden in het uitvoeringsplan (I2 van de deelreview): gerepareerd.

## Online te controleren (in stap 6 en 9 van het uitvoeringsplan)

1. **Cloudflare Access:**
   - `thuisplanner-staging.pages.dev`, een `<hash>.`-adres van een deployment en een `<branch>.`-alias geven allemaal het
     Access-scherm (getest in een privévenster);
   - "Preview branches: None".
2. **Supabase Auth:**
   - de captcha (Turnstile) wordt aan de serverkant afgedwongen op `signInWithOtp`;
   - de Site URL en de Redirect URL's zijn precies het Pages-adres;
   - anonieme accounts staan uit;
   - een e-mailwijziging moet op beide adressen bevestigd worden;
   - de OTP heeft 10 cijfers en is 600 seconden geldig.
3. **Exposed schemas:** precies `public` en `graphql_public`, en `private` niet in het "extra search path".
4. **Realtime:** "Allow public access" uit.
5. **`private.instellingen`:**
   - de rij bestaat;
   - `wachtwoordsessies_toegestaan = false`, `sessiecontrole = true`, `huishouden_open = false`;
   - `mail_testaanbieder` is leeg.
6. **H1:** ook bij de bevestiging van een nieuwe aanmelding bevat het token `amr` `otp` en een `session_id`; en de eigenaar
   van de functies kan `auth.sessions` lezen.
7. **Vault:** het wachtrij-adres begint met `https://`.
8. **Lettermint:**
   - de handtekening van een echte testwebhook wordt geaccepteerd (de opbouw van `X-Lettermint-Signature` is nu een
     aanname);
   - `LETTERMINT_IDEMPOTENT_BEWEZEN` pas na de proef uit stap 3;
   - een melding bij een hoog gebruik van het tegoed.
9. **Storage:** geen buckets. **pg_cron:** alle taken actief.
10. **De koude start van de functies en de time-out van de mail-hook:** bij een e-mailwijziging gaan twee mails na elkaar.

## Resterende risico's die we voor deze test accepteren

| Risico | Waarom acceptabel voor twee gebruikers | Wie accepteert |
| --- | --- | --- |
| K1 is eigen beveiligingscode, zonder onafhankelijke review | Uitgebreid getest (integratietests, tegenproeven, deze review); het gaat om twee eigen accounts met testgebruik | Producteigenaar (besluit van 21 oktober 2026) |
| De API is openbaar; wie het adres kent, kan het inloggen vertragen of blokkeren (na R2 en R3 alleen via het aanvragen van codes: hoogstens 8 per dag) | De adressen zijn niet openbaar; een bestaande sessie blijft werken; de noodstop en `codes_aan` zijn er | Producteigenaar |
| Een overgenomen mailbox betekent een overgenomen account | Dat geldt voor elk inloggen met e-mail. Herstel met een passkey (R1/R2 in de roadmap) komt vóór de commerciële start | Producteigenaar |
| Echte adressen in een testproject; nog geen privacyverklaring en verwijderroute | Alleen de eigen gegevens en die van Sanne, met haar medeweten; staging blijft intern | Producteigenaar en Sanne |
| Gratis abonnement: pauzeren na 7 dagen, geen back-ups | De export van stap 2b en het herstelplan; de gegevens zijn testgebruik | Producteigenaar |
| Safari wist de opslag na 7 dagen zonder bezoek | Opnieuw inloggen met een code; niets bevestigds gaat verloren | Producteigenaar |

## Wat een onafhankelijke review vóór de bèta moet beoordelen

1. K1 als geheel: het ontwerp, de grenzen (H, U, D, M), de cryptografie (HMAC, AES-GCM, toestel-tokens) en de hook.
2. De toegangspoort op de gehoste `amr`- en `session_id`-claims, en de afhankelijkheid van `auth.sessions`.
3. De RLS-matrix voor privé-afspraken ("Bezet"), en de rechten bij archiveren, ontkoppelen en verwijderen.
4. De grenzen voor misbruik over omgevingen heen: mailtegoed, aanmeldingen, en per IP-adres (Supabase en K1 samen).
5. De uitnodigingsflow: e-mailbinding, tokens, de wachtrij, de webhooks en de idempotentie.
6. De privacy van echte gebruikers: bewaartermijnen, verwijderen, de export en de logboeken.
7. Het dependencybeleid en het vastzetten van de Actions.

## Voorgestelde volgorde

1. **R1, R2 en R3 (en L3) repareren vóór de online migraties.** Klein, en met tests en tegenproeven. Dat vraagt een eigen
   akkoord, omdat het migratiecode raakt.
   - **Voorstel:** de migraties 13 en 14 zelf aanpassen. Die staan nog op geen enkele online omgeving: staging heeft er 11.
     Zo krijgt staging meteen de goede versie, zonder een extra herstelmigratie.
   - Lokaal en in CI worden de stacks toch opnieuw opgebouwd.
   - De Vakanties-branch, die op dezelfde basis staat, krijgt de wijziging bij het bijwerken.
2. R5: de exportmap afschermen (door de producteigenaar).
3. L9: de ontwikkelpakketten bijwerken (een aparte, kleine stap).
4. De online controles hierboven in stap 6 en 9.
5. R4, L1, L4–L6 en L8: vóór de bèta, samen met de onafhankelijke review.
