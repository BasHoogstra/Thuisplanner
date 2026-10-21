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

### Stap 2b — Controleerbare export vóór de migraties

Supabase Free heeft geen back-ups en geen herstel naar een tijdstip. Daarom maken we zelf een export.

**Wat we exporteren:**
- het schema (zoals het online staat);
- de gegevens van `public` en `private`;
- uit `auth` alleen de accounts en identiteiten. Sessies, verversingstokens, eenmalige tokens en het auditlogboek gaan
  niet mee.

**Hoe:**
- Met `supabase db dump` (de CLI draait pg_dump in Docker; er is geen nieuwe software nodig).
- Over dezelfde verbinding als stap 2: `sslmode=verify-full` en alleen de vastgepinde root. Nooit `sslmode=disable` of
  iets vergelijkbaars.
- Het wachtwoord alleen via de verborgen prompt.
- Hiervoor krijgt `verbinding.ps1` een modus `-Export`. Die wordt eerst lokaal gebouwd en tegen de lokale stack bewezen.
  Dat is een kleine scriptwijziging met een eigen akkoord, vóór deze stap.

**Waar het staat:**
- Buiten de repository, in een map die de producteigenaar kiest, bijvoorbeeld
  `%USERPROFILE%\Thuisplanner-exports\staging-<datum>`.
- De export bevat persoonsgegevens (testadressen en gehashte wachtwoorden). Na een geslaagde acceptatie (stap 11)
  verwijdert de producteigenaar hem.
- De wijziging voor `-Export` voegt een statische controle toe die een export in `thuisplanner/` weigert.

**Wat de export controleerbaar maakt:**
1. Een SHA-256 per bestand, vastgelegd naast de export.
2. Een telling per tabel uit de live database, alleen lezend, in dezelfde read-only transactie.
3. Een **hersteltoets vóór stap 4**: de export wordt teruggezet in een aparte, lege lokale stack, met dezelfde 11
   migraties. Daarna vergelijken we de tellingen per tabel en de controlesommen. Alleen als alles gelijk is, gaan we
   naar stap 4.

- **Akkoord:** ja (de scriptwijziging, de verbinding en de lokale hersteltoets).

### Stap 3 — Proefmail via Lettermint

- **Claude:**
  - één testmail via de Lettermint-API naar het adres van de producteigenaar;
  - daarnaast dezelfde aanvraag met dezelfde idempotentiesleutel. Die mag geen tweede mail geven.
- **Producteigenaar:**
  - maakt in Lettermint een API-token en een webhookgeheim aan, en bewaart die zelf;
  - controleert of de Cloudflare-zone van `mijnthuisplanner.nl` actief is. Daar staan de DKIM-records; als de zone niet
    actief is, komt mail mogelijk niet goed aan. De DNS-overstap heeft een eigen akkoord.
- **Controle:**
  - de mail komt aan en niet in de spam;
  - de afzender klopt;
  - er komt geen tweede mail.
- **Akkoord:** ja. Dit is een echte verzending, en mogelijk een DNS-wijziging.

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
