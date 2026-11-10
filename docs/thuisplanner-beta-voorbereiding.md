# Thuisplanner: voorbereiding van de besloten bèta (mijlpaal 2)

**Status:** 📝 voorbereiding, niets uitgevoerd (26 oktober 2026). Dit is een concept-checklist en -plan. Er is geen
project, account of abonnement aangemaakt, niets gekocht, niets gemigreerd, gecommit, gepusht of gedeployd, en er is
geen verbinding gemaakt met Supabase, Cloudflare of Lettermint. Huisplan is niet geraakt. De prijzen en limieten zijn
op 26 oktober 2026 alleen lezend nagekeken (zie de bronnen); waar iets onzeker is, staat ⚠️.

**Voortbouwend op:**
- `docs/thuisplanner-deel2-bouwscope.md` §4.1–4.3 (onderdeel 12 bèta-omgeving B1, 13 back-ups B2, 14 privacy en
  bewaking);
- `docs/thuisplanner-productiegeschiktheid.md` (§5; F1–F3, N1–N5);
- `docs/thuisplanner-staging.md` en `docs/thuisplanner-staging-overstap.md` (de werkwijze die hier wordt hergebruikt);
- `docs/thuisplanner-deel2-bouwverslag.md` §4.2 (H1–H19) en §6 (drie gescheiden omgevingen);
- `docs/thuisplanner-review-staging.md` (wat vóór de bèta moet: R4, L1, L4–L6, L8 en de onafhankelijke review);
- `docs/thuisplanner-staging-hosting.md`, `docs/thuisplanner-mailaanbieder-keuze.md`,
  `docs/thuisplanner-uitnodigingsmail-verzending.md`;
- `docs/productkompas-beslissingen.md` (gates; besluiten 9, 11, 13–16).

## 0. Eerst melden: tegenstrijdigheden en gaten

| # | Wat | Waar | Voorstel |
| --- | --- | --- | --- |
| T1 | De releaseroadmap van 26 oktober 2026 (mijlpaal 1–3) staat nog niet in `docs/roadmap.md`. Volgens de leesvolgorde gaat de roadmap voor op dit document | `docs/roadmap.md` | De mijlpalen eerst in de roadmap vastleggen (eigen akkoord); tot dan is dit document een concept |
| T2 | Het bouwverslag (§6, stap 9) zegt "bèta gratis, in de organisatie Thuisplanner"; de bouwscope (onderdeel 13) zegt "Pro, dagelijks". Supabase staat **geen gratis en betaalde projecten in één organisatie** toe | bouwverslag §6, bouwscope §4.1 | Besluit O1 (§10): de bèta op Pro in een eigen, nieuwe organisatie |
| T3 | In `omgevingen.json` delen `beta` en `productie` hetzelfde Pages-project (`thuisplanner-app`) en adres, maar hebben ze elk een eigen `supabaseRef` | `thuisplanner/omgevingen.json` | Besluit O2 (§10): wordt het bètaproject later het productieproject, of komt er een nieuw project met een overstap? |
| T4 | Het advies "staging en bèta elk een eigen afzender of subdomein" past niet op het gratis Lettermint-plan (1 project, 1 afzenderdomein) | `docs/thuisplanner-mailaanbieder-keuze.md` §4 | Voor de bèta delen ze het domein, met een eigen afzendernaam (staat al zo in `omgevingen.json`); een eigen domein bij Starter (€10 per maand) |
| T5 | De website zegt dat de privacyverklaring van de app komt "voordat de app voor iedereen opengaat"; de bouwscope eist publicatie "vóór de eerste tester" | `thuisplanner/website/src/privacy.html`, bouwscope §4.1 | De strengste regel geldt: gepubliceerd vóór de eerste externe familie |
| T6 | De productiegeschiktheid adviseert KG-5E vóór nieuwe functies. KG-5E is nog niet begonnen (`App.tsx` kiest nog tussen `DemoApp` en `LokaleApp`; geen `Opslag`-interface) | productiegeschiktheid §5 | "KG-5E licht" (§8) vóór de bèta; het volledige periodecontract mag na mijlpaal 2 |

## 1. Doel en scope

**Doel van mijlpaal 2:** een kleine, betrouwbare besloten bèta met **3 tot 5 externe gezinnen**, op uitnodiging, met
echte gegevens. We willen leren of Thuisplanner het huishouden werk bespaart (Productkompas, ultieme toets), zonder dat
een tester gegevens verliest of iets ziet wat niet voor hem is.

| Mijlpaal | Wanneer (ongeveer) | Omgeving | Wie |
| --- | --- | --- | --- |
| 1. De partner gebruikt het dagelijks | week 3 (half november) | staging, achter Access | de producteigenaar en Sanne |
| 2. Besloten bèta | week 6 (begin december) | **bèta (nieuw)** | daarnaast 3–5 externe gezinnen |
| 3. Publieke lancering | week 12–16 (januari–februari 2027) | productie | iedereen, als product, privacy en beveiliging op orde zijn |

**Bèta-1 tegenover later:**

| In bèta-1 | Later (na de eerste test van de partner, of na mijlpaal 2) |
| --- | --- |
| Inloggen met een e-mailcode, huishouden, uitnodigen, rollen | Plannen en slimme projecten (besluiten 13 en 18; gate 9 "plannen", AVG-beoordeling AI-verwerker, kwaliteitsproef) |
| Vandaag, Agenda (met "Bezet"), Taken, Boodschappen, zoals op staging | Huishoudkennis en contacten (besluit 14; gate 9 "kennis en contacten") |
| Herhalende afspraken | Herhalende taken (besluit 15), als ze vóór week 5 niet klaar en door gate 9 zijn |
| Online eerst, met duidelijke meldingen bij verbindingsverlies | Herinneringen (besluit 16; pushproef en gate 9 "meldingen") |
| AVG-verzoeken met de hand (export, verwijderen) | Zelf exporteren en het account verwijderen in de app (B3) |
| | Offline-wachtrij, abonnementen (F10), passkeys, Google/Apple, PITR |

Commercieel zijn projecten, kennis en herinneringen essentieel. Ze mogen na de eerste test van de partner komen; elk
onderdeel dat toch vóór week 5 klaar is en zijn gate heeft gehaald, kan mee. **Geen functie gaat de bèta in zonder zijn
gate.**

**Online eerst (besluit v1):** zonder verbinding wordt niets opgeslagen. De app moet dat altijd zichtbaar maken. Er is
al een melding "Geen verbinding" (`components/Lokaal.tsx`, `foutcodes.ts`); in de kwaliteitspoort (§8) toetsen we dat
per scherm, en de bekende beperking staat in de uitleg voor testers (§6).

## 2. De bèta-omgeving

### 2.1 Opbouw

| Onderdeel | Bèta | Hergebruik van staging |
| --- | --- | --- |
| Supabase-project | Nieuw, regio Frankfurt (eu-central-1), naam bijvoorbeeld `thuisplanner-beta` | Zoals stap 1–2 van `thuisplanner-staging.md` |
| Organisatie | Zie §2.3 en besluit O1 | – |
| Pages-project | `thuisplanner-app` (`omgevingen.json`), adres `app.mijnthuisplanner.nl` | Zoals stap 5; Preview branches: None |
| Branch | Een eigen productiebranch, bijvoorbeeld `thuisplanner-beta`, alleen vooruit gezet vanaf een stand met groene CI | Zoals `thuisplanner-staging` |
| Buildmodus | `beta`: `npm run build:beta` | Nieuw, op basis van `staging-build.ts` (§2.2) |
| `omgevingen.json` | `beta.supabaseRef` invullen, pas na controle in het dashboard (organisatie en kenmerk) | Zoals stap 0 van de overstap |
| Migraties | `verbinding.ps1 -Ref <kenmerk> -Omgeving beta` (dry-run), daarna `-Push` met de getypte bevestiging | Het script kent `-Omgeving beta` al en weigert nu een bèta zonder kenmerk |
| Nacontrole | `verbinding-controle.mjs na` met `KG_OMGEVING=beta` | Eerst de schijnafwijking met publishable keys oplossen (overstap stap 6, open punt) |
| Edge Functions | `functies.ps1` met het bètakenmerk | Moet `-Omgeving beta` leren (nu alleen staging; kleine wijziging) |
| Geheimen | Alle 13 opnieuw en **anders** dan op staging (pepper, sleutels, hook, wachtrij) | Zoals stap 6a–6f |
| Turnstile | Een eigen widget voor `app.mijnthuisplanner.nl` | Zoals stap 6d |
| Mail | `MAIL_AFZENDER` = `Thuisplanner <noreply@mail.mijnthuisplanner.nl>`; een eigen Lettermint-webhook naar het bètaproject | Het token kan per project; ⚠️ op het gratis plan is er één Lettermint-project (§2.4) |
| Auth | Alleen e-mail, aanmelden aan, bevestigen aan, OTP 10/600, captcha aan, Site URL `https://app.mijnthuisplanner.nl` | Zoals stap 6b |
| Schakelaars | `wachtwoordsessies` uit, `sessiecontrole` aan, `huishouden_open` uit, `onderhoud` leeg | De nacontrole eist dit |
| Testerslijst | Alleen het adres van de eerste volwassene per gezin (G1, `testers.sql`) | Zoals stap 7 |
| Domein | CNAME `app` bij TransIP naar het Pages-project | **Eigen akkoord (DNS)**; de DNS-overstap naar Cloudflare is niet nodig |

### 2.2 Buildmodus `beta` en de bewaking (N5)

Nu kent `src/lib/omgeving.ts` alleen `demo`, `lokaal` en `staging`, en `staging-kenmerk.mjs` alleen het stagingkenmerk.
Nodig (kleine, aparte wijziging met tests en tegenproeven, eigen akkoord):

| Wat | Eis |
| --- | --- |
| Modus | `beta` erbij (en meteen `productie`, zodat er één manier blijft) |
| Kenmerk | `build:beta` bouwt alleen tegen `omgevingen.json → beta.supabaseRef`; weigert een kenmerk van een andere omgeving (staging) en elk Huisplan-kenmerk, zoals `verbinding-controle.mjs` al doet |
| Geheimen | Dezelfde weigeringen als staging (demovariabelen, service-rol, `sb_secret_`) |
| CSP | `connect-src` alleen de eigen site en precies het bètaproject; Turnstile zoals op staging |
| Markering | Niet "Testomgeving · verzonnen gegevens" (dat klopt dan niet), maar een rustige "Bèta"-aanduiding; tekst is besluit O7 |
| Demo | Een build zonder configuratie mag in modus `beta` nooit als demo starten (N4): fout, geen demo |
| `noindex` | Blijft in de bèta |
| Test | Een offline e2e `e2e:beta`, zoals `e2e:staging`, met een verzonnen project; de buildbewaking (T20) met tegenproef |

### 2.3 Cloudflare Access op de bèta?

| Optie | Hoe | Voor | Tegen |
| --- | --- | --- | --- |
| A. Geen Access (vaste keuze bouwverslag §6) | Code-inlog, toegangspoort, testpoort G1 en `huishouden_open` uit | Eén inlog voor testers; zo werkt productie ook | Het app-skelet is openbaar (bevat geen gegevens) |
| B. Access met een lijst van adressen | Zoals staging (gratis tot 50) | Extra laag | Twee codes per tester (Access en Thuisplanner); elk nieuw gezinslid moet in twee lijsten; meer uitleg en supportvragen |
| **C. Access tijdelijk (advies)** | Access aan tijdens het inrichten, de nacontrole en de eigen proeven met verzonnen gegevens; uit vlak vóór de eerste familie | Niets openbaar zolang het niet af is; daarna zoals A | Eén extra omschakeling (een instelling, terug te draaien) |

**Advies C.** De echte beveiliging is RLS, de poort en G1; Access is alleen een stagingmaatregel (productiegeschiktheid
§3). Bij C controleren we vóór het uitzetten: H1–H19 op de bèta groen, S1/S2 gemeten, de privacyverklaring gepubliceerd.

**Besluit van de producteigenaar (28 oktober 2026):** C, met een harde voorwaarde. Access staat aan tijdens het inrichten
en de eigen proeven. Access gaat **pas uit** nadat de controles hieronder **online op de bèta** aantoonbaar groen zijn.
Daarna volgt een afzonderlijk akkoord van de producteigenaar.

| Controle (Access-poort) | Geslaagd als |
| --- | --- |
| Authenticatie | Alleen inloggen met een code. Een wachtwoordsessie krijgt niets (KG-T65 online nagelopen). "Uitloggen op alle toestellen" werkt direct. Logboeken zonder adres, code of token. |
| Autorisatie | Eigenaar, beheerder en lid doen alleen wat hun rol toestaat (uitnodigen, intrekken, lid toevoegen). Een niet-lid krijgt niets. Wie niet op de testerslijst staat, kan geen huishouden maken. |
| Huishoudscheiding | Twee testhuishoudens met verzonnen accounts. Gezin A ziet, via de app **en** via directe API-verzoeken met een eigen sessie, niets van gezin B: afspraken, taken, boodschappen, vakanties, leden en uitnodigingen. Een privé-afspraak blijft "Bezet" voor de partner. Realtime-seintjes bevatten geen inhoud. Het script voor de API-verzoeken heeft een tegenproef: met een opzettelijk verkeerde sessie moet het falen. |
| Gehoste tests | H1–H19 groen; S1/S2 gemeten |
| Verwijderen | De verwijderprocedure van §5.4 is op de bèta met verzonnen accounts uitgevoerd, en de controle "niets meer aanwezig" is groen |

### 2.4 De gratis limieten en wat dat betekent

| Feit (26 oktober 2026) | Gevolg |
| --- | --- |
| Supabase: **twee gratis projecten** per persoon, over alle organisaties waar je eigenaar of beheerder bent; gepauzeerde tellen niet mee | Staging + bèta = 2. Een Huisplan-project hervatten kan dan niet meer, en productie kan niet gratis |
| Supabase Free: pauzeren na 1 week inactiviteit, geen automatische back-ups | Onacceptabel voor echte gezinsgegevens (bouwscope onderdeel 13) |
| Supabase: gratis en betaald niet in één organisatie; elke organisatie heeft een eigen abonnement | Een bèta op Pro staat in een andere organisatie dan staging, of staging gaat mee naar Pro |
| Lettermint Free: 300 mails per maand, **geen daglimiet**, **1 project, 1 afzenderdomein**, 28 dagen berichtgeschiedenis | Staging en bèta delen tegoed en domein. Schatting bèta-1: 12 volwassenen × ±4 codes + ±15 uitnodigingen + staging ±30 ≈ 100 per maand. Ruim genoeg, maar R4 (misbruik via uitnodigingen) kan het tegoed in een dag opmaken |
| Cloudflare Pages, Turnstile en Access: gratis voor dit gebruik | Geen kosten |

**Advies:** maak het bètaproject pas aan op het moment van het Pro-besluit (§3), meteen in de juiste organisatie. Zo
hoeft er geen project verhuisd te worden en blijft er een gratis plek over. Tot die tijd kan alles lokaal worden
voorbereid (§9, spoor A).

## 3. Supabase Pro: voorbereiden, niet kopen

### 3.1 Wat Pro toevoegt

| | Free | Pro |
| --- | --- | --- |
| Prijs | $0 | vanaf **$25 per maand per organisatie**, met $10 rekentegoed (dekt één Micro-project) |
| Rekenkracht per project | – | Micro ≈ $10 per maand, Small ≈ $15 per maand; Nano kan niet op betaalde plannen |
| Pauzeren | na 1 week inactiviteit | nooit |
| Back-ups | geen | **dagelijks, 7 dagen** terug te halen; Storage-bestanden zitten er niet in (wij gebruiken geen Storage) |
| PITR | – | add-on, $100 per maand per 7 dagen; vraagt minstens Small; vervangt dan de dagelijkse back-ups (niet nodig voor de bèta) |
| Database | 500 MB | 8 GB per project, daarna $0,125 per GB |
| Egress | 5 GB | 250 GB, daarna $0,09 per GB |
| MAU | 50.000 | 100.000 |
| Edge Functions | 500.000 aanroepen | 2 miljoen, daarna $2 per miljoen |
| Logboeken | 1 dag | 7 dagen (handig voor de bewaking, §7) |
| Bestedingslimiet | – | standaard aan; laten staan |

⚠️ Of de dagelijkse back-ups van Pro in het dashboard te downloaden zijn, staat niet in de documentatie. Daarom houden
we de eigen export (§4) als tweede kopie, wat het antwoord ook is.

### 3.2 Opzetten en kosten

| Opzet | Per maand | Voor | Tegen |
| --- | --- | --- | --- |
| I. Bèta gratis (bij staging) | $0 | Geen kosten | Geen back-ups, pauzeren; strijdig met onderdeel 13 |
| **II. Nieuwe organisatie op Pro met alleen de bèta (advies)** | **$25** (Micro valt onder het tegoed); met een apart productieproject later **$35** | Back-ups en geen pauze waar echte gegevens staan; staging blijft gratis | Twee organisaties |
| III. De organisatie Thuisplanner naar Pro (staging + bèta) | $35 | Eén organisatie; staging pauzeert niet | Staging kost geld zonder echte gegevens |

Ongeveer €23–33 per maand, afhankelijk van de wisselkoers; ⚠️ btw en de exacte factuurregels pas bij het besluit
bekijken.

### 3.3 Wanneer beslissen, en wat vraagt akkoord

- **Uiterlijk week 4**, zodat er twee weken zijn voor inrichting, H1–H19 en de hersteloefening vóór week 6.
- **Afzonderlijk akkoord van de producteigenaar** voor:
  1. het abonnement (bedrag en betaalmethode; de producteigenaar voert het zelf uit);
  2. de nieuwe organisatie en het project;
  3. het ondertekenen van de verwerkersovereenkomst van Supabase (§5.3);
  4. een eventuele Lettermint Starter (€10 per maand) als het tegoed krapt.
- Daarna noteren: organisatie, kenmerk, regio, en de bestedingslimiet aan.

## 4. Back-ups

| Laag | Wat | Hoe vaak | Wie |
| --- | --- | --- | --- |
| 1 | Pro: dagelijkse back-up, 7 dagen | dagelijks, automatisch | Supabase |
| 2 | **Eigen export**: `verbinding.ps1 -Omgeving beta -Export -ExportMap <map>` (`export.mjs`: één momentopname, manifest met SHA-256, alle tabellen in `public` en `private`, uit `auth` alleen `users` en `identities`) | **wekelijks** tijdens de bèta, en vóór elke migratie | producteigenaar (wachtwoord bij de verborgen prompt) |
| 3 | **Tweede, versleutelde kopie elders** van laag 2 | na elke export | producteigenaar |
| 4 | **Hersteloefening**: `hersteltoets.sh <map> <sha256>` (lokale, aparte stack) | de eerste vóór de eerste familie, daarna maandelijks | Claude voert uit, producteigenaar kijkt mee |

**Laag 3, versleuteld, zonder nieuwe software (voorstel):**
- Optie a: een USB-schijf met BitLocker To Go (zit in Windows 11 Pro), op een andere plek bewaard.
- Optie b: een kleine uitbreiding van `export.mjs` die het pakket met AES-256-GCM versleutelt (Node `crypto`), met een
  wachtwoordzin uit de wachtwoordmanager; daarna een EU-opslag naar keuze. ⚠️ Een clouddienst is een nieuwe verwerker
  (§5.3) en mogelijk een kostenpost: eigen akkoord.
- Advies: **a** voor de bèta. De map met de onversleutelde export alleen voor het eigen account (R5, `icacls`), en
  BitLocker op de laptop aan.
- Bewaren: hoogstens 4 wekelijkse exports; oudere wissen. Dat zetten we zo in de privacyverklaring.

**Hersteloefening (acceptatie van onderdeel 13):**
1. Een export van de bèta en de hersteltoets "GESLAAGD", met de tellingen per tabel.
2. Een herstel uit de Pro-back-up naar een **nieuw** project is niet nodig voor de bèta. ⚠️ Herstel van `auth`-accounts
   in een gehost project en `session_replication_role` zijn nog niet getoetst (overstap, herstelplan). Valt dat tegen,
   dan loggen testers opnieuw in met een code; hun huishoudgegevens komen uit de export.
3. Na een herstel in een nieuw project: de Vault-waarden opnieuw zetten (`uitnodigingsmail-verzending` §6).

**Stopcriterium:** een mislukte hersteltoets of een gedeeltelijke export: geen nieuwe gezinnen tot het is opgelost.

## 5. Privacy en AVG

### 5.1 Opzet van de privacyverklaring van de app

Een eigen pagina op de website (bijvoorbeeld `mijnthuisplanner.nl/privacy-app`), naast de bestaande websiteverklaring.
De Huisplan-verklaring (`privacy.html` in de root) wordt niet gebruikt of gewijzigd; die beschrijft Firebase en andere
diensten.

| Onderdeel | Inhoud (concept) |
| --- | --- |
| Verantwoordelijke | De bedrijfsnaam, KvK en het contactadres uit `website/gegevens.json` (nu leeg; nodig vóór publicatie) |
| Welke gegevens | E-mailadres en weergavenaam; huishouden, leden (ook kinderen zonder account), rollen; afspraken (ook privé), taken, boodschappen; technische gegevens: toestel-token (alleen een HMAC op de server), inlogmomenten, IP-adres in logboeken |
| Doelen | De planner laten werken en delen binnen het huishouden; inloggen en beveiliging (codes, misbruik tegengaan, Turnstile); mails die nodig zijn (codes, uitnodigingen, adreswijziging); in de bèta: feedback en support |
| Grondslag | Uitvoering van de overeenkomst (gebruik van de dienst); gerechtvaardigd belang (beveiliging, misbruik, foutopsporing). Geen toestemming nodig voor tracking: er is geen tracking. ⚠️ Kindergegevens: alleen wat een ouder zelf invoert; geen eigen account onder de 16 |
| Wat we niet doen | Geen advertenties, geen verkoop, geen profilering, geen analyse- of trackingdiensten, geen AI in bèta-1 |
| Bewaartermijnen | Zie 5.2 |
| Verwerkers en locaties | Zie 5.3 |
| Rechten | Inzage, kopie, correctie, verwijdering, bezwaar; via het contactadres, antwoord binnen een maand; klacht bij de Autoriteit Persoonsgegevens |
| Bèta | Wat een bèta betekent: mogelijke fouten, de back-ups, en dat we bij het einde van de bèta vragen of de gegevens mee mogen naar productie (O2) |

### 5.2 Bewaartermijnen (uit wat al gebouwd is)

| Gegeven | Termijn | Bron |
| --- | --- | --- |
| Inhoud van het huishouden | Zolang het huishouden bestaat; weg bij verwijderen | KG-5B (`delete_household`) |
| Privégegevens van een gearchiveerd lid | 30 dagen na archiveren | `archief_bewaartermijn.sql` |
| E-mailadres op een uitnodiging | Gewist bij accepteren, sluiten of verlopen (dagelijkse taak) | `uitnodigingen_op_email.sql` |
| Codes | Hoogstens 24 uur in de database (10 minuten geldig) | `k1_codelaag.sql` |
| Onbevestigde accounts | 24 uur | `k1_codelaag.sql` |
| Tellers per adres | 30 dagen | `k1_codelaag.sql` |
| Bekende toestellen | 180 dagen zonder gebruik | `k1_codelaag.sql` |
| Uitnodigingsmails (wachtrij) | 30 dagen | `uitnodigingsmail.sql` |
| Logboeken van Supabase | 7 dagen op Pro | Supabase |
| Mails bij Lettermint | inhoud en metadata 28 dagen; gebeurtenissen hoogstens 90 dagen; restkopieën 14 dagen | Lettermint-DPA §3.1, §11.5 |
| Back-ups | Pro 7 dagen; eigen exports hoogstens 4 weken | §4 |

### 5.3 Verwerkers en verwerkersovereenkomsten

| Verwerker | Wat | Locatie | Overeenkomst | Actie |
| --- | --- | --- | --- | --- |
| Supabase | Database, Auth, Edge Functions, logboeken | Frankfurt (eu-central-1). ⚠️ Contractpartij volgens de DPA van 2026 is Supabase Pte. Ltd. (Singapore); doorgifte via standaardcontractbepalingen | De DPA wordt aangevraagd via het dashboard (legal documents) en ondertekend via PandaDoc | Aanvragen en ondertekenen vóór de eerste familie; subverwerkerslijst (Schedule 3) bekijken |
| Cloudflare | Hosting van de app (Pages), Turnstile, (tijdelijk) Access | Wereldwijd netwerk; ⚠️ doorgifte naar de VS (DPF of standaardcontractbepalingen) | De Cloudflare-DPA hoort bij de Self-Serve Subscription Agreement. ⚠️ Niet vastgesteld of die vanzelf geldt of moet worden aanvaard | Nagaan in het dashboard of de DPA geldt; Turnstile in de verklaring noemen |
| Lettermint | Versturen van codes en uitnodigingen, bezorgmeldingen | EU (DPA §8.1) | De DPA geldt automatisch, zonder handtekening | Vastleggen; de melding bij 200 mails aan |
| TransIP | Domeinregistratie en DNS van `mijnthuisplanner.nl` | Nederland | Geen gebruikersgegevens van de app (alleen DNS); ⚠️ eigen voorwaarden van TransIP nakijken | Alleen vermelden als dienstverlener, geen DPA nodig (⚠️ te bevestigen) |
| GitHub | Broncode, CI | VS | Geen gebruikersgegevens | Niet in de verklaring; wel: nooit echte gegevens in tests of issues |

### 5.4 AVG-verzoeken in de bèta (met de hand)

| Verzoek | Werkwijze | Nodig |
| --- | --- | --- |
| Inzage of kopie | Een alleen-lezende SQL-snippet die per account de eigen gegevens als JSON geeft (huishoudens, eigen afspraken, taken, boodschappen), uitgevoerd door de producteigenaar in de SQL-editor; per mail aan het eigen adres | Nieuw: `staging/avg-export.sql` (bouwen en lokaal testen; eigen akkoord) |
| Verwijderen | Zie **"Verwijderen op verzoek"** hieronder: een gecontroleerd verwijderscript voor de beheerder, geen handwerk in het dashboard | Het script, met een integratietest en een proef op de bèta |
| Correctie | In de app zelf | – |
| Logboek | Per verzoek: datum, soort, afgehandeld op (geen inhoud) | Een eenvoudige lijst bij de producteigenaar |

Termijn: binnen een maand; ons doel binnen een week.

**Verwijderen op verzoek (besluit van de producteigenaar, 28 oktober 2026):** vóór het eerste externe gezin moet er een
**aantoonbaar werkende** procedure zijn om op verzoek een account en een volledig huishouden met alle bijbehorende
gegevens te verwijderen. Een knop in de app mag later komen; de mogelijkheid zelf niet.

- **Wat de database al kan:**
  - `delete_household` (alleen de eigenaar). Alle inhoud gaat mee via `on delete cascade`: afspraken en details,
    taken, boodschappen, vakanties en paklijsten, leden, uitnodigingen en uitnodigingsmails.
  - De trigger `before_account_delete` bij het verwijderen van een account:
    - enige eigenaar zonder andere accounts: het huishouden gaat mee;
    - zijn er wel andere accounts: weigeren, eerst het eigendom over;
    - privé-afspraken weg, het profiel en de toestellen weg, en het account wordt losgemaakt van het lid.
- **Verwijderscript** (nieuw, met een eigen akkoord): alleen voor de beheerder, vanaf deze computer, met de verborgen
  wachtwoordprompt zoals `verbinding.ps1`, nooit in de app.
  1. Alleen lezend een **overzicht**: de huishoudens, leden, accounts en aantallen per tabel.
  2. Een **getypte bevestiging**.
  3. Verwijderen: het huishouden; de account(s); het adres van de testerslijst; en de resten bij dat adres (codes,
     grenzen, uitnodigingen naar dat adres in andere huishoudens).
  4. Een **controle dat er niets meer is**, op account-id, huishouden-id en de hash van het adres.
- **Varianten:**
  - (a) De eigenaar vraagt om het hele huishouden: alles weg, ook het lidmaatschap van de partner. Het account van de
    partner blijft alleen bestaan als die dat zelf wil.
  - (b) Een partner vraagt om alleen het eigen account: het account en de eigen privé-afspraken weg; de gedeelde
    huishoudgegevens blijven.
- **Identiteit:** alleen een verzoek vanaf het e-mailadres van het account, met een bevestiging per mail.
- **Register:** datum, soort verzoek en uitkomst, zonder persoonsgegevens.
- **Wat niet direct verdwijnt** (zo in de privacyverklaring):
  - de dagelijkse back-ups van Supabase: 7 dagen;
  - de eigen exports: hoogstens 4 weken;
  - de logboeken: 7 dagen;
  - de berichtgeschiedenis van Lettermint: 28 dagen.
  Na een herstel uit een back-up voeren we de verwijderingen uit het register opnieuw uit.
- **Bewijs, vóór het eerste gezin:**
  1. Een integratietest lokaal voor beide varianten, met een tegenproef: een opzettelijk achtergelaten rij laat de
     controle falen.
  2. Een proef op de bèta met verzonnen accounts, als onderdeel van de Access-poort (§2.3).
  3. Het opruimen van de testaccounts vóór de start, met hetzelfde script.

### 5.5 Vóór de eerste externe familie

- [ ] Privacyverklaring van de app gepubliceerd, met de bedrijfsgegevens ingevuld (publicatiebouw van de website).
- [ ] De DPA van Supabase ondertekend; die van Cloudflare en Lettermint vastgelegd.
- [ ] Het draaiboek voor inzage lokaal getest.
- [ ] **Het verwijderscript aantoonbaar werkend:** de integratietest met tegenproef groen, en de proef op de bèta met
      verzonnen accounts geslaagd (§5.4).
- [ ] **De Access-poort groen** (§2.3), en het afzonderlijke akkoord van de producteigenaar om Access uit te zetten.
- [ ] Back-uplagen 1–3 actief en de eerste hersteloefening geslaagd (§4).
- [ ] De onafhankelijke review van K1, de poort, de RLS en de uitnodigingsflow (review-staging, lijst van 7 punten) is
      gedaan, of de producteigenaar accepteert schriftelijk het resterende risico voor een besloten bèta.
- [ ] R4, L1, L4–L6 en L8 uit de stagingreview opgelost.
- [ ] Gate 9 bewezen voor elk domein dat in bèta-1 zit (§8).

## 6. Onboarding van externe gezinnen

| Stap | Hoe | Klaar als |
| --- | --- | --- |
| 1. Uitnodigen | De producteigenaar zet het adres van één volwassene per gezin op de testerslijst (`testers.sql`, G1), en stuurt een persoonlijke mail met de link, de uitleg en het supportadres | Het adres staat op de lijst; `huishouden_open` blijft uit |
| 2. Eerste inlog | Adres → zes cijfers → "Naar Vandaag", hoogstens 9 handelingen (bouwscope onderdeel 4) | Gemeten in de onboardingtest (§8) |
| 3. Huishouden | De tester maakt het huishouden en nodigt de partner uit (mail of link); kinderen als lid zonder account | De uitnodigingsmail komt binnen een minuut (H14) |
| 4. Beginscherm | Uitleg "Zet op beginscherm" voor iPhone en Android (Safari wist de opslag na 7 dagen zonder bezoek) | In de uitleg en op de website |
| 5. Eerste gebruik | Lege staten op Vandaag, Agenda, Taken en Boodschappen met één rustige zin en één knop (principe 2); geen rondleiding | Beoordeeld in de mobiele UX-check |

**Uitleg bij de start (één pagina of mail):**
- Wat bèta betekent, en dat we wekelijks een back-up maken.
- **Bekende beperkingen:** zonder verbinding wordt niets opgeslagen (je ziet "Geen verbinding"); "Ongedaan maken" werkt
  nog niet; dubbel toevoegen geeft twee items; nog geen herhalende taken, herinneringen, projecten of huishoudkennis
  (tenzij ze mee zijn); geen eigen export in de app (vraag het ons).
- Hoe je inlogt met een code, en dat een code nooit per telefoon of chat gevraagd wordt.

**Feedback en support:**

| Wat | Voorstel |
| --- | --- |
| Feedbackkanaal | Eén mailadres (bijvoorbeeld `beta@` of het contactadres) en een kort gesprek na week 1 en week 3 per gezin; geen extra dienst |
| Support | Hetzelfde adres; antwoord binnen een werkdag; noodgevallen (iemand kan niet inloggen) dezelfde dag |
| In de app | Onder Meer: "Feedback of hulp" met een `mailto:`-link (geen formulier, geen derde partij) |
| Vastleggen | Per gezin een korte notitie (wat werkt, wat niet), zonder inhoud uit hun planner |

## 7. Bewaking

| Wat | Hoe | Hoe vaak | Wie |
| --- | --- | --- | --- |
| Codes en pogingen | Een alleen-lezend **dagoverzicht** (nieuw: `staging/dagoverzicht.sql`): aantal aangevraagde en gecontroleerde codes, geremd door H/U/D, vergrendelde accounts, nieuwe accounts, verwijderde onbevestigde accounts. Alleen aantallen, nooit adressen | dagelijks tijdens de bèta | producteigenaar (5 minuten) |
| Mailwachtrij | `private.uitnodigingsmail_stand()` (bestaat al): wachtend > 10 min, vastgelopen, onzeker, mislukt, niet bezorgd | in het dagoverzicht | producteigenaar |
| Mailtegoed en bezorging | Lettermint-dashboard; melding bij 200 per maand; bounces en spamklachten | wekelijks, en bij de melding | producteigenaar |
| Geplande taken | `cron.job_run_details`: laatste run van de 5 taken `succeeded` | in het dagoverzicht | producteigenaar |
| Instellingen | De nacontrole (`verbinding-controle.mjs na`) | wekelijks en na elke wijziging | Claude, na akkoord |
| Fouten in de app | Bèta-1: de ErrorBoundary toont een rustige melding met "Meld dit" (mailto met tijdstip en schermnaam, geen inhoud). Geen externe foutmonitoring (geen nieuwe verwerker) | bij elke melding | producteigenaar |
| Functies en Auth | Logboeken in het dashboard (7 dagen op Pro): 5xx van de functies, `captcha_failed`, 429 | bij een melding of afwijking | producteigenaar, met Claude |
| Beschikbaarheid | Supabase-status en Cloudflare-status; geen eigen uptime-dienst in bèta-1 | bij klachten | producteigenaar |

Een externe dienst voor foutmonitoring of uptime kan vóór de lancering (mijlpaal 3), als eigen besluit met een
AVG-beoordeling.

**Noodstops** (bestaan al): `onderhoud = 'dicht'`, `codes_aan = false`, `registratie_open = false`, `MAIL_ADAPTER`
leeg. Ze staan in het draaiboek, met wie ze mag gebruiken (de producteigenaar).

## 8. Kwaliteitspoort vóór de bèta

| # | Onderdeel | Geslaagd als | Stand (26 oktober 2026) |
| --- | --- | --- | --- |
| Q1 | Mobiele UX-check | Op iPhone (Safari) en Android (Chrome), 360 en 390 px: inloggen, eerste huishouden, uitnodigen, elk hoofdscherm, lege staten, donker; de lijst uit bouwverslag §4.3 | Deels op staging (de producteigenaar); lege staten niet beoordeeld |
| Q2 | Privacy en RLS per domein (gate 9) | Per domein in bèta-1 (afspraken met "Bezet", taken, boodschappen, leden, uitnodigingen) de RLS-matrix met tegenproeven groen; voor elk nieuw domein (herhalende taken, meldingen, kennis, projecten) eerst zijn eigen gate | De bestaande domeinen bewezen (RLS-matrix, CI); de nieuwe domeinen nog niet gebouwd |
| Q3 | Onboardingtest met een nieuwe gebruiker | Iemand die Thuisplanner nooit zag, op een eigen telefoon, zonder hulp: account, huishouden, partner uitnodigen, één afspraak, één boodschap. Gemeten: handelingen, tijd, vragen | Niet gedaan |
| Q4 | ErrorBoundary (N2) | Een fout in één scherm geeft een rustige melding met "Opnieuw laden" en "Meld dit", geen wit scherm; met test en tegenproef | **Ontbreekt** in `src` |
| Q5 | Foutteksten (N1) | Geen technische of Engelse melding zichtbaar; codes via `foutcodes.ts`; `LETTERLIJK` alleen voor bewust gekozen teksten; per scherm een netwerkfout getoetst ("Geen verbinding") | Deels: TPU, TPA/TPB, TPM en TPK vertaald, met contracttest; de overige domeinen tonen nog de databasetekst |
| Q6 | KG-5E licht: één datapad | De online app gebruikt niet langer de demostaat als gedeelde staat voor online acties; `ongedaan`, `kiesScenario` en `vervangAlles` doen online niets zichtbaars meer of zijn weg; de map `lib/lokaal` hernoemd; modus `beta` en `productie` in de bewaking (N5); een productie- of bètabuild start nooit als demo (N4) | **Niet begonnen** (`App.tsx` kiest nog tussen `DemoApp` en `LokaleApp`) |
| Q7 | P2 (N3) | Bij expliciet uitloggen worden onbevestigde wijzigingen gewist, na een waarschuwing | Besluit open |
| Q8 | Gehoste tests | H1–H19 op de bèta groen; S1/S2 gemeten (H8, H9) | Op staging deels; bèta bestaat niet |
| Q9 | Beveiliging | Onafhankelijke review (of geaccepteerd risico); R4, L1, L4–L6, L8 | Open |
| Q10 | Herstel | Hersteloefening op de bèta geslaagd (§4) | Open |

Het volledige periodecontract van KG-5E (F2) en de router mogen na mijlpaal 2, mits Q6 is gehaald: dan bouwen we
nieuwe functies niet meer op twee datapaden (F1).

## 9. Werkplan

Schattingen in werkdagen van Claude (lokaal, met tests); "PO" is werk van de producteigenaar. Week 0 is 26 oktober 2026.

| Spoor | Werk | Schatting | Week | Akkoord nodig |
| --- | --- | --- | --- | --- |
| **A. Code (lokaal)** | A1 modus `beta`/`productie` in build en app, `build:beta`, `e2e:beta`, `functies.ps1 -Omgeving` (N4, N5) | 1,5 d | 1 | commit |
| | A2 ErrorBoundary met "Meld dit" (N2) | 0,5 d | 1 | commit |
| | A3 KG-5E licht (Q6) | 3–4 d | 1–3 | commit |
| | A4 foutteksten van de overige domeinen (N1) | 1–2 d | 2–3 | commit; mogelijk een migratie voor stabiele codes (eigen akkoord) |
| | A5 R4, L1, L4–L6, L8 uit de stagingreview | 2–3 d | 2–3 | commit; migraties (eigen akkoord) |
| | A6 lege staten, "Feedback of hulp", P2 | 1 d | 3 | commit; P2 is een besluit |
| | A7 `dagoverzicht.sql`, `avg-export.sql`, het AVG-draaiboek; nacontrole voor publishable keys | 1,5 d | 2–3 | commit |
| | A8 versleutelde export (optie b), alleen als gekozen | 0,5 d | 3 | commit |
| **B. Mijlpaal 1** | Sanne erbij op staging (overstap stap 10–11), dagelijks gebruik, feedback | PO | 0–3 | per stap (bestaand plan) |
| **C. Omgeving en kosten** | C1 besluit O1 en Pro (PO koopt) | PO | 4 | **kosten** |
| | C2 organisatie, project, Pages-project, Turnstile, geheimen, Auth (PO, met checklist) | 1 d PO + 0,5 d | 4 | **per onderdeel** |
| | C3 `omgevingen.json` invullen; migraties, functies, nacontrole | 0,5 d | 4 | **migratie, deployment** |
| | C4 CNAME `app` bij TransIP | PO | 4 | **DNS** |
| | C5 H1–H19 en S1/S2 op de bèta, met Access aan | 1 d | 4–5 | per test (online) |
| | C6 eerste export, versleutelde kopie, hersteloefening | 0,5 d + PO | 5 | export (online, alleen lezen) |
| **D. Privacy en onboarding** | D1 privacyverklaring van de app (concept → PO → publicatie op de website) | 1 d | 2–4 | **publicatie**; bedrijfsgegevens van PO |
| | D2 DPA Supabase aanvragen en ondertekenen; Cloudflare en Lettermint vastleggen | PO | 4 | **ondertekenen** |
| | D3 uitleg voor testers, uitnodigingsmail van de PO, beginscherm-uitleg | 0,5 d | 4 | tekst |
| | D4 onboardingtest met een nieuwe gebruiker (Q3) | PO + 0,5 d | 5 | – |
| **E. Review** | E1 onafhankelijke review (wie, kosten?) of een geaccepteerd risico | extern | 3–5 | **kosten / extern** |
| | A9 het verwijderscript met integratietest en tegenproef (§5.4) | 1,5–2,5 d | 3–4 | commit |
| | C7 de Access-poort op de bèta (§2.3): het API-scheidingsscript met tegenproef, en de verwijderproef | 1,5–2 d | 5–6 | per test (online) |
| **F. Start** | F1 de testaccounts opruimen met het verwijderscript; Access uit **na de Access-poort en een apart akkoord**; testerslijst; eerste 1–2 gezinnen; na een week de rest | PO | 6–7 | **start bèta** |

**Gevolg van de besluiten van 28 oktober 2026:** ongeveer 3–4 werkdagen extra (A9 en C7). De start van de bèta schuift
van rond week 6–7 naar **rond week 7–8** (een streefperiode; weeknummers zoals in de roadmap, waar week 1 de week van 26
oktober is). Er komen geen extra kosten bij.

**Kritiek pad:** A1 → A9 → C2/C3 → C5 → C7 → C6 → F1, met D1/D2 en Q9 ernaast. Spoor A en B lopen parallel; spoor C begint pas na
het Pro-besluit. Valt A3 of A5 uit, dan schuift mijlpaal 2, niet de kwaliteitspoort.

**Altijd een apart akkoord:** kosten (Pro, Lettermint Starter, een externe review of opslagdienst), elke nieuwe externe
dienst, DNS-wijzigingen, het aanmaken van organisaties en projecten, migraties en deployments, het uitzetten van Access,
het publiceren van de privacyverklaring, het ondertekenen van overeenkomsten, en het toelaten van elk gezin.

## 9a. Van bèta naar productie (besluit van 28 oktober 2026)

- **De bèta-omgeving wordt later de productieomgeving.** Hetzelfde Supabase-project (in de eigen Pro-organisatie),
  hetzelfde Pages-project en hetzelfde adres `app.mijnthuisplanner.nl`.
- **De gezinnen behouden hun gegevens** bij de overgang, **tenzij zij om verwijdering vragen** (§5.4). Dat staat in de
  uitnodiging, in de bètavoorwaarden en in de privacyverklaring.
- **Staging blijft de testomgeving.** Staging levert alleen geteste code en migraties. Er gaan nooit accounts of
  gegevens van staging naar de bèta of productie.
- **De overgang zelf**, elk onderdeel met een eigen akkoord:
  1. In `omgevingen.json` verhuist het kenmerk van `beta` naar `productie`, met de buildmodus `productie`.
  2. Registratie open: `huishouden_open` aan, de testpoort G1 uit.
  3. De privacyverklaring en de voorwaarden definitief.
  4. De onderdelen die vóór de lancering moeten: account en huishouden verwijderen in de app, een eigen export, quota,
     de externe review van K1, en monitoring (productiegeschiktheid §5).
  5. Rekenkracht en eventueel PITR afstemmen op het gebruik.
  6. Een export en een hersteltoets vlak vóór de overgang.

## 10. Open beslissingen

| # | Beslissing | Opties | Advies |
| --- | --- | --- | --- |
| O1 | Waar draait de bèta? | I gratis bij staging; II nieuwe organisatie op Pro ($25); III Thuisplanner-organisatie naar Pro ($35) | **II**, aangemaakt op het moment van het besluit (week 4) |
| O2 | Wordt het bètaproject later productie? | a. ja: hetzelfde project, de gezinnen houden hun gegevens; b. nee: een nieuw productieproject en een overstap of een schone start | **Besloten op 28 oktober 2026: a** (zie "Van bèta naar productie") |
| O3 | Access op de bèta | A geen; B blijvend; C tijdelijk | **Besloten op 28 oktober 2026: C**, Access uit pas na de Access-poort (§2.3) |
| O4 | Tweede kopie van de back-up | a. USB met BitLocker; b. versleutelde export naar EU-opslag | **a** voor de bèta |
| O5 | Hoe vaak de eigen export | wekelijks; dagelijks (vraagt een opgeslagen wachtwoord: botst met "geen geheimen") | **wekelijks** en vóór elke migratie |
| O6 | Onafhankelijke review vóór de bèta | extern (kosten); intern met geaccepteerd risico | Extern vóór de lancering is vast; voor de besloten bèta beslist de PO |
| O7 | Tekst van de bètamarkering | "Bèta", "Bèta · we leren nog", geen markering | Een rustige "Bèta" in Meer en op het inlogscherm, niet bovenaan elk scherm |
| O8 | Welke nieuwe functies in bèta-1 | geen; herhalende taken; herinneringen | Alleen wat in week 5 af is én zijn gate heeft; anders bèta-2 |
| O9 | Lettermint Starter | gratis houden; Starter (€10) | Gratis, met de melding bij 200; Starter als het tegoed of een eigen bètadomein nodig is |
| O10 | P2 (onbevestigde wijzigingen na uitloggen) | bewaren; wissen na waarschuwing | Wissen na waarschuwing (productiegeschiktheid) |
| O11 | Aantal gezinnen en volgorde | 3–5; in één keer of gespreid | Eerst 1–2, na een week zonder ernstige fouten de rest |

## Productkompas-toets (kort)

1. **Principes:** privacy volgt de situatie (gate 9, verwerkers, bewaartermijnen); principe 8 (echt gebruik als bewijs);
   rust boven volledigheid (lege staten, geen rondleiding, geen extra diensten).
2. **Neemt het werk weg?** Indirect: zonder bèta geen bewijs dat Thuisplanner werk wegneemt.
3. **Organiseren, onthouden, uitvoeren?** Randvoorwaarde, geen functie.
4. **Eenvoudiger?** Ja: dezelfde scripts als staging, geen nieuwe diensten, AVG-verzoeken met de hand.
5. **Aandacht, controle en privacy?** RLS en G1, back-ups, een verklaring vóór de eerste familie, geen tracking.
6. **Bewijs?** Dit levert het eerste bewijs van buiten het eigen gezin.
7. **Ultieme toets:** maakt toetsbaar of gezinnen minder hoeven te onthouden en te regelen.

**Gates:** gate 9 per domein in bèta-1; de gates van de besluiten 12–16 voor elke nieuwe functie; de navigatiegate
(besluit 2) wordt met de bèta juist gevoed. Huisplan en de importgates worden niet geraakt.

## Bronnen (alleen lezend nagekeken op 26 oktober 2026)

- [Supabase: prijzen (Pro $25, $10 tegoed, back-ups 7 dagen, PITR, limieten)](https://supabase.com/pricing)
- [Supabase: back-ups (dagelijks op Pro, 7 dagen; geen Storage; PITR vraagt Small)](https://supabase.com/docs/guides/platform/backups)
- [Supabase: facturering (twee gratis projecten; geen gemengde plannen in één organisatie)](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase: rekenkracht (Micro ≈ $10, Small ≈ $15; geen Nano op betaalde plannen)](https://supabase.com/docs/guides/platform/compute-and-disk)
- [Supabase: verwerkersovereenkomst](https://supabase.com/legal/dpa) en
  [klantdocumenten](https://supabase.com/legal/customer-resources/data-processing-addendum)
- [Lettermint: prijzen (gratis 300 per maand, 1 project, 1 domein; Starter €10 voor 10.000)](https://lettermint.co/pricing)
- [Lettermint: verwerkersovereenkomst (automatisch van kracht; EU; bewaartermijnen)](https://lettermint.co/dpa)
- [Cloudflare: verwerkersovereenkomst](https://www.cloudflare.com/cloudflare-customer-dpa/)
