# Thuisplanner: architectuur- en beveiligingsreview van wachtwoordloos inloggen (17 oktober 2026)

**Status:** review ter beoordeling. Er is niets geïmplementeerd, gemigreerd, gecommit, gepusht of gedeployed, en er
is niets online veranderd. Deze review bouwt voort op de lokale metingen in `docs/thuisplanner-registratie-inloggen.md`
§20.

**Vaste eis:** een nieuwe gebruiker opent zonder hulp, zonder dubbele inlog en zonder ingewikkelde stappen snel zijn
huishouden, of doet mee in een bestaand huishouden. Elke optie hieronder is daaraan getoetst.

**Bewijsniveaus in dit document:**
- **[gemeten]**: lokaal aangetoond (GoTrue v2.197.0, supabase-js 2.117.2).
- **[bron]**: gelezen in de broncode of de officiële documentatie.
- **[aanname]**: nog niet aangetoond; zo nodig op staging te meten (§7).

## 1. De risicoberekening bij een code van 6 cijfers, nagerekend

### 1.1 Wat vaststaat

| # | Feit | Niveau |
| --- | --- | --- |
| F1 | Een code blijft geldig na 10 foute pogingen: er is geen maximum per code | [gemeten] C6 |
| F2 | In `verify.go` van Supabase Auth is er geen teller voor mislukte pogingen, geen blokkade, en de code wordt niet in constante tijd vergeleken (`actual == expected`) | [bron] |
| F3 | De enige begrenzing van controles is de limiet `Verify` op `/verify` (GET en POST) | [bron] `api.go` |
| F4 | Die limiet is per sleutel: de kop `Sb-Forwarded-For`, of een ingestelde kop (`RateLimitHeader`). **Zonder kop wordt niet begrensd** | [bron] `middleware.go`; [gemeten] C12: lokaal geen limiet |
| F5 | Turnstile wordt afgedwongen bij het aanvragen (`/otp`), niet bij het controleren | [gemeten] C10, C11; [bron] `api.go` |
| F6 | Een nieuwe code maakt de vorige ongeldig; een code werkt één keer; een nieuwe pas na 60 seconden | [gemeten] C7–C9 |
| F7 | Er is geen Supabase-hook voor het controleren van e-mailcodes. Hooks voor MFA en wachtwoorden bestaan alleen op Team en Enterprise | [bron] |
| F8 | De gedocumenteerde standaard op de gehoste omgeving: 30 controles per 5 minuten (instelbaar) | [bron] documentatie |
| F9 | NIST SP 800-63B (rev. 4) §3.2.2: per authenticator hoogstens **100** mislukte pogingen achter elkaar. Codes onder 64 bits **moeten** begrensd worden. Een nieuwe code zet de teller **niet** terug. §3.1.3.2: 6 cijfers, 10 minuten geldig. §3.1.3.1: e-mail mag **niet** als out-of-band-tweede-factor | [bron] |

### 1.2 Wat aanname is

| # | Aanname | Waarom die ertoe doet | Te meten? |
| --- | --- | --- | --- |
| A1 | Op de gehoste omgeving zet Supabase de kop `Sb-Forwarded-For`, zodat de limiet per IP echt werkt | Zonder die kop is er geen enkele begrenzing (F4) | Ja, S1 (§7) |
| A2 | De limiet is 30 per 5 minuten en geldt voor POST met een e-mailcode | Bepaalt de snelheid van raden | Ja, S1 |
| A3 | De limiet geldt per volledig IPv6-adres, of per /64 | Een /64 bevat 2^64 adressen. Bij een limiet per volledig adres is "veel IP-adressen" goedkoop | Deels, S2; rotatie binnen een /64 testen we niet (dat zou een aanval nabootsen) |
| A4 | Er is geen extra bescherming aan de rand (zoals een WAF) die massaal raden stopt | Zo'n laag zou het risico verkleinen, maar is niet gedocumenteerd | Nee; daarom tellen we er niet op |
| A5 | De aanvaller kent het e-mailadres en kan Turnstile oplossen (bijvoorbeeld via een betaalde dienst) | Elke nieuwe code vraagt één oplossing | Nee; realistisch voor een gerichte aanval |

### 1.3 De berekening, met de aannames erbij

Een aanvaller laat steeds een nieuwe code sturen (F6: na 60 seconden) en raadt continu. Elke gok raakt de geldige code
met kans 1 op een miljoen. Per IP-adres zijn dat 30 gokken per 5 minuten, dus 8.640 per dag (A1 en A2). Bij een
volgehouden aanval is de kans per dag `1 − (1 − 10⁻⁶)^(8.640 × N)`:

| | N = 1 | N = 100 | N = 10.000 (IPv6, A3) |
| --- | --- | --- | --- |
| 6 cijfers, standaard | 0,86% | 58% | vrijwel 100% |
| 8 cijfers, standaard | 0,0086% | 0,86% | 58% |
| 10 cijfers, standaard | 0,000086% | 0,0086% | 0,86% |

**De vorige schatting klopt rekenkundig.** Wel zijn twee kanttekeningen nodig:
- Bij N = 1 gaat het om vele dagen volhouden, terwijl het slachtoffer een stroom codemails krijgt. De aanval valt dus
  op, maar het slachtoffer kan hem niet stoppen.
- De getallen bij grote N hangen helemaal af van A3. Ook zonder A3 voldoet de standaardopzet niet aan F9: er is geen
  limiet per account. Dat is aangetoond (F1 en F2), en hangt niet van aannames af.

**Ook aangetoond, en niet eerder genoemd:**
- Met `shouldCreateUser: true` maakt elke aanvraag voor een onbekend adres een onbevestigd account aan. Een aanvaller
  met Turnstile-oplossingen kan `auth.users` dus vullen met rommel. Daarom: opruimen.
- Een aanvaller kan de projectbrede mail-limiet uitputten. Dan krijgt **niemand** meer een code: een aanval op de
  beschikbaarheid.
- Het vergelijken niet in constante tijd (F2) is over het netwerk praktisch niet uit te buiten. Het staat hier voor de
  volledigheid. [aanname]

## 2. Drie (plus één) opties voor veilig wachtwoordloos inloggen

| | A: Supabase Auth standaard, met de ondersteunde extra's | B: eigen codelaag (K1) op Supabase Auth | C: een beheerde dienst via third-party auth | D: passkeys als hoofdroute |
| --- | --- | --- | --- | --- |
| Wat | Turnstile bij aanvragen; een langere code (8–10 cijfers); een strengere limiet per IP; korter geldig; de Send Email-hook alleen voor een limiet op versturen en een noodstop | §3 | Bijvoorbeeld Ory Network, Zitadel of Hanko (EU), of Auth0, Clerk of WorkOS (VS). Supabase accepteert hun tokens via "Custom OIDC" [bron] | WebAuthn |
| Limiet per account | **Nee** (F1–F3, F7) | **Ja**: per code en per account | Volgens de aanbieder; per aanbieder te verifiëren [aanname] | Niet nodig (geen geheim om te raden) |
| Voldoet aan F9 | Nee | Ja | Waarschijnlijk | Ja |
| Gebruikerservaring | 6 cijfers is onveilig; met 8–10 cijfers meer typen | **6 cijfers**, dezelfde stappen | Code of passkey; een eigen inlogscherm of een doorverwijzing (die laatste is slecht in de browser van WhatsApp) | Het snelst, maar niet elk toestel en elke browser in een app kan het; een code blijft nodig om te beginnen en te herstellen |
| Gevolg voor de database | Geen | Een tabel, twee Edge Functions | **Groot**: de gebruikers staan dan niet in `auth.users`. Ons schema verwijst naar `auth.users(id)` (leden, uitnodigingen, de verwijdertrigger). Een ombouw van RLS, triggers en tests | Supabase ondersteunt passkeys niet als hoofdroute [bron, MFA-pagina]; dan weer eigen code |
| Eigen beveiligingscode | Geen | **Ja** (kritiek pad) | Weinig | Veel (WebAuthn-verificatie) |
| Kosten | €0 | €0 extra (Edge Functions binnen het gratis tegoed) | Per aanbieder; Supabase rekent $0,00325 per MAU boven het tegoed [bron]; prijzen nog te verifiëren | €0 extra |
| Privacy | Supabase (EU-regio) | Supabase plus de mailaanbieder | Een extra verwerker; bij Amerikaanse aanbieders de CLOUD Act | Geen extra verwerker |
| Oordeel | **Onvoldoende** voor echte gezinsgegevens | **Advies** | Te zware ombouw voor deze fase; wel een optie als we Supabase Auth ooit verlaten | **Later als aanvulling**: optioneel, sneller, en het maakt R1 veilig (§5) |

## 3. K1 in detail

### 3.1 Onderdelen

- **Supabase Auth** blijft de enige uitgever van sessies. Geen eigen tokens.
- **Interne code van Supabase: 10 cijfers** (`otp_length = 10`, [gemeten] N6). Die wordt nooit gemaild of getoond.
- **Edge Function `stuur-code`:** de Send Email-hook (HTTP), voor alle soorten mail: `signup`, `magiclink`,
  `email_change` en `reauthentication`. Supabase ondertekent het verzoek volgens Standard Webhooks; de functie
  controleert die handtekening.
- **Edge Function `controleer-code`:** wordt door de app aangeroepen met het adres en 6 cijfers.
- **Tabel `private.inlogcodes`:** alleen voor de functies, niet via de API.
- **Geheimen, alleen als secrets van de Edge Functions en nooit in GitHub of de frontend:**
  - een HMAC-sleutel (pepper);
  - een versleutelsleutel (AES-256-GCM);
  - de API-sleutel van de mailaanbieder;
  - het hookgeheim.

### 3.2 Genereren

- 6 cijfers uit `crypto.getRandomValues`, met *rejection sampling*, zodat elke code van 000000 tot en met 999999 even
  waarschijnlijk is. Dat voldoet aan F9: een goedgekeurde willekeurige bron.
- Per adres is er hoogstens één actieve code. Een nieuwe aanvraag maakt de vorige ongeldig (status `vervangen`), net als
  Supabase zelf doet (F6). Een gedeeltelijke unieke index (`waar status = 'actief'`) dwingt dat af in de database.

### 3.3 Opslaan

| Kolom | Inhoud | Waarom |
| --- | --- | --- |
| `id` | uuid | |
| `adres_hmac` | HMAC-SHA256(pepper, kleine letters van het adres) | Opzoeken zonder het adres zelf op te slaan |
| `code_hmac` | HMAC-SHA256(pepper, id ‖ code) | Bij een databaselek zonder de pepper niet terug te rekenen (een gewone hash van 6 cijfers is in een seconde te kraken) |
| `token_hash_enc` | AES-256-GCM(sleutel, `token_hash` uit de hook) | Wie alleen de database heeft, kan er geen sessie mee halen |
| `soort` | `signup`, `email`, `email_change` of `reauthentication` | Voor de juiste `verifyOtp` |
| `pogingen` | int, standaard 0 | |
| `status`, `gemaakt`, `verloopt` (10 minuten), `gebruikt` | | Eenmalig en tijdgebonden |
| `account_mislukt` | in een aparte tabel per `adres_hmac`: mislukte pogingen achter elkaar, en "geblokkeerd tot" | F9: de teller loopt door over codes heen |

Bewaren: rijen gaan na 24 uur weg (een geplande taak); de tellers per adres na 30 dagen zonder mislukte pogingen.

### 3.4 Controleren (één atomaire stap in de database)

```
update private.inlogcodes
   set pogingen = pogingen + 1
 where adres_hmac = $1 and status = 'actief' and verloopt > now() and pogingen < 5
returning id, code_hmac, token_hash_enc, soort, pogingen;
```

1. Geen rij: één algemeen antwoord ("Deze code klopt niet of is verlopen"). Ook dan wordt een HMAC berekend, zodat de
   duur niet verraadt of er een code was.
2. De HMAC vergelijken in **constante tijd** (`timingSafeEqual`).
3. Fout: `account_mislukt + 1`. Bij de 5e fout op deze code is de code `vervallen`.
4. Goed, in een tweede atomaire stap:

   ```
   update … set status = 'gebruikt', gebruikt = now()
    where id = $1 and status = 'actief'
   returning token_hash_enc
   ```

   Alleen de eerste van twee gelijktijdige goede pogingen krijgt een rij terug; de tweede krijgt "al gebruikt". Daarna
   gaat `account_mislukt` naar 0 (NIST: na een geslaagde inlog terugzetten).
5. De functie ontsleutelt de `token_hash` en geeft die **aan de app**.

**Doorlopende vertraging per account** (NIST-techniek; nooit een blijvende blokkade):

| Mislukte pogingen achter elkaar (over codes heen) | Gevolg |
| --- | --- |
| 10 | 15 minuten geen nieuwe code |
| 20 | 1 uur |
| 30 | 24 uur, plus een mail naar het adres: "Er is vaak geprobeerd in te loggen" |

Een gebruiker die gewoon inlogt, merkt hier niets van.

### 3.5 De sessie veilig uitgeven

- De app roept `supabase.auth.verifyOtp({ token_hash, type })` aan. **Supabase zelf** geeft dan de sessie aan de app.
  Onze functie ziet nooit een access- of refresh-token.
- De `token_hash` is één keer bruikbaar ([gemeten] N5: een tweede keer wordt geweigerd), 10 minuten geldig, en 224 bits
  willekeurig (56 hex-tekens).
- Bij een nieuw adres zet die stap ook `email_confirmed_at`. Een adres geldt dus pas als bevestigd **nadat** de
  gebruiker de juiste code heeft ingevoerd. Daarop steunt `my_email()` in deel 1b.
- Alternatief: onze functie haalt zelf de sessie op en geeft die door. Niet doen: dan gaan refresh-tokens door onze code.

### 3.6 Aanvragen, gelijktijdigheid en hergebruik

| Situatie | Gedrag |
| --- | --- |
| Twee aanvragen tegelijk voor hetzelfde adres | Supabase laat er één per 60 seconden door (F6). Komen er toch twee bij de hook, dan wint de laatste en vervalt de eerste (unieke index) |
| Twee keer controleren tegelijk met de juiste code | Precies één slaagt (§3.4, stap 4) |
| Een gebruikte code nog eens | "Al gebruikt" of het algemene antwoord; geen sessie |
| De `token_hash` nog eens | Supabase weigert ([gemeten] N5) |
| Raden van de interne code van 10 cijfers, rechtstreeks bij Supabase | Alleen begrensd per IP (A1 tot en met A3). Die code bestaat alleen zolang iemand een code heeft aangevraagd. Dat vraagt Turnstile en valt onder onze limiet per adres. Bij hoogstens 10 codes per dag van 10 minuten is er hoogstens 100 minuten per dag iets te raden. Met een (zeer) hoog aangenomen tempo van 1.000 gokken per seconde: 6 × 10⁶ gokken op 10¹⁰, dus ongeveer 0,06% per dag. Restrisico; zie §8 |

### 3.7 Limieten op aanvragen (in `stuur-code`, vóór het versturen)

- Per adres: hoogstens 3 codes per 15 minuten en 10 per dag, met oplopende wachttijden.
- Per project: een stroomonderbreker. Bij meer dan X aanvragen per uur gaat er alleen nog een code uit voor adressen
  die al een bevestigd account hebben, en jij krijgt een melding. Dit beschermt tegen het uitputten van de mail-limiet.
- Elke aanvraag vraagt Turnstile (dat doet Supabase al, F5).
- **Optioneel:** Turnstile ook bij het controleren, maar pas na 2 foute pogingen. Dat kan Supabase zelf niet (F5); K1
  wel. Bij een normale inlog is het onzichtbaar.

### 3.8 Geen adresverraad

- Aanvragen gaat via Supabase: het antwoord is gelijk voor een nieuw en een bestaand adres ([gemeten] C4). De hook
  stuurt in beide gevallen dezelfde mail.
- Controleren geeft één antwoord voor "fout", "verlopen" en "geen code".
- `shouldCreateUser: false` gebruiken we nooit ([gemeten] C5).
- Onbevestigde accounts zonder huishouden gaan na 24 uur weg (een geplande taak). Dat ruimt rommel van misbruik op.

### 3.9 Storingen

| Storing | Gevolg | Maatregel |
| --- | --- | --- |
| De mailaanbieder valt uit | De hook geeft binnen 5 seconden een fout, en de app toont "Versturen lukt nu niet" ([gemeten] N3) | Een tweede aanbieder als reserve in dezelfde functie, met een time-out van ongeveer 2 seconden per aanbieder |
| Een koude start van de Edge Function | Iets langzamer | Binnen de 5 seconden; meten |
| `controleer-code` valt uit | Niemand kan **opnieuw** inloggen; wie ingelogd is, merkt niets | Bewaking en een melding aan jou |
| De database valt uit | Alles ligt stil | Zoals nu |
| Een sleutel uitgelekt | Pepper of versleutelsleutel | Beide wisselen; actieve codes vervallen (hooguit 10 minuten hinder) |

### 3.10 Misbruik vanaf veel IP-adressen

- **Raden van de 6 cijfers:** staat los van het aantal IP-adressen (de limieten gelden per account). Hoogstens 5 per
  code, en de vertraging per account.
- **Raden van de interne 10 cijfers:** zie §3.6.
- **Een slachtoffer buitensluiten,** door 5 foute pogingen per code of door de daglimiet op te maken: dat kan. Het
  slachtoffer kan dan een tijd niet **opnieuw** inloggen, maar bestaande sessies en de gegevens blijven. Zo'n aanval
  vraagt per code een Turnstile-oplossing, en valt op in het dagoverzicht. Dit is een bewust restrisico, zoals bij elk
  systeem met een limiet per account.
- **Mailbombardement:** de limiet per adres, Turnstile en de stroomonderbreker.

### 3.11 Bewijs vóór gebruik (deel van de bouw, na akkoord)

- Lokaal: het hele pad met een nagebootste aanbieder (Mailpit).
- Een tegenproef per regel: zonder de pogingengrens, zonder de atomaire update, zonder constante tijd, zonder
  versleuteling, zonder de controle van de hookhandtekening. Elke sabotage moet zijn test laten falen.
- `email_change` met twee codes (de payload heeft omgekeerde hashes [bron]) en `reauthentication`: nog te meten.
- Een externe review van de twee functies vóór de commerciële start.

## 4. Zes cijfers: voldoende met K1?

**Ja, met K1, en alleen met K1.**

| Grens | Waarde |
| --- | --- |
| Per code | 5 pogingen, dus kans 5 × 10⁻⁶ |
| Per account | Doorlopende vertraging; bij volhouden hoogstens ongeveer 40 pogingen per dag |
| Kans per dag bij een volgehouden gerichte aanval | Hoogstens 0,004%; per jaar hoogstens ongeveer 1,5%, terwijl het slachtoffer elke dag codemails en na 30 fouten een waarschuwing krijgt |
| NIST §3.2.2 (hoogstens 100 achter elkaar) | Ruim gehaald |

Wil je ook het jaarrisico lager, dan zijn 8 cijfers met K1 één instelling: het jaarrisico wordt dan 100 keer kleiner,
en de gebruiker typt 2 cijfers meer. **Advies:** begin met 6. Het aantal cijfers is één instelling, en het dagoverzicht
laat zien of er ooit zo'n aanval gebeurt.

## 5. R1 en R2 als beveiligingskritische processen (niets bouwen zonder een apart akkoord)

### 5.1 R1: herstel van het oorspronkelijke account (het adres verandert, het account blijft)

| Dreiging | Zonder passkey | Met passkey |
| --- | --- | --- |
| Een dief met een ontgrendelde telefoon en een sessie van langer dan 14 dagen | **Kan R1 starten.** Het slachtoffer heeft het oude adres niet meer (dat is de aanleiding van R1), dus de waarschuwing komt nergens aan, tenzij er een tweede toestel of een medebeheerder is. Na 72 uur is het account over | De dief moet ook Face ID of de vingerafdruk van de eigenaar hebben (WebAuthn-gebruikersverificatie) |
| Een overgenomen sessie (malware) | Idem | Idem |
| Iemand met de nieuwe mailbox | Kan R1 niet starten zonder sessie | Idem |

**Advies:** R1 alleen aanbieden als het account een passkey heeft die minstens 7 dagen eerder is geregistreerd, met
verificatie bij het starten. Daarbij:
- een wachttijd van 72 uur;
- meldingen naar alle toestellen en medebeheerders;
- annuleren mogelijk.

Zonder passkey is R1 er niet; dan geldt R2 of R3. Zo wordt R1 niet de zwakste schakel.

### 5.2 R2: een nieuwe koppeling via een beheerder (nooit een overname)

| Dreiging | Maatregel | Restrisico |
| --- | --- | --- |
| Een kwaadwillende beheerder koppelt het profiel van een actief lid aan een eigen account | Geweigerd als het oude account de afgelopen 30 dagen actief was; een tweede volwassen account moet bevestigen; 72 uur wachttijd; bezwaar via het oude account | Twee samenspannende volwassenen tegen een lid dat langer dan 30 dagen weg is. De schade blijft beperkt tot dat ene huishouden (profiel en gedeelde inhoud) |
| De eigenaar overnemen | R2 geldt nooit voor de eigenaar | |
| Privé-gegevens meenemen | Gaan nooit mee; die blijven van het oude account | |
| Het oude account kapen | Kan niet: het oude account wordt niet gewijzigd (adres, sessies en andere huishoudens blijven) | |
| Ongemerkt | Een mail naar het oude adres, een melding in de app van het oude account, en een auditlog | |

**Oordeel:** met deze maatregelen is R2 aanvaardbaar. Het is in feite een gewone uitnodiging met extra controles,
afgedwongen in de database. R3 (niets meer) blijft niet herstelbaar; een optionele passkey voorkomt dat.

## 6. Back-ups met aantoonbaar herstel

### 6.1 Doelen (voorstel)

| | Bèta | Commercieel |
| --- | --- | --- |
| Hoogstens verlies (RPO) | 24 uur | 2 minuten (PITR) |
| Hersteltijd (RTO) | 4 uur | 1 uur |
| Bewaren | 30 dagen | 30 tot 90 dagen, conform de privacyverklaring |

### 6.2 De tweede kopie: een eigen EU-server tegenover een beheerde oplossing

| | Eigen EU-server (VPS) | Een beheerde geplande taak (bijvoorbeeld Scaleway Serverless Jobs) | Alleen Supabase Pro |
| --- | --- | --- | --- |
| Wat | Een kleine server met cron, `pg_dump` en `age` | Een container met `pg_dump` en `age`, gestart door de dienst | Dagelijkse back-ups binnen Supabase |
| Onderhoud | **Jij**: updates, beveiliging en bewaking | Geen server; alleen het containerimage | Geen |
| Geheimen | Op de server | In de secretmanager van de dienst | Geen |
| Onafhankelijk van Supabase | Ja | Ja | **Nee**: hetzelfde account en dezelfde leverancier |
| Kosten (indicatie, te verifiëren) | ongeveer €4–6 per maand | enkele centen tot ongeveer €1 per maand | $25 per maand (Pro) |
| Oordeel | Werkt, maar extra beheer en extra aanvalsoppervlak | **Advies voor de tweede kopie** | **Advies voor de eerste kopie**, zodra er echte gegevens zijn |

In beide gevallen:
- Opslag in een EU-opslagdienst met **object lock** (30 dagen onwisbaar). Of de dienst dat ondersteunt, moet worden
  geverifieerd.
- Versleuteld met de publieke sleutel van `age`; de privésleutel staat offline, alleen bij jou.
- Een databaserol die alleen mag lezen.

**Er wordt niets geactiveerd zonder jouw akkoord.**

### 6.3 Aantoonbaar herstel

1. **Lokaal vooraf (H0, na akkoord):**
   - een export van de lokale stack, inclusief `auth`, volgens de migratiehandleiding van Supabase (rollen, schema en
     gegevens apart);
   - die terugzetten in een lege lokale stack, en dan controleren:
     - de nacontrole (`verbinding-controle.mjs na`);
     - het aantal rijen per tabel en een controlesom per tabel;
     - de RLS-matrix;
     - inloggen met een testaccount op de herstelde kopie.
   - Zo blijkt dat de export compleet is, ook `auth.users` en de verwijzingen.
2. **Elke maand:** dezelfde oefening met de echte (ontsleutelde) bèta-kopie, alleen lokaal. Daarna wordt de kopie
   gewist. De tijd tot herstel wordt gemeten.
3. **Elke dag automatisch:**
   - de export is gelukt;
   - de grootte is redelijk;
   - het bestand is geldig versleuteld;
   - het object lock is gezet.

   Bij een fout krijg jij een melding.
4. **Een logboek in de repository:** datum, uitkomst en tijd, zonder gegevens.

## 7. Plan voor de metingen op staging (niet uitgevoerd)

**Omgeving:** het stagingproject in de organisatie Thuisplanner, alleen de Auth-API. Het projectkenmerk wordt
gecontroleerd met de bestaande Huisplan-hashbewaking. Er is **geen configuratiewijziging nodig** voor S1 en S2.

| Meting | Doel | Configuratie | Impact | Terugdraaien | Grenzen |
| --- | --- | --- | --- | --- | --- |
| S0 | De versie van Auth noteren (`GET /auth/v1/health`) | Geen | Geen | Niet nodig | Alleen lezen |
| S1 | Toetst A1 en A2: na hoeveel controles volgt een 429, en hoe lang duurt de blokkade? | Geen | Jouw IP-adres kan ongeveer 5 minuten geen code laten controleren op staging. Andere gebruikers merken niets. Er gaat geen mail uit, er ontstaat geen account (alleen `/verify` met een niet-bestaand adres) | Wachten tot de blokkade voorbij is | Hoogstens 40 verzoeken; stoppen bij de eerste 429; alleen het adres `meting-…@test.invalid`; alleen de publieke anon-sleutel; het script draait op jouw computer, en jij start het |
| S2 | Toetst A3: telt IPv4 apart van IPv6? | Geen | Hetzelfde, eventueel per protocol | Wachten | Alleen als jouw verbinding IPv6 heeft. **Geen** rotatie binnen een /64; dat zou een aanval nabootsen |
| — | C6, C11, F2 | Niet nodig | | | Al aangetoond in de broncode, en lokaal gemeten |
| — | De hook en K1 | Pas in de bouwfase, met een eigen migratie en akkoord | | | |
| — | Bezorging (B6) | Bij de mailaanbieders, niet op staging | | | |

**Stopregels:**
- Een onverwacht antwoord (5xx, een antwoord met gebruikersgegevens), of meer dan 40 verzoeken: direct stoppen en
  overleggen.
- Na afloop worden geen gegevens bewaard, alleen tellingen.

## 8. Restrisico's met het advies

1. Een overgenomen mailbox geeft toegang. Dat is net zo bij wachtwoorden met "wachtwoord vergeten". Een optionele
   passkey verkleint dit later.
2. Het raden van de interne code van 10 cijfers hangt van A1 tot en met A3 af. S1 en S2 maken dat concreter.
3. Een gerichte buitensluiting van het opnieuw inloggen (§3.10). Bestaande sessies blijven werken.
4. K1 is eigen beveiligingscode in het kritieke pad. Nodig: tegenproeven, bewaking en een externe review vóór de
   commerciële start.
5. NIST beschouwt e-mail niet als sterke authenticatie (F9). Voor een consumentenapp is inloggen met een e-mailcode
   gangbaar. Een optionele passkey biedt later iets sterkers.
6. De afkoelperiode van 60 seconden in supabase-js na een netwerkstoring; opgevangen in de app.
7. De 7-dagenregel van Safari en de aparte opslag van een app op het beginscherm.
