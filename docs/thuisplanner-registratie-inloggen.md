# Thuisplanner KG-5H deel 2: zelf aanmelden en inloggen met een e-mailcode (plan)

**Status:** 📝 plan ter beoordeling (17 oktober 2026). Er is niets gebouwd, gemigreerd of gedeployed. Voorlopig akkoord
op D1–D8 en M1–M3 met voorwaarden (§11). De uitwerking daarvan staat in §12–§17; de open besluiten in §18.
Voortbouwend op deel 1 (`docs/thuisplanner-onboarding.md`) en deel 1b (`docs/thuisplanner-uitnodiging-email.md`,
lokaal gebouwd in commit `f9c8fa6`).

**Acceptatievoorwaarde (producteigenaar):** een nieuwe gebruiker meldt zich zonder hulp aan en doet binnen ongeveer
twee minuten mee in een huishouden, mits de e-mailcode op tijd binnenkomt.

## 1. Uitgangspunten en hoe het plan ze haalt

| # | Uitgangspunt | Hoe |
| --- | --- | --- |
| 1 | Zelf registreren met e-mailadres en eenmalige code | Eén scherm "Vul je e-mailadres in" voor nieuw én bestaand; Supabase `signInWithOtp` maakt zo nodig het account aan; code van 6 cijfers |
| 2 | Blijven ingelogd | Supabase-sessies duren standaard onbeperkt (refresh-token zonder einddatum); sessie in `localStorage` (staat al zo op staging). Zie §6.4 voor de beperking van Safari |
| 3 | Partner uitnodigen met weinig handelingen | Uitnodigen op e-mailadres (deel 1b) plus Delen; later desgewenst automatisch een mail (deel 2b) |
| 4 | Uitnodiging verschijnt na inloggen, zonder plakken | Deel 1b (`my_invites`); een geslaagde code is een bevestigd adres |
| 5 | Geen extra Cloudflare-inlog | Cloudflare Access gaat van de app af; een besloten-testpoort in de database neemt de rol over (§4) |
| 6 | Inloggen op een nieuwe telefoon | Adres → code → klaar; alles staat op de server |
| 7 | E-mailadres veilig wijzigen zonder verlies | Supabase "Secure email change": codes naar het oude **en** het nieuwe adres; het account (id) blijft hetzelfde, dus huishoudens en gegevens blijven |
| 8 | Werkt op telefoons, ook vanuit WhatsApp of een mailapp | Een **code** in plaats van een inloglink: je typt hem in hetzelfde venster, dus het werkt ook in de browser van WhatsApp en in de app op het beginscherm. De uitnodiging hangt niet meer van de link af (deel 1b) |

## 2. Gebruikersstappen en het aantal handelingen

Eén handeling = één tik, één ingevuld veld, of wisselen naar een andere app. Gemeten op het pad zonder fouten.

### A. Joris is uitgenodigd door Sanne (nieuw bij Thuisplanner)

Sanne (al ingelogd): Meer → Uitnodigen → e-mailadres van Joris → "Uitnodiging maken" → "Delen" → WhatsApp → Joris
kiezen → versturen. Dat zijn **8 handelingen**. Met deel 2b (automatische mail) zijn het er **4**, zonder WhatsApp.

| Stap | Joris doet | Handelingen |
| --- | --- | --- |
| 1 | Tikt op de link in WhatsApp; Thuisplanner opent (ook in de browser van WhatsApp) | 1 |
| 2 | Ziet "Je bent uitgenodigd. Vul je e-mailadres in"; typt zijn adres | 1 |
| 3 | Tikt "Stuur code" (de beveiligingscontrole van Turnstile is meestal onzichtbaar) | 1 |
| 4 | Wisselt naar de mailapp, leest de code, en wisselt terug | 2 |
| 5 | Typt de code (6 cijfers); bij het zesde cijfer gaat het vanzelf verder. Op iPhone kan de code vaak automatisch worden ingevuld vanuit Mail | 1 |
| 6 | Ziet meteen de uitnodiging ("Sanne nodigt je uit voor Familie Test, als beheerder"); vult zijn naam in | 1 |
| 7 | Tikt "Accepteren" | 1 |
| 8 | Tikt "Naar Vandaag" | 1 |

**Totaal: 9 handelingen.** Geschat ongeveer 45 tot 75 seconden plus de bezorgtijd van de mail. Dat past binnen
2 minuten als de code binnen ongeveer 30 seconden binnen is.

Mogelijke verkorting (besluit D5): de naam die Sanne voor hem invulde wordt voorgesteld, of de naam wordt één keer bij
het aanmelden gevraagd en daarna overal hergebruikt. Dan zijn het er 8.

### B. Iemand begint zelf (geen uitnodiging)

Opent de app (1), adres (1), "Stuur code" (1), naar de mail en terug (2), code (1), naam van het huishouden (1),
eigen naam (1), "Huishouden aanmaken" (1). **Totaal: 9 handelingen**, ongeveer 60 seconden plus de bezorging. Daarna de
partner uitnodigen zoals hierboven (8, of 4 met deel 2b).

### C. Bestaande gebruiker op een nieuwe telefoon

Opent de app (1), adres (1), "Stuur code" (1), naar de mail en terug (2), code (1). **Totaal: 6 handelingen.** Het
huishouden staat er direct; de gekozen huishouden staat per account onthouden.

### D. Bestaande gebruiker, zelfde telefoon

**0 handelingen**: ingelogd gebleven (zie de Safari-beperking in §6.4).

### E. E-mailadres wijzigen

Meer → Account → "E-mailadres wijzigen" (2), nieuw adres (1), "Stuur codes" (1). Dan de code van het nieuwe adres en
de code van het oude adres (elk 1 plus wisselen, samen ongeveer 4), en "Bevestigen" (1). **Ongeveer 9 handelingen**,
alleen als het nodig is. Daarna gelden uitnodigingen voor het nieuwe adres. Huishoudens blijven, want het account
blijft hetzelfde.

## 3. Technische keuzes

| Onderwerp | Keuze | Waarom / alternatief |
| --- | --- | --- |
| Inlogmethode | Alleen een e-mailcode (OTP), geen wachtwoord, geen inloglink | Een inloglink opent vaak in een andere browser dan de app op het beginscherm of de browser van WhatsApp, en dan kom je niet in dezelfde sessie. Een code werkt overal waar je kunt typen |
| Aanmelden en inloggen | Eén scherm; `signInWithOtp({ email, options: { shouldCreateUser: true, captchaToken } })`, dan `verifyOtp({ email, token, type: 'email' })` | Geen verschil zichtbaar tussen een nieuw en een bestaand adres, zodat niemand kan nagaan wie gebruiker is |
| Mailteksten | Eigen Nederlandse sjablonen in de repository (`thuisplanner/supabase/templates/`): "Confirm signup" en "Magic link" bevatten allebei **alleen de code** (`{{ .Token }}`), plus "Change email" en "Reauthentication" | Voor een nieuw account stuurt Supabase het aanmeldsjabloon, voor een bestaand het "Magic link"-sjabloon. **Lokaal te verifiëren** met Mailpit |
| Code | 6 cijfers, 10 minuten geldig, een nieuwe code na 60 seconden | Besluit D4. Supabase: standaard 1 uur; korter is veiliger en past bij de 2-minutenervaring |
| Sessie | `localStorage`, `persistSession`, `autoRefreshToken`; nooit een sessie uit de URL (`detectSessionInUrl: false`, staat al) | De standaard van Supabase: geen einddatum. Begrenzen (time-box, inactiviteit) kan alleen op Pro en is niet nodig |
| Uitloggen | "Uitloggen" (dit toestel) en "Uitloggen op alle toestellen" (`signOut({ scope: 'global' })`) | Bij een verloren telefoon |
| E-mailadres wijzigen | `updateUser({ email })` met **Secure email change** aan: codes naar beide adressen, `verifyOtp` met `type: 'email_change'` | Het account blijft hetzelfde. Uitnodigingen volgen het bevestigde adres (deel 1b) |
| Beveiligingscontrole | Cloudflare Turnstile (gratis), via de captcha van Supabase Auth | **Te verifiëren** dat Supabase de captcha ook op `signInWithOtp` afdwingt. Lokaal met de testsleutels van Turnstile |
| Besloten test | Een poort in de database (§4) in plaats van Cloudflare Access | Herbruikbaar als wachtlijst of "vroege toegang"; één schakelaar voor de commerciële start |
| Mail versturen | Eigen SMTP bij een aanbieder in de EU, vanaf een eigen domein met SPF, DKIM en DMARC | De ingebouwde mail van Supabase stuurt hoogstens 2 berichten per uur en alleen naar teamleden |
| Lokaal testen | De lokale stack vangt mail op in Mailpit; de e2e leest de code uit Mailpit | Het echte pad wordt getest, zonder wachtwoord-achterdeur in de staging- of productiebuild. De fictieve wachtwoordknoppen blijven alleen in de modus `lokaal` |
| Op het beginscherm | Een manifest (PWA) en een korte hulp "Zet Thuisplanner op je beginscherm" | Zie §6.4 |

## 4. Toegang zonder Cloudflare Access: de besloten-testpoort

**Probleem:** zonder Access kan iedereen met de URL een account maken. Dat is precies wat we willen voor vrienden en
kennissen, maar nog niet voor de hele wereld.

**Voorstel (besluit D3, advies G1):** iedereen kan een account maken en een uitnodiging accepteren. Een **eigen
huishouden aanmaken** mag alleen als:
- de registratie open staat (een schakelaar in de database, nu uit), of
- het bevestigde e-mailadres op de testerslijst staat (een tabel in `private`, die alleen de beheerder van Thuisplanner
  vult).

Wie niet op de lijst staat en geen uitnodiging heeft, ziet een vriendelijk scherm: "Thuisplanner is nog in een
besloten test. Heb je een uitnodiging gekregen? Log in met het adres waarop je bent uitgenodigd." Een eigen code
(bijvoorbeeld `TPB01`) volgt dezelfde lijn als de TPU-codes.

| Optie | Voor | Tegen |
| --- | --- | --- |
| **G1 Poort bij "huishouden aanmaken"** (advies) | Uitgenodigde gezinsleden kunnen altijd mee. Afgedwongen in de bestaande functie `create_household` (RLS-stijl, getest in de matrix). Commercieel: schakelaar om | Iedereen kan een account aanmaken en codes laten sturen; dat wordt beperkt door Turnstile en de limieten |
| G2 Poort bij het aanmaken van het account (Supabase-hook "Before User Created") | Er ontstaat geen account voor onbekende adressen | Een nieuw gezinslid met een link zonder adres kan dan niet aanmelden. Beschikbaarheid op het gratis abonnement nog te verifiëren |
| G3 Helemaal open | Het eenvoudigst | Te vroeg; vreemden kunnen staging vullen |

Cloudflare Access gaat pas van de app af **nadat** de poort op staging bewezen werkt (volgorde in §8). Die wijziging doe
jij in Cloudflare.

## 5. Beveiliging en privacy

| Risico | Maatregel |
| --- | --- |
| Iemand raadt codes | 6 cijfers, 10 minuten geldig, hoogstens 30 verificaties per 5 minuten per IP (standaard van Supabase; te controleren en zo nodig strenger) |
| Mailbombardement of misbruik van de aanmelding | Turnstile; een nieuwe code na 60 seconden; een uurlimiet op mail (in te stellen met eigen SMTP); de testpoort |
| Nagaan wie een account heeft | Eén scherm en één antwoord voor elk adres ("We hebben een code gestuurd als dit adres klopt"). Uitnodigingen noemen nooit of een adres bestaat (deel 1b) |
| Een overgenomen mailbox | Valt buiten de app. "Uitloggen op alle toestellen" en een melding bij een adreswijziging (het sjabloon "Email address changed") beperken de schade |
| Account overnemen via een adreswijziging | Secure email change: beide adressen bevestigen. Uitnodigingen gelden pas voor een bevestigd nieuw adres |
| Onbevestigd adres | **Confirm email** blijft aan. Bij een code is de bevestiging de code zelf. In de checklist en de smoketest |
| Sessie in de URL | Nooit overnemen (staat al, met een test) |
| Mail vervalst of in de spam | Eigen domein met SPF, DKIM en DMARC (`p=quarantine`, later `reject`) |
| Persoonsgegevens bij de mailaanbieder | Een aanbieder in de EU, met verwerkersovereenkomst; de bewaartermijn van de logboeken zo kort mogelijk |
| Privacyverklaring | Vóór externe testers: welke gegevens (e-mailadres, naam, inhoud van het huishouden), waarom, hoe lang, de mailaanbieder als verwerker, en verwijderen (account verwijderen bestaat al in de database) |
| Oude app, nieuwe database | De versiepoort (KG-5E) vóór productie; op staging de database eerst bijwerken, dan de app |
| Google en Apple | **Niet in deel 2.** Niet bewezen (voorwaarde 2 van 17 oktober), en voor Apple is een Developer-account nodig. Later apart, met een eigen controle op accountkoppeling |

## 6. Kosten en diensten

| Dienst | Waarvoor | Kosten (nog te verifiëren vóór akkoord) |
| --- | --- | --- |
| Eigen domein | Afzender van de mail (SPF/DKIM/DMARC), later de app-URL | Ongeveer €10 tot €15 per jaar (`.nl`) |
| SMTP in de EU | Codes en later uitnodigingsmails | Gratis instap is genoeg voor de test. Scaleway Transactional Email (Frankrijk): 300 mails gratis, daarna €0,25 per 1.000 (volgens de prijspagina van vandaag). Alternatief: Brevo (Frankrijk), met een gratis dagtegoed; prijs niet kunnen controleren |
| Cloudflare Turnstile | De beveiligingscontrole | Gratis |
| Supabase | Database en Auth | Free volstaat voor de test; eigen SMTP en captcha werken daarop. Pro (ongeveer $25 per maand) pas voor de commerciële start (back-ups, geen pauzestand) |
| Cloudflare Pages | De app | Gratis |
| Apple Developer | Alleen voor "Inloggen met Apple" of een app in de App Store | Ongeveer $99 per jaar; **niet nu** |

**Nieuwe kosten in deel 2: alleen het domein.** De rest blijft op een gratis abonnement, conform "voorlopig uitsluitend
gratis abonnementen". Het domein vraagt jouw akkoord.

### 6.4 Een bekende beperking: Safari en "blijven ingelogd"

Safari wist op iPhone de opslag van een website die je 7 dagen niet hebt geopend. Voor een app op het beginscherm geldt
dat niet. Wie Thuisplanner alleen in een Safari-tabblad gebruikt en een week niet opent, moet dus opnieuw een code
aanvragen (6 handelingen). Daarom komen er een manifest en een korte, eenmalige hulp "Zet Thuisplanner op je
beginscherm". Op Android en in Chrome speelt dit niet. **Op een echte iPhone te controleren.**

## 7. Testmatrix

### 7.1 Automatisch (lokaal, met Mailpit; daarna dezelfde smoketest tegen staging zonder mail uit te lezen)

| # | Scenario | Verwacht |
| --- | --- | --- |
| T1 | Nieuw adres → code → welkomstscherm | Account gemaakt; e-mail bevestigd; geen huishouden; geen wachtwoord |
| T2 | Bestaand adres → code | Ingelogd in het eigen huishouden; dezelfde tekst als bij T1 voordat de code klopt |
| T3 | Uitgenodigd op adres, nieuw account | Na de code meteen de uitnodiging; accepteren; telt **≤ 9 handelingen** (de e2e telt tikken en invullen) |
| T4 | Link geopend, daarna inloggen in hetzelfde tabblad | De uitnodiging blijft (sessionStorage); geen plakken |
| T5 | Verkeerde code, verlopen code, vijf keer fout | Duidelijke melding; geen sessie; limiet zichtbaar als rustige melding |
| T6 | Nieuwe code binnen 60 seconden | Knop wacht met een aftelling; de server weigert ook |
| T7 | Herladen, de app sluiten en heropenen | Nog ingelogd; geen token in de adresbalk |
| T8 | Uitloggen op alle toestellen | Een tweede sessie is ook uit (refresh mislukt) |
| T9 | Adres wijzigen | Beide codes nodig; daarna hetzelfde account, huishoudens intact; uitnodigingen voor het nieuwe adres |
| T10 | Testpoort | Niet op de lijst: geen eigen huishouden (`TPB01`), wel een uitnodiging accepteren. Op de lijst of met de schakelaar open: wel. RLS-scenario's met tegenproeven |
| T11 | Captcha | Zonder geldig token geen code (Turnstile-testsleutel "faalt altijd") |
| T12 | Buildbewaking | De staging- en productiebuild hebben geen wachtwoordformulier en geen fictieve accounts |
| T13 | Nagaan wie bestaat | Identieke antwoorden en tijden (ruwweg) voor een bekend en een onbekend adres |

### 7.2 Handmatig op echte toestellen (jij, op staging; met een stopwatch)

| Toestel en context | A uitgenodigd | B zelf beginnen | C nieuwe telefoon | D na 1 en 8 dagen | E adres wijzigen |
| --- | --- | --- | --- | --- | --- |
| iPhone, Safari-tabblad | ✓ | ✓ | ✓ | ✓ (verwacht: na 8 dagen opnieuw een code) | ✓ |
| iPhone, app op het beginscherm | ✓ | | ✓ | ✓ (verwacht: ingelogd) | |
| iPhone, link geopend in WhatsApp | ✓ | | | | |
| iPhone, link geopend in Gmail of Outlook | ✓ | | | | |
| Android, Chrome | ✓ | ✓ | ✓ | ✓ | ✓ |
| Android, link geopend in WhatsApp | ✓ | | | | |
| Computer, Chrome of Edge | | ✓ | ✓ | | ✓ |

**Per cel noteren:**
- de tijd van de eerste tik tot "Naar Vandaag";
- de bezorgtijd van de mail;
- het aantal handelingen;
- of je ergens moest nadenken.

**Geslaagd:** A en B binnen 2 minuten zonder hulp, met een mail die binnen 30 seconden bezorgd is.

## 8. Bouwvolgorde

1. **Besluiten D1 tot en met D8** (§9).
2. **Lokaal bouwen** (alleen na akkoord):
   - het code-inlogscherm (aanmelden en inloggen), met Turnstile;
   - de mailsjablonen en `config.toml` [auth.email] (`enable_confirmations`, de geldigheid en lengte van de code,
     `double_confirm_changes`) voor lokaal;
   - "Uitloggen op alle toestellen" en het e-mailadres wijzigen in Meer → Account;
   - de testpoort (één migratie, met RLS-scenario's en tegenproeven);
   - het manifest en de hulp voor het beginscherm;
   - de e2e met Mailpit en het tellen van handelingen;
   - de buildbewaking (geen wachtwoordformulier buiten de modus `lokaal`).
3. **Jij:**
   - het domein registreren (kosten, akkoord);
   - een account bij de SMTP-aanbieder;
   - DNS (SPF, DKIM, DMARC);
   - een Turnstile-site.

   Ik lever een stappenlijst. Geen geheimen in de chat: de SMTP-sleutel vul je zelf in het Supabase-dashboard in.
4. **Staging bijwerken (elk apart akkoord):**
   - de database bijwerken (deel 1b en deel 2) met `verbinding.ps1 -Bijwerken`, en de nacontrole;
   - de Auth-instellingen volgens een checklist:
     - aanmelden aan;
     - Confirm email aan;
     - Secure email change aan;
     - de geldigheid en lengte van de code;
     - de limieten;
     - captcha;
     - eigen SMTP;
     - de sjablonen;
   - daarna de app pushen.
5. **Smoketest op staging** (nog achter Access), inclusief de testpoort.
6. **Jij haalt Cloudflare Access van de app af.** Daarna draai ik de controle opnieuw: de app is bereikbaar, `noindex`,
   de testomgevingsbalk staat er, en de poort werkt.
7. **Jouw handmatige test op toestellen** (§7.2), en de privacyverklaring.
8. **Externe testers.**
9. Daarna, apart: deel 2b (automatische uitnodigingsmail via een Edge Function, met een daglimiet), KG-5E, en later
   Google en Apple.

## 9. Besluiten voor de producteigenaar

| # | Vraag | Advies |
| --- | --- | --- |
| D1 | Een eigen domein voor de mail (en later de app)? Welke naam? | **Ja**, nodig voor betrouwbare bezorging. De naam is jouw keuze (de werknamen zijn Thuisplanner en Thuisplanner) |
| D2 | Welke SMTP-aanbieder? | **Een EU-aanbieder met een gratis instap**, bijvoorbeeld Scaleway Transactional Email of Brevo. Ik vergelijk de actuele voorwaarden zodra je kiest |
| D3 | Toegang zonder Access: welke poort? | **G1**: poort bij "huishouden aanmaken", met een testerslijst en een schakelaar voor later |
| D4 | De code | **6 cijfers, 10 minuten geldig**, een nieuwe na 60 seconden |
| D5 | De naam één keer vragen bij het aanmelden, en hergebruiken? | **Ja** (één handeling minder; minder dubbel typen) |
| D6 | Automatisch een uitnodigingsmail versturen? | **Direct na deel 2, als deel 2b.** Delen via WhatsApp werkt al en is voor veel mensen natuurlijker |
| D7 | Het manifest en de hulp voor het beginscherm in deel 2? | **Ja**, vanwege de 7-dagenregel van Safari |
| D8 | Het wachtwoord helemaal weg (ook geen keuze)? | **Ja**; alleen de fictieve testaccounts van de modus `lokaal` behouden een wachtwoord, en de buildbewaking houdt dat buiten staging en productie |

## 10. Productkompas-toets

- **Principe 1**, het werk wegnemen:
  - geen wachtwoord;
  - geen link plakken;
  - geen dubbele inlog.
- **Principe 3**, één keer invullen: de naam en het adres één keer.
- **Principes 5 en 6**, rust:
  - één melding;
  - accepteren blijft een keuze;
  - geen meldingen over de beveiliging, tenzij nodig.
- **Privacy volgt de situatie:**
  - niemand kan nagaan wie gebruiker is;
  - een EU-verwerker;
  - een korte bewaartermijn.
- **Gates:**
  - beslissing 6 (lidmaatschap alleen door expliciet accepteren) blijft;
  - de versiepoort (KG-5E) vóór productie;
  - geen tijdelijke testoplossing: de testpoort is dezelfde schakelaar die bij de commerciële start opengaat.

## 11. Voorlopig akkoord van de producteigenaar (17 oktober 2026)

| # | Oordeel | Voorwaarde |
| --- | --- | --- |
| D1 | Akkoord | De definitieve domeinnaam kiezen we bewust (merk) |
| D2 | Akkoord: een Europese aanbieder | Na een vergelijking van de actuele kosten, de bezorgsnelheid, de limieten en de privacyvoorwaarden (§12) |
| D3 | Akkoord met het doel: geen dubbele Cloudflare-inlog voor testers | Eerst de beveiliging en de scheiding tussen interne staging en externe bètatests uitwerken, en beoordelen of een aparte bètaomgeving nodig is (§13) |
| D4 | Akkoord: 6 cijfers, 10 minuten | Mits er goede limieten zijn op codepogingen en verzending (§14) |
| D5 | Akkoord | |
| D6 | Akkoord: een uitnodigingsmail in deel 2 | Betrouwbare foutafhandeling, en geen dubbele uitnodigingen bij opnieuw versturen (§15) |
| D7 | Akkoord | Het beginscherm blijft optioneel en onderbreekt het aanmelden nooit (§15.3) |
| D8 | Akkoord: wachtwoordloos | |
| M1 | Toevoegen | |
| M2 | Toevoegen | Inclusief duidelijk tonen met welk e-mailadres iemand is ingelogd |
| M3 | Dubbele bevestiging voorlopig behouden | Een veilige commerciële herstelprocedure uitwerken, zonder onbeveiligde handmatige omweg (§16) |
| — | Expliciete aandacht | Niet-aankomende of vertraagde codes (§17), duidelijke herstelmogelijkheden (§16, §17) en betrouwbare sessies op mobiele telefoons (§17a) |

**De acceptatievoorwaarde blijft leidend:** een nieuwe gebruiker begint zonder hulp en zonder vooraf aangemaakt account,
en doet eenvoudig mee in een huishouden. Elke maatregel hieronder is getoetst op: kost dit de nieuwe gebruiker een extra
handeling? Alleen §16 (herstel) en §15.3 (beginscherm) voegen handelingen toe, en alleen als iemand ze zelf kiest.

## 12. D2: de mailaanbieder vergelijken

**Kandidaten** (EU-bedrijf, EU-infrastructuur, SMTP; prijzen van 17 oktober 2026, vóór de keuze opnieuw te controleren):

| Aanbieder | Land | Gratis | Daarna | Bijzonderheden |
| --- | --- | --- | --- | --- |
| Lettermint | Nederland | 300 per maand | vanaf €10 per maand voor 10.000 | Eigen EU-infrastructuur zonder Amerikaanse cloud (volgens de aanbieder); SMTP op elk abonnement; jong bedrijf, weinig onafhankelijke ervaringen |
| Scaleway Transactional Email | Frankrijk (groep Iliad) | 300 (de pagina zegt niet of dat per maand is) | €0,25 per 1.000 | Alleen in de regio Parijs; standaard hoogstens 10.000 per maand (te verhogen); geen uurlimiet |
| Brevo | Frankrijk | Volgens reviews 300 per dag; de eigen prijspagina was niet leesbaar | Volgens reviews vanaf ongeveer $9 per maand | Groot en bekend; de gratis mail draagt het Brevo-logo; vooral een marketingplatform |
| MailerSend | Litouwen | 500 per maand | vanaf ongeveer $7 per maand | Wordt als EU-gehost genoemd; de prijspagina zegt dat niet zelf, dus te verifiëren |

**Wat prijslijsten niet tonen, en hoe we het meten (besluit B6):**
- Bezorgsnelheid:
  - per kandidaat (hoogstens 3) een gratis account met een testsubdomein;
  - elke kandidaat stuurt 20 codes naar adressen bij Gmail, Outlook/Hotmail, iCloud, KPN en Ziggo;
  - we meten de tijd tot aankomst en of de mail in de inbox of de spam belandt;
  - **eis:** 95% binnen 30 seconden, en niets in de spam.
- Privacy: de verwerkersovereenkomst, de subverwerkers (geen Amerikaanse cloud als hoofdinfrastructuur), en de
  bewaartermijn van de logboeken (zo kort mogelijk).
- Limieten per uur, dag en maand, en wat er gebeurt bij overschrijding.
- Een webhook voor niet-bezorgde mail (bounces), nodig voor §15.2.

De accounts maak jij aan. Ik lever het meetscript en de meetlijst; sleutels komen niet in de chat.

## 13. D3: interne staging en een aparte bètaomgeving

**Advies (B1): ja, een aparte bètaomgeving.** Drie omgevingen met elk een eigen doel:

| | Lokaal | Staging (intern) | Bèta (extern) |
| --- | --- | --- | --- |
| Voor wie | Ontwikkeling en tests | Jij | Vrienden en kennissen |
| Gegevens | Fictief | Fictief en proeven; mag gewist worden | **Echte gezinsgegevens**: behandelen als productie |
| Wat er draait | Alles in ontwikkeling | Elke nieuwe migratie en build eerst hier | Alleen wat op staging bewezen is, per release op jouw akkoord doorgezet |
| Toegang | Dit toestel | Cloudflare Access **blijft**, plus de wachtwoordloze app-inlog | **Geen Access**: Supabase Auth, RLS en de testpoort |
| Supabase | Lokale stack | Het bestaande project | Een nieuw project (het tweede gratis project in de organisatie Thuisplanner) |
| Cloudflare Pages | | `thuisplanner-staging` | Een nieuw project, met een eigen branch en eigen variabelen |

**Waarom apart, en niet staging openzetten:**
- Op staging komen onafgemaakte migraties en proefscripts; die horen niet bij echte gezinnen.
- Staging moet vrij gewist en herbouwd kunnen worden; de bèta niet.
- Een fout in een nieuwe versie raakt eerst alleen staging.
- De bèta is in opzet al de latere productieomgeving: dezelfde instellingen en controles. Bij de commerciële start kan
  dat project productie worden (dan op Pro), zonder dat testers iets opnieuw moeten doen.

**Beveiliging van de bèta zonder Access.** De echte grens was altijd al Auth en RLS; de anon-sleutel is openbaar
bedoeld. Daarbij komen:
- de testpoort (G1) met een testerslijst;
- Turnstile en de limieten (§14);
- een noodschakelaar: aanmelden en code-inlog uit, zonder de app te verbergen;
- de bestaande strikte CSP, headers en `noindex`;
- een eigen buildmodus `beta` met een vastgepind projectkenmerk (een stagingbuild kan nooit met de bèta praten, en
  andersom);
- een dagelijks, alleen-lezend overzicht: nieuwe accounts, verstuurde codes en mislukte pogingen;
- de versiepoort (KG-5E) vóór de eerste externe tester;
- doorzetten per release met een apart akkoord: eerst de database (`-Bijwerken`, met de nacontrole), dan de app.

**Beperking: back-ups (besluit B2).** Supabase Free maakt geen downloadbare back-ups; Pro (ongeveer $25 per maand) doet
dat dagelijks. Voor echte gezinsgegevens is een back-up nodig:
- **B2a:** Pro voor de bèta. Dat kost geld en vraagt jouw akkoord.
- **B2b:** een wekelijkse, versleutelde export die jij start, via dezelfde veilige verbinding als nu.

## 14. D4: limieten op codes

| Wat | Limiet | Waar |
| --- | --- | --- |
| Nieuwe code voor hetzelfde adres | Na 60 seconden | Supabase (standaard); de app toont een aftelling |
| Mail per uur, voor het hele project | Bèta ongeveer 100 per uur, staging lager | Supabase, instelbaar met eigen SMTP. Bijstellen aan de hand van het dagoverzicht |
| Codes aanvragen | Alleen met een geldig Turnstile-token | Supabase-captcha; **lokaal te verifiëren** dat dit ook voor `signInWithOtp` geldt |
| Code proberen | Standaard 30 per 5 minuten per IP | Supabase, instelbaar |
| Pogingen per code | **Onbekend** | Lokaal te verifiëren of een code na foute pogingen vervalt |
| Per adres per dag | Bijvoorbeeld hoogstens 10 codes | Alleen met de Send Email-hook van Supabase; te verifiëren of die op Free beschikbaar is |

**Eerlijke kanttekening:** de pogingenlimiet geldt per IP en niet per account. Een aanvaller met veel IP-adressen kan in
10 minuten meer gokken. Met 6 cijfers is de kans per code klein, maar niet nul.

**Voorwaarde voor 6 cijfers:** lokaal aantonen dat een code na een aantal foute pogingen vervalt, óf dat de Send
Email-hook een daglimiet per adres mogelijk maakt. Lukt geen van beide, dan adviseer ik 8 cijfers, met hetzelfde scherm
en automatisch invullen (T5, T14).

## 15. D6, D7, M1 en M2 uitgewerkt

### 15.1 De uitnodigingsmail bevat geen token (advies B4)

Een uitnodiging op adres heeft de link niet nodig: wie inlogt met dat adres, ziet hem (deel 1b). De mail bevat daarom
alleen:
- de naam van de uitnodiger;
- het huishouden;
- de geldigheid;
- een knop naar de app (zonder geheim);
- de zin "Log in met dit adres".

Gevolgen:
- Een doorgestuurde of door een virusscanner geopende mail geeft niemand toegang.
- De server hoeft het token nooit te bewaren of te versturen.
- Een dubbele mail opent geen dubbele toegang.

### 15.2 Betrouwbaar versturen, en nooit dubbel

- **Wachtrij in de database:** `create_invite` met een adres zet, in dezelfde transactie, een rij in een wachtrij
  (uitnodiging, status, pogingen). Er gaat geen mail uit voor een uitnodiging die niet bestaat, en er raakt er geen
  kwijt.
- **Versturen:** een Edge Function pakt de rij op (direct, en anders bij de volgende ronde van een geplande taak) en
  bewaart het bericht-id van de aanbieder.
- **Idempotent:** hoogstens één mail per uitnodiging. Een herhaalpoging na een time-out gebruikt dezelfde sleutel bij de
  aanbieder.
- **Opnieuw versturen:**
  - "Nog eens sturen" geeft hoogstens één mail per 10 minuten, en hoogstens 3 per uitnodiging (in de database
    afgedwongen, met een eigen code);
  - "opnieuw uitnodigen" op hetzelfde adres trekt de vorige uitnodiging in (deel 1b);
  - er bestaan dus nooit twee geldige uitnodigingen naast elkaar.
- **Status voor de uitnodiger:**
  - "verstuurd om 14:02";
  - "nog niet verstuurd, we proberen het opnieuw";
  - "niet bezorgd: controleer het adres" (via de bounce-webhook).

  Delen via WhatsApp blijft er altijd bij staan.
- **Daglimiet:** hoogstens 20 uitnodigingsmails per huishouden per dag. De tekst ligt vast; de uitnodiger kan er niets
  aan toevoegen, dus de mail is geen spamkanaal.
- **Geen gegevensverlies:** mislukt het versturen, dan blijft de uitnodiging geldig en ziet de genodigde hem na het
  inloggen gewoon.

### 15.3 Het beginscherm: optioneel en nooit tussendoor (D7)

- Nooit tijdens het aanmelden, de code of een uitnodiging, en nooit als venster dat je moet wegklikken.
- Hoogstens één rustige kaart op Vandaag, op zijn vroegst bij het derde bezoek. "Niet nu" zet hem voorgoed weg.
- Alleen in Safari op iPhone en iPad, waar het verschil maakt. Niet als de app al op het beginscherm staat.

### 15.4 M1: het scherm vergeet je niet

- Na "Stuur code" bewaart de app op dit toestel alleen het adres en het tijdstip (hoogstens 10 minuten; nooit de code,
  nooit in de URL).
- Opent iemand de app of de link opnieuw, dan staat het codescherm er meteen: "We hebben een code gestuurd naar
  j…@….nl", met "Ander adres gebruiken".
- Weg na het inloggen, het uitloggen of na 10 minuten.

### 15.5 M2: altijd zien met welk adres je bent ingelogd

- Het adres staat op het codescherm, het welkomstscherm, het uitnodigingsscherm en in Meer → Account.
- Zonder uitnodiging op het welkomstscherm: "Je bent ingelogd als **joris@werk.nl**. Ben je uitgenodigd op een ander
  adres? Log dan uit en log in met dat adres." Daarbij één knop "Uitloggen en ander adres gebruiken", en de link als
  tweede weg.
- Nooit een melding of een ander adres een account of een uitnodiging heeft.

## 16. M3 en herstel: geen toegang meer tot het oude e-mailadres

**Uitgangspunten:**
- Geen wijziging op basis van een verhaal of een telefoontje.
- Herstel vraagt altijd een bewijs van bezit: een ingelogd toestel, het nieuwe adres, of een huishoudgenoot met
  beheerrechten.
- Er is altijd een wachttijd met meldingen, zodat de echte eigenaar kan ingrijpen.
- Beslissing 6 blijft: lidmaatschap alleen door expliciet accepteren.

**Drie niveaus (besluit B5):**

| Niveau | Situatie | Procedure | Waarom veilig |
| --- | --- | --- | --- |
| R1 | Nog ergens ingelogd, maar het oude adres is weg (bijvoorbeeld een werkadres) | In de app: "Ik kan niet meer bij mijn oude adres" → nieuw adres → code naar het nieuwe adres → **wachttijd van 72 uur** | Tijdens de wachttijd: een mail naar het oude adres met "Annuleren", een melding in de app op al je toestellen, en een melding aan de andere beheerders van je huishoudens. Daarna wijzigt het adres en worden de andere sessies uitgelogd. Wie alleen je mailbox heeft gestolen, kan dit niet starten |
| R2 | Nergens ingelogd, wel een huishoudgenoot met beheerrechten | De beheerder kiest bij jouw profiel "Opnieuw koppelen aan een nieuw adres". Er gaat een uitnodiging voor **hetzelfde profiel** naar je nieuwe adres; jij accepteert met een code; dan volgt een **wachttijd van 72 uur** met een melding aan het oude adres | Er zijn twee mensen nodig. **Privé-afspraken van het oude account gaan niet mee**, omdat ze alleen via het oude account als van jou te bewijzen zijn. Gedeelde inhoud blijft van het huishouden |
| R3 | Niets: geen toestel, geen mailbox en geen huishoudgenoot | Niet herstelbaar; opnieuw beginnen | Elke andere route is een onbeveiligde omweg. Voorkomen kan met een **optionele passkey** (Face ID of vingerafdruk) als tweede manier van inloggen, na deel 2 |

**Techniek:**
- R1 en R2 kunnen niet via de gewone `updateUser`. Daarom een serverfunctie (Edge Function met de service-sleutel, alleen
  op de server) en een geplande uitvoering na 72 uur.
- Annuleren kan altijd.
- Een auditlog met alleen een hash en een tijdstip, geen adressen.

**Volgorde:**
- In de bèta:
  - het gewone wijzigen met dubbele bevestiging (§2E);
  - een uitlegscherm "Geen toegang meer tot je oude adres?";
  - de veilige variant van R2: "vraag een beheerder om je opnieuw uit te nodigen op je nieuwe adres" (een nieuw
    profiel via een gewone uitnodiging en een code, zonder de oude privé-afspraken).
- R1 en de volledige R2 vóór de commerciële start.

## 17. Niet-aankomende of vertraagde codes

**Voorkomen:**
- Een eigen domein met SPF, DKIM en DMARC (D1).
- Een aanbieder die de bezorgmeting haalt (§12).
- Eenvoudige mails, zonder afbeeldingen of trackers, met een herkenbare afzender.
- Een code in plaats van een link: virusscanners van bedrijven "klikken" op links en maken inloglinks daardoor
  ongeldig; een code heeft daar geen last van.
- **Advies (besluit B3): de code in de onderwerpregel** ("483 920 is je Thuisplanner-code"). Je ziet hem dan al in de
  melding en automatisch invullen werkt beter. Nadeel: zichtbaar op een vergrendeld scherm; beperkt, want 10 minuten
  geldig en alleen bruikbaar met het adres.

**In de app, als er niets komt (zonder ooit te zeggen of het adres bestaat):**
- Direct: "We hebben een code gestuurd naar j…@….nl. Kijk ook bij Ongewenst of Spam." Plus "Ander adres gebruiken".
- Na 60 seconden: "Nog niets? Stuur een nieuwe code". De nieuwste code geldt; een eerdere vervalt.
- Na de tweede nieuwe code een hulptekst:
  - controleer het adres (letter voor letter getoond);
  - sommige providers houden mail een paar minuten vast; de code blijft 10 minuten geldig;
  - probeer het later nog eens.
- Vertraagd: een code die na 4 minuten aankomt, werkt nog (10 minuten geldig). Met M1 staat het codescherm er nog, ook
  na het wisselen van app.
- Bij een uitval van de aanbieder: "Het versturen lukt nu niet. Probeer het over een paar minuten opnieuw." Plus de
  noodschakelaar.

**Voor uitnodigingen:**
- De genodigde kan altijd inloggen met het uitgenodigde adres, ook als de uitnodigingsmail nooit komt.
- De uitnodiger ziet de status (§15.2) en kan de link via WhatsApp delen.

**Meten en bewaken:**
- Vóór de eerste tester de bezorgmeting (§12); daarna wekelijks een korte herhaling.
- In het dagoverzicht (§13) verstuurde codes tegenover geslaagde inlogs. Een plotselinge daling betekent dat er mail
  blijft hangen.
- Een tweede aanbieder als reserve is voor de commerciële versie het overwegen waard; voor de bèta nog niet.

## 17a. Betrouwbare sessies op mobiele telefoons

**Hoe het werkt:**
- De sessie van Supabase heeft geen einddatum.
- Het toegangstoken (1 uur) wordt vernieuwd met een refresh-token dat één keer bruikbaar is. Supabase vangt
  gelijktijdig vernieuwen binnen een korte marge op, en supabase-js stemt tabbladen af.
- De sessie staat in `localStorage` van dat toestel.

**Waar het op telefoons mis kan gaan, en wat we doen:**

| Situatie | Risico | Maatregel |
| --- | --- | --- |
| Telefoon offline bij het openen (trein, kelder) | Vernieuwen mislukt; een slordige app logt dan uit | **Nooit uitloggen door een netwerkfout.** Alleen uitloggen als de server de sessie echt weigert. Offline blijft de app ingelogd en toont "geen verbinding" (de sync doet dat al) |
| App dagen dicht; het toegangstoken is verlopen | Bij het openen even "niet ingelogd" | Bij het openen en bij terugkeer (`visibilitychange`) eerst vernieuwen, dan pas laden; zolang dat loopt "Even geduld", nooit het inlogscherm |
| Twee tabbladen of app en tabblad tegelijk | Twee keer vernieuwen met hetzelfde token | Afstemming in supabase-js en de herhaalmarge van Supabase; getest (T22) |
| iPhone Safari, 7 dagen niet geopend | Safari wist de opslag; opnieuw een code nodig | Beginschermkaart (§15.3). M1 maakt opnieuw inloggen kort (6 handelingen) |
| iPhone: Safari tegenover de app op het beginscherm | Twee aparte opslagen | Eén keer inloggen in de app op het beginscherm; uitleg in de beginschermkaart ("je logt daar één keer in") |
| De browser in WhatsApp of Gmail | Die opslag kan bij het sluiten verdwijnen | Aanmelden en accepteren werkt daar gewoon. Het lidmaatschap staat in de database, dus later in Safari of de app is één code genoeg. Na het accepteren één rustige zin: "Open Thuisplanner voortaan in je browser of zet hem op je beginscherm", zonder het accepteren te onderbreken |
| De gebruiker wist zijn browsergegevens | Uitgelogd | Opnieuw een code. Onbevestigde opdrachten per account blijven het onderwerp van KG-5E (geen dataverlies bij uitloggen) |
| De sessie wordt ingetrokken ("Uitloggen op alle toestellen", herstel R1) | Een andere telefoon gebruikt nog een oude sessie | Bij de volgende vernieuwing een nette overgang naar het inlogscherm, met het adres al ingevuld (M1) |

**Extra tests:**
- **T21:** offline openen, en daarna weer online. Verwacht: steeds ingelogd, geen inlogscherm.
- **T22:** twee tabbladen vernieuwen tegelijk. Verwacht: beide blijven ingelogd.
- **T23:** het toegangstoken is verlopen (nagebootst, zoals in de bestaande integratietests). Verwacht: bij het openen
  vernieuwd, zonder inlogscherm.
- **T24:** de sessie is op de server ingetrokken. Verwacht: een nette overgang naar het inlogscherm met het adres
  ingevuld.
- **Handmatig op toestellen:**
  - de iPhone 8 dagen niet openen (Safari tegenover het beginscherm);
  - Android Chrome na 8 dagen;
  - de browser van WhatsApp sluiten en opnieuw openen.

**Extra tests bij §14 tot en met §17:**

| # | Scenario | Verwacht |
| --- | --- | --- |
| T14 | Tien foute codes, vanaf één IP en nagebootst vanaf meer | Limiet werkt; vastgelegd of een code na X fouten vervalt (bepaalt 6 of 8 cijfers) |
| T15 | SMTP onbereikbaar (lokaal nagebootst) | Nette melding, geen sessie, later opnieuw mogelijk |
| T16 | Uitnodigingsmail: time-out na het versturen, dan een herhaling | Precies één mail (Mailpit telt) |
| T17 | "Nog eens sturen" vier keer | Hoogstens 3, één per 10 minuten, afgedwongen in de database |
| T18 | Een bounce-melding van de aanbieder | Status "niet bezorgd" bij de uitnodiger |
| T19 | M1: venster dicht na "Stuur code", app opnieuw open | Direct het codescherm met het adres; na 10 minuten niet meer |
| T20 | Bèta-build tegen het stagingproject (en andersom) | De build weigert |

## 18. Open keuzes

| # | Vraag | Advies |
| --- | --- | --- |
| B1 | Een aparte bètaomgeving (nieuw Supabase-project en nieuw Pages-project; staging blijft achter Access)? | **Ja** |
| B2 | Back-ups van echte bètagegevens: Pro (B2a) of een eigen wekelijkse, versleutelde export (B2b)? | **B2b** zolang de groep klein is; **B2a** vóór de commerciële start |
| B3 | De code in de onderwerpregel van de mail? | **Ja** |
| B4 | Een uitnodigingsmail zonder token, alleen een knop naar de app? | **Ja** |
| B5 | Herstel: in de bèta het uitlegscherm en de veilige variant van R2; R1 en de volledige R2 (72 uur wachttijd) vóór de commerciële start; R3 niet herstelbaar, met later een passkey als voorkomen | **Ja** |
| B6 | Bezorgmeting met hoogstens 3 aanbieders (Lettermint, Scaleway, Brevo), met gratis accounts die jij aanmaakt? | **Ja** |
| B7 | De domeinnaam (D1) | Jouw merkkeuze. De naam is pas nodig vlak vóór de bezorgmeting |

**Nog lokaal te verifiëren** (alleen metingen op de lokale stack, geen bouwwerk):
- welk mailsjabloon een nieuw account krijgt;
- of de lengte van de code instelbaar is;
- of de captcha ook voor `signInWithOtp` geldt;
- of een code na foute pogingen vervalt;
- of de Send Email-hook op Free beschikbaar is;
- hoe supabase-js zich gedraagt bij offline vernieuwen.

Deze uitkomsten bepalen D4 (6 of 8 cijfers), de daglimiet per adres en de maatregelen bij T21.

## 19. Besluiten van 17 oktober (tweede ronde)

| # | Besluit | Uitwerking |
| --- | --- | --- |
| B1 | Akkoord: een aparte bètaomgeving; interne staging blijft beschermd en gescheiden | §13 |
| B2 | Voorlopig akkoord met automatische, versleutelde back-ups; eerst opslag, herstel en controle uitwerken, met de kosten van iets robuusters | §21 |
| B3 | Liever geen code in de onderwerpregel; een vriendelijk alternatief met automatisch invullen | §22 |
| B4 | Akkoord: een uitnodigingsmail zonder geheim token, zolang alleen het juiste bevestigde account kan accepteren | Dat is zo (deel 1b, `my_email()` en KG-T57 tot en met T64) |
| B5 | R1–R3 verder uitwerken, nog niet bouwen; extra beveiliging bij het wijzigen van een adres; voorkomen dat een beheerder via R2 een ander account overneemt; onderscheid tussen een nieuwe koppeling en herstel van het oorspronkelijke account | §23 |
| B6 | Akkoord: hoogstens 3 aanbieders vergelijken, op snelheid, betrouwbaarheid, foutafhandeling, privacy en kosten | §12, aangevuld in §24 |
| B7 | De domeinnaam later bewust kiezen, vóór de echte bezorgtests | Ook nodig voor het automatisch invullen (§22) |
| — | Een aparte noodstop voor registratie, voor codeverzoeken en voor bestaande sessies | §25 |
| — | Netwerkstoringen loggen niemand onnodig uit | §20.4 |
| — | De mobiele ervaring blijft leidend; is de codebeveiliging voldoende zonder extra stappen? | §20.2 en §26 |

## 20. Resultaten van de lokale metingen (17 oktober 2026)

Gemeten op de lokale stack: Auth (GoTrue) v2.197.0, supabase-js 2.117.2, PostgreSQL 17. De meetinstellingen waren zoals
voor productie bedoeld: bevestigen verplicht, 6 cijfers, 10 minuten geldig, 60 seconden tussen codes. De
meetinstellingen stonden alleen in een kopie buiten de repository. De meetfuncties stonden tijdelijk in de lokale
database en zijn verwijderd. Er is niets online gewijzigd. Meetscripts en logboeken staan in de scratchmap van deze
sessie, niet in de repository.

### 20.1 Codes

| # | Meting | Uitkomst | Gevolg voor het plan |
| --- | --- | --- | --- |
| C1 | Sjabloon bij een nieuw adres | "Confirmation"; de standaardtekst bevat **alleen een link, geen code** | Eigen sjablonen met `{{ .Token }}` zijn verplicht, voor confirmation, magic link, email change en reauthentication |
| C2 | Sjabloon bij een bestaand adres | "Magic link" | Dezelfde tekst als C1 |
| C3 | De lengte van de code is instelbaar | Ja (`otp_length`; gemeten met 6 en 10) | |
| C4 | Antwoord bij een nieuw tegenover een bestaand adres | Gelijk (`user: null`, `session: null`); duur 352 tegenover 190 ms | Geen adresverraad in het antwoord. Een klein tijdsverschil blijft |
| C5 | `shouldCreateUser: false` bij een onbekend adres | Geeft "Signups not allowed for otp" | Verraadt dat het adres onbekend is: **nooit gebruiken**; altijd `true` (de testpoort zit in de database) |
| C6 | Tien foute pogingen, daarna de juiste code | **De juiste code werkt nog**: er is geen maximum per code | Zie §20.2 |
| C7 | Een gebruikte code nog eens | Geweigerd | |
| C8 | Een nieuwe code binnen 60 seconden | Geweigerd (429, "after 59 seconds") | De app toont een aftelling |
| C9 | Een nieuwe code na 61 seconden | Een andere code; **de oude vervalt** | De app zegt "gebruik de nieuwste code" |
| C10 | Turnstile bij het **aanvragen** van een code | Afgedwongen: zonder token geweigerd | |
| C11 | Turnstile bij het **controleren** van een code | **Niet** afgedwongen | Zie §20.2 |
| C12 | Een limiet op het aantal controles per IP | Lokaal grijpt geen limiet in (meer dan 50 pogingen); de lokale stack herkent geen IP-adres | Lokaal niet te meten. Gedocumenteerd voor de gehoste omgeving: 30 per 5 minuten per IP. Op staging te meten (apart akkoord) |
| C13 | Bezorging naar Mailpit | 86 tot 300 ms | Zegt niets over echte bezorging; die meten we in B6 |

### 20.2 Is een code van 6 cijfers veilig genoeg zonder extra stappen?

**Nee, niet met alleen de standaardinstellingen van Supabase.** De metingen C6, C11 en C12 samen betekenen:
- Raden wordt alleen beperkt door de limiet per IP-adres (gedocumenteerd: 30 per 5 minuten).
- Er is geen maximum per code, en geen limiet per account.
- Er bestaat geen Supabase-hook voor het controleren van e-mailcodes. Die hooks zijn er alleen voor MFA en wachtwoorden,
  en alleen op Team en Enterprise.

**Grove inschatting** voor een aanvaller die steeds nieuwe codes laat sturen. Elke aanvraag vraagt een opgeloste
Turnstile-controle, en de echte gebruiker krijgt elke keer een mail, dus dit valt op:

| | 1 IP-adres | 100 IP-adressen |
| --- | --- | --- |
| 6 cijfers, standaard | ongeveer 0,9% kans per dag | ongeveer 58% kans per dag |
| 8 cijfers, standaard | ongeveer 0,009% | ongeveer 0,9% |
| **Eigen codelaag (§26): 6 cijfers, hoogstens 5 pogingen per code en 10 codes per adres per dag** | **hoogstens 0,005% per dag** (50 pogingen op 1 miljoen), ongeacht het aantal IP-adressen | **gelijk** |

Een gerichte aanval met veel IP-adressen is dus met 6 cijfers en de standaardinstellingen haalbaar. Voor echte
gezinsgegevens en de commerciële versie is dat onvoldoende. Meer cijfers verkleint het risico, maar heft het niet op,
en kost gebruiksgemak. De oplossing die geen extra stap kost: een **eigen codelaag** (§26).

### 20.3 E-mailadres wijzigen

| # | Meting | Uitkomst |
| --- | --- | --- |
| W1 | Wijziging aanvragen | Er gaat een mail met een eigen code naar het oude én naar het nieuwe adres |
| W2 | Alleen het nieuwe adres bevestigd | Het adres verandert **nog niet** |
| W3 | Ook het oude adres bevestigd | Het adres is gewijzigd; **hetzelfde account-id**; het huishouden is intact |
| W4 | Andere sessies na de wijziging | **Blijven actief** (2 sessies gemeten). De app moet zelf "andere toestellen uitloggen" doen (`signOut({ scope: 'others' })`) |
| W5 | Het oude adres na de wijziging | Direct vrij voor een nieuw account |
| W6 | Beide mails gebruiken hetzelfde sjabloon | De tekst moet voor allebei kloppen. De sjablonen kennen `{{ .Email }}` en `{{ .NewEmail }}`, zodat de mail naar het oude adres kan zeggen: "Je adres wordt gewijzigd naar n…" |

### 20.4 Sessies en netwerkstoringen

| # | Meting | Uitkomst | Gevolg |
| --- | --- | --- | --- |
| S1 | Openen zonder netwerk met een verlopen toegangstoken | De sessie **blijft bewaard**, maar `getSession()` geeft geen sessie, met de fout `AuthRetryableFetchError` | **De app mag bij die fout nooit het inlogscherm tonen.** De app toont dan "geen verbinding" en blijft ingelogd (met de opgeslagen gegevens zodra KG-5E dat kan) |
| S2 | Weer online, hetzelfde clientobject | **Nog 60 seconden geen sessie**: na een mislukte vernieuwing houdt supabase-js een afkoelperiode van 60 seconden aan voor hetzelfde token (`REFRESH_FAILURE_COOLDOWN_MS`). Herladen lost het direct op | De app toont "verbinding herstellen…". Kies het eenvoudigste dat werkt: de app wacht de afkoeling af, of maakt na het terugkomen van het netwerk de client opnieuw aan. Een regressietest (T21) legt dit vast, ook bij een nieuwe versie van supabase-js |
| S3 | Twee vensters vernieuwen tegelijk | Beide blijven ingelogd | |
| S4 | Een verloren antwoord: hetzelfde oude refresh-token na 12 seconden | Werkt nog (Auth geeft het nog ongebruikte opvolgende token terug) | Een slecht netwerk logt niemand uit |
| S5 | Een langzaam netwerk (8 s per verzoek) | Werkt | |
| S6 | Overal uitloggen, daarna vernieuwen op een ander toestel | Nette afmelding (`SIGNED_OUT`); de sessie is uit de opslag weg | |
| S7 | Het oude **toegangstoken** na overal uitloggen | **Werkt nog bij de database**, tot het verloopt (hoogstens 1 uur) | Zie §25 |
| S8 | Het token bevat `session_id`; een databasecontrole of die sessie nog bestaat | Een ingetrokken sessie wordt direct herkend; de controle kost 0,14 ms (primaire sleutel) | Basis voor de noodstop op sessies (§25) |

### 20.5 Noodstops en de Send Email-hook

| # | Meting | Uitkomst |
| --- | --- | --- |
| N1 | Registratie uit (`[auth] enable_signup = false`) | Een nieuw adres wordt geweigerd ("signup_disabled") en een bestaand adres werkt. **Let op:** de melding verraadt dat het adres onbekend is |
| N2 | E-mail-inloggen uit (`[auth.email] enable_signup = false`, in het dashboard: de e-mailprovider uit) | **Alle** code-inlog is geweigerd, ook voor bestaande gebruikers; bestaande sessies blijven |
| N3 | De Send Email-hook (Postgres) met een schakelaar in de database | Codes direct uit, zonder herstart, met een eigen melding (503). Bestaande sessies blijven |
| N4 | De inhoud van de hook | Het soort actie (`signup` of `magiclink`), de interne code en een `token_hash` (56 tekens) |
| N5 | Een server haalt met de `token_hash` een sessie op | Werkt, **precies één keer**, voor een nieuw én een bestaand adres |
| N6 | De interne code op 10 cijfers | Werkt; de gebruiker ziet die code nooit als de hook de mail verstuurt |
| N7 | Beschikbaarheid | De Send Email-hook en Before User Created staan volgens de documentatie op Free en Pro. Er is geen hook voor het controleren van codes |

## 21. B2: back-ups van echte gezinsgegevens

**Wat Supabase biedt** (documentatie van 17 oktober 2026):
- Free: geen automatische back-ups; zelf exporteren.
- Pro ($25 per maand): dagelijks, de laatste 7 dagen, ook te downloaden. Herstellen gebeurt naar hetzelfde project; dat
  is tijdens het herstellen onbereikbaar.
- PITR, herstel tot op de seconde, met hoogstens ongeveer 2 minuten verlies: ongeveer $100 per maand voor 7 dagen, plus
  minstens compute "Small". Dagelijkse back-ups stoppen dan.

**Varianten:**

| Variant | Hoogstens verlies | Kosten per maand | Beoordeling |
| --- | --- | --- | --- |
| V1: een wekelijkse export die jij start | Een week | €0 | **Onvoldoende** voor echte gezinsgegevens (jouw inschatting klopt): de kans op vergeten is groot en het verlies te groot |
| V2: Pro, met dagelijkse back-ups van Supabase | 1 dag | ongeveer $25 (ongeveer €23) | Beheerd, zonder geheim bij ons. Maar het is één leverancier en één account: verwijderen of misbruik van het account raakt ook de back-ups |
| **V3 (advies): Pro, plus een eigen versleutelde kopie elders** | 1 dag (Supabase); de kopie is een tweede verdediging | ongeveer $25, plus ongeveer €1 tot €5 voor de opslag van de kopie | Twee onafhankelijke kopieën; zie hieronder |
| V4: Pro met PITR | ongeveer 2 minuten | ongeveer $125 tot $140 | Pas bij betalende klanten of veel gebruik |

**V3 uitgewerkt:**
- **De kopie elders:** dagelijks een logische export (`pg_dump`), inclusief `auth`.
  - Versleuteld met een publieke sleutel (`age`). De privésleutel staat alleen offline, bij jou (in een wachtwoordkluis),
    nooit op de machine die de export maakt. Wie die machine overneemt, kan de back-ups dus niet lezen.
  - Opslag bij een EU-opslagdienst (bijvoorbeeld Scaleway Object Storage), in een emmer met **object lock**: een back-up
    is daar 30 dagen niet te wissen of te overschrijven, ook niet met de sleutel van de export.
- **Wie de export draait:**
  - Het moet een plek zijn met een geheim, maar zonder geheimen in GitHub (jouw regel).
  - Opties: een kleine EU-server (bijvoorbeeld ongeveer €4 tot €6 per maand), of een geplande Edge Function met een
    alleen-lezende databaserol. Dat laatste moet nog worden onderzocht, want `pg_dump` draait niet in een Edge Function.
  - De export gebruikt een **eigen databaserol die alleen mag lezen**, nooit `postgres` of de service-sleutel.
- **Bewaren:** 7 dagelijkse, 4 wekelijkse en 3 maandelijkse kopieën; daarna automatisch weg. Voor de privacyverklaring:
  een verwijderd account blijft hoogstens 90 dagen in back-ups.
- **Herstellen:** een vaste, geschreven procedure: downloaden, ontsleutelen (alleen jij) en terugzetten. Eerst naar een
  lege lokale stack of een tijdelijk project, nooit meteen over de bèta heen.
- **Controleren (het belangrijkste):**
  - Dagelijks automatisch: de export is gelukt, de grootte is redelijk (geen lege export) en de versleuteling klopt
    (alleen de kopregel van het bestand). Bij een fout krijg jij een mail.
  - Maandelijks een **hersteloefening**: de laatste kopie terugzetten in een lege lokale stack, dan de nacontrole
    (`verbinding-controle.mjs na`), het aantal rijen per tabel vergelijken en de RLS-matrix draaien. De uitkomst gaat
    in een logboek in de repository, zonder gegevens.
  - Vóór de eerste tester: één volledige oefening, met de tijd tot herstel erbij gemeten.

**Open keuzes:**
- **B2-1:** V3 (advies) of alleen V2.
- **B2-2:** wie de dagelijkse kopie maakt: een kleine EU-server (advies) of jouw eigen pc (onbetrouwbaar).

Pro kost geld en vraagt dus jouw akkoord; zonder Pro geen beheerde back-ups.

## 22. B3: code niet in de onderwerpregel, wel automatisch invullen

- **Onderwerp:** "Je inlogcode voor Thuisplanner", zonder code.
- **Voorbeeldtekst** (de tekst die mailapps in de melding tonen): een verborgen eerste regel "De code staat in deze mail.
  Hij is 10 minuten geldig." Zo staat de code ook niet in de melding of op het vergrendelscherm. Dat is te controleren
  op een iPhone, op Android met Gmail, en in Outlook.
- **De code in de mail:** groot, als één reeks cijfers zonder spaties of streepjes. Spaties kunnen het automatisch
  herkennen hinderen.
- **Automatisch invullen:**
  - **iPhone en iPad (iOS 17+, Safari):** Safari vult codes uit Mail automatisch in, met `autocomplete="one-time-code"`
    op het invoerveld. Apple publiceert de herkenningsregels niet. Volgens een melding op het ontwikkelaarsforum werkte
    het niet toen het afzenderdomein afweek van het domein van de website. **Daarom: de app en de afzender op hetzelfde
    eigen domein** (B7). Of het ook in de app op het beginscherm en in de browser van WhatsApp werkt, is op een echt
    toestel te testen.
  - **Android:** automatisch invullen uit e-mail bestaat niet in Chrome (WebOTP werkt alleen met sms). Wel helpt het:
    - plakken in het eerste vakje vult alle zes vakjes;
    - bij een volledige code gaat het vanzelf verder;
    - het veld krijgt `inputmode="numeric"`, dus een cijfertoetsenbord.
  - **Overal:** een knop "Open je mail" alleen waar dat betrouwbaar kan (bijvoorbeeld de Gmail-app bij een Gmail-adres).
    Anders liever niets dan een knop die niets doet.
- **Gevolg voor het aantal handelingen:** met automatisch invullen wordt "naar de mail en terug, code typen" (3
  handelingen) één tik. Dan is scenario A 7 handelingen in plaats van 9.

## 23. B5: wijzigen en herstellen zonder overname

**Onderscheid:**
- **Herstel van het oorspronkelijke account:** het account (het id) blijft hetzelfde en krijgt een ander adres. Daarmee
  houd je alles: alle huishoudens, je privé-afspraken en je rollen. Dit kan **alleen door de eigenaar van het account
  zelf**, nooit door een beheerder.
- **Een nieuwe koppeling (R2):** een **nieuw** account wordt in **één** huishouden aan je bestaande profiel gekoppeld.
  Het oude account wordt niet gewijzigd en niet overgenomen; het verliest alleen in dat ene huishouden de koppeling met
  dat profiel. Privé-afspraken, andere huishoudens en het adres van het oude account blijven van het oude account.

**Extra beveiliging bij het gewone wijzigen (met toegang tot het oude adres):**
- Beide adressen bevestigen (gemeten: W1 tot en met W3).
- Na de wijziging alle andere sessies uitloggen (W4); het toestel van de wijziging blijft ingelogd.
- Een melding naar het **oude** adres: "Je adres is gewijzigd naar n…@…. Was jij dit niet? …"
- Hoogstens één adreswijziging per 7 dagen per account. Dat remt iemand die een sessie heeft overgenomen.
- Een wijziging alleen vanuit een sessie die het afgelopen uur met een code is bevestigd. Is dat langer geleden, dan
  eerst één extra code naar het huidige adres (Supabase "reauthenticate").
- Tijdens een lopende herstelprocedure (R1 of R2) kan het adres niet gewijzigd worden.

**R1: herstel van het oorspronkelijke account, zonder toegang tot het oude adres:**
- Alleen vanuit een sessie die **minstens 14 dagen bestaat**. Een net overgenomen sessie kan dit dus niet.
- Een code naar het nieuwe adres, dan een **wachttijd van 72 uur**.
- Tijdens de wachttijd:
  - een mail naar het oude adres met "Annuleren";
  - een melding op al je toestellen;
  - een melding aan de andere beheerders van je huishoudens.
- Annuleren kan vanuit elke sessie van het account en via de mail.
- Daarna: het adres gewijzigd en alle andere sessies uitgelogd.

**R2: een nieuwe koppeling via een beheerder, zonder overname:**
- **Geweigerd** als het oude account de afgelopen **30 dagen** nog actief was (een vernieuwde sessie). Wie nog
  gewoon inlogt, heeft R2 niet nodig, en een beheerder kan zo nooit een actief account van iemand anders "loskoppelen".
- Nooit voor het profiel van de **eigenaar**. Eigendom overdragen of herstellen loopt niet via R2.
- Nooit door het account dat zelf aan het profiel gekoppeld is, en de beheerder moet al minstens 14 dagen beheerder
  zijn.
- Een **tweede volwassen account** in het huishouden moet het bevestigen, als het huishouden er een heeft.
- Een uitnodiging op het **nieuwe** adres, voor dat profiel; de nieuwe persoon accepteert zelf met een code (beslissing
  6).
- Een **wachttijd van 72 uur**, met een mail naar het oude adres en een melding in de app van het oude account. Het
  oude account kan **bezwaar maken**; dan stopt de procedure en krijgen de andere beheerders een melding.
- Na afloop is alleen in **dat ene huishouden** het profiel van het nieuwe account. Het oude account houdt al het
  andere.
- Alles in een auditlog (wie, wat, wanneer; adressen alleen als hash).
- Alles wordt in de database afgedwongen, met RLS-scenario's en tegenproeven, zoals bij deel 1b.

**R3: zonder toestel, mailbox en huishoudgenoot:** niet herstelbaar. Voorkomen met een optionele passkey, na deel 2.

**Volgorde (ongewijzigd):**
- In de bèta: het gewone wijzigen met alle extra's hierboven, het uitlegscherm, en de veilige "nieuw profiel via een
  gewone uitnodiging".
- R1 en R2 vóór de commerciële start, elk met een eigen plan en akkoord.

## 24. B6: de vergelijking van de mailaanbieders

Per aanbieder (hoogstens 3) dezelfde proef, met het testsubdomein (na B7):

| Onderdeel | Meting | Eis |
| --- | --- | --- |
| Snelheid | 20 codes naar Gmail, Outlook/Hotmail, iCloud, KPN en Ziggo; tijd tot aankomst | 95% binnen 30 seconden |
| Betrouwbaarheid | Inbox of spam; SPF, DKIM en DMARC "pass" in de kopregels; hun statuspagina en storingsgeschiedenis | Niets in de spam; drie keer pass |
| Foutafhandeling | Een niet-bestaand adres (bounce), een volle mailbox, een ongeldige sleutel, een tijdelijke fout: welk antwoord en welke webhook | Bruikbare foutcodes en een bounce-webhook |
| Limieten | Per uur, dag en maand, en wat er gebeurt bij overschrijding | Geen stille weigering |
| Privacy | De verwerkersovereenkomst, subverwerkers, de bewaartermijn van logboeken en de inhoud, de plaats van de servers | EU-bedrijf en EU-servers, korte bewaartermijn |
| Kosten | Gratis tegoed en de prijs bij 1.000, 10.000 en 100.000 mails per maand | Bekend en voorspelbaar |
| API | Een HTTP-API voor de Edge Function (§26) en een idempotentiesleutel | Nodig voor de codelaag en de uitnodigingsmail |

De uitkomst komt in een tabel, met mijn advies. De keuze maak jij.

## 25. Drie aparte noodstops

| Noodstop | Wat stopt | Wat blijft | Hoe | Gemeten |
| --- | --- | --- | --- | --- |
| **1. Registratie** | Nieuwe accounts **én** het aanmaken van nieuwe huishoudens | Bestaande gebruikers loggen in; uitnodigingen accepteren voor wie al een account heeft | **Advies:** een schakelaar in de database (de testpoort G1, plus "geen nieuwe accounts" in de codelaag, §26). De registratieschakelaar van Supabase (N1) **niet** als eerste middel, omdat die verraadt of een adres bestaat; alleen als laatste redmiddel | N1 |
| **2. Codeverzoeken** | Er gaan geen codes meer uit; niemand logt **opnieuw** in | Iedereen die al ingelogd is, werkt gewoon door | Een schakelaar in de database, gelezen door de codelaag (§26) en de hook (N3): direct, zonder herstart, met een rustige melding. Als laatste redmiddel: de e-mailprovider uit in het dashboard (N2) | N2, N3 |
| **3. Bestaande sessies** | Alle (of de sessies van één account) **direct** zonder toegang, ook het nog geldige toegangstoken | Accounts en gegevens; opnieuw inloggen kan, tenzij noodstop 2 ook aan staat | **(a)** de sessies verwijderen (`auth.sessions`; vernieuwen faalt daarna: S6). **(b)** een controle in de bestaande RLS-hulpfuncties (`private.is_active_member` en verwanten) of de `session_id` uit het token nog bestaat (S8). Zonder (b) blijft een token nog tot een uur geldig (S7). **(c)** voor het hele project een onderhoudsschakelaar in diezelfde hulpfuncties: alles direct alleen-lezen, of helemaal dicht | S6, S7, S8 |

- Elke noodstop is een rij in een tabel in `private`. Alleen jij zet hem om, via een script met de veilige verbinding.
- De app toont per noodstop een eigen rustige melding, met een stabiele code. Er komt geen paniek in beeld en niemand
  wordt uitgelogd zonder reden.
- De nacontrole toont de stand van alle drie.
- Voor elke noodstop komt er een test in de RLS-matrix, met tegenproef: hij werkt, en uit betekent echt uit.

## 26. Wijziging in het plan: een eigen codelaag (advies)

**Waarom:** §20.2. Het geeft een limiet **per adres en per code** zonder dat de gebruiker iets extra merkt, en lost
tegelijk andere punten op:
- noodstop 2 zonder herstart;
- daglimieten per adres;
- een logboek voor "komt niet aan";
- eigen sjablonen en de verborgen voorbeeldtekst;
- een tweede mailaanbieder als reserve.

**Hoe (alles gemeten in N3 tot en met N6, behalve het versturen via een echte aanbieder):**
1. De app vraagt een code aan zoals nu (`signInWithOtp`, met Turnstile; C10).
2. De interne code van Supabase is **10 cijfers** en wordt nooit gemaild (N6). Raden daarvan is onbegonnen werk (1 op
   10 miljard per poging).
3. De Send Email-hook (een HTTP-hook naar een Edge Function in de EU; op Free beschikbaar, N7):
   - maakt een **eigen code van 6 cijfers**;
   - bewaart alleen de hash daarvan, met de `token_hash` versleuteld, 10 minuten, één keer bruikbaar;
   - controleert de noodstops en de daglimiet per adres;
   - verstuurt de mail via de API van de aanbieder, met een idempotentiesleutel.
4. De gebruiker typt de 6 cijfers. Een Edge Function `code-controleren`:
   - telt de pogingen, **hoogstens 5 per code**; daarna vervalt de code en is er een nieuwe nodig;
   - geeft bij een goede code de sessie terug via de `token_hash` (N5: werkt één keer);
   - de app zet die sessie (`setSession`).
5. Dezelfde laag doet het wijzigen van het e-mailadres (de soort `email_change`) en de herbevestiging.

**Wat de gebruiker merkt:** niets anders. Wel minder risico, en betere meldingen als de mail niet komt.

**Nadelen en risico's:**
- Eigen code in het belangrijkste pad. Valt de Edge Function of de aanbieder uit, dan kan niemand **opnieuw** inloggen;
  wie ingelogd is, merkt niets. Daartegen helpen:
  - tests, inclusief tegenproeven;
  - een tweede aanbieder als reserve in dezelfde functie;
  - de bewaking (§17).
- De hook moet binnen 5 seconden klaar zijn. Daarom met een korte time-out naar de aanbieder: mislukt het binnen die
  tijd, dan volgt direct een nette melding.
- De `token_hash` is 10 minuten lang gevoelig (die geeft één keer een sessie). Daarom versleuteld opgeslagen, alleen
  in `private`, direct gewist na gebruik of verloop, en nooit in logboeken.
- Dit is meer bouwwerk dan de standaardroute: ongeveer twee Edge Functions, één migratie en tests. Nog te verifiëren:
  het hele pad met een echte aanbieder, en het gedrag als de hook een fout geeft (N3 laat zien dat de gebruiker dan een
  nette fout krijgt).

**Kosten:** Edge Functions vallen binnen het gratis tegoed van Supabase; de mail telt bij de aanbieder.

**Alternatief (eenvoudiger, minder sterk):** 8 cijfers met de standaardlimieten. Het risico blijft bij een gerichte
aanval met veel IP-adressen (§20.2), en de gebruiker typt twee cijfers meer. **Niet mijn advies** voor echte
gezinsgegevens.

## 27. Bijgewerkte open keuzes

| # | Vraag | Advies |
| --- | --- | --- |
| K1 | De eigen codelaag (§26) in plaats van alleen de standaardcodes van Supabase? | **Ja** |
| B2-1 | Back-ups: V3 (Pro plus een eigen versleutelde kopie met object lock) of alleen V2 (Pro)? | **V3**; Pro kost ongeveer $25 per maand en vraagt jouw akkoord |
| B2-2 | Wie maakt de dagelijkse kopie? | Een kleine EU-server (ongeveer €4 tot €6 per maand), met een alleen-lezende databaserol |
| B3-1 | Code niet in het onderwerp; een verborgen voorbeeldtekst; app en afzender op hetzelfde domein | **Ja** (dat maakt B7 belangrijker) |
| B5-1 | De extra eisen bij wijzigen, R1 (sessie minstens 14 dagen oud, 72 uur) en R2 (oud account 30 dagen inactief, niet voor de eigenaar, een tweede volwassene bevestigt, bezwaar mogelijk) | **Ja**, als uitgangspunt voor een eigen plan vóór de commerciële start |
| N-1 | De drie noodstops zoals in §25, met de database-schakelaars als eerste middel | **Ja** |
| T-1 | De limiet per IP en de bezorging pas meten op staging, met een apart akkoord (lokaal niet te meten) | **Ja** |

**Resterende risico's na deze keuzes:**
- Een overgenomen mailbox blijft de sleutel tot een account. Dat is net zo bij wachtwoorden met "wachtwoord vergeten";
  de melding naar het oude adres en de wachttijden beperken de schade.
- iPhone: de 7-dagenregel van Safari en de aparte opslag van de app op het beginscherm.
- De afkoelperiode van 60 seconden in supabase-js na een netwerkstoring (S2): opgevangen in de app en met een
  regressietest bewaakt.
- Afhankelijkheid van één mailaanbieder. Een reserve kan in de codelaag.
- Automatisch invullen uit Mail is niet door Apple gedocumenteerd; het moet op echte toestellen werken. Zonder
  automatisch invullen is het scenario 9 handelingen in plaats van 7.

## 28. Bijgewerkte bouwvolgorde (nog geen akkoord om te bouwen)

1. De keuzes uit §27, en B7 (de domeinnaam).
2. B6: de vergelijking van de aanbieders, met jouw accounts.
3. **Deel 2 lokaal bouwen** (apart akkoord):
   - het codescherm en M1, M2, D5 en D7;
   - de codelaag (K1);
   - de sjablonen;
   - de noodstops;
   - de testpoort;
   - de sessieregels (S1, S2);
   - het wijzigen van het adres met de extra's;
   - de uitnodigingsmail;
   - de buildmodus `beta`;
   - tests, inclusief T1 tot en met T24 en de RLS-scenario's.
4. Het bèta-project en de back-ups (V3) inrichten, en een hersteloefening doen (aparte akkoorden; kosten).
5. Staging bijwerken en testen (achter Access), inclusief de limiet per IP en de bezorging (T-1).
6. Doorzetten naar bèta; jouw toestelproef (§7.2).
7. Externe testers.

