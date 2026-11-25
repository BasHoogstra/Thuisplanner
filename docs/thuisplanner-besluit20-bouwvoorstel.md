# Besluit 20: persoonlijke instellingen en meldingen (bouwvoorstel)

- **Status:** concept, 24 november 2026. Niets gebouwd, geen migratie, geen commit. Ter beslissing door de producteigenaar.
- **Opdracht:** drie berichten van 24 november (weergavevoorkeuren, de uitbreiding met pushmeldingen, en de versnelling).
  Prioriteit: (1) PR #55 en #56 afronden, (2) startscherm, (3) weergave per scherm, (4) push met voorkeuren, (5) interne
  test met Bas en Sanne, (6) externe bèta met vijf gezinnen.
- **Mobiele voorbeelden:** `docs/afbeeldingen/besluit20-instellingen-mobiel.html` (acht telefoonschermen, licht en donker).
- **Gelezen:** `PRODUCT_PRINCIPLES.md`, besluiten 1–19, `docs/roadmap.md`, `docs/thuisplanner-meldingen.md` (M1–M8),
  `docs/thuisplanner-beta-voorbereiding.md`, en de code op `thuisplanner-overzicht` (de stand van PR #56).

## 0. Eerst melden: botsingen en wat niet in 7 dagen past

| # | Wat | Waarom het ertoe doet | Voorstel |
| --- | --- | --- | --- |
| B1 | "Een rustige standaard, met persoonlijke vrijheid" als **belangrijkste productprincipe** | `PRODUCT_PRINCIPLES.md` mag ik niet wijzigen zonder expliciete opdracht. Het principe past bij principe 2, 6 en 7, maar "persoonlijke vrijheid" kan schuren met principe 1 en vraag 3 van de productgrenzen ("kan het met minder zichtbare complexiteit?") | Vastleggen als **besluit 20** in `productkompas-beslissingen.md`, met als toets: elke instelling moet een echte, waargenomen behoefte oplossen (Sanne) en heeft een rustige standaard. Wil je het in het Productkompas zelf, geef dan die opdracht apart |
| B2 | De lijst met meldingen gaat ver voorbij **besluit 16** ("een kleine set herinneringen") en botst met **principe 6** en **beslissing 4** (alleen melden met echte waarde) | Activiteitsmeldingen (nieuw, gewijzigd, verwijderd, afgerond, boodschappen) zijn precies de "toasts over wijzigingen door anderen" die beslissing 10 al ter discussie stelde | Besluit 20 **verruimt** besluit 16: alles mag bestaan, maar activiteit staat **standaard uit** en komt in een tweede fase. In de bèta eerst de herinneringen plus "taak aan jou gegeven" (§4) |
| B3 | **Verjaardagen** bestaan nog niet als onderdeel | Een verjaardag is nu een jaarlijkse afspraak voor de hele dag (de + herkent "jarig"). Een eigen categorie hangt aan besluit 14 (contacten, eigen gate 9) | Geen eigen schakelaar of melding. Een verjaardag krijgt nu gewoon de herinnering voor een hele-dagafspraak |
| B4 | **Plannen op het Overzicht** | Besluit 19 houdt plan-taken zonder datum bewust van het Overzicht | Geen schakelaar "Plannen" op het Overzicht. Plan-taken mét datum staan er al, als gewone taak |
| B5 | Er is **geen service worker en geen webmanifest** | Zonder beide geen push, en op de iPhone werkt webpush alleen voor een app op het beginscherm (iOS 16.4+) | Eerst een kleine PWA-basis (§5.3), mét de regel uit besluit 17: geen echte gegevens in de browsercache |
| B6 | **Push in 7 dagen** is niet verantwoord | Besluit 16 eist eerst een pushproef op de testtelefoons en gate 9 voor het domein "meldingen". Herinneringen bij herhalende afspraken, wijzigingen, stille uren en zomertijd moeten aantoonbaar kloppen | Startscherm en weergave **wel** binnen 7 dagen bij Bas en Sanne; push daarna (§7) |
| B8 | Bij het onderzoek gevonden, **buiten deze scope** | (a) Het gezinsfilter laat taken zonder persoon weg bij één gekozen lid (`lib/filter.ts`, `taakPast`), terwijl het commentaar zegt dat ze bij het hele gezin horen; afspraken zonder persoon blijven wel staan. (b) Afspraken over meer dagen staan alleen op hun eerste dag. (c) Twee verouderde commentaren over Plannen (`lib/plan.ts:2`, `context.tsx:47`) | (a) is van belang voor "Ik" bij openen (§2) en hoort in PR V; (b) en (c) apart, na de bèta |
| B7 | **Bèta binnen 14 dagen** hangt niet alleen aan deze functies | Het werkplan van de bèta (§9) noemt ook de bèta-omgeving op Pro, back-ups en een hersteloefening, de privacyverklaring (die moet nu ook push noemen) en de Access-poort | Haalbaar alleen als die punten parallel lopen; anders schuift de bèta, niet de kwaliteitspoort |

## 1. Besluit 20 (tekst voor `docs/productkompas-beslissingen.md`)

> ### 20. Persoonlijke instellingen en meldingen (24 november 2026)
>
> - **Besluit van de producteigenaar:** Thuisplanner blijft één gedeelde omgeving voor het huishouden, met **een rustige
>   standaard en persoonlijke vrijheid**. Ieder account kiest zelf het startscherm, wat het Overzicht toont, hoe de
>   Agenda opent, en welke meldingen het wil. Zonder iets in te stellen werkt Thuisplanner prettig; instellingen zijn
>   nooit een stap in de onboarding.
> - **Productkompas:** principes 1, 2, 6 en 7; beslissingen 4, 10, 16 en 19; de regel "Privacy volgt de situatie".
> - **Uitgangspunten:**
>   - **Alleen de eigen weergave.** Een instelling verandert nooit gedeelde gegevens, de privacy, of wat een ander ziet.
>     Per account, nooit per huishouden of lid (M2). Een kind zonder account heeft geen instellingen.
>   - **Verbergen is niet verwijderen.** Wat verborgen is, blijft bereikbaar via de Agenda, Boodschappen of een link.
>     Geen instelling kan een scherm leeg maken; te laat en vandaag blijven zichtbaar zolang Te doen aan staat.
>   - **Weinig instellingen.** Alleen wat een waargenomen behoefte oplost. Geen aantallen, kleuren of sorteringen.
>   - *(Noot, 25 november 2026: de startschermregel hieronder is aangevuld met optie a; zie besluit 20 in
>     `docs/productkompas-beslissingen.md`.)*
>   - **Links gaan voor.** Een adres met een eigen scherm of item (een link, een uitnodiging, een melding) opent dat. Het
>     startscherm geldt alleen als de app zonder eigen adres opent. Wisselen tussen schermen keert nooit vanzelf terug.
>   - **Meldingen: herinneringen aan, activiteit uit.** Herinneringen aan eigen afspraken en taken staan standaard aan;
>     meldingen over wat anderen doen staan standaard uit. Nooit een melding over een eigen actie. Stille uren standaard
>     22:00–7:00. Toestemming per toestel, pas als iemand zelf meldingen aanzet (besluit 16).
>   - **Privacy in de melding:** een privé-afspraak van een ander geeft nooit een melding; een eigen privé-afspraak toont
>     geen titel; huishoudkennis staat nooit in een melding.
>   - **Herstellen:** één knop zet startscherm en weergave terug naar de standaard. Meldingen hebben een eigen
>     herstelknop, zodat iemand niet per ongeluk alle herinneringen kwijt is.
> - **Voorwaarden vóór implementatie:** gate 9 voor het domein "voorkeuren" (eigen rij alleen) en, apart, voor
>   "meldingen" (voorkeuren, toestellen, verzendlog); de pushproef van besluit 16; geen migratie, geheim (VAPID) of
>   uitrol zonder afzonderlijk akkoord.
> - **Wat verandert:** besluit 16 wordt verruimd (meer soorten meldingen, activiteit standaard uit). **Wat niet
>   verandert:** het Productkompas, de besluiten 1–15 en 17–19, en de maxima en volgorde van het Overzicht (besluit 19).

## 2. Functioneel ontwerp per scherm

Zie de voorbeelden 1–6. Eén ingang **Meer → Voor jou → Persoonlijke instellingen**, met vier regels.

| Scherm | Instelling | Keuzes (standaard vet) | Waarom wel of niet |
| --- | --- | --- | --- |
| **Startscherm** | Waar de app opent | **Overzicht**, Agenda, Taken (Agenda → Taken), Boodschappen | Sanne vroeg erom. Meer, Plannen, Spullen, Vakanties: niet. Daar begint niemand de dag, en Plannen staat achter een schakelaar |
| **Overzicht** | Onderdelen tonen | **Afspraken aan**, **Te doen aan**, **Boodschappen aan**, **Vakantie en suggestie aan** | Vier schakelaars; de maxima van besluit 19 blijven. Laatste onderdeel kan niet uit (geen leeg scherm). Verjaardagen en Plannen: zie B3 en B4 |
| **Agenda** | Standaardweergave | Dag, **Week**, Maand, Taken | De keuze waar Sanne mee begon. Nu opent de Agenda altijd op dezelfde weergave |
| **Agenda** | Wiens agenda bij openen | **Iedereen**, of Ik | Dekt "mijn taken / van anderen / niet toegewezen": het bestaande gezinsfilter, geen tweede filter. "Ik" toont ook wat voor het hele gezin is (zie B8a). Opgeslagen als `iedereen`/`ik`, niet als lid-id, zodat het in elk huishouden van het account werkt. Een doorklik vanaf het Overzicht toont altijd iedereen (review PR #55) |
| **Taken** | Afgerond en zonder datum | **ingeklapt** (zoals nu) | Geen schakelaar "verbergen": ingeklapt is al rustig en verbergen maakt dingen onvindbaar. Pas toevoegen als de bèta laat zien dat ingeklapt stoort |
| **Boodschappen** | – | – | Geen instelling. De lijst is al gedeeld en kort; persoonlijke varianten zouden verwarren ("staat het erop of niet?") |
| **Meldingen** | Zie §4 | | |

**Bewust niet** (gevraagd of denkbaar, maar zonder genoeg waarde): afspraken of hele-dagafspraken in de Agenda
verbergen (dan klopt de Agenda niet meer en ontstaan dubbele boekingen), vakanties uit de maand halen, aantallen op het
Overzicht, eigen sortering, thema's, "niet-toegewezen taken" als aparte schakelaar (zit al in het filter "Iedereen").

**Nu bestaat er niets hiervan:** de Agenda begint altijd op Week en Iedereen (`App.tsx:220`), het startscherm volgt
alleen het adres (`App.tsx:213`, leeg = Overzicht), en er is geen instellingenscherm. Meer heeft Vakanties, Plannen,
Spullen, Huishouden en Account.

*(Noot, 25 november 2026: aangevuld met optie a. Bij een echte nieuwe start geldt het startscherm ook op een gewoon
hoofdscherm; zie besluit 20 in `docs/productkompas-beslissingen.md`.)*

**Startscherm, precies:** bij het openen zonder `#/…` in het adres (start van de beginscherm-app, een gewone bladwijzer
naar de app) gaat Thuisplanner naar het gekozen scherm. Met een eigen adres (`#/agenda`, een melding, een uitnodiging,
een herlaadbeurt) opent dat adres. Dit gebeurt één keer per start, nooit bij wisselen. Zijn de voorkeuren van dit
account nog niet op dit toestel (eerste keer inloggen), dan opent het Overzicht en geldt de keuze vanaf de volgende
start: geen sprong terwijl iemand al kijkt.

## 3. Mobiele visuele voorbeelden

`docs/afbeeldingen/besluit20-instellingen-mobiel.html`: (1) de ingang onder Meer, (2) Persoonlijk met vier regels en
herstellen, (3) startscherm, (4) Overzicht-schakelaars, (5) Agenda en taken, (6) meldingen met de toestelstatus, (7) de
eigen uitleg vóór de systeemvraag, (8) het vergrendelscherm.

## 4. Meldingen: soorten, ontvangers en standaarden

| Melding | Ontvanger | Standaard | Fase | Opmerking |
| --- | --- | --- | --- | --- |
| Herinnering afspraak met tijd | Accounts van wie in de afspraak staat; bij een kind zonder account of "iedereen": alle volwassen accounts | **Aan**, 30 min vooraf | P1 | Per voorkomen van een herhalende reeks; uitzonderingen en losgemaakte keren tellen mee |
| Herinnering hele-dagafspraak | Idem | **Aan**, 8:00 op de dag | P1 | Eén bundel per dag als het er meer zijn |
| Herinnering taak met tijd | De verantwoordelijke; zonder verantwoordelijke niemand | **Aan**, op het tijdstip | P1 | Taken zonder tijd geven geen herinnering (die staan op het Overzicht) |
| Taak aan jou gegeven | De nieuwe verantwoordelijke, niet als die het zelf deed | **Aan** | P1 | De enige activiteitsmelding die standaard aan staat: iemand vraagt jou iets |
| Taak te laat | De verantwoordelijke | Uit | P2 | Kan zeuren; eerst zien of het nodig is |
| Afspraak nieuw / gewijzigd / verwijderd | Wie in de afspraak staat, niet de maker | Uit | P2 | Gewijzigd alleen bij datum of tijd; bundelen per 10 minuten |
| Taak afgerond door een ander | De maker van de taak | Uit | P2 | |
| Boodschappen toegevoegd | Alle accounts behalve wie toevoegt | Uit | P2 | Hoogstens één bundel per uur |
| Dagelijks gezinsoverzicht | Wie het aanzet | Uit | P2 | Alleen als er iets is; op een rustige dag niets |
| Vakantie (vertrek, voorbereiding) | Leden van de vakantie | Uit | P2 | |
| Verjaardagen | | – | met besluit 14 | B3 |

**Altijd:** nooit over een eigen actie; nooit over een privé-afspraak van een ander; stille uren (standaard 22:00–7:00)
schuiven een melding door naar het einde van de stille uren, behalve een herinnering met een tijd die dan al voorbij is
(die vervalt); hoogstens één melding per item per gebeurtenis per toestel; een tik opent het item zelf
(`#/agenda?item=…`), na inloggen als dat nodig is.

**Toestel en voorkeur gescheiden:** de voorkeuren gelden voor het account (alle toestellen). Elk toestel heeft zijn eigen
toestemming. Het scherm toont per toestel de stand ("Op deze iPhone: aan; op je laptop: uit") en een knop om dit toestel
aan of uit te zetten.

## 5. Technisch ontwerp

### 5.1 Opslag en synchronisatie van voorkeuren (PR V)

- **Eén tabel `public.account_preferences`**: `user_id uuid primary key references auth.users on delete cascade`,
  `prefs jsonb not null default '{}'`, `version int not null default 1`, `updated_at timestamptz`. RLS: alleen
  `user_id = auth.uid()` mag lezen, invoegen en wijzigen; geen enkele policy voor andere accounts, ook niet voor de
  eigenaar van het huishouden. Niets op `households` of `household_members` (M-architectuur §3.1).
- **Alleen bekende sleutels en waarden.** Een controle in de database (trigger) weigert onbekende sleutels en waarden,
  zodat er geen vrije gegevens in kunnen. Ontbrekende sleutel = standaard; zo hebben bestaande en nieuwe accounts zonder
  migratie van gegevens meteen de standaard, en een nieuwe instelling later ook.
- **Schrijven per sleutel** via één RPC `set_preference(key, value)` die atomair `jsonb_set` doet. Twee toestellen die
  verschillende instellingen wijzigen, overschrijven elkaar dus niet; dezelfde instelling: de laatste wint (aanvaardbaar
  voor een weergavekeuze). "Herstellen" is `reset_preferences(scope)`.
- **Offline en snel:** de app bewaart de laatst bekende voorkeuren per account in `localStorage` (zoals nu al de
  vakantie-keuze, `lib/vakantie.ts:46`), past ze direct toe bij het starten, en haalt ze op bij inloggen, bij
  terugkeren naar de app en in de bestaande vangnetronde van 30 seconden. Geen realtime-kanaal nodig. Uitloggen wist de
  lokale kopie.
- **Wijzigen zonder verbinding kan niet**, net als bij de inhoud: Thuisplanner is online eerst en verstuurt niets
  automatisch later (`thuisplanner-sync.js`, kop). De schakelaars staan dan uit, met "Geen verbinding". Dat is
  eenvoudiger en voorspelbaarder dan een tweede wachtrij alleen voor instellingen.
- **Demo:** dezelfde code met een geheugenopslag; de demo toont de instellingen ook.
- **Waarom geen `user_metadata` van Supabase Auth:** die komt mee in elk token, is niet per sleutel atomair en is lastig
  te testen in de RLS-tests. Een tabel past bij de bestaande migraties, tests en export.
- **Export en verwijderen:** de rij gaat mee in de data-export van het account en verdwijnt met het account (cascade).

### 5.2 Meldingen: tabellen (PR P1)

| Tabel | Inhoud | Toegang |
| --- | --- | --- |
| Voorkeuren | In `account_preferences.prefs` onder `meldingen.*` (aan/uit per soort, minuten vooraf, stille uren, tijdzone van het toestel) | Eigen rij |
| `push_devices` | `id`, `user_id`, `endpoint` (uniek), `p256dh`, `auth`, een label ("iPhone"), `created_at`, `last_ok_at`, `failures` | Eigen rijen lezen en verwijderen; aanmaken via RPC; de functie leest met de service-rol |
| `notification_log` | `user_id`, `device_id`, `kind`, `item_id`, `occurrence_date`, `fire_at`, `status`, `attempts` met **unieke sleutel** op (`device_id`, `kind`, `item_id`, `occurrence_date`, `fire_at`) | Niet leesbaar voor de app; bewaartermijn 30 dagen (pg_cron) |
| `notification_outbox` (P2) | Gebeurtenissen voor activiteitsmeldingen, met `actor` = `auth.uid()` | Alleen triggers en de functie |

### 5.3 PWA-basis (PR P0)

`manifest.webmanifest` met iconen en `start_url: "./"`, en een **minimale service worker** die alleen `push` en
`notificationclick` afhandelt. **Geen** cache van API-antwoorden of documenten (besluit 17); hoogstens de statische
app-bestanden, en in P0 zelfs dat niet. Op staging blijft Cloudflare Access ervoor staan: een melding die de app opent na
een verlopen Access-sessie, komt eerst op de Access-inlog uit. Dat is aanvaardbaar voor de interne test en vervalt met de
Access-poort van de bèta.

### 5.4 Plannen en versturen (PR P1)

- **Hetzelfde patroon als de uitnodigingsmail** (migratie `20261024120000`): pg_cron elke minuut → pg_net → een nieuwe
  Edge Function `stuur-meldingen`, met URL en geheim uit Vault. Geen nieuwe externe dienst: de pushdiensten van Apple,
  Google en Mozilla horen bij de browser en zijn gratis. Wel nieuw: een **VAPID-sleutelpaar** als geheim (akkoord).
- **Herinneringen worden elke ronde opnieuw berekend** uit de huidige gegevens, voor de komende 2 minuten, in één
  SQL-functie. Die gebruikt de bestaande `private.occurs_on` (`kg5c_inhoud.sql:172`, dezelfde regels als
  `herhaling.ts`, inclusief `event_exceptions` en losgemaakte keren) en de tijdzone van het huishouden
  (`households.timezone`). Afspraken staan als lokale datum en tijd zonder zone; de app leest `households.timezone` nu
  niet, dus ook de app gaat die zone gebruiken als het toestel in een andere zone staat (anders klopt de herinnering niet
  met wat de Agenda toont). Daardoor:
  - **gewijzigd** (andere tijd) → andere `fire_at` → de nieuwe tijd geldt, de oude komt niet meer voor;
  - **verwijderd** of **uitzondering** → komt niet meer voor → geen melding;
  - **zomer- en wintertijd** → de omrekening van lokale tijd naar UTC gebeurt per voorkomen, niet één keer per reeks.
- **Idempotent:** eerst een rij in `notification_log` met `on conflict do nothing`; alleen een nieuw ingevoegde rij wordt
  verstuurd. Twee rondes tegelijk sturen dus nooit dubbel.
- **Te laat na een storing:** een herinnering die meer dan 10 minuten te laat zou komen, wordt niet meer verstuurd
  (status `gemist`), zodat er na een storing geen stortvloed komt.
- **Naar het juiste item:** er is nu geen adres voor één afspraak of taak (`uitHash`, `App.tsx:36`, kent alleen
  vakanties, plannen en spullen). P1 voegt `#/agenda/<id>` en `#/taak/<id>` toe: de Agenda opent op die dag en het
  detailvenster gaat open. Is het item weg of niet zichtbaar, dan opent de dag met "Deze afspraak bestaat niet meer",
  zonder te verraden of het een privé-afspraak was.
- **Fouten:** 404 of 410 van de pushdienst → toestel verwijderen. 429 of 5xx → opnieuw in een volgende ronde, hoogstens
  3 keer. Na 5 mislukkingen op rij → toestel uit, en de app vraagt bij de volgende start opnieuw.
- **Vóór verzending gecontroleerd:** het account is nog lid van het huishouden, mag het item zien (dezelfde regels als
  de RLS, inclusief privé), en heeft de melding aan. De inhoud: tijd, titel en wie bij een gedeelde afspraak; geen titel
  bij een eigen privé-afspraak of een taak; nooit notities, plek of huishoudkennis.
- **Toestemming ingetrokken:** bij elke start vergelijkt de app `Notification.permission` met de serverstand en ruimt een
  dood toestel op. Uitloggen meldt het toestel af (zoals P2 bij onbevestigde opdrachten); accountverwijdering ruimt alles
  op via de cascade.

### 5.5 Databasewijzigingen (elk met een eigen akkoord)

1. `…_account_preferences.sql` (PR V): tabel, sleutelcontrole, RPC's, RLS, export.
2. `…_meldingen.sql` (PR P1): `push_devices`, `notification_log`, RPC's, Vault-sleutels, pg_cron-taak, opruimtaak.
3. `…_meldingen_activiteit.sql` (PR P2): outbox en triggers.

Geen wijziging aan bestaande tabellen of policies.

## 6. Privacy en beveiliging

- **Voorkeuren** zijn persoonsgegevens met weinig risico, maar zeggen iets over gewoonten (stille uren, tijdzone).
  Alleen het eigen account, niet de beheerder van het huishouden.
- **Pushinhoud** gaat versleuteld (webpush, aes128gcm) via de pushdienst van het toestel; die dienst kan de inhoud niet
  lezen, maar het vergrendelscherm toont hem wel. Daarom de minimale inhoud uit §5.4, en een open vraag (§10, A5) of de
  titel van gedeelde afspraken standaard op het vergrendelscherm mag.
- **Endpoint en sleutels** van een toestel zijn geheim genoeg om iemand meldingen te sturen: alleen leesbaar voor de
  service-rol, nooit terug naar de app.
- **Geen nieuwe verwerker** in juridische zin, maar de privacyverklaring moet de pushdiensten van Apple en Google en de
  bewaartermijn van het verzendlog noemen (punt voor het bètawerkplan).
- **Gate 9-bewijs:** tegenproeven dat account A de voorkeuren, toestellen en log van B niet kan lezen of wijzigen (ook
  niet als eigenaar), dat een melding over een privé-afspraak van een ander nooit ontstaat, en dat na verlies van
  lidmaatschap geen melding meer komt.

## 7. Planning, parallel werk en opleverdata

Eén werkdag is een dag bouwen en testen door Claude, plus jouw akkoorden. De data gaan uit van akkoorden op dezelfde
dag.

| PR | Inhoud | Hangt af van | Bouwtijd | Kan parallel met |
| --- | --- | --- | --- | --- |
| **#55/#56** | Reviewcorrecties (loopt in een andere sessie) | – | 0,5–1 dag | alles |
| **V** | Voorkeurentabel, startscherm, Overzicht-schakelaars, Agenda-standaarden, instellingenscherm, herstellen | #56 (Overzicht) | **3,5–4 dagen** | P0, P1-server |
| **P0** | Manifest, minimale service worker, pushproef op de telefoons van Bas en Sanne | – | **1 dag** + jouw proef op de telefoons | V |
| **P1** | Toestellen, verzendlog, `stuur-meldingen`, herinneringen (afspraak, taak, hele dag), taak aan jou, stille uren, meldingenscherm, de adressen `#/agenda/<id>` en `#/taak/<id>` | P0-uitslag; V (scherm en tabel) | **5–6 dagen** | V (serverdeel eerst) |
| **P2** | Activiteitsmeldingen, dagoverzicht, vakantie | P1 en bèta-gebruik | 3–4 dagen | na de bètastart |

**Kritieke pad:** P0-proef (werkt webpush op beide telefoons?) → P1 → gate 9 "meldingen" → staging → interne test.

**Vroegst realistisch:**

| Mijlpaal | Datum | Toelichting |
| --- | --- | --- |
| #55 en #56 gemerged en op staging | wo 25 – do 26 nov | Na jouw akkoord op merge en uitrol |
| Pushproef op de telefoons | vr 27 nov | P0 op staging; jij en Sanne zetten de app op het beginscherm |
| **Interne test: startscherm en weergave** | **di 1 dec** | Binnen 7 dagen. PR V op staging, inclusief de migratie |
| Interne test: herinneringen | wo 9 dec | P1 op staging, na gate 9; 2–3 dagen echt gebruik door Bas en Sanne |
| **Externe bèta** | **ma 14 dec**, eerst 1–2 gezinnen | 6 dagen later dan 14 dagen. Reden: P1 plus 2–3 dagen echte herinneringen bij jullie vóór vreemden ze krijgen. Verder hangt de datum aan het bètawerkplan (B7) |

**Alternatief voor de bèta:** start op di 8 dec zonder push, en zet de herinneringen een week later aan. Dat haalt de 14
dagen, maar dan zitten meldingen niet in de eerste bèta, en dat was je wens. Mijn advies: 14 december, met push.

**Uitgesteld** (voorstel, op jouw akkoord): Agenda-stap 5–7, Maaltijden & Recepten (2b), Plannen-uitbreidingen,
herhalende taken voor zover niet al klaar, Spullen-uitbreidingen. Wel door: de punten van het bètawerkplan (omgeving,
back-ups, privacyverklaring, Access-poort).

## 8. Testplan

| Wat | Hoe | Waar |
| --- | --- | --- |
| Twee gezinsleden, andere voorkeuren | Bas Agenda/Week, Sanne Overzicht zonder Boodschappen; de een ziet niets van de ander | e2e lokaal (twee accounts) |
| Eén account, twee toestellen | Wijzig op toestel 1, open toestel 2: zelfde stand; twee verschillende sleutels tegelijk: beide blijven | e2e lokaal (twee browsercontexten) + RLS-test `--gelijktijdig` |
| Offline | Zonder netwerk: laatst bekende voorkeuren gelden, schakelaars staan uit met "Geen verbinding"; verbinding terug: de stand van het andere toestel komt binnen | e2e lokaal (netwerk uit) |
| Startscherm | Start zonder adres → keuze; met `#/boodschappen`, uitnodiging of meldingslink → dat adres; wisselen en herladen → geen sprong | unit + e2e demo |
| Tonen en verbergen | Elke schakelaar; laatste onderdeel kan niet uit; te laat en vandaag blijven; verborgen blijft bereikbaar in de Agenda | unit (`vandaag.ts`) + e2e demo |
| Herstellen | Weergave terug naar standaard, meldingen blijven; en andersom | unit + e2e |
| Privacy en rechten (gate 9) | RLS-tests: A leest of wijzigt B niet, ook niet als eigenaar; geen melding over privé van een ander; geen melding na verlies van lidmaatschap | `thuisplanner/supabase/tests` |
| Herinneringen | Afspraak, hele dag, taak; herhalend met uitzondering; gewijzigd vlak voor de tijd; verwijderd; twee rondes tegelijk: één melding | unit op de functie (vaste klok) + lokaal met een testtoestel |
| Stille uren en tijd | 22:00–7:00; nacht over middernacht; de nacht van 29 maart en 25 oktober 2026 (zomer/winter); toestel in een andere zone | unit (vaste klok, `TZ`) |
| Toestemming ingetrokken, verlopen | 410 → toestel weg; toestemming uit in iOS → bij de volgende start opgeruimd; uitloggen → afgemeld | unit + handmatig op de telefoons |
| iPhone en Android | Beginscherm-app iOS 16.4+, Chrome Android, desktop Chrome/Edge; melding tikken opent het item | handmatig, checklist (Bas en Sanne) |
| Regressie | Volledige unit-, demo-e2e-, lokale en LAN-suite; de bestaande RLS-tests | CI |

## 9. Kosten

Webpush zelf is gratis. De kosten zitten in Edge Function-aanroepen en wat opslag. Uitgangspunt: 2 accounts per
huishouden, 6 meldingen per account per dag, één ronde per minuut (43.200 aanroepen per maand, ongeacht het aantal
gebruikers; de functie verstuurt in bundels).

| Huishoudens | Meldingen per maand | Edge-aanroepen | Extra kosten bovenop Supabase Pro ($25) |
| --- | --- | --- | --- |
| 5 | ~1.800 | ~45.000 | $0 (ruim binnen Pro: 2 miljoen aanroepen) |
| 100 | ~36.000 | ~50.000 | $0 |
| 1.000 | ~360.000 | ~60.000 | $0; het verzendlog is dan ~360.000 rijen per maand, met 30 dagen bewaren verwaarloosbaar |
| 10.000 | ~3,6 miljoen | ~100.000 tot ~300.000 (meer bundels) | Waarschijnlijk $0–10 aan functies; wel nagaan of één ronde per minuut 120.000 meldingen per uur haalt binnen de tijdslimiet van een functie (dan per ronde in porties) |

Voorkeuren kosten niets meetbaars (één kleine rij per account). Bedragen zijn een schatting; ⚠️ prijzen eerst nakijken
bij het Pro-besluit.

## 10. Beslissingen die jouw akkoord vragen

| # | Beslissing | Mijn advies |
| --- | --- | --- |
| A1 | Besluit 20 vastleggen zoals in §1, met de verruiming van besluit 16 (B1, B2) | Ja; Productkompas zelf niet wijzigen |
| A2 | De set instellingen van §2, inclusief wat er bewust **niet** in komt | Ja |
| A3 | Meldingen in twee fasen; in de bèta P1 (herinneringen en "taak aan jou") | Ja |
| A4 | Ontvangers van herinneringen bij een kind zonder account of "iedereen": alle volwassen accounts | Ja; elk kan het zelf uitzetten |
| A5 | Titel van een gedeelde afspraak op het vergrendelscherm | Ja, met later eventueel een schakelaar "details verbergen" |
| A6 | Externe bèta op 14 december met push (of 8 december zonder) | 14 december |
| A7 | Welk werk wordt uitgesteld (§7) | Zoals voorgesteld |
| A8 | Starten van PR V en P0 in eigen worktrees, parallel | Ja |
| Per stap | Elke migratie (V, P1), het VAPID-geheim, elke commit, push, merge en uitrol | Apart, zoals altijd |
