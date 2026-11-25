# Thuisplanner: resterende risico's voor de besloten bèta (besluit O6)

**Status:** concept ter beoordeling door de producteigenaar, 25 november 2026 (pakket P3, voorwaarde V5). Er is niets
gecommit, gedeployd of online gewijzigd. Dit document voegt geen nieuwe bevindingen toe: elk punt komt uit de code of
uit de genoemde documenten, met de plek erbij.

**Waarvoor dit is.** Vóór het eerste externe gezin moet de onafhankelijke beveiligingsreview gedaan zijn, óf de
producteigenaar accepteert schriftelijk het resterende risico voor een besloten bèta (`thuisplanner-beta-voorbereiding.md`
§5.5 en besluit O6; roadmap, "Besloten bèta op uitnodiging", V5). Het advies is: accepteren voor de besloten bèta met
vijf gezinnen, en de **externe review vóór de publieke lancering** (mijlpaal 3). Dit overzicht maakt zichtbaar wat je
dan accepteert.

**Bronnen:** `thuisplanner-review-staging.md` (interne review, 21 oktober 2026, R1–R5, L1–L9, Info, de 7 punten voor de
onafhankelijke review), `thuisplanner-k1-ontwerp.md` §12, `thuisplanner-staging-overstap.md` stap 6, en de code zelf.

**Hoe te lezen.** "Kans" en "schade" zijn een inschatting voor deze bèta: vijf gezinnen, alleen op uitnodiging, met
`huishouden_open` uit en de testerslijst (G1). Bij een publieke lancering liggen ze hoger.

## In het kort

- Er is **geen bekende route** waarmee een buitenstaander gegevens van een gezin kan lezen of wijzigen, of waarmee een
  gezinslid de privé-afspraken van een ander kan zien (interne review, "Nagelopen en in orde").
- Wat overblijft, gaat vooral over **eigen beveiligingscode zonder externe blik** (K1, de poort), over
  **beschikbaarheid** (inloggen hinderen, het mailtegoed opmaken) en over **instellingen die alleen online te zien zijn**.
- Een deel wordt vóór de start opgelost in andere pakketten (P1, P2, P4, P5) en in de online Access-poort (V7). Die
  punten hoef je niet te accepteren; ze blokkeren de start tot ze af zijn.

## 1. Opgelost in dit pakket (P3)

| # | Wat het was | Wat er nu staat | Bewijs |
| --- | --- | --- | --- |
| L5 | Het Vault-adres van de mailwachtrij mocht `http://` zijn; dan gaat het wachtrijgeheim onversleuteld over het netwerk | De nacontrole (`verbinding-controle.mjs na`) eist online dat het adres met `https://` begint. De database toetst dat zelf: alleen "ja" of "nee" komt terug, nooit het adres. "Niet te lezen" telt als afwijking | `tests/functies/nacontrole-vault.test.mjs` (4 tests) en 3 tegenproeven: elke bewust ingebouwde fout wordt gevangen |
| L6 | Het namenfilter in de uitnodigingsmail liet Unicode-punten (`evil．com`) en telefoonnummers door | `veiligeNaam` (`_gedeeld/mails.ts`) normaliseert eerst met NFKC en weigert daarna ook ideografische punten, niet-Latijnse "domeinen" en zes of meer cijfers | `tests/functies/mails.test.mjs` (8 tests, waaronder 2 tegenproeven); met het oude filter falen 4 tests |

**Nog te melden bij L5 (geen wijziging gedaan):** de database zelf accepteert nog `http://`
(`20261024120000_uitnodigingsmail_automatisch.sql:255`: `url !~ '^https?://'`; zo ook de opruimronde in
`20261029120000_spullen_documenten.sql:460`). De nacontrole vangt een fout adres nu wél, maar pas als hij draait (na
elke wijziging en wekelijks, beta-voorbereiding §7). Dat ook in de database dichtzetten vraagt een migratie; lokaal is
het adres bewust `http://`. Alleen pakket P2 voegt vóór de start een migratie toe: dit is daarom niet toegevoegd, maar
gemeld (rapport van P3). Strikt nodig voor de start is het niet, zolang de nacontrole na elke wijziging draait. Ook wordt niet gecontroleerd dat het adres naar het eigen project wijst (alleen dat het met
`https://` begint).

## 2. Wordt vóór de start opgelost (blokkeert de start, niet te accepteren)

| # | Wat | Waar | Pakket |
| --- | --- | --- | --- |
| R4 | Een account op de testerslijst kan via uitnodigingen het mailtegoed opmaken (tot 10 huishoudens × 20 mails per dag); dat raakt ook de inlogcodes | review-staging R4 | P2 (V4) |
| L1 | Bij "registratie dicht" gaat per aanvraag een uitlegmail weg, zonder grens per adres | review-staging L1 | P2 (V4) |
| L4 | Een onderschept webhookverzoek is 5 minuten opnieuw te gebruiken (geen geheugen voor webhook-id's) | review-staging L4 | P2 (V4) |
| – | Registratie alleen op uitnodiging in de codelaag (nu kan iedereen een account aanmaken; zonder lidmaatschap ziet dat account niets) | roadmap V4 | P2 |
| L8 | De kenmerkcontrole loopt alleen via `npm run build:staging` | review-staging L8 | P1 (V3) |
| – | Online controles op de bèta: Access-poort, het API-scheidingsscript met tegenproef, H1–H19, de verwijderproef | beta-voorbereiding §2.3 | P5 + C (V7) |
| – | De nacontrole geeft met publishable keys een **schijnafwijking** op de schemacontrole (`/rest/v1/` antwoordt 401); `private` is wel aantoonbaar niet bereikbaar | staging-overstap stap 6g; `schemaFouten` in `verbinding-controle.mjs` | **Nog geen pakket.** Nodig voor een betrouwbare nacontrole op de bèta (beta-voorbereiding §2.1) |

## 3. Te accepteren voor de besloten bèta; externe review vóór de lancering

Dit zijn de 7 punten die een onafhankelijke review moet beoordelen (review-staging, laatste deel), met wat er nu al staat.

| # | Risico in gewone taal | Kans | Schade | Wat er al staat | Wanneer |
| --- | --- | --- | --- | --- | --- |
| 1 | **K1 is eigen inlogcode** (codes, grenzen, versleuteling, toestellen, de hook) en niemand van buiten heeft ernaar gekeken. Een denkfout kan inloggen op andermans account mogelijk maken | Laag: de bekende zwakke plekken (R1–R3, L3) zijn gerepareerd en getest | Hoog: toegang tot de gegevens van een gezin | Integratietests en tegenproeven (AC-reeks, R2-test met 35 pogingen); codes van 6 cijfers uit een goede bron; HMAC met pepper alleen in de functie; AES-256-GCM; vergelijking in constante tijd; logboeken zonder adres of code; fail-closed bij een ontbrekende instelling (review-staging, "Nagelopen") | Extern vóór de lancering |
| 2 | **De toegangspoort** vertrouwt op wat Supabase in het token zet (`amr`, `session_id`) en op `auth.sessions`. Verandert Supabase dat gedrag, dan kan de poort anders uitpakken | Laag | Hoog | `otp` verplicht, alleen `otp`/`totp` toegestaan; de sessie moet nog bestaan; fail-closed zonder instellingenrij (R1); gehoste test H1 op staging. Bij elke nieuwe Supabase-versie hoort een controle (K1-ontwerp §13) | Extern vóór de lancering; H1 opnieuw op de bèta (V7) |
| 3 | **RLS en privé-afspraken**: een fout in de regels kan een gezin iets van een ander laten zien, of een partner een privé-afspraak | Laag | Hoog | RLS-matrix met tegenproeven in CI; `event_details_visible`; samengestelde sleutels per huishouden; realtime-seintjes zonder inhoud; vóór de start het API-scheidingsscript met twee testhuishoudens (V7) | Extern vóór de lancering |
| 4 | **Misbruik en beschikbaarheid**: wie een adres kent, kan via de openbare API codes aanvragen en zo het inloggen een dag hinderen of het mailtegoed (300 per maand, gedeeld met staging) aanspreken. De IP-limiet van Supabase op de gehoste omgeving is volgens het K1-ontwerp nog een aanname | Middel: de API en de anon-sleutel zijn openbaar (de repository is openbaar) | Middel: niemand komt in een account, maar een gezin kan tijdelijk niet inloggen op een nieuw toestel, of mails komen niet aan | Hoogstens 8 codes per adres per dag (R3); Turnstile op aanvragen; een bestaande sessie blijft werken; noodstoppen `codes_aan`, `registratie_open`, `onderhoud`; melding in Lettermint bij 200 mails (beta-voorbereiding §2.4, §7); dagoverzicht (V6) | Accepteren voor de bèta; per IP en over omgevingen heen beoordelen vóór de lancering |
| 5 | **De uitnodigingsflow** (adresbinding, tokens, wachtrij, webhooks, idempotentie): een fout kan een uitnodiging bij de verkeerde persoon laten werken of mails dubbel versturen | Laag | Middel tot hoog | Tokens van 32 bytes, alleen als hash bewaard, eenmalig, gebonden aan het adres; geen token in de mail; wachtrij alleen met de service-rol; webhookhandtekening in constante tijd. **Open:** een echte Lettermint-testwebhook is in de stagingdocumentatie niet als geaccepteerd vastgelegd (staging-overstap 6e; review-staging "Online te controleren" 8) | L4 vóór de start (P2); webhook bevestigen op de bèta; extern vóór de lancering |
| 6 | **Privacy van echte gebruikers**: bewaartermijnen, verwijderen, export en logboeken | Middel: er gaan voor het eerst gegevens van anderen in | Middel | Bewaartermijnen in de code (beta-voorbereiding §5.2); verwijderscript (V6), privacyverklaring en DPA (V8), back-ups (V9) blokkeren de start. **Open:** de onversleutelde export van 21 oktober op de laptop (R5): afschermen en BitLocker staan niet als afgerond vastgelegd | Vóór de start via V6, V8, V9; R5 door de producteigenaar; extern vóór de lancering |
| 7 | **Afhankelijkheden en de bouwstraat**: bekende kwetsbaarheden in ontwikkelpakketten (L9: vite 7.1.12 en vitest, alleen tijdens ontwikkelen en testen) en Actions die niet op een vaste versie staan (`@v4`) | Laag: de bèta draait de gebouwde app, niet de ontwikkelserver; de workflows hebben geen geheimen en geen deploy | Laag tot middel | `contents: read`, `pull_request` (geen `_target`); geen geheim in de bundel (gecontroleerd vóór en na de build) | Bijwerken in een aparte, kleine stap; beleid extern vóór de lancering |

## 4. Bekend en geaccepteerd, of later

| # | Wat | Kans / schade | Wat er staat | Wanneer |
| --- | --- | --- | --- | --- |
| Info | De noodstop (`onderhoud = dicht`) stopt de mailwachtrij niet; in de wachtrijmigraties komt `onderhoud` niet voor | Laag / laag | Met de hand `MAIL_ADAPTER` leegmaken (noodstoppen, beta-voorbereiding §7) | Vastleggen in het draaiboek; later in de code |
| Info | Een Realtime-verbinding die al open is, krijgt tijdens `onderhoud` nog seintjes zonder inhoud tot het token ververst | Laag / laag | De seintjes bevatten alleen `{t, id, v, op}` | Accepteren |
| L7 | De sessie blijft in `localStorage` (ingelogd blijven op de telefoon) | Laag / middel bij een gestolen, ontgrendelde telefoon | "Uitloggen op alle toestellen" werkt direct | Accepteren; herzien bij passkeys |
| – | Wie de mailbox overneemt, neemt het account over | Laag / hoog | Geldt voor elk inloggen met e-mail; passkeys komen vóór de commerciële start | Accepteren voor de bèta |
| Info | AES-GCM zonder AAD in K1 | Laag / laag | Alleen relevant voor iemand die al in de database kan schrijven | Externe review |
| Info | Kleuren worden niet aan de serverkant op hexwaarde gecontroleerd | Zeer laag / laag | De CSP en de manier van tonen maken er geen risico van | Later |

## Wat je accepteert (voorstel voor de tekst)

> Ik accepteer voor de besloten bèta van Thuisplanner, met hoogstens vijf gezinnen op uitnodiging, de resterende
> risico's uit hoofdstuk 3 en 4 van dit document, zonder onafhankelijke beveiligingsreview vooraf. Deze acceptatie
> geldt alleen zolang:
> - de punten uit hoofdstuk 2 vóór het eerste gezin zijn opgelost en de Access-poort (V7) online groen is;
> - `huishouden_open` uit staat en alleen de testerslijst en uitnodigingen toegang geven;
> - de noodstoppen werken en het dagoverzicht dagelijks wordt bekeken;
> - de onafhankelijke review plaatsvindt **vóór de publieke lancering** (mijlpaal 3) en vóór er meer gezinnen bijkomen
>   dan deze vijf.
>
> Naam en datum: ______________________

Deze tekst is een voorstel; de producteigenaar beslist of en hoe hij die vastlegt.
