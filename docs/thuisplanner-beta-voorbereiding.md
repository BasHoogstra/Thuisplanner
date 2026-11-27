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
| 3. Publieke lancering | streefdatum begin juni 2027, vroegst eind mei (scenario 2, besluit 25 november 2026; zie de roadmap) | productie | iedereen, als product, privacy en beveiliging op orde zijn |

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
| Buildmodus | `beta`: `npm run build:beta` | Gebouwd (lokaal, pakket P1), op basis van `staging-build.ts` (§2.2) |
| `omgevingen.json` | `beta.supabaseRef` invullen, pas na controle in het dashboard (organisatie en kenmerk) | Zoals stap 0 van de overstap |
| Migraties | `verbinding.ps1 -Ref <kenmerk> -Omgeving beta` (dry-run), daarna `-Push` met de getypte bevestiging | Het script kent `-Omgeving beta` al en weigert nu een bèta zonder kenmerk |
| Nacontrole | `verbinding-controle.mjs na` met `KG_OMGEVING=beta` | Eerst de schijnafwijking met publishable keys oplossen (overstap stap 6, open punt) |
| Edge Functions | `functies.ps1 -Ref <kenmerk> -Omgeving beta` | Kent `-Omgeving beta` (pakket P1); weigert zolang `beta.supabaseRef` leeg is, en elk project van een andere omgeving of van Huisplan. Productie kan hier niet |
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

**Stand (25 november 2026, pakket P1, voorwaarde V3; lokaal gebouwd en getest, nog niet gecommit):**

- **Modus:** `src/lib/omgeving.ts` kent `demo`, `lokaal`, `staging`, `beta` en `productie`. `npm run build:beta` en
  `npm run build:productie` bouwen met `vite build --mode beta|productie`; de omgeving staat daarna vast in de bundel.
  Let op: Vite's eigen standaardmodus `production` is de demobuild (`npm run build`), niet de omgeving `productie`.
- **Kenmerk:** `scripts/staging-kenmerk.mjs <omgeving>` (vóór de typecontrole) én `controleerOmgeving` in de build zelf
  (L8) eisen precies `omgevingen.json → <omgeving>.supabaseRef`. Een kenmerk van een andere omgeving, een ander project
  en elk Huisplan-project worden geweigerd. Zolang `beta.supabaseRef` (of `productie.supabaseRef`) `null` is, stopt de
  build met de melding dat het kenmerk eerst moet worden vastgelegd. De enige uitzondering is de offline e2e
  (`KG_E2E_NEPPROJECT=1`, alleen uit de procesomgeving, en alleen voor het verzonnen project `NEP_REF`).
- **Geheimen, CSP, `noindex`:** dezelfde weigeringen als staging (`VITE_DEMO_*`, service-rol, `sb_secret_`); `connect-src`
  alleen de eigen site en precies het project (https en wss), Turnstile alleen met een sitekey; `X-Robots-Tag: noindex`.
- **Demo (N4):** een bèta- of productiebuild zonder geldige configuratie bouwt niet; en mocht de app toch zonder
  configuratie starten, dan toont ze een fout ("Weigering (bèta): …"), nooit de demo.
- **Markering (O7):** een rustige "Bèta · Thuisplanner is nog in ontwikkeling." op het inlogscherm en in Meer; geen balk
  of label bovenaan elk scherm, geen "Testomgeving" of "verzonnen gegevens", tabtitel gewoon "Thuisplanner". De uitleg
  "Wat werkt er in deze lokale versie?" in Meer staat alleen in lokaal en staging. Productie: geen markering.
- **Tests:** `tests/omgeving.test.ts` (bèta en productie, T20, N4, de uitzondering voor de e2e),
  `tests/beta-markering.test.tsx` (markering per omgeving, met tegenproef voor lokaal en staging),
  `npm run e2e:beta` (`e2e-beta/`: de bètabuild in de browser met CSP, en de tegenproeven van de buildbewaking met de
  echte `vite build`), en `supabase/tests/functies/functies-deploy.test.mjs` (`-Omgeving beta`). Ook in CI.
- **Nog open (niet in P1):** het bètaproject zelf (V2), en het invullen van `beta.supabaseRef` na controle in het
  dashboard (C3). De nacontrole `omgevingen.test.mjs` eist nu nog dat twee omgevingen nooit hetzelfde kenmerk hebben;
  als de bèta later productie wordt (O2, §9a), moet dat bij de overstap opnieuw worden bekeken.

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

#### Het API-scheidingsscript (regel "Huishoudscheiding"; voorwaarde V7, pakket P5)

Script: `thuisplanner/supabase/staging/scheiding.mjs`. Het deel "via de app" van de regel blijft een handmatige proef op
twee telefoons; het script doet het deel "via directe API-verzoeken".

**Wat het doet.** Het maakt per run vier verzonnen accounts (`scheiding-a1-<run>@test.invalid` enzovoort): gezin A en
gezin B, elk een eigenaar en een partner. De eigenaars komen alleen voor deze run op de testerslijst (G1). Elke sessie
is een echte codesessie (amr `otp`, een bestaande `session_id`) via een eenmalige inloglink van Supabase Auth; er gaat
daarbij geen mail uit, en elke sessie moet eerst door de toegangspoort (`mijn_toegang` = `ok`). Beide gezinnen krijgen
inhoud in elk domein: afspraken (gedeeld, privé, een reeks met een uitzondering, een deelnemer), taken, boodschappen,
een vakantie met paklijst, pakitem, vakantieboodschap en voorbereiding, leden (ook een kind), uitnodigingen (met link;
lokaal ook op e-mailadres), Mijn spullen met een gedeeld en een persoonlijk document (geüpload en bevestigd) en een
koppeling, en een plan met onderdeel en taak. Daarna probeert gezin A, met de sessie van de eigenaar én van de partner:

- **lezen:** elke tabel en view (19) zonder filter, gericht op de id's van B, en met een filter op huishouden B; zoeken op
  de tekst van B; `my_memberships`, `my_invites`, profielen, `household_channel(B)` en `uitnodigingsmails(B)`;
- **wijzigen:** elke schrijfbare kolom van B, toevoegen in B, kruisverwijzingen vanuit het eigen huishouden naar iets van B
  (vakantie, plan, spul, document, boodschap, deelnemer, eigenaar), en 30 functies met een huishouden, afspraak,
  uitnodiging, lid, paklijst of plan van B;
- **bestanden:** een link, download, overschrijven of upload via het bekende pad, het id onder het eigen huishouden, de
  publieke URL, `bevestig-upload` met het id van B, en de map van B bekijken.

Daarna moeten alle gegevens en bestanden van B precies gelijk zijn aan vóór de pogingen. Verder: een verlopen link van B
werkt voor niemand meer (vers werkte hij wel); een privé-afspraak van de eigenaar is voor de partner alleen "Bezet" en
zonder details (de eigenaar ziet ze wel); het kanaal van B gaat voor A niet open (een expliciete weigering); op het eigen
kanaal komen seintjes aan, maar geen enkel seintje over B, alleen de sleutels `t`, `id`, `v` en `op`, en geen tekst. Bij
elke controle hoort een tegencontrole die laat zien dat de controle iets meet (B heeft echt gegevens in elke tabel, de
partner ziet de eigen taken van A, het eigen kanaal ontvangt). Aan het eind ruimt het script altijd alles op (ook na een
fout): bestanden, huishoudens, accounts en testers, en controleert het dat er niets is achtergebleven.

**Weigeren.** Vóór er verbinding is, weigert het script: elke omgeving behalve `lokaal` en `beta` (staging bevat echte
gegevens van de gezinsbèta; productie nooit); online elk kenmerk dat niet precies bij `beta` in
`thuisplanner/omgevingen.json` staat (dus nu altijd: het bètakenmerk is nog `null`), een kenmerk van een andere omgeving,
elk Huisplan-kenmerk (ook in een adres of sleutel), een database-adres dat niet de session pooler van precies dat
project is, een sleutel van een ander project, een geheime sleutel op de plaats van de publieke, en lokaal alles wat niet
op 127.0.0.1 of localhost staat. Online stopt het ook als wachtwoordsessies aan staan of de sessiecontrole uit. De
weigeringen hebben een eigen zelftest zonder netwerk: `node thuisplanner/supabase/staging/scheiding.mjs zelftest`.

**Draaien, lokaal** (een eigen stack, bijvoorbeeld met `project_id` `thuisplanner_p5`; de waarden uit
`supabase status -o env`, eenmalig `npm ci` in `thuisplanner/supabase/tests/integratie`):

```
KG_OMGEVING=lokaal API_URL=… ANON_KEY=… SERVICE_ROLE_KEY=… DB_URL=… node thuisplanner/supabase/staging/scheiding.mjs
KG_OMGEVING=lokaal … node thuisplanner/supabase/staging/scheiding.mjs --tegenproef sessie
KG_OMGEVING=lokaal … node thuisplanner/supabase/staging/scheiding.mjs --tegenproef beleid
```

**Draaien, op de bèta** (later, met de producteigenaar, Access aan, nadat het bètakenmerk na controle in het dashboard
in `omgevingen.json` staat). Alleen in de omgeving van dit ene proces, nooit in een bestand of de chat: `KG_OMGEVING=beta`,
`KG_REF`, `KG_DB_URL` (session pooler zonder wachtwoord), `PGPASSWORD`, `KG_ANON_KEY` (publieke sleutel) en
`KG_GEHEIME_SLEUTEL` (de service-rol of `sb_secret_`; nodig om verzonnen accounts aan te maken, een inloglink te maken
en op te ruimen). Daarna het script, en de tegenproef `--tegenproef sessie`. Online maakt het script geen
uitnodiging op e-mailadres (die zou een echte mail versturen) en de tegenproef `beleid` (die het schema wijzigt) is
online geweigerd.

**Geslaagd als:**

- de gewone run eindigt met `GESLAAGD: gezin A ziet en wijzigt niets van gezin B; seintjes zonder inhoud; alles
  opgeruimd.` en code 0 (elke afwijking: `GEFAALD` met de lijst `NIET IN ORDE`, code 1);
- elke tegenproef eindigt met `TEGENPROEF GESLAAGD: het script faalde zoals bedoeld …` en code 0: de controles zagen de
  fout (met de sessie van B als "partner van A" zien onder andere lezen, leden, documenten, bestanden en het kanaal van
  B rood; met een te ruime leesregel op taken en de documentenbucket zien lezen en bestanden rood), en daarna is alles
  opgeruimd. `TEGENPROEF MISLUKT` betekent dat de controles blind zijn: dan telt ook de gewone run niet;
- de zelftest eindigt met `ZELFTEST GESLAAGD`.

**Wat het niet doet:** het deel via de app, de autorisatie per rol (eigenaar, beheerder, lid; regel "Autorisatie"), en de
gehoste tests H1–H19.

**Stand (25 november 2026), alleen lokaal** op een eigen stack (`thuisplanner_p5`, met de schakelaars zoals online:
wachtwoordsessies uit, `huishouden_open` uit): de gewone run **geslaagd** (316 van 316 controles); de tegenproef
`sessie` **faalde zoals bedoeld** (94 controles rood, waaronder lezen, leden, documenten, bestanden en het kanaal van B);
de tegenproef `beleid` **faalde zoals bedoeld** (18 controles rood: lezen van taken en de bestanden); de zelftest groen
(21 gevallen). Na elke run waren er geen testaccounts, huishoudens, bestanden, testers of tegenproefregels meer over.
Online (bèta) is niets gedraaid; dat volgt later met de producteigenaar, met Access aan.

#### Welke gehoste tests H1–H19 al een runner hebben (alleen geïnventariseerd, 25 november 2026)

"Runner" = een script in de repository dat de test tegen een online project uitvoert. Bron van de tests:
`docs/thuisplanner-deel2-bouwverslag.md` §4.2.

| Test | Runner? | Wat er is |
| --- | --- | --- |
| H1 codesessie (`amr`, `session_id`) | Nee | Handmatig: inloggen in de app. `scheiding.mjs` controleert `mijn_toegang` = `ok`, maar met een inloglink, niet via de codelaag; dat is dus niet H1 |
| H2 wachtwoordroutes | Nee | Alleen lokaal (`tests/integratie/poort.test.mjs`) |
| H3 uitloggen op alle toestellen | Nee | Alleen lokaal |
| H4 blootgestelde schema's | Ja | `verbinding-controle.mjs na` met `KG_ANON_KEY` (`private` moet PGRST106 geven) |
| H5 Storage en GraphQL | Deels | De nacontrole vergelijkt buckets en policies met de vaste lijst (de tekst "geen buckets" in het bouwverslag is sinds besluit 17 achterhaald); GraphQL nee |
| H6 Send Email-hook | Nee | Handmatig: een code aanvragen |
| H7 Auth-instellingen | Ja | `verbinding-controle.mjs na` met `KG_ANON_KEY` |
| H8 S1 aankomsttijd codes | Nee | Handmatige meting |
| H9 S2 limieten van Supabase | Nee | Handmatige meting |
| H10 pogingentellers onder gelijktijdigheid | Nee | Alleen lokaal (`k1.test.mjs`) |
| H11 Turnstile | Nee | Handmatig |
| H12 koude start | Nee | Handmatige meting |
| H13 logboeken | Nee | Handmatig in het dashboard |
| H14 uitnodigingsmail V1–V8 | Nee | `proefmail.mjs` toetst alleen de adapter en de idempotentie bij Lettermint, niet V1–V8 |
| H15 bounce-webhook | Nee | Handmatig |
| H16 pg_cron | Deels | De nacontrole ziet de taken actief; "na een nacht opgeruimd" is handmatig |
| H17 headers en CSP | Nee | Handmatig in de browser |
| H18 gratis tegoed | Nee | Dashboard (op Pro gaat het om het rekentegoed) |
| H19 automatische verzending | Deels | De nacontrole ziet pg_net, Vault en de taken; de mail binnen een minuut en pauzeren/hervatten zijn handmatig |

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

### 2.5 Acceptatievoorwaarde "Eén keer inloggen" (besluit van de producteigenaar, 26 november 2026)

**Besluit** ("Alle drie", op de drie voorstellen uit `docs/thuisplanner-inlogduur-advies.md`, 26 november 2026):
1. De voorwaarde "Eén keer inloggen" is een **bèta-gate vóór 14 december** (voorwaarde V11 in de roadmap): de 13
   testpunten hieronder en de **8-dagenproef, die uiterlijk 5 december begint**.
2. **Overbrugging:** de Access-sessieduur op staging gaat tijdelijk naar het maximum. De producteigenaar doet dat zelf
   in het dashboard. Dit is tijdelijk en telt niet als bewijs voor de gate.
3. **PR #57 komt vóór 14 december in de bèta-build:** de manifest, de pictogrammen, de beginscherm-tags
   (`apple-mobile-web-app-capable` e.d.) en de service worker. De pushproef zelf hoeft niet mee. Dit is een
   afhankelijkheid van P1 (V3).

**De voorwaarde.** Op `app.mijnthuisplanner.nl`, zonder Cloudflare Access, ziet een gebruiker na één code-inlog per
toestel in de volgende situaties **geen enkel inlogscherm en geen Access-scherm**: na een app-update, na het afsluiten
en herstarten van app en toestel, na offline openen, en na **minstens 8 dagen** niet openen. Dit geldt voor een
iPhone-beginscherm-app en voor een desktopbrowser (Chrome of Edge); Android Chrome als het toestel er is. Geslaagd =
alle testpunten groen, met datum en tijd vastgelegd. Waarom 8 dagen: net over de 7-dagenregel van Safari.

**Waarom het kan (uit het advies):** Supabase vernieuwt sessies zonder einddatum zolang er geen time-box of
inactiviteitslimiet is (gemeten: na vernieuwen blijft `amr: otp` en geeft de toegangspoort `ok`); netwerkfouten loggen
niemand uit. De twee echte voorwaarden zijn **één vast adres** (een ander adres is een andere opslag) en op de iPhone
een **echte beginscherm-app met manifest** (PR #57).

| # | Testpunt | Toestel | Verwacht | Wie |
| --- | --- | --- | --- | --- |
| 1 | Eerste inlog met een code in de beginscherm-app | iPhone (Bas en Sanne) | Binnen 2 minuten ingelogd; geen Access-scherm | PO, Sanne |
| 2 | App uit de app-wisselaar vegen en heropenen; telefoon herstarten | iPhone | Direct het huishouden, geen inlogscherm | PO, Sanne |
| 3 | Nieuwe build uitrollen (app-update), daarna openen en herladen | iPhone + desktop | Ingelogd; nieuwe versie zichtbaar | Claude (uitrol na akkoord), PO |
| 4 | Database-migratie uitrollen, daarna openen | iPhone + desktop | Ingelogd | Claude (na akkoord), PO |
| 5 | Vliegtuigmodus aan, app openen, na 2 minuten weer online | iPhone | "Geen verbinding", nooit het inlogscherm; daarna vanzelf verder (binnen 60–90 s) | PO |
| 6 | Minstens 8 dagen niet openen, daarna openen | iPhone-beginscherm-app | Ingelogd, geen code nodig | PO of Sanne (één toestel bewust laten liggen) |
| 7 | Minstens 8 dagen niet openen | desktop Chrome of Edge (browser gesloten) | Ingelogd | PO |
| 8 | Browser en computer herstarten | desktop | Ingelogd | PO |
| 9 | Toegangstoken verlopen (meer dan 1 uur dicht), daarna openen | iPhone + desktop | Ingelogd, hoogstens kort "Even geduld" | PO |
| 10 | Tegenproef: "Uitloggen op alle toestellen" op toestel A | A en B | B is bij de volgende actie uit (TPA02), A ook; opnieuw inloggen kan met een code | PO |
| 11 | Tegenproef: `app.mijnthuisplanner.nl` in een privévenster | desktop | Geen Access-scherm, wel het codescherm. `thuisplanner-app.pages.dev` en een preview geven het Access-scherm (of bestaan niet) | Claude (zonder inlog) |
| 12 | Auth-instellingen van de bèta | dashboard | Zoals vastgelegd hieronder | PO (schermafdruk), Claude legt vast |
| 13 | Geautomatiseerd (lokaal en in CI): code-sessie na vernieuwen `ok`; heropenen bewaard (bestaat al); T21 en T23 | — | Groen, met tegenproef | Claude |

**De 8-dagenproef (testpunt 6 en 7) begint uiterlijk 5 december.** Kan dat nog niet op de definitieve hostnaam, dan
loopt de proef op staging met een vergelijkbare opzet (beginscherm-app met de manifest van PR #57), en wordt hij op de
bèta korter herhaald (testpunt 9), met een tweede 8-dagenproef vanaf de verhuizing. Planning: zie de roadmap, V11.

**Wanneer is de gate groen voor 14 december** (besluit van de producteigenaar, 26 november 2026: "Ja, zo"):
1. **De 8-dagenproef op staging is geslaagd**: een iPhone-beginscherm-app (met de manifest van PR #57) en een desktop
   (Chrome of Edge) zijn minstens 8 dagen bewust niet geopend en daarna nog ingelogd, zonder code. Een Access-scherm
   dat ondanks de verlengde sessieduur verschijnt, wordt apart genoteerd en telt niet als fout van het inloggen zelf.
   Voorwaarde: de Auth-instellingen van staging zijn gelijk aan de vastgelegde bèta-instellingen (schermafdruk PO).
2. **De korte reeks op de bèta is groen**, na de verhuizing en vóór 14 december: testpunt 1–5 en 8–12 op
   `app.mijnthuisplanner.nl`, plus testpunt 13 (geautomatiseerd).
3. **De tweede 8-dagenproef op de bèta** begint op de verhuisdatum. De uitslag komt na 14 december, vóór de andere
   gezinnen. **Besluit van de producteigenaar (26 november 2026: "Ja"):** deze proef moet groen zijn voordat er nieuwe
   gezinnen bij komen; faalt die, dan gaan er geen nieuwe gezinnen bij tot de oorzaak is opgelost.

**Vastgelegde Auth-instellingen van de bèta** (checklist bij C2, controle in de nacontrole):
- JWT-expiry 3600 s;
- rotatie van refresh-tokens aan, herhaalmarge 10 s;
- **geen** time-box, **geen** inactiviteitstime-out, **geen** "single session per user" (pas op Pro beschikbaar: uit
  laten);
- de grens "Token refresh" niet lager dan 150 per 5 minuten per IP (een 429 bij een verlopen token wist de sessie in
  auth-js; restrisico, zie handeling 12).

**Afscherming van de technische hostnamen** (Access per hostnaam, niet per project):

| Hostnaam | Project | Access |
| --- | --- | --- |
| `app.mijnthuisplanner.nl` | `thuisplanner-app` | **Nee**, pas na de groene Access-poort (§2.3) en een apart akkoord; tijdens het inrichten wel (O3/C) |
| `thuisplanner-app.pages.dev` | idem | **Ja** (of een redirect naar het eigen domein): voorkomt een tweede adres met een eigen sessie |
| `*.thuisplanner-app.pages.dev` (previews) | idem | **Previews uit** (advies), anders Access: een preview zou met de bèta-database (straks productie) praten |
| `thuisplanner-staging.pages.dev` + previews | `thuisplanner-staging` | **Ja, blijft** (B1) |

Te verifiëren in het dashboard: "Enable access policy" in Pages beschermt standaard alleen de previews; het hoofdadres
moet apart in de Access-applicatie.

**Handelingen, elk met een apart akkoord van de producteigenaar** (niets hiervan is uitgevoerd):
1. Access-sessieduur op staging verlengen (de overbrugging; doet de PO zelf).
2. PR #57 (of alleen de manifest, de pictogrammen en de tags) samenvoegen naar staging, en later naar de bèta.
3. De kleine app-verbeteringen bouwen en committen: een eenmalige beginschermhint op de iPhone in een Safari-tabblad
   (§15.3), `navigator.storage.persist()` na het inloggen, de test "code-sessie na vernieuwen blijft `ok`", eventueel
   een `SIGNED_OUT`-luisteraar (T24), en geautomatiseerde varianten van T21 en T23.
4. P2 en de integratiebranch pushen, de Draft PR maken en naar staging zetten.
5. Het bèta-Supabase-project aanmaken (Pro, eigen organisatie) en de Auth-instellingen zetten zoals hierboven.
6. Het Pages-project `thuisplanner-app` en het eigen domein `app.mijnthuisplanner.nl` (DNS) koppelen.
7. Previews van `thuisplanner-app` uitzetten, en Access op `thuisplanner-app.pages.dev` (en eventueel de previews).
8. Access tijdelijk op `app.mijnthuisplanner.nl` tijdens het inrichten (O3/C), en Access daar uitzetten na de groene
   Access-poort.
9. Migraties en functies op de bèta-database, en de uitrol van de app.
10. De verhuizing van Bas en Sanne van staging naar de bèta: export en import van hun gegevens, en één nieuwe
    code-inlog per toestel (het ene inlogmoment op het definitieve adres; daarna nooit meer van adres wisselen).
11. De 8-dagenproef starten (welk toestel bewust blijft liggen, en vanaf welke datum).
12. Het restrisico "429 bij vernieuwen" vastleggen in `docs/thuisplanner-restrisico-besloten-beta.md`.

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
| Inzage of kopie | Een alleen-lezende SQL-snippet die per account de eigen gegevens als JSON geeft (huishoudens, eigen afspraken, taken, boodschappen, vakanties, spullen en documenten, plannen), uitgevoerd door de producteigenaar in de SQL-editor; per mail aan het eigen adres | `staging/avg-export.sql` (gebouwd, zie "Stand P4" hieronder) |
| Verwijderen | Zie **"Verwijderen op verzoek"** hieronder: een gecontroleerd verwijderscript voor de beheerder, geen handwerk in het dashboard | `staging/verwijderen.ps1` en `verwijderen.mjs` (gebouwd); nog de proef op de bèta |
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

**Stand P4 (voorwaarde V6, 25 november 2026): lokaal gebouwd en getest; nog niet gecommit; de proef op de bèta volgt
met de producteigenaar.**

- **Het verwijderscript** (`staging/verwijderen.ps1`, het werk in `staging/verwijderen.mjs`):
  - Aanroep: `verwijderen.ps1 -Ref <kenmerk> -Omgeving beta -Soort huishouden -Adres <eigenaar> [-Huishouden <id>]
    [-Ook <partner>]` voor variant (a), of `-Soort account -Adres <adres>` voor variant (b). `-Ook` alleen als de
    partner zelf ook om verwijdering vraagt; anders blijft dat account bestaan, zonder huishouden.
  - Verborgen prompts voor het databasewachtwoord en voor de pepper (`K1_PEPPER` van dat project, uit de
    wachtwoordmanager): de codelaag bewaart adressen alleen als HMAC met die pepper, dus zonder pepper zijn de codes en
    de tellers van de grenzen bij een adres niet te vinden. Staat er een recente code van het account, dan toetst het
    script de pepper daaraan en weigert bij een verkeerde. Dezelfde verbindingseisen als `verbinding.ps1` (kenmerk uit
    `omgevingen.json`, session pooler, TLS met de vastgepinde Supabase-root); zolang `beta.supabaseRef` leeg is,
    weigert het script de bèta vóór het verbindt.
  - Stap 1, alleen lezend: de huishoudens die weggaan (met leden en per lid of het account blijft), de aantallen per
    tabel, wat er in een huishouden dat blijft van het account verdwijnt, de resten bij het adres (testerslijst,
    uitnodigingen elders, codes, tellers), en **waar het account en het adres nu nog voorkomen** (dezelfde zoektocht
    als de controle). Wat de database zou weigeren (de enige eigenaar van een huishouden met andere accounts), staat
    hier al als weigering; dan wordt er niets verwijderd.
  - Stap 2: de getypte bevestiging `verwijder <omgeving> <adres>`.
  - Stap 3, één transactie (alles of niets), na een hercontrole onder vergrendeling dat er sinds het overzicht niets
    wezenlijks veranderde: het huishouden (variant a; alle inhoud via de cascades), de account(s) (de triggers van de
    database doen privé-afspraken, persoonlijke spullen en documenten, en het huishouden waar het account het enige
    account is), de testerslijst, de codes en tellers bij de hash van het adres, uitnodigingen naar het adres in andere
    huishoudens (ingetrokken, adres gewist), het eigenaarsveld van gedeelde bestanden, de regels in het
    **auditlogboek van Supabase Auth** (dat bewaart adres en account-id, ook ná het verwijderen van een account) en
    Realtime-berichten. Daarna de bestaande opruimronde voor de bestanden (`verwijderen-spullen.mjs`).
  - Stap 4, de controle "niets meer aanwezig": elke tekst-, uuid- en json-kolom van elke tabel in `public`, `private`,
    `auth`, `storage`, `realtime`, `net`, `cron` en `supabase_functions` wordt doorzocht op de account-id's, de
    huishouden-id's (variant a, en huishoudens die meegingen), de adressen en de hash van het adres; plus de controle
    van Mijn spullen op bestanden. Een tabel die niet te lezen is, telt als afwijking.
  - De laatste regel is de **registerregel zonder persoonsgegevens** (datum, soort, aantallen, uitkomst).
  - Plannen, vakanties (met paklijsten en boodschappenkoppelingen), afspraken, taken en boodschappen gaan in variant (a)
    mee via de cascades; in variant (b) blijven ze als gedeelde huishoudgegevens. De test toetst beide.
- **Integratietest** `tests/integratie/verwijderen.test.mjs` (lokale stack, het script als opdracht met de bevestiging op
  standaardinvoer): variant (a) met inhoud in alle domeinen, bestanden, een kind, een partner met account, een open
  uitnodiging, een uitnodiging naar het adres in een ander huishouden en een andere tester; variant (b); alleen een
  adres zonder account; weigeringen (database zou weigeren, verkeerde pepper, online zonder kenmerk) en een verkeerde
  bevestiging laten alles ongemoeid. **Tegenproeven:** een opzettelijk achtergelaten rij met het adres, de hash van
  het adres, een account-id, een huishouden-id, een regel in het auditlogboek, en een achtergelaten bestand laten de
  controle elk falen. Daarnaast met de hand nagegaan: zonder de opruiming van het auditlogboek eindigt het script met
  "AFWIJKING" en faalt de test.
- **Uitslag lokaal (25 november 2026, eigen stack `thuisplanner_p4`, 24 migraties):** `verwijderen.test.mjs` 5 van 5,
  `avg-export.test.mjs` 3 van 3, `dagoverzicht.test.mjs` 2 van 2, en `verwijderen-spullen.test.mjs` nog steeds 5 van 5;
  `statisch.js` geslaagd. De controle doorzocht 73 tabellen. De tests staan in `tests/integratie/run.sh` (CI).
- **Bij de proef op de bèta nagaan:** of de rol `postgres` online ook mag wat lokaal kan (regels uit
  `auth.audit_log_entries` en `realtime.messages` verwijderen, het eigenaarsveld van `storage.objects` leegmaken, en
  alle tabellen in de doorzochte schema's lezen). Zo niet, dan stopt het script met een fout of meldt de controle
  "niet te controleren" (fail-closed); dan eerst overleggen.
- **Inzage:** `staging/avg-export.sql`, één alleen-lezende select met de plek `VUL-HIER-HET-ADRES-IN`. Grens: nooit
  meer dan het account in de app mag zien (geen privé-afspraak, persoonlijk spul of document van een ander, ook niet
  als "Bezet"; geen adressen, account-id's, hashes of tokens van anderen). De bestanden zelf staan er niet in (alleen
  titel, soort, grootte); die gaan apart mee als daarom gevraagd wordt. Test `tests/integratie/avg-export.test.mjs`,
  met tegenproeven (zonder de privacyfilter, of met een ander huishouden erbij, faalt de toets).
- **Open punt voor de producteigenaar:** "Na een herstel uit een back-up voeren we de verwijderingen uit het register
  opnieuw uit" kan niet met een register zonder persoonsgegevens: dan is niet bekend wie opnieuw weg moet. Voorstel:
  na een herstel eerst alle accounts en huishoudens vergelijken met de stand van vóór het herstel; wat er na het herstel
  weer is maar daarvoor niet, opnieuw verwijderen. Of: een apart, versleuteld lijstje met de adressen van verwijderde
  accounts, alleen zolang de oudste back-up bestaat (hoogstens 4 weken). Besluit nodig.

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
| Codes en pogingen | Een alleen-lezend **dagoverzicht** (`staging/dagoverzicht.sql`, gebouwd): aantal aangevraagde, gebruikte en gecontroleerde codes, codes vervallen na te veel fouten, geremd door H/U/D, adressen aan de aanvraaggrens, vergrendelde adressen (H op), in Auth geblokkeerde accounts, nieuwe en onbevestigde accounts. Alleen aantallen, nooit adressen. Niet mogelijk, omdat de database het niet bijhoudt: het aantal geweigerde codeaanvragen en het aantal verwijderde onbevestigde accounts | dagelijks tijdens de bèta | producteigenaar (5 minuten) |
| Mailwachtrij | `private.uitnodigingsmail_stand()` (bestaat al): wachtend > 10 min, vastgelopen, onzeker, mislukt, niet bezorgd | in het dagoverzicht | producteigenaar |
| Mailtegoed en bezorging | Lettermint-dashboard; melding bij 200 per maand; bounces en spamklachten | wekelijks, en bij de melding | producteigenaar |
| Geplande taken | `cron.job_run_details`: laatste run van de **6** taken `succeeded` (sinds Mijn spullen ook `thuisplanner-documenten-opruimen`) | in het dagoverzicht | producteigenaar |
| Instellingen | De nacontrole (`verbinding-controle.mjs na`) | wekelijks en na elke wijziging | Claude, na akkoord |
| Fouten in de app | Bèta-1: de ErrorBoundary toont een rustige melding met "Meld dit" (mailto met tijdstip en schermnaam, geen inhoud). Geen externe foutmonitoring (geen nieuwe verwerker) | bij elke melding | producteigenaar |
| Functies en Auth | Logboeken in het dashboard (7 dagen op Pro): 5xx van de functies, `captcha_failed`, 429 | bij een melding of afwijking | producteigenaar, met Claude |
| Beschikbaarheid | Supabase-status en Cloudflare-status; geen eigen uptime-dienst in bèta-1 | bij klachten | producteigenaar |

**Stand P4 (25 november 2026): `staging/dagoverzicht.sql` lokaal gebouwd en getest; nog niet gecommit.** Eén
alleen-lezende select in de SQL-editor; per regel een onderdeel, een waarde en eventueel "let op" (bijvoorbeeld een
vergrendeld adres, een mislukte of niet gelopen geplande taak, of niet precies 6 geplande taken). Test
`tests/integratie/dagoverzicht.test.mjs`: elke regel telt precies wat erbij komt, oude codes (ouder dan 24 uur) tellen
niet mee, en er staat nooit een adres, hash of id in; met tegenproeven (een variant die een adres toont, of oude codes
meetelt, laat de toets falen).

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
| Q11 | Eén keer inloggen (§2.5, besluit 26 november 2026) | De 13 testpunten groen, met de 8-dagenproef (begin uiterlijk 5 december); PR #57 in de bèta-build; Auth-instellingen vastgelegd; technische hostnamen afgeschermd | Open: advies besloten, niets uitgevoerd |

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
