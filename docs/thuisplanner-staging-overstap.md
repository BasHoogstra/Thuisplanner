# Thuisplanner-staging: overstap naar de huidige versie, voor twee echte gebruikers

**Status:** uitvoeringsplan. Opgesteld op 21 oktober 2026; stap 0 is lokaal uitgevoerd. Nog niets online gewijzigd.

**Doel:** de producteigenaar en zijn partner (Sanne) gebruiken Thuisplanner op hun eigen telefoons, ook buiten huis en
met de laptop uit. Ze gebruiken de bestaande, besloten staging achter Cloudflare Access. Dit is geen publieke lancering;
externe testers komen nooit op staging (bouwverslag deel 2, §6).

**Uitgangspunten van de producteigenaar (21 oktober 2026):**
- Huisplan blijft volledig ongemoeid.
- Alleen de afzonderlijke Thuisplanner-testomgeving. Er worden geen productiegegevens overgezet.
- Geen geheimen in de chat, de logboeken of de repository.
- Elke stap die iets online verandert, krijgt vooraf een eigen akkoord. Dat geldt ook voor commits, pushes, migraties,
  deployments en wijzigingen in Cloudflare, Supabase of de firewall.
- Voor deze besloten test met twee gebruikers mag de beveiligingsreview intern plaatsvinden, mits de bevindingen en de
  resterende risico's expliciet zijn vastgelegd (stap 3a). Een onafhankelijke review blijft nodig vóór een bredere bèta
  of externe gebruikers.
- Vóór de migraties 12–16 komt er een controleerbare export van de staginggegevens, met een herstelprocedure (stap 2b).
- De vormgeving en de functies blijven zoals ze zijn; er worden geen nieuwe functies gebouwd.

**Volgorde:**
- Zodra migratie 13 (de toegangspoort) online staat, werkt de huidige online app niet meer, want die logt in met een
  wachtwoord. Daarom gaan de database (4), de functies en de mail (5–6) en de nieuwe app (8) kort na elkaar online.
- In die tussentijd is staging buiten gebruik. Voor een interne omgeving is dat acceptabel.

## Het project, ondubbelzinnig

| Wat | Waarde | Bron |
| --- | --- | --- |
| Supabase-project | `mcyjpnnjqxlqfwqhkqrl`, organisatie **Thuisplanner**, regio Frankfurt | `thuisplanner/omgevingen.json` (`staging.supabaseRef`), `docs/thuisplanner-staging.md` |
| App | `https://thuisplanner-staging.pages.dev/`, Pages-project `thuisplanner-staging`, gebouwd uit de branch `thuisplanner-staging` | `omgevingen.json` |
| Huisplan | Twee eigen projecten in de organisatie Huisplan, allebei gepauzeerd. Nooit gebruiken | `supabase/README.md` (root) |

**Bewaking:**
- `verbinding-controle.mjs` en `verbinding.ps1` weigeren elk ander kenmerk vóór het verbinden. Dat geldt ook voor een
  omgeving zonder vastgelegd kenmerk: de bèta en productie zijn daarmee voorlopig geblokkeerd.
- Beide weigeren ook elk Huisplan-kenmerk. Ze vergelijken via SHA-256, zodat de kenmerken zelf nergens in
  `thuisplanner/` staan.
- `npm run build:staging` (ook in Cloudflare Pages) bouwt alleen tegen het vastgelegde stagingproject
  (`scripts/staging-kenmerk.mjs`).

**Wat geen script kan vaststellen:** bij welke Supabase-organisatie het project hoort. Dat is een controle door de
producteigenaar in het dashboard, bij stap 2 en opnieuw vóór stap 4:
- bovenaan staat de organisatie **Thuisplanner**;
- Project Settings → General toont het kenmerk `mcyjpnnjqxlqfwqhkqrl`.

## Stappen

Bij elke stap: wat Claude doet, wat de producteigenaar doet, hoe we controleren, en of er een akkoord nodig is.

### Stap 0 — Omgeving vastzetten en documentatie bijwerken (lokaal) — **uitgevoerd op 21 oktober 2026**

**Wat er is gedaan:**
- `omgevingen.json` kreeg het stagingkenmerk.
- De verbindingscontrole weigert nu een omgeving zonder vastgelegd kenmerk.
- De stagingbuild bouwt alleen tegen het vastgelegde kenmerk.
- `staging/testers.sql` is vervangen. Het zet nu alleen een adres op de testerslijst, met controles.
- De verouderde documentatie is bijgewerkt.

**Controle:**
- de unit- en functietests, met een tegenproef;
- de statische controles;
- de volledige testronde;
- Huisplan is ongewijzigd.

Akkoord gegeven op 21 oktober 2026.

### Stap 1 — Werk veiligstellen (commit en push naar `thuisplanner-deel2`)

- **Claude:**
  - commit B1, B2, C1, W1, W2 en stap 0;
  - push naar `thuisplanner-deel2`. Dat is niet de branch waaruit Cloudflare bouwt, dus er wordt niets gedeployed.
- **Controle:** CI op de concept-PR is groen (3 jobs).
- **Akkoord:** ja.

### Stap 2 — Alleen lezende controle van staging

- **Claude:**
  - draait `verbinding.ps1 -Ref mcyjpnnjqxlqfwqhkqrl -Bijwerken`, zonder `-Push`, in het Terminal-paneel;
  - meldt de aantallen accounts, huishoudens en inhoud. Geen adressen, geen inhoud.
- **Producteigenaar:**
  - controleert de organisatie in het dashboard;
  - typt het databasewachtwoord bij de verborgen prompt;
  - zet desgewenst vooraf `$env:KG_ANON_KEY`. Dat is de publieke anon-sleutel en geen geheim.
- **Controle:**
  - de verbinding loopt via TLS met de vastgepinde Supabase-root;
  - het juiste project, geen Huisplan;
  - de geschiedenis bestaat precies uit de migraties 1–11;
  - de dry-run toont alleen de migraties 12–16.
- **Akkoord:** ja. Dit is een online verbinding, maar er wordt niets gewijzigd.
- **Uitgevoerd op 21 oktober 2026** (na een correctie van de URI): PostgreSQL 17.11, 11 migraties, 11 tabellen in
  `public`, schema `private` aanwezig, 2 accounts, pg_cron aan. De dry-run toonde precies de migraties 12–16; de stand
  was voor en na gelijk (`f98c68ba8ab9`). Er is niets gewijzigd.

### Stap 2b — Controleerbare export vóór de migraties

Supabase Free heeft geen back-ups en geen herstel naar een tijdstip. Daarom maken we zelf een export. Lokaal gebouwd en
bewezen op 21 oktober 2026; de online export zelf heeft een eigen akkoord.

**Wat we exporteren:**
- **de gegevens:** alle gewone tabellen in `public` en `private`, en uit `auth` alleen `users` en `identities`.
  Sessies, verversingstokens, eenmalige tokens en het auditlogboek gaan niet mee;
- **het schema:** dat is de repository. Het manifest legt de migratieversies vast, en de vorm van het schema: per schema
  het aantal relaties, functies en policies, en per tabel de kolommen met hun type.

**Hoe** (`staging/export.mjs`, aangeroepen door `verbinding.ps1 -Export`):
- Dezelfde verbinding als stap 2: TLS met keten- en hostnaamcontrole en alleen de vastgepinde Supabase-root. Nooit
  `sslmode=disable` of iets vergelijkbaars.
- Het wachtwoord alleen via de verborgen prompt. Geen `pg_dump` en geen nieuwe software: de bestaande `pg`-bibliotheek.
- Eén read-only transactie met één momentopname (repeatable read): de telling en de rijen horen bij hetzelfde moment.
  Het schema wordt vóór en na de export vergeleken; is het veranderd, dan wordt er niets geschreven.
- Per tabel één JSON-bestand, plus `manifest.json` met de telling en de SHA-256 per bestand. Na het schrijven leest het
  script alles terug en controleert het.
- Het script toont aan het eind de **SHA-256 van `manifest.json`**. Die noteren we; de hersteltoets vraagt hem.

**Waar het staat:**
- In een lege map buiten de repository, die de producteigenaar kiest, bijvoorbeeld
  `C:\Users\Bas\Thuisplanner-exports\staging-2026-10-21`. Het script weigert een relatieve map, een map in of boven
  de repository, en een map die niet leeg is. Dat gebeurt vóór het wachtwoord wordt gevraagd.
- De export bevat persoonsgegevens: twee adressen en gehashte wachtwoorden. Hij blijft alleen op deze computer en de
  producteigenaar verwijdert hem na een geslaagde acceptatie (stap 11).

**Uitvoering:**
1. In een tab van het Terminal-paneel, vanuit de repository:
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\thuisplanner\supabase\staging\verbinding.ps1 -Ref mcyjpnnjqxlqfwqhkqrl -Export -ExportMap <map>`
2. De producteigenaar plakt de Session pooler-URI (met `[YOUR-PASSWORD]`) en typt het wachtwoord bij de verborgen prompt.
3. Het script toont per tabel de telling en de SHA-256 van het manifest.

**De hersteltoets** (`staging/hersteltoets.sh`, alleen lokaal, vóór stap 4):
`bash thuisplanner/supabase/staging/hersteltoets.sh <map> <SHA-256 van manifest.json>`
1. Controleert het manifest tegen de genoteerde SHA-256, en elk bestand tegen zijn controlesom en telling.
2. Start een aparte, lege lokale stack (`thuisplanner_hersteltoets`, poorten 54430–54434) met precies de migraties uit
   het manifest, zonder seed en zonder mail-hook. De gewone lokale stack wordt niet geraakt.
3. Vergelijkt de vorm van het schema met het manifest, vóór er iets wordt teruggezet.
4. Zet alle tabellen terug (triggers en sleutelcontroles staan daarbij uit, zodat versies en tijden niet veranderen) en
   vergelijkt per tabel elke rij met de export.
5. Stopt de stack en verwijdert hem zonder back-up.

Alleen als de hersteltoets "GESLAAGD" meldt, gaan we naar stap 4. Kolommen in `auth` die lokaal niet bestaan (het
gehoste Supabase Auth kan nieuwer zijn dan de lokale stack), meldt de toets met "LET OP". Die worden niet vergeleken.

**Lokaal bewezen (21 oktober 2026):**
- Integratietest `tests/integratie/export.test.mjs` (6 tests, ook in CI).
- Een database met precies migraties 1–11, gevuld zoals staging toen is ingericht (het oude `testers.sql` en
  `archief-proef.sql`: 4 accounts, een huishouden, leden, uitnodigingen en afspraken). Geëxporteerd en met de hersteltoets
  volledig teruggezet: 14 tabellen, 21 rijen, gelijk.
- Tegenproeven, alle gevangen:
  - niet leegmaken vóór het terugzetten;
  - triggers aan tijdens het terugzetten;
  - vergelijken alleen op aantallen;
  - een gewijzigd, ontbrekend of extra bestand;
  - een ander manifest;
  - een manifest met een migratie minder en een nieuwe controlesom: de schemavorm houdt het tegen;
  - een map in de repository, een relatieve map, of `-Export` samen met `-Push`.

**Herstel online, als het ooit nodig is (scenario "project onbruikbaar" in het herstelplan):** dezelfde stappen tegen een
nieuw, leeg Thuisplanner-project na de migraties 1–11. Dat gaat alleen na een aparte uitwerking en een eigen akkoord: het
terugzetten in een gehost project gebruikt `session_replication_role`, en dat is daar nog niet getoetst.

- **Akkoord:** de online export (één verbinding, alleen lezen) heeft een eigen akkoord. De hersteltoets is lokaal.
- **Uitgevoerd op 21 oktober 2026:**
  - **Export:** 14 tabellen, 14 rijen (2 accounts, 1 huishouden met 3 leden, 1 uitnodiging, 1 afspraak, 1 boodschap),
    migraties tot en met `20261019120000`, schema `f98c68ba8ab9`.
  - **Manifest:** SHA-256 `81dd0fdfe9e11bd10420924d65c9d6b1fc2be3229657edced672296c7c921622`.
  - **Opslag:** de export staat in `C:\Users\Bas\Thuisplanner-exports\staging-2026-10-21`, buiten Git en buiten OneDrive.
  - **Hersteltoets:** geslaagd. Alles is teruggezet en gelijk aan de export, zonder "LET OP": de kolommen van `auth` en de
    schemavorm komen overeen met de lokale stack.
  - Online is niets gewijzigd.

### Stap 3 — Proefmail via Lettermint

**DNS (gecontroleerd op 21 oktober 2026, alleen lezend).** `mijnthuisplanner.nl` gebruikt nog de nameservers van
TransIP. Daar staan alle vier de Lettermint-records en ze lossen goed op:
- DKIM `lm1` en `lm2._domainkey.mail`;
- de Return-Path `lm-bounces.mail` → `bounces.lmta.net`;
- DMARC `_dmarc.mail`.

Voor de mail is dus **geen Cloudflare-stap en geen DNS-overstap nodig**. De overstap houdt zijn eigen akkoord.

- **Producteigenaar, in Lettermint:**
  - het domein `mail.mijnthuisplanner.nl` staat op geverifieerd, en de afzender `noreply@mail.mijnthuisplanner.nl` mag;
  - de naam van de route voor transactionele mail noteren (geen geheim);
  - een API-token met alleen verzendrechten aanmaken, alleen in de wachtwoordmanager;
  - het gratis plan (300 per maand) en, als dat kan, een gebruiksmelding bij 200.
  - De webhook pas in stap 6, als `mail-bezorging` online staat.
- **Hulpmiddel:** `staging/proefmail.ps1`, dat `staging/proefmail.mjs` aanroept. Lokaal gebouwd op 21 oktober 2026.
  - Ontvangstadres en token gaan bij een verborgen prompt. Ze staan alleen in dat ene proces en worden daarna gewist.
  - Er is een getypte bevestiging (`verstuur proefmail`).
  - Het gebruikt precies de Lettermint-adapter van de Edge Functions (`aanbieder.ts`), met de afzender uit
    `omgevingen.json`.
  - Het verstuurt één mail en doet daarna, na 3 seconden, hetzelfde verzoek met dezelfde `Idempotency-Key`.
  - Het toont alleen statuscodes, het `message_id` en een verkort adres.
  - Uitvoeren:
    `powershell -NoProfile -ExecutionPolicy Bypass -File .\thuisplanner\supabase\staging\proefmail.ps1 [-Route <naam>]`
- **Uitkomsten:**
  - `IDEMPOTENT BEWEZEN` (hetzelfde `message_id`, exit 0);
  - `NIET IDEMPOTENT` (een ander id: misschien twee mails, exit 3);
  - `NIET BEWEZEN` (409, time-out of fout bij het tweede verzoek, exit 3);
  - `NIET VERSTUURD` (de eerste keer niet aangenomen; geen tweede verzoek, exit 1).
- **Controle in de mailbox:**
  - precies één mail;
  - niet in de spam;
  - de juiste afzender;
  - in de berichtkoppen `spf=pass`, `dkim=pass` en `dmarc=pass`.

  Pas als dat allemaal klopt én de uitkomst "bewezen" is, mag `LETTERMINT_IDEMPOTENT_BEWEZEN=ja` in stap 6. Eventueel nog
  een proef naar Gmail of iCloud (H8).
- **Getest (zonder te versturen):** `tests/functies/proefmail.test.mjs`, 5 tests tegen een nagebootste Lettermint
  (idempotent, niet idempotent, 409, weigering, en uitvoer zonder token of volledig adres). Tegenproeven gevangen:
  - een tweede verzoek met een nieuwe sleutel;
  - elk tweede antwoord als "bewezen" tellen;
  - het volledige adres in de uitvoer;
  - na een weigering toch een tweede verzoek.
- **Akkoord:** ja. Dit is een echte verzending.

### Stap 3a — Interne beveiligingsreview (lokaal, documentatie)

- **Claude:** beoordeelt K1 (de codelaag), de toegangspoort, de testpoort, de uitnodigingsmail en de RLS voor dit
  gebruik.
- **Vastgelegd in** `docs/thuisplanner-review-staging.md`:
  - de bevindingen;
  - wat is opgelost;
  - de resterende risico's, en wie ze accepteert.
- **Daarnaast:** de lijst van wat een onafhankelijke review vóór de bèta moet beoordelen.
- **Akkoord:** de producteigenaar leest de review en geeft daarna akkoord voor stap 4.

### Stap 4 — Migraties 12–16 online

- **Claude:**
  - `verbinding.ps1 -Ref mcyjpnnjqxlqfwqhkqrl -Bijwerken -Push`. Het script vraagt een getypte bevestiging.
  - Daarna de nacontrole (`na`).
- **Producteigenaar:** typt het wachtwoord bij de verborgen prompt.
- **Controle:**
  - 16 migraties;
  - de geplande taken zijn actief;
  - de schakelaars staan goed (`wachtwoordsessies_toegestaan` uit, `huishouden_open` uit);
  - RLS en de rechten kloppen;
  - geen bucket in Storage.
- **Akkoord:** ja (migratie).

| Migratie | Wat verandert er | Bestaande gegevens |
| --- | --- | --- |
| 12 `uitnodigingen_op_email` | Twee kolommen op `household_invites` (adres, geweigerd); vervangen uitnodigingsfuncties met stabiele foutcodes; een trigger die het adres wist; een dagelijkse taak voor verlopen adressen | Bestaande uitnodigingen hebben geen adres en werken zoals voorheen |
| 13 `toegangspoort` | Alle toegang loopt via `private.uid()`: alleen een sessie die met een code is begonnen en nog bestaat. Verder de testpoort G1, de instellingen en de testerslijst, en nieuwe profielregels | Rijen worden niet gewijzigd. **Accounts met een wachtwoord verliezen hun toegang**: de huidige online app werkt dan niet meer |
| 14 `k1_codelaag` | Nieuwe, afgeschermde tabellen voor codes, accounts en toestellen, alleen voor de Edge Functions; een opruimtaak | Niets geraakt |
| 15 `uitnodigingsmail` | Een wachtrij zonder adres of token, en een trigger alleen bij nieuwe uitnodigingen | Niets geraakt |
| 16 `uitnodigingsmail_automatisch` | pg_net; een taak die elke minuut kijkt of er werk is; vervangen wachtrijfuncties | Doet niets zolang Vault leeg is |

### Stap 5 — Edge Functions online

Het gaat om `stuur-code`, `controleer-code`, `stuur-uitnodiging` en `mail-bezorging`.

- **Het probleem:** de Supabase CLI op deze laptop is ingelogd op het Huisplan-account en blijft dat.
- **Daarom een klein script, vergelijkbaar met `verbinding.ps1`:**
  - het vraagt een persoonlijk token van het Thuisplanner-account bij een verborgen prompt;
  - het token staat alleen in dat ene proces;
  - het controleert het kenmerk tegen `omgevingen.json` en weigert Huisplan;
  - het deployt met een expliciete `--project-ref`.
- **Producteigenaar:** maakt het token aan en trekt het na afloop in.
- **Controle:** de functielijst van het stagingproject toont precies deze vier, met `verify_jwt` uit, zoals in
  `config.toml`.
- **Akkoord:** ja (het script lokaal, daarna de deployment).

### Stap 6 — Geheimen, hook, Auth en Turnstile

Alleen de producteigenaar zet deze waarden, in het dashboard. Claude ziet ze niet. Willekeurige waarden maak je lokaal
aan in je eigen terminal en plak je rechtstreeks in het dashboard.

**Functiegeheimen:**
- `K1_PEPPER`
- `K1_SLEUTEL` (32 bytes, base64)
- `K1_HOOK_SECRET` (het geheim dat Supabase maakt bij de Send Email-hook)
- `K1_CAPTCHA=aan` (de nacontrole eist dat online)
- `TURNSTILE_SECRET`
- `MAIL_ADAPTER=lettermint`
- `LETTERMINT_TOKEN`
- `LETTERMINT_WEBHOOK_GEHEIM`
- `MAIL_AFZENDER` (zie `omgevingen.json`)
- `APP_URL`
- `WACHTRIJ_GEHEIM`
- `LETTERMINT_IDEMPOTENT_BEWEZEN=ja`, alleen als stap 3 dat heeft aangetoond

**Auth:**
- de Send Email-hook naar `stuur-code`;
- een OTP van 10 cijfers, 600 seconden geldig, 60 seconden tussen aanvragen;
- bevestigen verplicht;
- alleen e-mail als inlogmethode;
- **aanmelden aan**. De nacontrole eist dat, anders krijgt een genodigde geen code. De besloten test zit in de database
  (testpoort G1) en in Cloudflare Access.

**Overig:**
- **Vault:** `thuisplanner_wachtrij_url` en `thuisplanner_wachtrij_geheim`, via de SQL-editor.
- **Turnstile:** een gratis widget voor `thuisplanner-staging.pages.dev`. De sitekey gaat in stap 8 naar Pages.
- **Lettermint:** de webhook naar `mail-bezorging`.

- **Controle:** de nacontrole met `KG_ANON_KEY` geeft geen afwijking (H7, H16).
- **Akkoord:** ja, per onderdeel.

### Stap 7 — Accounts en huishouden (vóór de telefoonproef klaargezet)

- **Accounts:** iedereen maakt zijn eigen account met een e-mailcode, in stap 9 en 10. Er worden geen accounts met een
  wachtwoord in het dashboard aangemaakt.
- **Testerslijst:** de producteigenaar zet zijn eigen adres erop met `thuisplanner/supabase/staging/testers.sql`, in de
  SQL-editor. Het adres vult hij alleen daar in.
- **Sanne:** hoeft niet op de testerslijst, want zij accepteert een uitnodiging.
- **Cloudflare Access:** de producteigenaar voegt het adres van Sanne toe aan de Access-policy.
- **Akkoord:** ja.

### Stap 8 — De nieuwe app naar staging

- **Claude:** zet de branch `thuisplanner-staging` op `thuisplanner-deel2` en pusht. Dat is fast-forward, want
  staging is een voorouder van deel2. Cloudflare bouwt daarna.
- **Producteigenaar:** voegt in Pages `VITE_TURNSTILE_SITEKEY` toe.
- **Controle:**
  - het bouwlog is groen;
  - de build weigert een ander project, Huisplan, demovariabelen en geheimen;
  - de echte headers en CSP (H17).
- **Akkoord:** ja (deployment).

### Stap 9 — Toegangstests met één account

Met het eigen adres van de producteigenaar: H1–H7 en H10–H13 uit het bouwverslag van deel 2, §4.2.

- **Controle:**
  - `mijn_toegang` geeft `ok`;
  - een sessie met een wachtwoord krijgt niets;
  - "overal uitloggen" werkt direct;
  - in de logboeken staan geen adres, code of token.
- **Akkoord:** ja.

### Stap 10 — Sanne erbij

1. De producteigenaar maakt in de app het huishouden aan.
2. Hij nodigt Sanne uit op haar adres, als beheerder.
3. Sanne opent de app (Access), logt in met een code, ziet de uitnodiging en accepteert die.
4. Allebei zetten jullie de app op het beginscherm. Safari wist anders na 7 dagen zonder bezoek de opslag.

- **Controle:** de uitnodigingsmail komt binnen een minuut, precies één keer (H14).
- **Akkoord:** ja.

### Stap 11 — Acceptatietests samen

Claude levert vooraf een afvinklijst.

| Onderwerp | Geslaagd als |
| --- | --- |
| Synchronisatie | Een wijziging staat binnen een paar seconden bij de ander, ook na wisselen van app of vergrendelen. Na een uur zonder gebruik werkt het nog |
| Uitnodigingen | De mail komt aan; accepteren en weigeren werken; het adres verdwijnt na het accepteren |
| Privacy en RLS | Een privé-afspraak staat bij de ander alleen als "Bezet", zonder titel, plek of notities. De ander kan hem niet wijzigen of verwijderen. Alleen de eigenaar wisselt privé en gedeeld |
| Herhalingen | Hele reeks en "alleen deze" wijzigen of verwijderen, zichtbaar bij de ander |
| Taken | Toevoegen, wie pakt het op, afvinken, weer openzetten |
| Boodschappen | Categorieën; dezelfde boodschap op beide telefoons geeft er één; afvinken en het mandje |
| Gelijktijdig wijzigen | Beide passen hetzelfde item aan: de tweede krijgt "Iemand anders heeft dit net aangepast" en er gaat niets stil verloren |

**Bekende beperkingen.** We leggen ze vast, maar repareren ze niet:
- "Ongedaan maken" doet online niets.
- Er is geen offline-wachtrij.
- Een taak of afspraak die twee keer wordt toegevoegd, staat er twee keer.
- Een gratis project pauzeert na ongeveer 7 dagen zonder gebruik.

## Herstelplan

Een eenvoudige rollback bestaat hier niet:
- er zijn geen back-ups en geen herstel naar een tijdstip;
- er zijn geen terug-migraties;
- elke migratie draait als eigen transactie.

**Noodschakelaars.** Ze werken direct, via de SQL-editor:
- `update private.instellingen set onderhoud = 'dicht'` geeft niemand nog toegang, ook bestaande sessies niet;
- `codes_aan = false` stuurt geen codes meer;
- `registratie_open = false` laat geen nieuwe accounts meer toe.

| Wat misgaat | Wat we doen |
| --- | --- |
| Een migratie faalt | Die migratie rolt zelf terug; de eerdere blijven staan en zijn samen consistent. Het script stopt en herstelt niets zelf. Claude analyseert de fout en stelt een reparatie vooruit voor, als nieuwe migratie of als correctie, met een eigen akkoord |
| De migraties staan, maar gedragen zich verkeerd | Onderhoud op `dicht`, dan vooruit repareren. De migraties wijzigen geen bestaande rijen. Is er toch iets beschadigd, dan zetten we gericht die rijen terug uit de export van stap 2b |
| Het project is onbruikbaar | Een nieuw, leeg project in de organisatie Thuisplanner. Gratis kan dat: twee actieve projecten, en beide Huisplan-projecten zijn gepauzeerd. Het kenmerk wordt bewust in `omgevingen.json` vervangen; daarna de migraties 1–11 (eerste push), de export van stap 2b terug, de tellingen vergelijken, en de overstap opnieuw. **Voorbehoud:** het terugzetten van `auth`-accounts in een gehost project is niet gegarandeerd. Lukt het niet, dan maken de testers hun account opnieuw met een code; staging bevat alleen testgegevens |
| Er komt geen mail aan, dus niemand kan inloggen | De gegevens blijven veilig. `MAIL_ADAPTER` leegmaken stopt alle verzending direct. Daarna de Lettermint-status en de DNS bekijken. Uitnodigingen blijven geldig en zijn na het inloggen zichtbaar |
| Het inloggen wijkt af (H1: `amr` of `session_id` anders) | De poort laat niemand binnen, maar zet ook niets open. Staging blijft dicht tot een gerichte reparatie met een eigen akkoord |
| De app werkt niet goed | Cloudflare Pages kan terug naar een eerdere deployment, maar de oude wachtwoordbuild werkt na migratie 13 niet meer. Terug kan dus alleen naar een eerdere nieuwe build; anders repareren we vooruit |
| Misbruik van het aanmelden | Er kunnen online geen accounts meer worden aangemaakt (zie de schakelaars hierboven). Verder de grenzen van K1 per adres en Turnstile |
| Het project is gepauzeerd | Weer aanzetten in het dashboard; daarna laat de nacontrole zien of de taken draaien |

## Resterende risico's van deze opzet (worden aangevuld in stap 3a)

- **De API is openbaar bereikbaar.** Cloudflare Access beschermt alleen de app. Wie de anon-sleutel en het adres heeft,
  kan dus codes aanvragen. Wat dat beperkt:
  - de grenzen van K1 per adres;
  - Turnstile;
  - de limieten van Supabase.

  Een eigen huishouden maken kan alleen met een adres op de testerslijst, en zonder lidmaatschap zie je niets.
- **Echte adressen van twee personen** staan in een testproject. De privacystappen (verklaring, verwijderroute) zijn
  gepland voor de bèta.
- **De balk op staging zegt "verzonnen gegevens".** Bij echt gebruik klopt dat niet meer. Of die tekst verandert, is een
  aparte beslissing (een kleine tekstwijziging); nu verandert er niets.
- **K1 is eigen beveiligingscode.** Een onafhankelijke review is nodig vóór de bèta.
