# Thuisplanner KG-5H deel 2: laatste beveiligingscontrole en definitieve bouwscope

**Status:** 📝 ter beoordeling (17 oktober 2026). Beide controles zijn lokaal uitgevoerd en geslaagd, met de wijzigingen
in het ontwerp die hieronder staan. Er is niets geïmplementeerd, gemigreerd, gecommit, gepusht of gedeployed. Alle
meetobjecten (een schema, functies, tabellen en een hook) stonden tijdelijk in de lokale database en zijn verwijderd. De
lokale stack staat terug op de oorspronkelijke configuratie.

**Voortbouwend op:**
- `docs/thuisplanner-k1-ontwerp.md`;
- `docs/thuisplanner-review-inloggen.md`;
- `docs/thuisplanner-h0-hersteltest.md`.

## 1. Controle 1: wachtwoorden en andere routes

### 1.1 De aanval, nagespeeld in de standaardopzet van Supabase

Gemeten met bevestigen verplicht, GoTrue v2.197.0:

| # | Scenario | Uitkomst |
| --- | --- | --- |
| P1 | Vooraf kapen: de aanvaller doet `signUp(adres van het slachtoffer, eigen wachtwoord)`; het slachtoffer logt later in met een code | **Account overgenomen.** Het slachtoffer bevestigt met zijn code het adres; daarna logt de aanvaller in met zijn wachtwoord. Het wachtwoord bleef bewaard |
| P2 | De aanvaller doet `signUp` op een al bevestigd adres | Geweigerd ("User already registered"). **Maar dat verraadt dat het adres een account heeft.** Dat zit in Supabase zelf |
| P3 | Met een (gestolen) sessie een wachtwoord toevoegen, daarna overal uitloggen | **Achterdeur:** inloggen met dat wachtwoord blijft werken |
| P4 | Wat de Before User Created-hook ziet bij `signUp` met wachtwoord tegenover een code | **Precies hetzelfde** (dezelfde velden, `provider: email`, geen identiteiten). De hook kan de aanval dus niet tegenhouden |
| P5 | Een tweede `signUp` van de aanvaller op een onbevestigd adres | Maakt de openstaande code van het slachtoffer ongeldig (hinder, geen overname) |

Daarbij uit de broncode en de documentatie:
- Supabase heeft geen instelling om wachtwoorden uit te zetten terwijl code-inlog aan blijft.
- De hook die wachtwoordpogingen kan tegenhouden, bestaat alleen op Team en Enterprise.

### 1.2 Is een trigger op `auth.users` de juiste oplossing?

**Nee, niet als hoofdmaatregel.**
- De documentatie van Supabase noemt triggers op `auth.users` een ondersteund patroon (voor profielen), maar waarschuwt
  dat kolommen van `auth.users` "op elk moment kunnen veranderen". Alleen de primaire sleutel is gegarandeerd.
- Een trigger die `encrypted_password` herschrijft, hangt dus aan een kolom zonder garantie. Bij een wijziging faalt
  hij, en blokkeert hij alle aanmeldingen, of hij doet stil niets.
- Daarnaast zou hij ingrijpen in een tabel die Supabase beheert, en ook de lokale tests met wachtwoorden breken.

### 1.3 Het veiligere alternatief: een poort op de manier van inloggen (`amr`)

**Gemeten:**
- Het toegangstoken bevat de claim `amr`, met de manier van inloggen:
  - een code (ook via de `token_hash` van K1) geeft `["otp"]`;
  - een wachtwoord geeft `["password"]`;
  - beide blijven zo na het vernieuwen van het token.
- De claim is gedocumenteerd, als optionele claim, met de vaste waarden `password`, `otp`, `totp`, `oauth`, `magiclink`
  en andere.

**Ontwerp:**
- Eén functie `private.code_sessie()` geeft alleen true als `amr` `otp` bevat en verder niets anders dan `otp` of
  `totp`.
- **Ontbreekt de claim, dan false** (fail-closed). Verandert er ooit iets bij Supabase, dan wordt alles geweigerd en
  zien we dat meteen; het staat nooit stil open.
- Die controle komt in de bestaande toegangsfuncties, waar RLS, de RPC's en Realtime al op leunen:
  - `require_uid`;
  - `my_household_ids` en `my_memberships`;
  - `is_active_member`;
  - `has_role`;
  - `may_listen`.

**Bewezen met echte tokens, op een tijdelijk prototype:**

| Sessie | Uitkomst |
| --- | --- |
| Het slachtoffer, met een code | toegelaten |
| De aanvaller, met een wachtwoord (P1) | **geweigerd** ("Log in met een code") |
| Idem, na het vernieuwen van het token | **geweigerd** |
| Het achterdeurwachtwoord na overal uitloggen (P3) | **geweigerd** |
| Het slachtoffer, opnieuw met een code | toegelaten |
| Zonder sessie | geweigerd |
| **Ter vergelijking, de huidige RLS zonder poort** | **De wachtwoordsessie van de aanvaller ziet het huishouden.** Dat gat zit nu ook op staging, waar testers met een wachtwoord inloggen. De poort komt dus mee met deel 2 |

**Extra, ondersteunde hygiëne:**
- Bij het bevestigen van een nieuw adres overschrijft K1 het wachtwoord met een onbekende waarde, via de Admin-API
  (`updateUserById`). **Gemeten:** daarna werkte geen enkel wachtwoord van de aanvaller meer.
- Eenmalig, bij de overgang van staging en bèta naar codes: voor alle bestaande accounts hetzelfde, met een script.
- Bestaande wachtwoordaccounts zijn dan geen achterdeur meer: hun wachtwoord is weg, en een nieuw wachtwoord levert
  alleen een geweigerde sessie op.

**Onderhoudbaarheid:**
- De poort steunt op een gedocumenteerde claim van het token, niet op een kolom van een tabel die Supabase beheert.
- Er is één functie met tests en tegenproeven: zonder de poort moet P1 slagen. Bij elke nieuwe versie van de CLI of Auth
  draaien die tests.
- De nacontrole leest `/auth/v1/settings`.
- De lokale testaccounts met een wachtwoord: een instelling `wachtwoordsessies_toegestaan` in `private`, standaard
  **uit**. Alleen het lokale seedscript zet hem aan. De nacontrole eist "uit" op staging en bèta.

**Wat blijft:**
- P2 (signUp verraadt een bestaand account) zit in Supabase. Turnstile op `/signup` maakt dat per poging duur.
- P5 (een openstaande code ongeldig maken) beperkt zich tot hinder: een nieuwe code is nodig. Het wordt geremd door 60
  seconden, Turnstile en de limiet per adres.

## 2. Controle 2: bekende toestellen en pogingentellers

### 2.1 Een bekend toestel herkennen en beveiligen

- **Ontstaan:** **alleen** na een geslaagde codecontrole. `controleer-code` geeft dan naast de `token_hash` een nieuw
  toestel-token (32 willekeurige bytes). Zonder juiste code bestaat er geen manier om er een te krijgen.
- **Opslag:**
  - Op het toestel: in `localStorage`, per account. Het gaat mee in de body van de POST, dus geen cookie en geen
    CSRF-risico.
  - In de database: alleen een HMAC met een geheime pepper, gekoppeld aan het adres.
- **Rotatie:** bij elke geslaagde inlog krijgt het toestel een nieuw token en vervalt het oude.
- **Hoogstens 5 actieve toestellen per account;** het oudste vervalt. Ze vervallen ook bij:
  - "Uitloggen op alle toestellen";
  - een adreswijziging;
  - herstel;
  - 180 dagen zonder gebruik.
- **Bewust niet gekoppeld aan IP-adres of browser.** Mobiele netwerken wisselen voortdurend van IP-adres.
- **Wat een gestolen toestel-token waard is:** het opent nooit een account. Het geeft alleen de pogingen van dat ene
  toestel (D), binnen de harde grens, tot de volgende rotatie of intrekking.

### 2.2 De tellers

- Een poging is één controle van een code. **De code wordt alleen bekeken als er vooraf een plek is gereserveerd.**
- Het account wordt eerst vergrendeld (`FOR UPDATE`), zodat alle pogingen voor één adres na elkaar lopen, hoeveel
  toestellen of IP-adressen er ook zijn.

| Grens | Waarde | Geldt voor |
| --- | --- | --- |
| **H: harde grens per account** | 100 per 24 uur | Alle pogingen samen: bekend, onbekend en elk aantal IP-adressen |
| U: onbekende context | 30 per 24 uur | Alle onbekende toestellen en IP-adressen samen, als **één emmer** |
| D: per bekend toestel | 10 per 24 uur | Elk bekend toestel apart |
| Per code | 5 | Daarna vervalt de code (K1-ontwerp §5) |
| M: actieve toestellen | 5 | Per account |

**Ingebouwde regel:** H ≥ U + M × D (100 ≥ 30 + 5 × 10). Een aanvaller zonder toestel-token kan dus nooit de harde grens
opmaken. De bekende toestellen van de echte gebruiker blijven altijd werken.

### 2.3 Bewijs (tijdelijk prototype in de lokale database, met gelijktijdige verzoeken)

| # | Aanval | Uitkomst |
| --- | --- | --- |
| T1/T5 | 5.000 **gelijktijdige** pogingen, elk met een ander verzonnen toestel-token (of geen) | **Precies 30** codes bekeken, 4.970 geremd: verzonnen toestellen vallen allemaal in de ene onbekende emmer |
| T2 | Kan de aanvaller zo bekende toestellen maken? | Nee: daarna nog steeds precies de 2 toestellen van het slachtoffer |
| T3 | Het slachtoffer logt in met een bekend toestel terwijl de onbekende emmer vol is | Lukt |
| T3b | Het oude token na rotatie | Telt als onbekend, dus geremd |
| T4 | 2.000 gelijktijdige pogingen met **gestolen** toestel-tokens plus onbekend, met de harde grens op 40 gezet | Het totaal blijft **precies 40**: de harde grens houdt, ongeacht het aantal toestellen |
| T6 | Het toestel-token van een ander account | Geen eigen emmer bij dit adres |
| T7 | Na het venster van 24 uur | Weer pogingen mogelijk |

**Wat het prototype niet aantoont** (komt in de bouwtests van K1):
- de echte HMAC-vergelijking van de code;
- de Edge Functions zelf;
- de invloed op de reactietijd.

5.000 gelijktijdige pogingen voor één adres kostten lokaal ongeveer 5 seconden, door de vergrendeling. Voor één adres
is dat de bedoeling.

## 3. Conclusie van de controles

Beide controles zijn geslaagd, met twee wijzigingen in het ontwerp:
1. Geen trigger op `auth.users`, maar de **`amr`-poort** in de toegangsfuncties, plus het overschrijven van
   wachtwoorden via de Admin-API.
2. De pogingentellers zoals in §2: een harde grens per account, één emmer voor alles wat onbekend is, toestellen alleen
   na een geslaagde code.

Daarmee is voor de gebruiker niets veranderd: e-mailadres, zes cijfers, ingelogd.

## 4. Definitieve bouwscope deel 2

### 4.1 Nodig vóór externe testers

| # | Onderdeel | Kern | Acceptatie |
| --- | --- | --- | --- |
| 1 | **K1: de codelaag** | De hook `stuur-code`, de functie `controleer-code`, tabellen, tellers (§2), toestellen, de noodstop voor codes, het opruimen van onbevestigde accounts | K1-ontwerp AC-1 tot en met AC-27, plus T1–T7 uit §2.3 als vaste tests |
| 2 | **De `amr`-poort** | `private.code_sessie()` in alle toegangsfuncties; de instelling voor lokale wachtwoorden; het overschrijven van wachtwoorden bij bevestigen; het eenmalige script voor bestaande accounts | P1 en P3 als tests met tegenproef; de RLS-matrix uitgebreid; alle bestaande suites groen |
| 3 | **Instellingen van Supabase Auth**, als checklist en automatisch nagekeken | Alleen e-mail; bevestigen aan; interne code van 10 cijfers, 600 s; Turnstile; secure email change; beide hooks; telefoon, providers, anoniem, SAML en passkeys uit | De nacontrole leest `/auth/v1/settings` en faalt bij een afwijking |
| 4 | **Het codescherm in de app** | Adres → 6 vakjes (`autocomplete="one-time-code"`, plakken, automatisch verder) → ingelogd. Een aftelling; hulp bij een code die niet aankomt; M1 (het scherm vergeet je niet); M2 (het adres zichtbaar) | Een e2e met Mailpit; een nieuwe gebruiker in **hoogstens 9 handelingen** tot "Naar Vandaag" (gemeten in de e2e) |
| 5 | **De naam één keer vragen (D5)** | `profiles.display_name`, overal voorgesteld | Een uitnodiging accepteren in 2 tikken |
| 6 | **Sessies op mobiel** | Nooit uitloggen door een netwerkfout; omgaan met de afkoeling van 60 s; "Uitloggen" en "Uitloggen op alle toestellen" (trekt ook de toestellen in) | De regressietests S1/S2 en T21–T24 |
| 7 | **Testpoort G1 en registratie** | Een eigen huishouden alleen voor de testerslijst, of als de registratie open staat. Bij een gesloten registratie hetzelfde antwoord, met een uitlegmail | RLS-scenario's; AC-20 |
| 8 | **Drie noodstops** | Registratie; codes; sessies (sessiecontrole in de toegangsfuncties, plus een onderhoudsschakelaar) | Elke noodstop een test met tegenproef |
| 9 | **Adres wijzigen** | Twee eigen codes; de andere sessies en toestellen uit; een melding naar het oude adres; hoogstens één keer per 7 dagen | AC-8 |
| 10 | **De uitnodigingsmail (D6)** | Zonder geheim; een wachtrij in de database; idempotent; een status voor de uitnodiger; een daglimiet | De tests T16–T18 |
| 11 | **Het domein en de mailaanbieder** (B7 en B6; door jou, met mijn meetscript) | SPF, DKIM en DMARC; de vergelijking van hoogstens 3 aanbieders | 95% binnen 30 s, niets in de spam |
| 12 | **De bèta-omgeving** (B1) | Eigen Supabase- en Pages-projecten; de buildmodus `beta`; staging blijft achter Access | De buildbewaking (T20) en de nacontrole |
| 13 | **Back-ups voor echte gegevens** (B2) | Pro (dagelijks), plus een tweede versleutelde kopie elders met de controle op alle tabellen (H0-1), plus de eerste hersteloefening | Een hersteloefening zoals H0, op de echte omgeving |
| 14 | **Privacyverklaring en bewaking** | Doelen, bewaartermijnen en verwerkers; een dagoverzicht van codes en pogingen | Gepubliceerd vóór de eerste tester |

### 4.2 Kan veilig later

| Onderdeel | Waarom het kan wachten | Uiterlijk |
| --- | --- | --- |
| R1 (herstel met passkey) en de volledige R2 | De bèta heeft de veilige variant via een gewone uitnodiging | Vóór de commerciële start |
| Passkeys als extra route | Codes werken overal; passkeys maken alleen sneller en sterker | Na de bèta |
| Google en Apple | Niet bewezen; Apple vraagt een Developer-account | Apart besluit |
| Een tweede mailaanbieder als reserve | Bij een storing blijft ingelogd werken; alleen nieuwe inlogs wachten | Vóór de commerciële start |
| De kaart voor het beginscherm (D7) | Optioneel, en onderbreekt niets | Na de eerste testronde |
| De knop "Open je mail" | Klein gemak | Later |
| PITR (herstel tot op de seconde) | Dagelijks volstaat voor de bèta | Bij betalende klanten |
| De externe review van K1 (AC-28) | Nodig vóór de lancering, niet voor vrienden en kennissen | Vóór de commerciële start |
| S1/S2 op staging | Alleen als Supabase de IP-limiet niet schriftelijk bevestigt | Vóór de bèta, of eerder als dat antwoord uitblijft |
| KG-5E (offline en de opslag-interface) | Een eigen spoor; deel 2 leunt er niet op | Volgens de roadmap |

### 4.3 Volgorde en akkoordmomenten

1. **Jouw akkoord op deze bouwscope.**
2. **Lokaal bouwen** in kleine, afgeronde commits, elk met de eigen tests groen:
   1. de `amr`-poort, met de RLS-matrix, tegenproeven en P1/P3;
   2. K1 (eerst de database: tabellen en tellers; dan de twee functies; dan AC-1 tot en met AC-27);
   3. het codescherm, D5 en de sessies;
   4. de noodstops en G1;
   5. adres wijzigen;
   6. de uitnodigingsmail.
3. Parallel, door jou: het domein en de vergelijking van de aanbieders (11).
4. **Apart akkoord:** de bèta-omgeving en de back-ups (12 en 13); kosten vanaf Pro.
5. **Apart akkoord:** staging bijwerken met `-Bijwerken` en de nacontrole, de app pushen, een smoketest.
6. **Apart akkoord:** doorzetten naar de bèta, jouw proef op echte toestellen, de privacyverklaring, en daarna de
   eerste externe testers.

**Stopcriteria:** een geslaagde tegenproef (een sabotage die niet wordt opgemerkt), een gevonden lek van een token, een
mislukte hersteloefening of een gedeeltelijke export: dan stoppen en overleggen.
