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
- **Uitgevoerd op 22 oktober 2026:**
  - Beide verzoeken zijn aangenomen, met hetzelfde `message_id`; uitkomst "IDEMPOTENT BEWEZEN".
  - De mail is precies één keer aangekomen in Outlook.com, niet in de spam, met de juiste afzender.
  - De berichtkoppen zijn in orde:
    - `spf=pass` (`smtp.mailfrom=lm-bounces.mail.mijnthuisplanner.nl`);
    - `dkim=pass` voor `header.d=mail.mijnthuisplanner.nl`, de eigen, uitgelijnde handtekening, en ook voor
      `bounces.lmta.net`;
    - `dmarc=pass action=none` (`header.from=mail.mijnthuisplanner.nl`);
    - `compauth=pass`.
  - Daarmee mag `LETTERMINT_IDEMPOTENT_BEWEZEN=ja` in stap 6.
  - Het DMARC-beleid staat nog op `p=none` (meten). Naar `quarantine` gaat het pas na een periode zonder fouten, met een
    eigen akkoord (DNS).

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

- **4-voorbereiding (lokaal, 22 oktober 2026):**
  - De vaste referentie van de nacontrole is bijgewerkt: 95 functies in `private`, sinds R1.
  - Nieuw is `tests/integratie/nacontrole.test.mjs`. Die toetst de referentie, de migraties en de geplande taken tegen
    de lokale stack, ook in CI, zodat een afwijking voortaan opvalt.
  - `-VoorStap6` toont de twee ontbrekende Vault-waarden als "verwacht" in plaats van als afwijking.
- **4a (online, alleen lezend):** een nieuwe export en de hersteltoets, als in stap 2b, naar een nieuwe lege map.
  - **Uitgevoerd op 22 oktober 2026:** `C:\Users\Bas\Thuisplanner-exports\staging-2026-10-22`, 14 tabellen en 14 rijen,
    schema `f98c68ba8ab9`.
  - **Manifest:** SHA-256 `fda9952a162646790a6ef858fb64d89bcccdc1d4e0e380fc4d3db70721020975`.
  - **Hersteltoets:** geslaagd.
  - **Vergeleken met 21 oktober:** alle 14 tabellen bevatten precies dezelfde gegevens (gelijke controlesommen per
    tabel), en de migraties en de schemavorm zijn gelijk. Staging is in de tussentijd niet gebruikt.
- **4b (online, de migratie):**
  `powershell -NoProfile -ExecutionPolicy Bypass -File .\thuisplanner\supabase\staging\verbinding.ps1 -Ref mcyjpnnjqxlqfwqhkqrl -Bijwerken -Push -VoorStap6`
  - Het script vraagt een getypte bevestiging (`push staging mcyjpnnjqxlqfwqhkqrl`).
  - Daarna de nacontrole (`na`), zonder `KG_ANON_KEY`. Aanmelden in Auth staat tot stap 6b nog uit; dat zou anders een
    verwachte afwijking geven.
- **Producteigenaar:** typt het wachtwoord bij de verborgen prompt.
- **4b uitgevoerd op 22 oktober 2026:**
  - **Vooraf:** het script zag precies de migraties 1–11 online en 5 nieuw, en de stand was voor en na de bevestiging
    gelijk (`f98c68ba8ab9`).
  - **De push:** de migraties 12–16 zijn zonder fout uitgevoerd, ook pg_net.
  - **De nacontrole: IN ORDE.**
    - 16 migraties;
    - de schemavorm is gelijk aan de referentie (private: 9 relaties en 95 functies; public: 11 relaties, 34 functies en
      18 policies);
    - de Realtime-policy is in orde;
    - de 5 geplande taken zijn actief;
    - de schakelaars staan goed (wachtwoordsessies uit, sessiecontrole aan, testpoort dicht, registratie en codes aan);
    - pg_net staat aan.
  - **Verwacht tot stap 6:** de twee Vault-waarden ontbreken nog.
  - **Nog niet gecontroleerd:** de Auth-instellingen en de blootgestelde schema's (zonder `KG_ANON_KEY`); dat gebeurt in
    stap 6.
  - **Gevolg:** de huidige stagingapp, die met een wachtwoord inlogt, krijgt geen gegevens meer. Inloggen met een code kan
    pas na stap 6, en de nieuwe app komt in stap 8.
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

Het gaat om `controleer-code`, `mail-bezorging`, `stuur-code` en `stuur-uitnodiging`. Het hulpmiddel is
`staging/functies.ps1`, dat `staging/functies.mjs` gebruikt. Lokaal gebouwd en getest op 22 oktober 2026.

- **Het probleem:** de Supabase CLI op deze laptop is ingelogd op het Huisplan-account. Die inlog wordt niet gebruikt.
- **Het token:** het script vraagt een persoonlijk token van het **Thuisplanner-account** bij een verborgen prompt. Dat
  staat alleen in `SUPABASE_ACCESS_TOKEN` van dat ene proces (dat gaat voor de inlog van de CLI) en wordt daarna gewist.
- **Vooraf, lokaal:**
  - het kenmerk is precies het vastgelegde stagingproject uit `omgevingen.json`, nooit Huisplan;
  - in `functions/` staan precies de vier functies, plus de gedeelde code;
  - in `config.toml` staat bij elke functie `verify_jwt = false`;
  - niets in `functions/` of `config.toml` is ongecommit.
- **Deployen:**
  - na een getypte bevestiging (`deploy staging <kenmerk>`);
  - `npx supabase@2.117.0 functions deploy <de vier> --project-ref <kenmerk> --no-verify-jwt --use-api` (bundelen bij
    Supabase, zonder Docker; nooit `supabase link`).
- **Daarna, alleen lezend:** `functions list` moet precies de vier tonen, alle vier `ACTIVE` en met `verify_jwt` uit.
  Extra functies worden ook gemeld.
- **Uitvoeren:**
  - eerst alleen controleren (lokaal, niets online):
    `powershell -NoProfile -ExecutionPolicy Bypass -File .\thuisplanner\supabase\staging\functies.ps1 -Ref mcyjpnnjqxlqfwqhkqrl`
  - daarna deployen: hetzelfde met `-Deploy`.
- **Producteigenaar:** maakt het token aan in Supabase (Account → Access Tokens) en **trekt het na afloop in**.
- **Te verifiëren bij het eerste gebruik:** de JSON-velden van `functions list` (`slug`, `status`, `verify_jwt`). Wijken
  ze af, dan meldt de controle een afwijking (fail-closed) en kijken we samen.
- **Getest (zonder verbinding):** `tests/functies/functies-deploy.test.mjs`, 5 tests. Tegenproeven gevangen:
  - een Huisplan-kenmerk niet geweigerd;
  - `verify_jwt` na het deployen niet gecontroleerd;
  - extra functies toegestaan;
  - `config.toml` niet gecontroleerd.

  Verder lokaal nagespeeld: een ander kenmerk, een ongecommit bestand in `functions/` en geen token. Alle drie stoppen ze
  vóór er iets online gebeurt.
- **Akkoord:** ja (deployment).
- **Uitgevoerd op 22 oktober 2026:**
  - **De eerste poging stopte** zonder deployment, omdat een verkeerde waarde in de tokenvraag kwam; de CLI weigerde die
    lokaal.
    - Het echte token werd daarna in PowerShell geplakt. Het is ingetrokken, en uit de PowerShell-geschiedenis verwijderd.
    - Sindsdien controleert `functies.ps1` de vorm van het token (`sbp_` en 40 tekens) direct na de vraag.
  - **De tweede poging** (commit `4d3867c`, nieuw token):
    - alle vier de functies zijn gedeployd, versie 1;
    - geüpload zijn alleen de `index.ts`-bestanden en de gedeelde code (`_gedeeld/k1.ts`, `aanbieder.ts` en `mails.ts`);
      geen `.env` of andere bestanden;
    - de controle na afloop is **IN ORDE**: precies de vier, `ACTIVE`, met `verify_jwt` uit.
  - **Tot stap 6** antwoorden de functies met een storing (503), omdat de geheimen nog ontbreken. Dat is bedoeld.

### Stap 6 — Geheimen, hook, Auth en Turnstile (checklist)

Alleen de producteigenaar zet deze waarden, in het dashboard. Claude ziet ze niet.

**Willekeurige waarden maak je in je eigen PowerShell-venster**, buiten dit gesprek. Ze gaan rechtstreeks naar het
klembord, en niet op het scherm:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) | Set-Clipboard
```

Plak de waarde in het dashboard, en leeg daarna het klembord: `Set-Clipboard -Value ' '`. Bewaar niets in een bestand.
De waarden hoeven ook niet in je wachtwoordmanager: als je ze verliest, maak je nieuwe aan. Een nieuwe pepper of sleutel
maakt dan alleen de codes en de toestellen van dat moment ongeldig.

**6a. Supabase → Edge Functions → Secrets** (het stagingproject):

| Naam | Waarde | Herkomst |
| --- | --- | --- |
| `K1_PEPPER` | 32 willekeurige bytes (base64) | Het commando hierboven |
| `K1_SLEUTEL` | 32 willekeurige bytes (base64), een andere waarde | Het commando hierboven |
| `K1_HOOK_SECRET` | `v1,whsec_…` | Gemaakt door Supabase bij de hook (6c); hetzelfde geheim |
| `K1_CAPTCHA` | `aan` | Vast (de nacontrole eist dat online) |
| `TURNSTILE_SECRET` | De geheime sleutel van de widget | Cloudflare Turnstile (6d) |
| `MAIL_ADAPTER` | `lettermint` | Vast |
| `MAIL_AFZENDER` | `Thuisplanner (staging) <noreply@mail.mijnthuisplanner.nl>` | `omgevingen.json` |
| `LETTERMINT_TOKEN` | Het token uit stap 3 | Lettermint (wachtwoordmanager) |
| `LETTERMINT_WEBHOOK_GEHEIM` | `whsec_…` | Lettermint, bij de webhook (6e) |
| `LETTERMINT_IDEMPOTENT_BEWEZEN` | `ja` | Alleen als in stap 3 ook SPF, DKIM en DMARC `pass` zijn |
| `LETTERMINT_ROUTE` | Alleen als het niet de standaardroute is | Lettermint |
| `APP_URL` | `https://thuisplanner-staging.pages.dev` | `omgevingen.json` |
| `WACHTRIJ_GEHEIM` | 32 willekeurige bytes (base64; minstens 32 tekens) | Het commando hierboven; dezelfde waarde gaat ook in Vault (6f) |

`SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` geeft Supabase zelf aan de functies. Die zet je niet, en ze komen nooit in
de app.

**6b. Supabase → Authentication:**
- **Sign In / Providers → Email:**
  - e-mail aan;
  - **Allow new users to sign up: aan** (de nacontrole eist dat; de besloten test zit in de testpoort en in Access);
  - **Confirm email: aan**;
  - **Secure email change: aan**;
  - **Email OTP length: 10**;
  - **Email OTP expiration: 600** seconden.
- **Alle andere aanmeldmethoden uit:** telefoon, anoniem, SAML en sociale accounts.
- **URL Configuration:**
  - Site URL `https://thuisplanner-staging.pages.dev`;
  - geen extra Redirect URL's.
- **Rate Limits:** e-mail ten minste 60 seconden tussen aanvragen (H7).
- **Attack Protection → Captcha: aan, met Turnstile en de geheime sleutel uit 6d** (review R3 en H11). De app stuurt bij
  het aanvragen van een code een eigen Turnstile-token mee. Het controleren van de code gebruikt een tweede, nieuw token,
  dus die twee zitten elkaar niet in de weg.

**6c. Supabase → Authentication → Hooks → Send Email:**
- type HTTPS;
- adres `https://mcyjpnnjqxlqfwqhkqrl.supabase.co/functions/v1/stuur-code`;
- **Generate secret**, en dat geheim ook als `K1_HOOK_SECRET` bij 6a zetten;
- aanzetten.

**6d. Cloudflare → Turnstile:**
- een nieuwe widget, gratis, voor de hostname `thuisplanner-staging.pages.dev`;
- modus "Managed";
- de **sitekey** (geen geheim) gaat in stap 8 naar Pages als `VITE_TURNSTILE_SITEKEY`;
- de **geheime sleutel** gaat naar `TURNSTILE_SECRET` (6a) en naar de Auth-captcha (6b).

**6e. Lettermint → Webhooks** (pas nu: `mail-bezorging` staat dan online):
- adres `https://mcyjpnnjqxlqfwqhkqrl.supabase.co/functions/v1/mail-bezorging?aanbieder=lettermint`;
- gebeurtenissen: `message.delivered`, `message.hard_bounced`, `message.failed`, `message.suppressed` en
  `message.policy_rejected`;
- het `whsec_…`-geheim gaat naar `LETTERMINT_WEBHOOK_GEHEIM`.

**6f. Supabase → SQL Editor, Vault** (de waarden alleen in de editor typen, niet in de chat):
```sql
select vault.create_secret('https://mcyjpnnjqxlqfwqhkqrl.supabase.co/functions/v1/stuur-uitnodiging', 'thuisplanner_wachtrij_url');
select vault.create_secret('<dezelfde waarde als WACHTRIJ_GEHEIM>', 'thuisplanner_wachtrij_geheim');
```
Het adres moet met `https://` beginnen (review L5).

**6g. Supabase → Project Settings → Data API:** Exposed schemas precies `public` en `graphql_public`, en `private` niet
in het extra search path. **Realtime → Settings:** "Allow public access" uit.

**Controle na stap 6:** `verbinding.ps1 -Ref mcyjpnnjqxlqfwqhkqrl -Bijwerken` toont dan niets nieuws. De nacontrole
(`node verbinding-controle.mjs na`, met `$env:KG_ANON_KEY` gezet) controleert:
- de Auth-instellingen;
- de blootgestelde schema's;
- Vault;
- pg_net;
- de schakelaars;
- de geplande taken.

Dat is H7 en H16.

- **Akkoord:** ja, per onderdeel.
- **Uitgevoerd op 22 en 24 oktober 2026** (door de producteigenaar in de dashboards; Claude zag geen waarden):
  - **6a–6c, geheimen en hook:** volgens de melding van de producteigenaar staan de 13 geheimen. De Send Email-hook
    (HTTPS, `stuur-code`) staat aan, en `K1_HOOK_SECRET` is gezet. `stuur-code` antwoordt op een verzoek zonder geldige
    handtekening met 401. Dat ze werken, blijkt uit stap 9: de code-inlog slaagt via de hook.
  - **6b, Auth:** de producteigenaar meldde e-mail aan, aanmelden aan, bevestigen aan, OTP 10 en 600, andere methoden
    uit, de Site URL gezet, een rate limit van 60 seconden en de captcha aan. Alleen lezend nagemeten (24 oktober):
    alleen e-mail als inlogmethode, `disable_signup` uit, `mailer_autoconfirm` en `phone_autoconfirm` uit, SAML en
    passkeys uit. Dat is in orde.
  - **6d, Turnstile:** de widget staat op de hostname `thuisplanner-staging.pages.dev`. De geheime sleutel is
    vervangen, en op 26 oktober is gemeten dat hij overeenkomt met de widget (zie stap 9).
  - **6e, de Lettermint-webhook:** het adres, de vijf gebeurtenissen en `LETTERMINT_WEBHOOK_GEHEIM` zijn ingesteld (volgens
    de melding). **Open:** er is geen testgebeurtenis bevestigd; dat volgt met de eerste uitnodigingsmail (H14, stap 10).
  - **6f, Vault** (SQL-controle door de producteigenaar): `thuisplanner_wachtrij_geheim` heeft 44 tekens, en
    `thuisplanner_wachtrij_url` is het https-adres van `stuur-uitnodiging`. Daarnaast: 5 geplande taken, allemaal
    actief; de schakelaars `wachtwoordsessies` uit, `sessiecontrole` aan, `onderhoud` leeg en `huishouden_open` uit.
  - **6g, schema's:** alleen `public` en `graphql_public` zijn blootgesteld. Realtime "Allow public access" staat uit, en
    er zijn geen Storage-buckets (volgens de melding). Alleen lezend nagemeten: een verzoek op `private` geeft
    `PGRST106` ("Only the following schemas are exposed: public, graphql_public").
  - **De nacontrole:** de Auth-instellingen zijn IN ORDE. De schemacontrole gaf een **schijnafwijking**: met een
    publishable key antwoordt de root van `/rest/v1/` met 401 ("Secret API key required"), en de controle verwacht daar
    nog het oude antwoord. De meting per tabel hierboven laat zien dat `private` niet bereikbaar is. **Open:** de
    nacontrole aanpassen aan publishable keys (aparte wijziging, met akkoord).

### Stap 7 — Accounts en huishouden (vóór de telefoonproef klaargezet)

- **Accounts:** iedereen maakt zijn eigen account met een e-mailcode, in stap 9 en 10. Er worden geen accounts met een
  wachtwoord in het dashboard aangemaakt.
- **Testerslijst:** de producteigenaar zet zijn eigen adres erop met `thuisplanner/supabase/staging/testers.sql`, in de
  SQL-editor. Het adres vult hij alleen daar in.
- **Sanne:** hoeft niet op de testerslijst, want zij accepteert een uitnodiging.
- **Cloudflare Access:** de producteigenaar voegt het adres van Sanne toe aan de Access-policy.
- **Akkoord:** ja.
- **Stand op 26 oktober 2026:**
  - De producteigenaar behoudt zijn bestaande account en het bestaande huishouden (besluit van 24 oktober). Er zijn
    geen gegevens verwijderd of gereset. Hij logt in met een code, en is eigenaar (stap 9).
  - De testerslijst is leeg (0 adressen, gemeten op 24 oktober), en dat is niet nodig gebleken: een eigen nieuw
    huishouden maken is niet nodig, omdat het bestaande huishouden er al is.
  - **Open:** dat het adres van Sanne in de Access-policy staat, is niet aantoonbaar vastgelegd. Te controleren
    vóór stap 10.

### Stap 8 — De nieuwe app naar staging

- **Claude:** zet de branch `thuisplanner-staging` op `thuisplanner-deel2` en pusht. Dat is fast-forward, want
  staging is een voorouder van deel2. Cloudflare bouwt daarna.
- **Producteigenaar:** voegt in Pages `VITE_TURNSTILE_SITEKEY` toe.
- **Controle:**
  - het bouwlog is groen;
  - de build weigert een ander project, Huisplan, demovariabelen en geheimen;
  - de echte headers en CSP (H17).
- **Akkoord:** ja (deployment).
- **Uitgevoerd op 24 en 26 oktober 2026:**
  - Pages: de root is `thuisplanner/app`, de watch paths `thuisplanner/**`, de build `npm ci && npm run build:staging`,
    de uitvoer `dist`, en de productiebranch `thuisplanner-staging`.
  - `thuisplanner-staging` is alleen vooruit gezet: eerst naar `41f105d` (24 oktober), daarna naar `75d167f` (26
    oktober). Bij beide was de uitrol in Pages **Success** (volgens de melding van de producteigenaar).
  - **De sitekey:** de eerste build had een geheime sleutel als sitekey. Die is ingetrokken. Een tweede build had nog
    een oude waarde van 35 tekens. In de derde build bevat de gepubliceerde bundel alleen één sleutel van 24 tekens
    (`0x4AAA…`), alleen lezend nagemeten in de app. Na het toevoegen van de hostname bij Turnstile (fout 110200) laadt
    Turnstile.
  - **Access:** het app-adres, en de preview-adressen (`main.`, `thuisplanner-deel2.` en
    `thuisplanner-staging.thuisplanner-staging.pages.dev`), geven zonder inlog 302 naar de Access-inlog. Gemeten op 24
    oktober, en opnieuw op 26 oktober.
  - **De buildbewaking:** de weigering van een ander project, Huisplan, demovariabelen en geheimen is lokaal en in CI
    getest. Online is alleen de geslaagde build met de juiste configuratie gezien.
  - **Open (H17):** de echte response-headers en de CSP van de online app zijn niet afzonderlijk uitgelezen. Wel bekend:
    de CSP in de build (`_headers`, `frame-ancestors 'none'`, script alleen van `self` en `challenges.cloudflare.com`),
    en dat Turnstile online laadt. Uitlezen kan alleen met een Access-inlog, in de browser van de producteigenaar.

### Stap 9 — Toegangstests met één account

Met het eigen adres van de producteigenaar: H1–H7 en H10–H13 uit het bouwverslag van deel 2, §4.2.

- **Controle:**
  - `mijn_toegang` geeft `ok`;
  - een sessie met een wachtwoord krijgt niets;
  - "overal uitloggen" werkt direct;
  - in de logboeken staan geen adres, code of token.
- **Akkoord:** ja.
- **Uitgevoerd op 26 oktober 2026:**
  - **De eerste pogingen mislukten** met `captcha_failed`.
    - Oorzaak: de geheime Turnstile-sleutel bij de Auth-captcha in Supabase was een andere dan die van de widget. Gemeten
      zonder de sleutel te tonen: lengte en vingerafdruk (de eerste 8 bytes van SHA-256), plus de siteverify-controle
      van Cloudflare.
    - Herstel door de producteigenaar: de sleutel uit Cloudflare (lengte 35, Cloudflare geeft `invalid-input-response`
      op een nep-token) is gezet bij de Auth-captcha en in `TURNSTILE_SECRET`.
  - **Reparatie B** (commit `75d167f`, CI groen, Pages-uitrol op `thuisplanner-staging` geslaagd): na een geweigerd of
    verlopen token komt er een nieuwe widget, en kan de gebruiker altijd opnieuw controleren.
  - **Inloggen met een code werkt**, op de telefoon en op de laptop. De producteigenaar komt direct in de planner, als
    eigenaar van het bestaande huishouden. Daarmee geeft `mijn_toegang` dus `ok`.
  - **"Uitloggen op alle toestellen" werkt direct.**
    - Na het uitloggen op de telefoon toont de laptop na verversen het inlogscherm.
    - Het Auth-logboek toont de uitlog (204), en daarna voor de laptop `403 Session not found`: de sessie was op de
      server al ingetrokken.
  - **Logboeken schoon.**
    - `stuur-code` en `controleer-code` schrijven alleen functie, soort, uitkomst en `bekend_toestel`.
    - Het Auth-logboek toont geen code en geen token. Het adres van de gebruiker legt Supabase zelf vast in het
      Auth-logboek; dat zien alleen beheerders van het project.
  - **Niet apart online getest:** dat een sessie met een wachtwoord niets krijgt. Wachtwoordsessies staan uit
    (`private.instellingen`), en die regel is lokaal bewezen (KG-T65 in `rls_tests.sql`).

### Stap 9b — Vakanties, Agenda en de slimme + naar staging (vóór stap 10)

Toegevoegd op 26 oktober 2026, op verzoek van de producteigenaar (roadmap, mijlpaal 1: één gebundelde uitrol, daarna
stap 10 en 11). Dit is de eerste uitrol met nieuwe functies; de uitgangspunten hierboven gelden verder onverkort.

**Wat er online komt:** de geïntegreerde branch `thuisplanner-vakanties` (Vakanties V1 met extra inpaklijsten, Later
nodig, de slimme + met het herontwerp, Agenda stap 0–4, de foutgrens) en de migraties 25–27:

| Migratie | Wat verandert er | Bestaande gegevens |
| --- | --- | --- |
| 25 `vakanties` | Vakanties, pakitems en de koppeling met boodschappen; `tasks.trip_id`; RLS, functies en seintjes | Niets geraakt; `trip_id` is leeg |
| 26 `boodschappen_later` | `shopping_items.deferred` (Later nodig); `add_shopping_items` krijgt `p_later` (oude aanroepen werken ongewijzigd) | Niets geraakt; `deferred` is onwaar |
| 27 `paklijsten` | Extra inpaklijsten (`trip_packing_lists`, `trip_packing_items.list_id`) | Niets geraakt |

**Waarom vóór stap 10, en zo (§22.1 van `docs/thuisplanner-vakanties.md`, keuze 1: samen uitrollen):**
- Staging heeft nu alleen de toestellen van de producteigenaar. Er is dus geen toestel van een ander met een oude app.
- De app die nu online staat (`75d167f`) kent geen vakanties, geen pakitems en geen `list_id`. Het risico van §20.6
  (items van een extra lijst als Gezamenlijk tonen) bestaat alleen voor een app die wel paklijsten kent maar geen
  `list_id`; die versie heeft nooit online gestaan.
- Wat de oude app in de korte tussentijd wél anders toont: een boodschap bij Later nodig staat bij de gewone
  boodschappen, en een voorbereiding van een vakantie staat als gewone taak. Daarom gaat de app direct na de migraties
  online, en worden alle toestellen daarna herladen. De oude app blijft met de nieuwe migraties werken (alleen
  toevoegingen); terug naar de vorige build in Pages kan dus.

**Stappen, elk met een eigen akkoord:**
1. **Lokaal, de repetitie** (`staging/generale.sh`): de laatste export van staging terug in een aparte lokale stack,
   de migraties tot en met 16 zoals online, een foto van alle gegevens, de controle vooraf van
   `verbinding.ps1 -Bijwerken`, de migraties 25–27 met `supabase db push`, en daarna de vergelijking (elke bestaande rij
   ongewijzigd) en de nacontrole tegen de referentie van stand 27. Daarnaast de volledige lokale testreeks op de
   branch. **Uitgevoerd op 26 oktober 2026 met de export van 22 oktober**; zie de uitkomst hieronder.
2. **Online, alleen lezend:** een nieuwe export en de hersteltoets, als in stap 2b, naar een nieuwe lege map. Sinds 22
   oktober staan er accounts en een huishouden uit stap 7 en 9 in.
3. **Lokaal:** `generale.sh` opnieuw, met die nieuwe export.
4. **Online, de migraties:** eerst de dry-run, dan de push:
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\thuisplanner\supabase\staging\verbinding.ps1 -Ref mcyjpnnjqxlqfwqhkqrl -Bijwerken`
   en daarna met `-Push` (zonder `-VoorStap6`: Vault staat sinds stap 6). Verwacht vooraf: 16 migraties online, 3 nieuw.
   De nacontrole toetst tegen stand 27: private 9 relaties, 103 functies, 0 policies; public 15 relaties, 38 functies,
   30 policies (`SCHEMA_PER_STAND` in `verbinding-controle.mjs`).
5. **Online, de app:** `thuisplanner-staging` alleen vooruit zetten naar de geteste commit van `thuisplanner-vakanties`
   (fast-forward: `75d167f` is een voorouder) en pushen; Cloudflare bouwt. Direct na stap 4.
6. **Toestellen:** de app op elk toestel sluiten en opnieuw openen (vanaf het beginscherm), en kort nalopen: een
   vakantie maken, een pakitem afvinken op de telefoon en zien op de laptop, iets toevoegen met de +, de Agenda.

- **Controle:** de nacontrole van stap 4 in orde; het bouwlog groen; de korte ronde van stap 6.
- **Akkoord:** ja, per stap (export, migratie, push en deployment).
- **Als het misgaat:** zie het herstelplan. De migraties wijzigen geen bestaande rijen; de oude build werkt ermee.
- **Open punten die blijven:** de verdediging in de database en een minimale app-versie (§22.1, punt 2 en 3) vóór de bèta.

**Uitkomst van de lokale repetitie (stap 9b.1, 26 oktober 2026): geslaagd.**
- `bash thuisplanner/supabase/staging/generale.sh C:/Users/Bas/Thuisplanner-exports/staging-2026-10-22 fda9952a…020975`
  (de export van stap 4a; manifest en controlesommen in orde, 14 tabellen, 14 rijen, stand 19).
- Teruggezet en gelijk aan de export; daarna de migraties 12–16 met `db push` (supabase 2.117.0, als
  `verbinding.ps1`), zonder fout.
- Foto: 21 tabellen, 16 rijen. De controle vooraf: 16 migraties, precies 3 nieuw (25, 26, 27).
- De migraties 25–27 met `db push`: zonder fout.
- Vergelijking: alle bestaande rijen ongewijzigd. Nieuw: de kolommen `shopping_items.deferred` en `tasks.trip_id`
  (bestaande rijen gelijk) en de tabellen `trips`, `trip_packing_items`, `trip_packing_lists`, `trip_shopping_links`.
- Nacontrole tegen stand 27: in orde (19 migraties; private 9/103/0, public 15/38/30). Alleen verwacht in deze opzet:
  de twee Vault-waarden (online gezet in stap 6).
- Tegenproef: een gewijzigde controlesom en een verdwenen kolom geven een afwijking (code 1); een niet-lokaal adres
  wordt geweigerd. De aparte stack is na afloop verwijderd.
- **Beperking:** de export van 22 oktober is van vóór stap 7 en 9 (geen accounts met een code, geen K1-gegevens).
  Daarom stap 9b.2 en 9b.3 met een nieuwe export, vlak voor de echte uitrol.

**Stap 9b.2, de nieuwe export (27 oktober 2026, online alleen lezend): geslaagd.**
- `C:\Users\Bas\Thuisplanner-exports\staging-2026-10-27` (buiten Git; toegang alleen het eigen account, SYSTEM en
  Administrators): 21 tabellen, 22 rijen, migraties tot `20261024120000`, schema `3d20a2c7d6f1`, Postgres 17.11.
- **Manifest:** SHA-256 `caae37041e29c430bb9d2fb9b248a04fc778de35c4a97cecea0723f4521111b0`. Online niets gewijzigd.
- Nieuw ten opzichte van 22 oktober: de accounts en codegegevens van stap 7–9. De testerslijst en de wachtrij van de
  uitnodigingsmails zijn leeg (Sanne is nog niet uitgenodigd).

**Stap 9b.3, hersteltoets en repetitie met die export (27 oktober 2026, alleen lokaal): geslaagd.**
- **Hersteltoets** (`hersteltoets.sh`, aparte stack): manifest en controlesommen in orde; teruggezet en gelijk aan de
  export (alle tabellen, alle rijen); geen LET OP-meldingen. Stack daarna verwijderd.
- **Repetitie** (`generale.sh`, aparte stack): teruggezet en gelijk; foto 21 tabellen, 22 rijen; de controle vooraf: 16
  migraties, precies 3 nieuw; de migraties 25–27 met `db push` zonder fout; **alle bestaande rijen ongewijzigd** (nieuw
  alleen `shopping_items.deferred`, `tasks.trip_id` en de vier vakantietabellen); **nacontrole tegen stand 27 in orde**
  (19 migraties; private 9/103/0, public 15/38/30). Alleen verwacht: de twee Vault-waarden. Stack daarna verwijderd.
- **Geen berichten naar buiten:** de mail-hook staat in de tijdelijke opzet uit, Edge Functions en Mailpit starten niet,
  en de verzending van uitnodigingsmails kan alleen met de Vault-waarden, die niet in de export zitten (de nacontrole
  toonde ze als ontbrekend). De wachtrij was leeg.
- **Resterende risico's voor 9b.4–9b.6:** staging draait Postgres 17.11, de repetitie 17.6 (gewone SQL; de dry-run en
  de nacontrole van de echte push zijn de laatste toets). Alleen de database is geoefend, niet de functies, mail of
  Realtime (die veranderen niet; stap 9b.6 loopt de app na). Tussen 9b.4 en 9b.5 toont de oude app Later nodig tussen de
  gewone boodschappen: kort en onschuldig, mits 9b.5 direct volgt. De export bevat persoonsgegevens: verwijderen na
  stap 11.

**De volledige lokale testronde op deze stand (26–27 oktober 2026)** (tot en met `7620ff5`, met het stagingpakket):
- tsc schoon; Vitest 570/570; e2e 263 geslaagd, 0 mislukt, 13 overgeslagen (360, 390 en desktop; 320 px en donker in
  de tests zelf); `statisch.js` geslaagd.
- RLS-matrix 88/88; integratie- en synctests alle geslaagd (sync 8, vakanties-sync 15, nacontrole 5, export 6 en de
  rest); sync-, K1- en vakanties-sync-tegenproeven 25/25, 30/30 en 16/16.

**Bekende aandachtspunten (geen fout in de code, wel vastgelegd):**
- **De 13 overgeslagen e2e-tests** zijn bewust, per groep:
  - 3: de screenshots (`prototype.spec.ts`), alleen via `npm run screenshots` (één per project);
  - 6: het losse bestand (`prototype.spec.ts`, twee tests), alleen na `npm run losbestand` (per project);
  - 4: alleen op de laptop overgeslagen, omdat ze over de telefoon gaan: drie van de slimme + (het toetsenbord en het
    smalle scherm, `snelinvoer.spec.ts`) en het vegen in de paklijst (`vakanties.spec.ts`).
- **4 RLS-tegenproeven op de gedeelde lokale database:** op de lokale stack `thuisplanner`, waar tests van meerdere
  werkmappen gegevens achterlaten (35 huishoudens), vangt de matrix 136 van de 140 sabotages bij het bedoelde scenario.
  De andere 4 (tegenproef 1, 2, 3 en 7: alles zichtbaar maken) worden wel gevangen, maar al eerder, bij KG-T01, KG-T03
  of KG-T04, omdat die scenario's rijen tellen. Op een schone, tijdelijke database met dezelfde 19 migraties: 88/88 en
  140/140. Opruimen of opnieuw opbouwen van de gedeelde lokale stack gebeurt alleen met een akkoord.
- **k1 AC-11/AC-12 en `uitnodigingsmail.test.mjs`** draaien niet in de testcontainer van deze werkmap (geen `docker`
  voor de logboeken; geen `supabase/functions/.env`). Ze moeten in een volledige testopzet slagen **vóór de bèta**
  (`docs/thuisplanner-deel2-bouwverslag.md` §8.4).
- **De echte iPhone-test** van deze stand is gedaan op 27 oktober 2026, en is geslaagd (`docs/thuisplanner-agenda.md`,
  M1). Dat was de demomodus; de echte modus met twee accounts volgt in stap 11.

### Stap 10 — Sanne erbij

1. De producteigenaar maakt in de app het huishouden aan.
2. Hij nodigt Sanne uit op haar adres, als beheerder.
3. Sanne opent de app (Access), logt in met een code, ziet de uitnodiging en accepteert die.
4. Allebei zetten jullie de app op het beginscherm. Safari wist anders na 7 dagen zonder bezoek de opslag.

- **Controle:** de uitnodigingsmail komt binnen een minuut, precies één keer (H14).
- **Akkoord:** ja.
- **Voorbereiding uitgevoerd op 26 oktober 2026:**
  - In Cloudflare Access staan beide applicaties op een sessieduur van 1 maand. Beide policies ("Thuisplanner Staging -
    Alleen testers" en "Allow Members - Cloudflare Pages") volgen de sessieduur van de applicatie.
  - De previews staan aantoonbaar achter Access (zie stap 8). Welke van de twee applicaties welke hostnames dekt, is
    niet afzonderlijk vastgesteld.
  - Sanne is op verzoek van de producteigenaar **nog niet uitgenodigd**.
  - **Open:** controleren dat het adres van Sanne in de Access-policy staat (zie stap 7).

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

**Erbij na stap 9b (26 oktober 2026): Vakanties, Agenda en de slimme +.** Op beide telefoons; licht en donker.

| Onderwerp | Geslaagd als |
| --- | --- |
| De slimme + | Een afspraak ("Etentje bij oma zaterdag om 18:00"), een taak en een paar boodschappen in één zin komen goed binnen en staan binnen een paar seconden bij de ander. De verzendknop staat boven het toetsenbord, ook met een lange zin. Privé of gedeeld is zichtbaar en met één tik te wisselen; een privé-afspraak is bij de ander "Bezet". "Formulier" opent het formulier met wat al herkend is |
| Vakanties | Een vakantie maken met datums; de kaart staat op Vandaag ("over n dagen") en opent de vakantie, bij allebei |
| Inpakken | Per persoon, Gezamenlijk en een extra lijst (bijvoorbeeld "Oma"): toevoegen en afvinken op de ene telefoon staat binnen een paar seconden bij de ander. Dezelfde tekst twee keer bij één persoon geeft één item. Overnemen van een vorige vakantie, en ongedaan maken |
| Voorbereidingen | "Paspoorten controleren voor Frankrijk" met de + wordt een taak bij die vakantie, met het label; zonder datum staat hij in de Agenda onder "Zonder datum" |
| Later nodig | "Zonnebrand kopen voor Frankrijk" staat bij Later nodig met het label, niet tussen de gewone boodschappen; "Nu kopen" zet hem met één tik op de gewone lijst, bij allebei |
| Agenda | De weekstrip op de iPhone: een dag kiezen toont die dag, de rest van de week staat eronder; vakantiedagen tonen de vakantie, die opent met één tik. De + van een dag zet de datum. Het gezinsfilter achter de knop; "Zonder datum" ingeklapt met een telling. De maand en de dag kloppen met de week |
| Navigatie | Tussen Vandaag, Agenda, Boodschappen en Meer (Vakanties) wisselen zonder fouten; terug naar de app na vergrendelen toont de laatste stand |
| Foutgrens | Wordt niet opzettelijk getest. Loopt toch een scherm vast: een rustige melding met "Opnieuw laden" en "Meld dit" (een mail met alleen tijdstip en scherm), en de navigatie werkt nog. Meld het dan |

**Bekende beperkingen.** We leggen ze vast, maar repareren ze niet:
- "Ongedaan maken" doet online niets.
- Er is geen offline-wachtrij.
- Een taak of afspraak die twee keer wordt toegevoegd, staat er twee keer.
- Een gratis project pauzeert na ongeveer 7 dagen zonder gebruik.
- De weekstrip markeert een vakantiedag niet zichtbaar; de dag zelf en "Rest van de week" wel (Agenda M2, stap 8).
- Op 320 px zakt in de kop van de Agenda de pijl "Volgende" naar een tweede regel (Agenda M3).
- "Meld dit" opent een mail zonder ontvanger: het adres staat nog niet in de app.

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
