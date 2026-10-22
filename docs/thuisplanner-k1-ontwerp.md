# Thuisplanner K1: eigen codelaag voor wachtwoordloos inloggen (afgebakend ontwerp)

**Status:** 📝 ontwerp ter beoordeling (17 oktober 2026). Akkoord om het ontwerp uit te werken; **geen** akkoord op de
implementatie. Er is niets gebouwd, gemigreerd, gecommit of gedeployed.

**Basis:**
- de review `docs/thuisplanner-review-inloggen.md`;
- de metingen in `docs/thuisplanner-registratie-inloggen.md` §20;
- de hersteltest `docs/thuisplanner-h0-hersteltest.md`.

**Voor de gebruiker verandert niets:** e-mailadres invullen, zes cijfers invullen, ingelogd. Een uitnodiging op dat
adres verschijnt direct (deel 1b); gezinsleden koppelen gaat daarna vrijwel vanzelf.

**Bewijsniveaus:**
- **[getest]**: lokaal aangetoond.
- **[bron]**: gelezen in de broncode of de officiële documentatie.
- **[aanname]**: nog niet aangetoond.
- **[bouwtest]**: wordt pas bij de bouw aangetoond; staat als acceptatiecriterium in §11.

## 1. Afbakening

**Binnen K1:**
- codes aanvragen, versturen en controleren voor `signup`, `magiclink`, `email_change` en `reauthentication`;
- het afsluiten van alle andere routes naar een sessie;
- limieten en wachttijden;
- de noodstop voor codes;
- logboek en bewaking.

**Buiten K1** (eigen plan en akkoord):
- het codescherm in de app (deel 2);
- de uitnodigingsmail (D6);
- R1 en R2 (herstel);
- passkeys;
- de keuze van de mailaanbieder (B6);
- de bèta-omgeving.

## 2. Hoe het werkt

1. De app: `signInWithOtp({ email, options: { shouldCreateUser: true, captchaToken } })`. Supabase controleert Turnstile
   [getest, C10], maakt bij een nieuw adres een onbevestigd account aan, en maakt een **interne code van 10 cijfers**
   [getest, N6].
2. Supabase roept de **Send Email-hook** aan: de HTTP-functie `stuur-code`. Supabase verstuurt die mail dan zelf niet
   [bron]. De hook krijgt:
   - het soort actie;
   - de interne code;
   - de `token_hash` (56 tekens);
   - het adres [getest, N4].
3. `stuur-code`:
   - controleert de handtekening van het verzoek (Standard Webhooks);
   - controleert de noodstop en de limieten (§6);
   - maakt een **eigen code van 6 cijfers**;
   - bewaart alleen de HMAC daarvan en de **versleutelde** `token_hash`;
   - verstuurt de mail met alleen de 6 cijfers via de API van de aanbieder.

   De interne code en de `token_hash` verlaten de functie nooit.
4. De gebruiker typt de 6 cijfers in de app. De app roept `controleer-code` aan, met het adres en de code in de body van
   een POST.
5. `controleer-code` controleert in één atomaire stap (§5). Pas bij een goede code geeft de functie de ontsleutelde
   `token_hash` terug, in de body van het antwoord.
6. De app: `verifyOtp({ token_hash, type })`. **Supabase zelf geeft de sessie uit** aan de app [getest, N5]. Bij een
   nieuw adres zet die stap ook `email_confirmed_at`. De `token_hash` werkt precies één keer [getest, N5].

Onze functies zien nooit een access- of refresh-token.

## 3. Beveiligingscontrole

### 3.1 Kan iemand de eigen codecontrole omzeilen via de standaard Auth-endpoints?

Alle openbare routes van Supabase Auth die tot een sessie of een bevestigd adres kunnen leiden:

| Route | Risico zonder maatregel | Maatregel in K1 | Bewijs |
| --- | --- | --- | --- |
| `POST /verify` met adres en de **interne** code | Raden van 10 cijfers | Alleen begrensd per IP; de code bestaat alleen na een aanvraag (Turnstile plus onze limieten); zie §8 | Begrenzing per IP [bron]; op de gehoste omgeving [aanname A1–A3] |
| `POST /verify` of `GET /verify` met een `token_hash` | Raden van 224 bits | Onbegonnen werk; de `token_hash` lekt nergens (§3.3) | [getest, N5] eenmalig |
| `POST /signup` met **wachtwoord** | **Vooraf kapen van een account:** een aanvaller maakt een account op het adres van het slachtoffer, met een eigen wachtwoord. Logt het slachtoffer later met een code in, dan wordt het adres bevestigd en kan de aanvaller met zijn wachtwoord binnen | **Wachtwoorden structureel onmogelijk:** een trigger op `auth.users` (zoals de bestaande verwijdertrigger) maakt `encrypted_password` bij elke insert en update leeg. Daarnaast weigert de hook `signup` met een wachtwoord, als de payload dat laat zien [aanname] | [bouwtest] AC-3 |
| `POST /token?grant_type=password` | Inloggen met een wachtwoord | Kan niet: er bestaan geen wachtwoorden (hierboven) | [bouwtest] AC-3 |
| `PUT /user` met een wachtwoord | Een wachtwoord toevoegen aan een bestaand account | Dezelfde trigger | [bouwtest] AC-3 |
| `POST /recover` ("wachtwoord vergeten") | Een herstelcode geeft een sessie | De hook **weigert** `recovery`: er gaat geen mail uit, en een nette melding volgt. De interne herstelcode valt onder §8 | [bouwtest] AC-4 |
| `POST /otp` met een telefoonnummer, of `POST /token` met een id-token | Inloggen met sms, of met een andere provider | Telefoon, alle externe providers, SAML/SSO, Web3 en anonieme accounts **uit** | [getest]: lokaal staat alleen e-mail aan (`/auth/v1/settings`). [bouwtest] AC-5: de nacontrole leest `/settings` en faalt bij iets anders |
| `GET /authorize` (OAuth) | Idem | Idem | Idem |
| `POST /resend` | Een nieuwe mail | Loopt via de hook en onze limieten | [bouwtest] AC-6 |
| `POST /reauthenticate` | Een herbevestiging | Via de hook met een eigen code. Wordt alleen gebruikt bij het wijzigen van het adres (wachtwoorden bestaan niet) | [bouwtest] AC-7 |
| `PUT /user` met een nieuw e-mailadres | Adres wijzigen | Via de hook: twee eigen codes (oud en nieuw). De payload heeft omgekeerde hashes [bron]. Beide moeten kloppen [getest, W1–W3, met de codes van Supabase zelf] | [bouwtest] AC-8 |
| Admin-endpoints (`/admin/*`, `/invite`) | Alles | Alleen met de service-sleutel, alleen op de server. Nooit in de frontend of in GitHub (bestaande regel en bewaking) | Bestaande controles |
| Passkeys (`passkeys_enabled` in `/settings`) | Een onbekende route | **Uit**, tot een eigen besluit; de nacontrole controleert dat | [getest]: de sleutel bestaat in v2.197.0. Het gedrag is [aanname] |

**Conclusie:** omzeilen kan alleen via het raden van de interne code van 10 cijfers (§8). Alle andere routes zijn
afgesloten of lopen via de hook. **Nieuw gevonden:** zonder de wachtwoordtrigger is het vooraf kapen van een account
mogelijk. Dat geldt ook voor de huidige standaardopzet van Supabase met codes, als wachtwoorden niet uitgeschakeld zijn.

### 3.2 Zijn alle andere aanmeld- en herstelroutes afgedekt?

Ja, volgens de tabel in §3.1. Die lijst is opgesteld uit de routes in `api.go` [bron]. Bij elke nieuwe versie van
Supabase Auth komt er een controle:
- de nacontrole leest `/auth/v1/settings` en weigert elke ingeschakelde route die niet op de toegestane lijst staat;
- een lijsttest vergelijkt de routes uit `api.go` met deze tabel.

Herstel via R1 en R2 valt buiten K1, met een eigen ontwerp en akkoord.

### 3.3 Is de `token_hash` alleen beschikbaar na een geslaagde controle, zonder te lekken?

| Plek | Maatregel | Bewijs |
| --- | --- | --- |
| Mail | Alleen de 6 cijfers. Geen `{{ .ConfirmationURL }}` en geen link met een token; de knop gaat naar de app zonder geheim | [bouwtest] AC-9: de inhoud van de mail in Mailpit |
| URL | De app geeft de `token_hash` alleen in de body van `verifyOtp` (POST /verify), nooit in een URL; `detectSessionInUrl` staat uit (staat al) | [bouwtest] AC-10: een netwerkopname in de e2e |
| Logboeken van de Edge Functions | Geen logging van de payload, de code, de `token_hash` of het adres. Alleen een id, het soort actie en de uitkomst | [bouwtest] AC-11: zoeken in de logboeken (lokaal: de containerlogboeken) op elke gebruikte `token_hash` en code; verwacht 0 treffers |
| Logboeken van Supabase Auth zelf (de hookaanroep) | Of Auth de payload of het antwoord van de hook logt | **[aanname]** → AC-11 dekt ook de container van Auth |
| Database | AES-256-GCM, met de sleutel alleen in de secrets van de Edge Function; de tabel in `private` (geen API-toegang); wissen na gebruik of na 10 minuten | [bouwtest] AC-12 |
| Foutmeldingen | Vaste teksten met een stabiele code. Nooit een `sqlerrm`, stacktrace of payload in het antwoord | [bouwtest] AC-13 |
| Antwoord van `controleer-code` | De `token_hash` **alleen** bij een goede code; bij elke andere uitkomst hetzelfde foutantwoord, zonder `token_hash` | [bouwtest] AC-14, met tegenproef |
| De app | Alleen in het geheugen, direct doorgegeven aan `verifyOtp`; nooit in `localStorage`, `sessionStorage` of een logboek | [bouwtest] AC-10 |

### 3.4 Zijn de limieten effectief, ook bij gelijktijdige verzoeken en veel IP-adressen?

- **Per code (5 pogingen):** het verhogen en controleren gebeurt in **één `UPDATE … WHERE pogingen < 5 RETURNING`**. De
  rijvergrendeling van PostgreSQL zet gelijktijdige pogingen achter elkaar; de zesde krijgt geen rij terug.
- **Precies één keer gebruiken:** een tweede atomaire `UPDATE … WHERE status = 'actief'`. Van twee gelijktijdige goede
  pogingen krijgt er één de `token_hash`.
- **Per account:** een teller-rij per `adres_hmac`, bijgewerkt met `INSERT … ON CONFLICT DO UPDATE … RETURNING`, ook
  atomair.
- **Aanvragen per adres:** idem, in `stuur-code`.
- **Veel IP-adressen:** alle limieten zijn gekoppeld aan het **adres**, niet aan het IP-adres. Meer IP-adressen helpen
  dus niet bij het raden van de 6 cijfers. Alleen het raden van de interne code (§8) hangt van IP-limieten af.

**Bewijs:** [bouwtest] AC-15 tot en met AC-17:
- 50 gelijktijdige foute pogingen: precies 5 geteld, en de code vervalt;
- 10 gelijktijdige goede pogingen: precies één `token_hash`;
- 20 gelijktijdige aanvragen: hoogstens de limiet.

Met een tegenproef: zonder de voorwaarde in de `UPDATE` moet AC-15 falen.

### 3.5 Hoe voorkomen we dat aanvallers legitieme gebruikers steeds blokkeren?

**Uitgangspunt:** we blokkeren nooit een account. We remmen alleen het **opnieuw inloggen met een code** af. Bestaande
sessies en alle gegevens blijven altijd werken.

| Aanval | Gevolg zonder maatregel | Maatregel | Restant |
| --- | --- | --- | --- |
| Een code "opbranden" met 5 foute pogingen | De code van het slachtoffer vervalt | Het slachtoffer vraagt een nieuwe aan; die heeft weer 5 pogingen. Na 2 fouten op één code vraagt `controleer-code` om Turnstile, dus opbranden kost de aanvaller per code een oplossing | De aanvaller moet de nieuwe code van het slachtoffer op tijd opbranden en weet niet wanneer die komt |
| De wachttijd per account opbouwen (10, 20 of 30 fouten) | Het slachtoffer kan 15 minuten tot 24 uur niet opnieuw inloggen | **Een bekend toestel:** na elke geslaagde inlog krijgt het toestel een willekeurig toestel-id (alleen een hash in de database). Pogingen en aanvragen met een bekend toestel-id hebben een **eigen** teller, los van de wachttijd door fouten van anderen | Een **nieuw** toestel van het slachtoffer valt tijdens een lopende aanval wel onder de wachttijd. Het slachtoffer krijgt een mail ("Er wordt geprobeerd in te loggen; je bestaande toestellen werken gewoon") |
| De daglimiet voor het versturen opmaken | Het slachtoffer krijgt geen code meer | Ook per toestel gescheiden: aanvragen met een bekend toestel-id hebben een eigen tegoed. Onbekende aanvragen boven de limiet vragen een zichtbare Turnstile-controle in plaats van een harde weigering | Idem |
| Mailbombardement | Veel mail naar het slachtoffer | De limiet per adres, Turnstile, en de stroomonderbreker per project | Hoogstens enkele mails per kwartier |

Een toestel-id is geen geheim dat een account opent. Het bepaalt alleen in welke teller iemand valt. Lekt het, dan krijgt
de aanvaller alleen de normale limieten van dat toestel, nooit een sessie.

### 3.6 Worden nieuwe en bestaande accounts gelijk behandeld, zonder adresverraad?

| Punt | Hoe | Bewijs |
| --- | --- | --- |
| Antwoord bij het aanvragen | Supabase geeft voor een nieuw en een bestaand adres hetzelfde antwoord | [getest, C4] |
| Duur bij het aanvragen | Een nieuw adres duurt langer (352 tegenover 190 ms lokaal), omdat Supabase het account aanmaakt | [getest, C4]. **Restrisico.** Het verschil zit in Supabase en is niet weg te poetsen. Het verraadt alleen of er al een account bestaat, niet meer |
| `shouldCreateUser: false` | Nooit gebruiken; die verraadt een onbekend adres | [getest, C5]; [bouwtest] AC-18 |
| Mail | Eén sjabloon voor `signup` en `magiclink`, met dezelfde tekst | [bouwtest] AC-9 |
| Controleren | Eén foutantwoord voor fout, verlopen, geen code of onbekend adres. Ook zonder code wordt een HMAC berekend, zodat de duur gelijk blijft | [bouwtest] AC-19 |
| Limieten | Gekoppeld aan het adres, niet aan een account: ze bestaan ook voor een adres zonder account | Ontwerp |
| Noodstop registratie | **Niet** de schakelaar van Supabase (die verraadt een onbekend adres, [getest, N1]). Bij een gesloten registratie antwoordt de hook voor `signup` **hetzelfde** als bij succes, maar stuurt een mail "Thuisplanner is nog in een besloten test". De rechtmatige eigenaar van het adres krijgt zo uitleg; een buitenstaander ziet niets anders | [bouwtest] AC-20 |
| Onbevestigde accounts van misbruik | Na 24 uur zonder bevestiging verwijderd | [bouwtest] AC-21 |
| Na het inloggen | De testpoort (G1) en "geen huishouden" zie je alleen over je **eigen** account | Bestaande RLS |

## 4. Codes maken

- 6 cijfers via `crypto.getRandomValues`, met rejection sampling: elke waarde van 000000 tot en met 999999 is even
  waarschijnlijk.
- Hoogstens één actieve code per adres. Een nieuwe aanvraag zet de vorige op `vervangen` (een gedeeltelijke unieke
  index). Dat volgt Supabase: daar maakt een nieuwe code de vorige ook ongeldig [getest, C9].
- Geldig: 10 minuten, en de interne code van Supabase ook (`otp_expiry = 600`).

## 5. Opslaan, controleren en ongeldig maken

**Tabel `private.k1_codes`:**
- `id`
- `adres_hmac`
- `code_hmac` (= HMAC(pepper, id ‖ code))
- `token_hash_enc` (AES-256-GCM)
- `soort`
- `pogingen`
- `status`: `actief`, `gebruikt`, `vervallen` of `vervangen`
- `gemaakt`, `verloopt`, `gebruikt_op`

**Tabel `private.k1_tellers`**, per `adres_hmac`, en apart per bekend toestel:
- mislukte pogingen achter elkaar;
- aanvragen per venster;
- "geremd tot".

**Controleren:**
1. `UPDATE k1_codes SET pogingen = pogingen + 1 WHERE adres_hmac = $1 AND status = 'actief' AND verloopt > now() AND pogingen < 5 RETURNING …`
2. De HMAC vergelijken in constante tijd.
3. Bij een fout: de teller per account en per toestel verhogen; bij de 5e fout `status = 'vervallen'`.
4. Bij een goede code: `UPDATE … SET status = 'gebruikt' WHERE id = $1 AND status = 'actief' RETURNING token_hash_enc`.
   Daarna gaan de mislukte pogingen terug naar 0.
5. Ontsleutelen en teruggeven.

**Ongeldig maken:** een code vervalt bij gebruik, na 5 fouten, bij een nieuwe code, na 10 minuten, of door de noodstop
(alle actieve codes op `vervallen`). Een opruimtaak wist rijen na 24 uur.

**Sleutels wisselen:** pepper en versleutelsleutel zijn secrets. Na een wissel vervallen de actieve codes; dat geeft
hooguit 10 minuten hinder.

## 6. Limieten (startwaarden, instelbaar in één tabel)

| Wat | Waarde |
| --- | --- |
| Pogingen per code | 5 |
| Turnstile bij het controleren | Na 2 fouten op dezelfde code |
| Aanvragen per adres (onbekend toestel) | 3 per 15 minuten en 10 per dag; daarboven een zichtbare Turnstile |
| Aanvragen per adres (bekend toestel) | Een eigen tegoed: 3 per 15 minuten |
| Wachttijd per account door mislukte pogingen (onbekend toestel) | Na 10: 15 minuten, na 20: 1 uur, na 30: 24 uur plus een mail. Een geslaagde inlog zet terug |
| Stroomonderbreker per project | Bij meer dan X aanvragen per uur (instelbaar) alleen nog adressen met een bevestigd account, en een melding aan de beheerder |
| Noodstop codes | Eén schakelaar; direct, zonder herstart [getest, N3] |

## 7. Storingen

| Storing | Gedrag | Bewijs |
| --- | --- | --- |
| De aanbieder reageert niet binnen ongeveer 2 s | Een tweede aanbieder, of anders een nette fout binnen de 5 s van de hook; de app toont "Versturen lukt nu niet" | Foutdoorgifte van de hook [getest, N3]; de terugval [bouwtest] AC-22 |
| `controleer-code` valt uit | Niemand kan **opnieuw** inloggen; wie ingelogd is, merkt niets | Bewaking [bouwtest] AC-23 |
| De database valt uit | Alles ligt stil, zoals nu | |
| Een netwerkstoring op de telefoon | Nooit uitloggen door een netwerkfout; omgaan met de afkoeling van 60 s in supabase-js | [getest, S1 en S2]; [bouwtest] AC-24 |

## 8. Restrisico: het raden van de interne code van 10 cijfers

De interne code bestaat alleen na een aanvraag (Turnstile, plus onze limiet van hoogstens 10 per dag van elk 10
minuten), dus hoogstens 100 minuten per dag per adres.

| Aanname over de gehoste omgeving | Gokken per dag (bij 100 minuten blootstelling) | Kans per dag (op 10¹⁰) |
| --- | --- | --- |
| Een limiet per IP van 30 per 5 minuten, 100 IP-adressen | 60.000 | 0,0006% |
| Geen werkende limiet; de aanvaller haalt 100 per seconde | 600.000 | 0,006% |
| Geen werkende limiet; de aanvaller haalt 1.000 per seconde | 6.000.000 | 0,06% |

Bij elke aanvraag krijgt het slachtoffer een mail. Na de daglimiet volgt alleen nog een zichtbare Turnstile-controle.

## 9. Zijn de stagingmetingen S1 en S2 nodig?

**Voor de keuze van K1: nee.**
- K1 is in elk scenario veiliger dan de standaardopzet.
- De 6 cijfers van de gebruiker hangen niet van IP-limieten af (§3.4).

**Wel van belang voor één restrisico:** het raden van de interne code (§8). Ook in het slechtste scenario (geen werkende
limiet) blijft dat in dezelfde orde als de kans van de gebruikerscode zelf (0,004% per dag). S1 verandert het ontwerp
dus niet, alleen de grootte van een restrisico in de risicoafweging.

**Advies:**
- S1 en S2 nu **niet** uitvoeren.
- Eerst schriftelijk vragen aan Supabase hoe `/verify` op de gehoste omgeving per IP wordt begrensd, en hoe IPv6 wordt
  geteld (via de documentatie of support; geen wijziging).
- Pas als dat antwoord ontbreekt of onduidelijk is, S1 als acceptatiestap vóór de bèta, volgens het plan in de review
  §7.

## 10. NIST SP 800-63B: precies wat wel en niet geldt

- **Status:** NIST SP 800-63B is een richtlijn voor Amerikaanse overheidsdiensten. Thuisplanner valt er niet onder.
  **We claimen geen NIST-conformiteit**, en zeker niet voor inloggen met een e-mailcode.
- **Inloggen met een e-mailcode is in NIST-termen geen erkende authenticator.**
  - §3.1.3.1: e-mail mag niet als out-of-band-authenticator worden gebruikt.
  - Bevestigingscodes voor het valideren van een adres of voor herstel vallen daar uitdrukkelijk buiten. Dat is ook
    niet wat wij doen: wij loggen in met de code.
  - Er is dus geen NIST-niveau (AAL) dat onze inlog haalt. Wie een NIST-niveau nodig heeft, heeft passkeys of een andere
    erkende authenticator nodig.
- **Wat we wel gebruiken:** een paar concrete eisen uit 63B als **ontwerpmaat**, zonder een claim:
  - een geheim van minstens 6 cijfers uit een goedgekeurde willekeurige bron (§3.1.3.2);
  - hoogstens 10 minuten geldig, en één keer bruikbaar (§3.1.3.2);
  - hoogstens 100 mislukte pogingen achter elkaar per authenticator, en een nieuwe code zet de teller niet terug
    (§3.2.2);
  - afremmen met een captcha en oplopende wachttijden, en terugzetten na een geslaagde inlog (§3.2.2).
- **Wat we daarom in teksten schrijven:** "volgens de aanbevelingen voor eenmalige codes (onder meer NIST SP 800-63B
  §3.1.3.2 en §3.2.2) ontworpen", nooit "NIST-conform" of "voldoet aan NIST".

## 11. Acceptatiecriteria (alle lokaal aan te tonen vóór staging; elk met een tegenproef waar dat kan)

| # | Criterium |
| --- | --- |
| AC-1 | Het hele pad werkt lokaal: adres, 6 cijfers, ingelogd; een nieuw adres is daarna bevestigd; een uitnodiging op dat adres verschijnt direct (deel 1b) |
| AC-2 | Een uitnodiging accepteren kost na het inloggen hoogstens 2 tikken ("Accepteren", "Naar Vandaag"); met D5 hoeft de naam niet te worden ingevuld |
| AC-3 | Geen wachtwoorden: een `signup` met wachtwoord, `updateUser({ password })` en een directe update van `auth.users` laten `encrypted_password` leeg; inloggen met een wachtwoord faalt. Het vooraf-kapen-scenario wordt nagespeeld en faalt |
| AC-4 | `recovery` geeft geen mail en geen sessie |
| AC-5 | De nacontrole leest `/auth/v1/settings`. Alleen e-mail staat aan; telefoon, externe providers, anoniem, SAML en passkeys staan uit; `mailer_autoconfirm` is false. Anders faalt de controle |
| AC-6 | `resend` volgt dezelfde limieten |
| AC-7 | `reauthenticate` werkt met een eigen code |
| AC-8 | Adres wijzigen: beide eigen codes nodig; hetzelfde account; de andere sessies uitgelogd; een melding naar het oude adres |
| AC-9 | De mail bevat alleen de 6 cijfers: geen link met een token, geen interne code; dezelfde tekst voor een nieuw en een bestaand adres |
| AC-10 | De `token_hash` komt nooit in een URL, `localStorage`, `sessionStorage` of de console (e2e met een netwerkopname) |
| AC-11 | Zoeken in alle containerlogboeken (Edge Functions en Auth) op de gebruikte `token_hash`, de interne code en de 6 cijfers: 0 treffers |
| AC-12 | Met alleen de database (zonder de secrets) is geen sessie te halen: de `token_hash` is versleuteld en de code is een HMAC |
| AC-13 | Foutantwoorden bevatten geen interne details (een lijst van alle foutpaden) |
| AC-14 | De `token_hash` alleen bij een goede code (tegenproef: zonder die voorwaarde faalt de test) |
| AC-15 | 50 gelijktijdige foute pogingen: precies 5 geteld, de code vervalt; de zesde en latere krijgen het algemene foutantwoord |
| AC-16 | 10 gelijktijdige goede pogingen: precies één `token_hash`; Supabase geeft één sessie |
| AC-17 | 20 gelijktijdige aanvragen: hoogstens de limiet; nooit twee actieve codes |
| AC-18 | `shouldCreateUser: false` komt nergens in de app voor (statische controle) |
| AC-19 | `controleer-code` geeft hetzelfde antwoord, en ruwweg dezelfde duur, voor fout, verlopen, geen code en onbekend adres |
| AC-20 | Bij een gesloten registratie: hetzelfde antwoord als bij succes; het nieuwe adres krijgt de uitlegmail; een bestaand adres logt normaal in |
| AC-21 | Onbevestigde accounts zonder huishouden zijn na 24 uur weg; bevestigde accounts blijven altijd |
| AC-22 | De aanbieder valt uit: terugval of een nette fout binnen 5 s; geen half verstuurde code die toch geldig is |
| AC-23 | De bewaking meldt een mislukte hook, een mislukte controle en ongewone aantallen |
| AC-24 | Een netwerkstoring logt niet uit (de bestaande metingen S1 en S2 als regressietest) |
| AC-25 | Een bekend toestel logt in, ook terwijl een aanvaller de teller van dat adres heeft opgebouwd |
| AC-26 | De noodstop voor codes werkt direct: geen nieuwe codes en geen controles; bestaande sessies werken door |
| AC-27 | De RLS-matrix en alle bestaande suites blijven groen; nieuwe RLS-scenario's voor `private.k1_*` (geen API-toegang) |
| AC-28 | Een externe review van de twee functies en de migratie vóór de commerciële start |

## 12. Wat lokaal getest is, en wat nog aanname is

| Onderwerp | Niveau |
| --- | --- |
| Geen maximum per code bij Supabase; vergelijking niet in constante tijd | [getest, C6] en [bron] |
| Turnstile bij aanvragen wel, bij controleren niet | [getest, C10 en C11] en [bron] |
| Zonder kop geen IP-limiet; lokaal niet begrensd | [bron] en [getest, C12] |
| De IP-limiet op de gehoste omgeving, en IPv6 | **[aanname]** (§9) |
| De hook krijgt de `token_hash`; die werkt één keer; interne code van 10 cijfers | [getest, N4–N6] |
| De hook kan codes stoppen met een eigen melding | [getest, N3] |
| De hook beschikbaar op Free | [bron] |
| `email_change` via de hook met eigen codes | **[aanname]** → AC-8 |
| De wachtwoordtrigger op `auth.users`, en hoe Supabase daarop reageert | **[aanname]** → AC-3 |
| Of Supabase de hookpayload logt | **[aanname]** → AC-11 |
| De terugval naar een tweede aanbieder binnen 5 s | **[aanname]** → AC-22 |
| Gelijktijdigheid van de atomaire updates | Ontwerp, gebaseerd op het bekende gedrag van PostgreSQL → AC-15 tot en met AC-17 |
| Het gedrag van de passkey-sleutel in `/settings` | **[aanname]** |
| Herstel van back-ups | [getest]: lokaal, H0 |

## 13. Kosten en gevolgen

- **Kosten:** Edge Functions vallen binnen het gratis tegoed; de mail telt bij de aanbieder. K1 zelf kost niets.
- **Bouwwerk:** één migratie (tabellen, de trigger, de opruimtaak, RLS), twee Edge Functions, het codescherm, en tests
  (AC-1 tot en met AC-27).
- **Beheer:** de secrets (pepper, versleutelsleutel, de sleutel van de aanbieder, het hookgeheim), bewaking, en een
  controle bij elke nieuwe versie van Supabase Auth (§3.2).
- **Commercieel:**
  - K1 is draagbaar: het concept werkt ook bij een andere authenticatielaag.
  - Passkeys kunnen later als extra, snellere route, en maken R1 veilig.
  - Eigen beveiligingscode vraagt vóór de lancering een externe review (AC-28).
