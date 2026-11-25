# Thuisplanner: centrale planning van de besloten bèta (14 december 2026 – eind mei 2027)

- **Status:** concept, 25 november 2026. Alleen planning. Niets gebouwd, gecommit, gepusht, gemerged of uitgerold; geen
  VAPID-sleutel, migratie, registratie of kostenpost.
- **Doel (Bas, 25 november):** aan het einde van de besloten bèta een functioneel vrijwel compleet product. Eén centrale
  planning voor alle werk, met werkpakketten, capaciteit, afhankelijkheden, streefdata, kosten en beslispunten.
- **Leidend:** `PRODUCT_PRINCIPLES.md` → `docs/productkompas-beslissingen.md` (nu met besluit 20) → `docs/roadmap.md` (met
  een verwijzing naar dit document) → de uitwerkingen hieronder.
- **Bouwt voort op:** `thuisplanner-besluit20-bouwvoorstel.md`, `thuisplanner-personalisatie-beta-plan.md` (meldingen,
  technisch ontwerp), `thuisplanner-taakstatus-bouwvoorstel.md`, `thuisplanner-paklijst-categorieen-voorstel.md`,
  `thuisplanner-beta-voorbereiding.md`, de agenda-adviezen, en het onderzoek
  `thuisplanner-agenda-koppelingen-onderzoek.md` (25 november 2026; verwerkt in §5, §6, §8, §9 en §10).
- **Codebasis gelezen:** `origin/thuisplanner-staging` (`4288909`, 25 migraties).

Leeswijzer: §0 eerst gemeld · §1 personalisatie volledig uitgewerkt (met het mobiele probleem) · §2 taken met tijd en
herinnering · §3 meldingen versneld · §4 werkpakketten en conflictanalyse · §5 tijdlijn · §6 agendakoppelingen ·
§7 capaciteit · §8 kosten · §9 risico's · §10 beslispunten.

---

## 0. Eerst gemeld: spanning met besluiten

| # | Wens | Botst met | Voorstel |
| --- | --- | --- | --- |
| **S1** | **Persoonlijke navigatie** | Beslissing 2: de navigatie wordt eerst getoetst aan werkelijk gebruik; principe 8 | Klein houden: alleen de **derde knop** kiezen (Boodschappen, of Taken, Plannen of Vakanties). Overzicht, Agenda, + en Meer staan vast. Wat mensen kiezen is meteen bewijs voor de navigatietoets (alleen aantallen, geen inhoud) |
| **S2** | **Blokken op het Overzicht ordenen** | Besluit 19: "wat nu of dringend is, gaat voor" | Ordenen mag, maar **"Nu"** (de eerstvolgende afspraak van vandaag, en taken die te laat of van vandaag zijn) staat altijd bovenaan. Alleen de rest is te ordenen |
| **S3** | **Thema, compact/ruim, ordenen** | Het bouwvoorstel van besluit 20 noemde thema's en eigen sortering "bewust niet" | Besluit 20 is nu vastgelegd met de ruimere richting; deze drie staan bij "nog te beslissen" tot jouw akkoord (B-P1). Licht/donker is technisch al voorbereid (`ontwerp/tokens.css` kent `data-theme`) |
| **S4** | **M8 ondersteuningsniveaus** | Principe 2 en 6 | Niet als aparte knop in de bèta (ongewijzigd advies) |
| **S5** | **Taken met tijd** | Besluit 18 (alleen de titel verplicht) en de + (een zin met een tijd wordt nu een afspraak) | Tijd en herinnering **optioneel en verborgen** tot iemand ze kiest; de + blijft een zin met tijd als afspraak zien, behalve als de gebruiker "Taak" kiest (§2) |
| **S6** | **Eén omgeving?** Draait de bèta op staging (jouw voorkeur van 10 november), dan is "eerst intern testen" op dezelfde database als de gezinnen | Bèta-voorbereiding §9a (staging blijft testomgeving) en besluit O1 | **Functieschakelaars per account op de server** (pakket F0): een fase staat eerst aan voor jou en Sanne, daarna voor iedereen, zonder nieuwe build. Nodig in beide varianten; beslissing O1 blijft (B-O1) |

---

## 1. Personalisatie, volledig uitgewerkt

### 1.1 Het mobiele probleem: "instellingen hebben geen zichtbaar effect"

> Het bugonderzoek loopt in de sessie die dit plan aanvroeg; ik heb daar niets aan veranderd. Hieronder alleen wat uit
> het **lezen** van de code op `origin/thuisplanner-staging` volgt, als hypothese voor dat onderzoek.

| Instelling | Hoe het nu werkt (code) | Waarom je op de telefoon niets ziet |
| --- | --- | --- |
| Startscherm | `Schil` leest `voorkeuren.bijStart` (de kopie op het toestel **bij het openen**) één keer in `useState` (`App.tsx`, `start`) | Een beginscherm-app op de iPhone wordt zelden echt opnieuw gestart: iOS hervat hem. En het adres staat na de eerste start vast op `#/vandaag`, dus "openen zonder adres" komt bijna nooit voor. Bij de eerste keer inloggen is `bijStart` leeg: de keuze geldt pas vanaf de volgende start |
| Agenda: weergave en Iedereen/Ik | De stand van de Agenda wordt één keer gezet uit `bijStart` (`App.tsx`, `agenda`-state) en blijft daarna "waar je was" | Een wijziging in Instellingen raakt de lopende Agenda niet; pas na een echte herstart van de app. Op de telefoon gebeurt dat zelden |
| Overzicht: onderdelen | `Vandaag.tsx` leest de **actuele** `voorkeuren.voorkeuren` | Dit zou direct moeten werken. Werkt het niet, dan zit de oorzaak elders (schrijven mislukt zonder melding, of de build zonder `VITE_VOORKEUREN`); dat bepaalt het bugonderzoek |

**Ontwerpregel voor de oplossing (opgenomen in besluit 20):** *een instelling werkt meteen en zichtbaar.*

1. **Agenda:** een gewijzigde standaard zet ook de lopende stand (`zetAgenda`) zodra iemand op de Agenda-knop tikt; en
   vanuit het Agenda-scherm zelf (§1.3, "Altijd zo openen") direct.
2. **Startscherm:** geldt ook bij **terugkeren na lange afwezigheid** (de app was langer dan 4 uur onzichtbaar →
   `visibilitychange`), niet alleen bij een koude start. Een link of melding gaat nog steeds voor. Onder de keuze één zin:
   *"Thuisplanner opent hiermee als je de app opent."*
3. **Bevestiging:** na elke wijziging een korte, rustige melding (*"Opgeslagen"*), of bij een fout *"Niet opgeslagen:
   geen verbinding"*. Nooit stil falen.
4. **Testen op het echte toestel:** de e2e krijgt een test "instelling wijzigen → scherm verandert zonder herladen", en
   de handmatige checklist op de iPhone een test "app op de achtergrond, 4 uur later openen".

Pakket **P-fix** (0,5–1 dag, na de uitkomst van het bugonderzoek). Het komt als eerste, vóór de bètastart.

### 1.2 De volledige set

Alle sleutels komen in **één** uitbreiding van `private.voorkeur_geldig` (dezelfde migratie als de meldingen, §4.3),
met vaste waarden, nooit vrije tekst. Ontbrekend = standaard.

| # | Onderdeel | Sleutel(s) | Keuzes (standaard **vet**) | Waar in te stellen | Pakket | Fase |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Persoonlijk startscherm** | `startscherm` (bestaat) | **Overzicht**, Agenda, Taken, Boodschappen (+ Plannen als dat de derde knop is) | Instellingen; Meer | P-fix | bètastart |
| 2 | **Persoonlijke navigatie** | `navigatie.derde` | **Boodschappen**, Taken, Plannen, Vakanties | Instellingen; lang drukken op de derde knop → "Andere knop kiezen" | P2 | 4 jan (S1, B-P2) |
| 3 | **Overzicht aanpassen** | `overzicht.*` (bestaat) | vier onderdelen **aan** | Instellingen; onderaan het Overzicht "Aanpassen" | P1 | bètastart |
| 4 | **Blokken ordenen** | `overzicht.volgorde` | **afspraken-taken-boodschappen-verder**; elke volgorde van die vier ("Nu" staat altijd boven) | Overzicht → Aanpassen: omhoog/omlaag-knoppen (geen slepen: werkt slecht op de telefoon en voor schermlezers) | P2 | 4 jan (S2) |
| 5 | **Agendaweergave** | `agenda.weergave` (bestaat) | Dag, **Week**, Maand, Taken | Instellingen; in de Agenda: het weergavemenu → "Altijd zo openen" | P1 | bètastart |
| 6 | **Standaardfilter Agenda** | `agenda.wie` (bestaat) | **Iedereen**, Ik | Instellingen; in het gezinsfilter → "Altijd zo openen" | P1 | bètastart |
| 7 | **Taken in Dag en Week** | `agenda.taken` | **tonen**, verbergen (blijven in Taken en op het Overzicht) | Instellingen; Agenda-menu | P2 | 4 jan |
| 8 | **Persoonlijke takenweergave** | `taken.groepering`, `taken.afgerond` | **op datum**, op status (met T1); afgerond **ingeklapt**, verborgen | Instellingen; in Agenda → Taken: kop → "Weergave" | P2 | 4 jan (na T1) |
| 9 | **Licht en donker** | `weergave.thema` | **Volgt de telefoon**, Licht, Donker | Instellingen → Weergave | P1 | bètastart |
| 10 | **Compact en ruim** | `weergave.dichtheid` | **Ruim** (zoals nu), Compact | Instellingen → Weergave | P2 | 4 jan |
| 11 | **Instellingen vanuit de schermen** | – | Op elk scherm hoogstens één ingang, in de kop of in een bestaand menu, die naar de juiste plek in Instellingen gaat (`#/instellingen/<deel>`) of de keuze ter plekke vastlegt | per scherm | P1 | bètastart |
| 12 | **Terugzetten** | `reset_preferences('weergave')` (bestaat), `('meldingen')` (nieuw) | Weergave terug (1–10); meldingen apart; per scherm "Standaard" waar een keuze ter plekke kan | Instellingen; per scherm | P1 | bètastart |
| 13 | **Meldingen** | `meldingen.*` | zie `thuisplanner-personalisatie-beta-plan.md` §1.3–1.4 | Instellingen → Meldingen; bij een afspraak of taak "Herinnering" | B1–B3 | §3 |

**Bewust niet** (ongewijzigd): kleuren, lettertypes, aantallen op het Overzicht, eigen sortering binnen lijsten, een
tweede filter naast het gezinsfilter, en verbergen van afspraken in de Agenda (dan klopt de Agenda niet meer).

### 1.3 Instellingen vanuit de schermen (rustig)

| Scherm | Ingang | Wat er gebeurt |
| --- | --- | --- |
| Overzicht | Onderaan, na de laatste regel: tekstlink **"Overzicht aanpassen"** | Opent `#/instellingen/overzicht` met tonen en ordenen |
| Agenda | In het bestaande weergavemenu (Dag/Week/Maand/Taken) een laatste regel **"Altijd zo openen"** (alleen als de huidige weergave niet al de standaard is) | Legt `agenda.weergave` vast; korte bevestiging |
| Agenda, gezinsfilter | Idem in het filtermenu, alleen bij Iedereen of Ik | Legt `agenda.wie` vast |
| Agenda → Taken | In de kop een knop **"Weergave"** | Groepering en afgerond |
| Navigatie | Lang drukken op de derde knop | "Andere knop kiezen" (alleen als S1 akkoord is) |
| Afspraak of taak | In het detailvenster één regel **"Herinnering"** | Persoonlijk, alleen voor jou (B3) |
| Meer | "Persoonlijke instellingen" (bestaat) | – |

Geen tandwielen op elk scherm, geen tips of uitleg-ballonnen (principe 2 en 6).

### 1.4 Technisch

- **App:** `lib/voorkeuren.ts` (type `Voorkeuren`, `SLEUTELS`, `uitOpslag`) uitbreiden; één contracttest houdt de lijst
  gelijk met de database.
- **Thema:** `document.documentElement.dataset.theme` = `light`/`dark` of weg (volgt het systeem), en de meta
  `theme-color` mee. Wordt toegepast vóór de eerste weergave uit de kopie op het toestel (geen flits). Kost weinig:
  `ontwerp/tokens.css` heeft de donkere set al; wel elk scherm nalopen op hard gecodeerde kleuren (contrast AA in beide).
- **Compact:** CSS-variabelen voor rijhoogte en ruimte (`--rij-pad`, `--blok-ruimte`) op `:root[data-dichtheid="compact"]`;
  aanraakdoelen blijven ≥ 44 px. Raakt veel CSS: daarom ná T1 en na de paklijst-UI (§4.2).
- **Ordenen:** `overzicht.volgorde` als één van de 24 volgordes (in SQL gecontroleerd als permutatie van de vier namen).
  `lib/vandaag.ts` krijgt de volgorde als parameter; "Nu" blijft vast bovenaan (besluit 19).
- **Navigatie:** `Navigatie.tsx` leest `navigatie.derde`; de route bestaat al voor alle vier de schermen.
- **Taken:** `taken.groepering` werkt in `TakenWeergave` (`Agenda.tsx`); "op status" vraagt T1.
- **Database:** alleen nieuwe sleutels in `voorkeur_geldig` en de weergavelijst in `reset_preferences`. Geen nieuwe tabel.

---

## 2. Taken met een optioneel tijdstip en een optionele herinnering

### 2.1 Wat de gebruiker merkt

- Een taak toevoegen blijft: titel, en eventueel een datum en wie. **Niets nieuws in beeld.**
- Pas als er een datum is, verschijnt bij **"Meer"** in het venster de keuze **"Tijd"** (een tijdkiezer per kwartier).
- Een taak met tijd staat in de Agenda (Dag, Week) en op het Overzicht op dat tijdstip, met de vink-cirkel (geen
  afspraakstijl).
- **Herinnering:** een taak met tijd geeft de verantwoordelijke standaard een herinnering op het tijdstip (instelbaar:
  op tijd, 15, 30 of 60 minuten ervoor, of uit). Daarnaast kan ieder bij elke taak (met of zonder tijd) via de regel
  **"Herinnering"** een persoonlijke herinnering zetten (*"herinner mij morgen om 9:00"*). Die is alleen voor jezelf.
- **De +:** "gymtas inpakken morgen om 8 uur" wordt nu een afspraak. Zo blijft het; kiest de gebruiker in de + "Taak", of
  begint de zin met een takenwoord ("niet vergeten", "moet"), dan wordt het een taak met tijd.

### 2.2 Technische wijzigingen

| Laag | Wijziging |
| --- | --- |
| Database | `tasks.due_time time` (null), check `due_time is null or due_date is not null`; kolomrechten `insert/update (due_time)`; de bestaande triggers (`guard_task_plan`, possession) laten het veld met rust. **Samen met T2** (In afwachting, notitie, opvolgdatum) in één additieve takenmigratie: één generale repetitie, één gate 9-ronde |
| Persoonlijke herinneringen | Eén tabel voor afspraken én taken: `item_reminders` (`user_id`, `household_id`, `item_soort` (`event`/`task`), `item_id`, `voorkomen date` (null = elke keer), `moment` (een vaste lijst: minuten vooraf, of een tijdstip op een dag)). RLS: alleen de eigen rij; cascade op account en item. Vervangt het aparte `event_reminders` uit het meldingenplan (M7) |
| Meldingen | De planner (`meldingen_te_versturen`) krijgt de soort "taak met tijd" en leest `item_reminders`; dezelfde privacyregels en dezelfde idempotentie |
| Sync | `thuisplanner-sync.js`: `due_time` in de takenvelden; `lokaal/omzetten.ts` en `types.ts` (`Taak.tijd`) |
| App | `ItemVenster`/`DetailVenster` (tijd achter "Meer"), sortering op tijd binnen een dag in `vandaag.ts`, `kalender.ts`, `Agenda.tsx`; de + in `intentie.ts`/`zin.ts` |
| Export, verwijderscript, nacontrole | nieuwe kolom en tabel mee (`avg-export.sql`, `SCHEMA_PER_STAND`) |
| Herhalende taken (besluit 15) | Nog niet gebouwd. Het herhalingscontract (A1, PR #50) moet een tijd bij een taak kunnen dragen; daarom dit pakket **vóór** herhalende taken en met hetzelfde veld |

**Gate:** gate 9 voor het takendomein (de uitbreidingen van taken, besluit 18) en de gate "Persoonlijke instellingen"
voor `item_reminders`.

**Bouwtijd:** takenmigratie (T2 + tijd) met tests 1,5 dag; app en sync voor de tijd 2 dagen; `item_reminders` en de
planner 1,5 dag; samen ±5 dagen. T2 zelf telt apart (taakstatus-voorstel: ±3 dagen).

---

## 3. Pushmeldingen: eerder door parallel bouwen

### 3.1 Wat er verandert ten opzichte van het eerdere plan

- **PR #57** (PWA-basis): eerst de basis omzetten naar `thuisplanner-staging` (de oude basis `thuisplanner-overzicht` is
  gemerged), CI opnieuw, en een **onafhankelijke review** (`@codex review`, want het raakt service worker, CSP en een
  geheim) vóór de merge. In de planning: wk 48.
- **B2 kan sneller:** de outbox en het verzendlog bestaan al in B1. De triggers en samenvattingen (B2) kunnen vanaf dag 3
  van de B1-bouw parallel worden gebouwd door een vierde sessie, op hetzelfde contract, lokaal getest. Ze gaan in een
  **eigen migratie** pas na B1 naar staging.
- **B3 kan sneller:** `item_reminders` hoort nu bij het takenpakket (§2) en wordt in de kerstperiode gebouwd en intern
  getest.

| Fase | Eerder plan | Nieuw | Wat het mogelijk maakt |
| --- | --- | --- | --- |
| B1 herinneringen, taak aan jou | 14 dec | **14 dec** | ongewijzigd (kritiek pad) |
| B2 activiteit, samenvattingen | 11 jan | intern **16 dec**; gezinnen **ma 4 jan** | parallelle bouw + functieschakelaars (F0) + interne test tijdens de kerst |
| B3 per-item herinnering, taak met tijd | 25 jan | intern **28 dec**; gezinnen **ma 11 jan** | takenmigratie in de kerstperiode, één migratie voor T2 + tijd |

Gezinnen eerder dan 4 januari kan technisch (21 december), maar dan heeft B1 maar één week gedraaid, net voor de
kerststop. Dat raad ik af.

---

## 4. Werkpakketten

### 4.1 Overzicht

Sessie = één Claude-sessie in een eigen worktree. "PO" = werk van jou. Elke commit, push, merge, migratie, geheim,
registratie en uitrol vraagt jouw akkoord.

| ID | Werkpakket | Dagen | Hangt af van | Raakt (bestanden) | Status |
| --- | --- | --- | --- | --- | --- |
| **X0** | Bugonderzoek instellingen op de telefoon | – | – | – | loopt (sessie die dit plan vroeg) |
| **P-fix** | Instellingen werken meteen en zichtbaar (§1.1) | 0,5–1 | X0 | `App.tsx`, `voorkeuren-opslag.ts`, `Instellingen.tsx` | gepland |
| **D0** | Besluit 20 en deze planning in de docs (lokaal klaar, niet gecommit) | – | – | `docs/` | klaar, wacht op akkoord |
| **F0** | Functieschakelaars per account op de server (`feature_access`, RPC `mijn_functies`), ook voor de UI | 1,5 | – | nieuwe migratie (deel van M-1), `context.tsx` | gepland |
| **W0** | PR #57: basis omzetten, CI, review, merge; VAPID-paar; pushproef | 0,5 + PO | – | PR #57 | gebouwd, wacht |
| **M-1** | **Eén migratie "voorkeuren en meldingen"**: alle nieuwe sleutels (§1.2 en meldingen), F0, `push_devices` (met `kanaal` en `token`, §6), outbox, verzendlog, `meldingen_config`, trigger N3, planner, pg_cron; gate 9 | 3,5 | contract | `supabase/` | gepland |
| **W2** | Edge Function `stuur-meldingen` | 2–2,5 | contract | `supabase/functions/` | gepland |
| **W3** | App meldingen (scherm, toestemming, toestel, adressen naar één item) | 2,5–3 | contract, W0 | `app/src/pwa`, `screens/Instellingen.tsx`, `App.tsx` (routes) | gepland |
| **P1** | Personalisatie bètastart: thema, ingangen vanuit de schermen, terugzetten, Agenda "Altijd zo openen" | 2 | P-fix, M-1 (sleutels) | `voorkeuren.ts`, `Instellingen.tsx`, `Agenda.tsx` (menu), `Vandaag.tsx` (link), `tokens.css` | gepland |
| **W5** | Integratie B1 + P1, generale repetitie, staging | 1,5 | M-1, W2, W3, P1 | – | gepland |
| **T1** | Taakstatus voor alle taken (zonder migratie) | 2 | – | `Agenda.tsx` (TakenWeergave), `DetailVenster.tsx`, `plan.ts` | voorstel |
| **B2** | Activiteit en samenvattingen (migratie M-2: triggers) | 3–4 | M-1-contract (bouw), W5 (uitrol) | `supabase/`, `functions/` | gepland |
| **P2** | Navigatie, ordenen, takenweergave, taken in Dag/Week, compact | 3 | P1, T1 (voor "op status"), paklijst-UI (CSS) | `Navigatie.tsx`, `vandaag.ts`, `Agenda.tsx`, `app.css` | gepland (S1–S3) |
| **TK** | Takenmigratie T2 + tijd, `item_reminders`, app, + (§2) | 5 + T2 3 | T1, M-1 | `supabase/`, `sync/`, `ItemVenster`, `DetailVenster`, `intentie.ts`, `zin.ts` | gepland |
| **B3** | Per-item herinneringen in de app, uitzondering stille uren | 1,5 | TK | `DetailVenster.tsx`, functie | gepland |
| **V7** | P7 vakantietaken (zichtbaarheid) | – | – | vakanties | loopt (andere sessie) |
| **PK** | Paklijsten: categorieën en items wijzigen | volgens voorstel | – | `Vakanties.tsx`, `VakantieVensters.tsx`, `vakantie.ts`, `categorie.ts` | voorstel |
| **SP** | Spullen: Q11 (privacy) en de uitrol | volgens Q11 | – | spullen | open |
| **HT** | Herhalende taken (besluit 15) op het herhalingscontract (A1, PR #50) | 5–7 | TK (veld tijd), A1-review | `tasks`, `herhaling.ts` | open |
| **AG-GM** | Google-project, domeinverificatie, toestemmingsscherm, merkverificatie | 0,5 + PO | privacyverklaring openbaar (BW) | – | dec |
| **AG-G0** | OAuth-prototype op staging (testmodus), demovideo, verificatie aanvragen | 3–4 | AG-GM; scopes vastgelegd | `supabase/functions/`, koppelscherm | jan |
| **AG-A** | Agenda fase A: model (herhalingscontract, tijdzone per afspraak, meerdaags) | 12–15 | ontwerpgoedkeuring v3; na M-1 (planner deelt `voorkomens_in_venster`) | `events`, `herhaling.ts`, `kalender.ts` | ontwerp klaar |
| **AG-B/C/D** | Agenda: motor, Google-adapter, proef ≥14 dagen | 18–28 | AG-A, AG-G0 | `supabase/`, `functions/` | feb–mrt |
| **AG-E** | Outlook persoonlijk (Graph); E2 uitgeververificatie later | 6–9 | AG-B; Entra-tenant | – | feb–apr |
| **AG-N1** | App-schil (Capacitor) voor iOS, Xcode Cloud, APNs-verzender, TestFlight | 7–10 | besluiten D2–D5 van het onderzoek; Apple-lidmaatschap | nieuwe map voor de app-schil, `functions/stuur-meldingen` (kanaal APNs) | jan–feb |
| **AG-N2/N3** | EventKit-plug-in, toestel-adapter, proef op iPhones, TestFlight voor gezinnen | 14–21 | AG-B, AG-N1 | app-schil, motor | mrt–mei |
| **BW** | Bètawerkplan: privacyverklaring (push, koppelingen), Access-poort, back-up en hersteloefening, verwijderscript, Pro-besluit O1 | volgens bèta-voorbereiding §9 | – | `docs/`, scripts | deels open |
| **L** | Lanceringseisen (productiegeschiktheid §5): export en verwijderen in de app, quota, externe review van het inloggen, monitoring | 6–10 | BW | – | feb–mrt |

### 4.2 Wat kan parallel zonder technische conflicten

**Regel:** twee sessies raken nooit tegelijk hetzelfde bestand, en er staat steeds hoogstens één migratie in de wachtrij
naar staging.

| Conflictpunt | Wie wil het | Oplossing |
| --- | --- | --- |
| `private.voorkeur_geldig` + `voorkeuren.ts` | personalisatie én meldingen | **Alle** nieuwe sleutels in M-1 (ook die voor P2), één eigenaar (de M-1-sessie). P1/P2 gebruiken ze alleen |
| `tasks` (migraties) | T2, tijd, herhalende taken, Spullen Q11b (`possession_id`) | Eén takenstroom, achter elkaar: Q11b → TK (T2 + tijd) → HT |
| `events` en `occurs_on` | meldingenplanner, agenda fase A | De planner leest alleen via `private.voorkomens_in_venster`; AG-A vervangt die functie en draait de herinneringstests mee |
| `Agenda.tsx` | T1, P1 (menu), P2 (takenweergave), TK (tijd tonen) | Eén UI-stroom "Agenda en taken", achter elkaar: T1 → P1-menu → P2 → TK |
| `app.css` / `tokens.css` | thema (P1), compact (P2), paklijst (PK), T1-kleuren | Thema eerst (alleen tokens); compact pas als PK en T1 gemerged zijn |
| `App.tsx` | P-fix, W3 (routes), P2 (navigatie) | P-fix eerst (klein); W3 alleen `uitHash` en routes; P2 alleen `Navigatie.tsx` |
| `sync/thuisplanner-sync.js` | TK, V7 | V7 eerst laten landen |
| Migratienummers | M-1, M-2, TK, V7, Q11b, AG-A | Nummer pas bij de bouw; vaste volgorde: V7 → M-1 → Q11b → M-2 → TK → HT → AG-A |

**Parallelle sporen** (hoogstens 4 sessies tegelijk; meer kun jij niet bijhouden met akkoorden, reviews en tests op de
telefoon):

| Spoor | Week 48–50 (tot de start) | Week 51–1 (start en kerst) | Januari | Februari–maart |
| --- | --- | --- | --- | --- |
| **1 Database en server** | M-1 (met F0) → W5 | M-2 (B2) | TK-database, HT | AG-B (motor) → AG-C |
| **2 Functie en meldingen** | W2 | B2-samenvattingen | B3; AG-G0 (prototype) | AG-E (Outlook) |
| **3 App personalisatie en meldingen** | P-fix → W3 → P1 | P2 | B3-app → AG-N1 (app-schil, APNs) | AG-N2 (EventKit) |
| **4 Agenda en taken UI / overig** | T1 | TK-app | AG-A (model) | AG-D (proef), L |
| **PO** | akkoorden, pushproef, privacyverklaring, Access | intern testen; Google-project en merkverificatie | gezinnen; Google-aanvraag; Apple-inschrijving | Entra; lanceringsbesluiten |

In januari tot en met mei lopen er twee agenda-sporen (zoals het onderzoek aanraadt) naast het afronden van B3, HT,
Spullen en paklijsten; dat blijft binnen vier sporen omdat de meldingen en de personalisatie dan klaar zijn.

---

## 5. Tijdlijn met streefdata

Weken volgens ISO (wk 48 = 23–29 november 2026). Elke uitrol: eerst intern (functieschakelaar voor jou en Sanne), dan
de gezinnen. Kerst: geen nieuwe functies voor de gezinnen van 23 december tot en met 3 januari; lokaal bouwen en intern
testen gaan door.

| Datum | Mijlpaal | Pakketten | Jouw akkoorden |
| --- | --- | --- | --- |
| wo 25 nov | Plan en besluit 20 (lokaal) | D0 | docs committen |
| do 26 – vr 27 nov | PR #57 omgezet, CI, `@codex review`; contract voor de sporen; P-fix na X0 | W0, P-fix | basis omzetten, VAPID-paar |
| ma 30 nov – di 1 dec | #57 gemerged; pushproef op beide iPhones (ook na herstart en na een dag) | W0 | merge, Pages-variabelen, uitrol |
| 30 nov – vr 4 dec | Bouw M-1, W2, W3, P1, T1 (lokaal) | sporen 1–4 | commits |
| ma 7 dec | PR's, `@codex review` (privacy, migratie, service worker) | – | push, PR |
| di 8 dec | M-1 op staging; functie; geheimen; schakelaars aan voor jou en Sanne | W5 | **migratie, functie, geheim, uitrol: elk apart** |
| wo 9 – vr 11 dec | Interne test: herinneringen, thema, instellingen vanuit de schermen | – | – |
| **vr 11 dec** | **Go/no-go** voor push en P1 bij de gezinnen | – | jij beslist |
| **ma 14 dec** | **Bètastart**: Overzicht, Agenda, Taken (met T1), Boodschappen, Vakanties, Plannen; personalisatie P1; meldingen B1 (of uit bij no-go) | – | toelaten per gezin |
| wo 16 dec | B2 intern | M-2 | migratie |
| 21 dec – 3 jan | Intern: P2, TK, B3. Gezinnen: geen nieuwe functies | – | migratie TK (intern) |
| **ma 4 jan** | **Gezinnen: B2 en P2** | – | schakelaars |
| **ma 11 jan** | **Gezinnen: taken met tijd, herinneringen per afspraak of taak (B3)** | TK, B3 | schakelaars |
| 7 – 18 dec | Privacyverklaring openbaar (ook Limited Use voor Google); Google-project, DNS-verificatie, merkverificatie | BW, AG-GM | publicatie, project, DNS |
| 5 – 29 jan | Agenda fase A; OAuth-prototype; herhalende taken; Spullen (na Q11); paklijsten | AG-A, AG-G0, HT, SP, PK | per migratie |
| ±15 jan | **Google-verificatie aangevraagd**; Apple-lidmaatschap (na de keuze van de uitgeversnaam) | AG-G0 | indienen, inschrijving, kosten |
| 18 jan – 19 feb | App-schil iOS met APNs en TestFlight; motor (fase B) | AG-N1, AG-B | commits; TestFlight |
| ma 1 feb | **Gezinnen: herhalende taken** (streef) | HT | – |
| 22 feb – 5 mrt | Google-adapter; Outlook persoonlijk (Graph) | AG-C, AG-E | Entra-tenant |
| 8 – 19 mrt | Interne proef Google ≥ 14 dagen (eigen gezin en Sanne); EventKit-plug-in | AG-D, AG-N2 | – |
| **±22 mrt – begin apr** | **Gezinnen: Google-koppeling** (na de koppelingspoort en de goedkeuring van Google) | AG-D | start koppeling |
| **±half apr** | **Gezinnen: Outlook persoonlijk** | AG-E | – |
| **±eind apr – half mei** | **Gezinnen: Apple via de app (TestFlight)** | AG-N3 | externe testers |
| **vr 28 mei 2027** | **Einde besloten bèta (voorstel, B-E)**: functioneel vrijwel compleet, met tweerichting voor Google, Outlook persoonlijk en Apple. Alternatief: vr 26 maart zonder koppelingen, die dan als updates na de bèta komen | – | beslissing lancering |

---

## 6. Agendakoppelingen (uit `thuisplanner-agenda-koppelingen-onderzoek.md`, 25 november 2026)

- **Uitgangspunt (besluit 20):** de bèta start zonder volledige koppelingen; betrouwbare tweerichting met Apple, Google
  en Outlook blijft het doel richting de publieke lancering; ICS is voor Apple geen eindoplossing.
- **Advies van het onderzoek, per aanbieder:**

| Aanbieder | Route | Op zijn vroegst / realistisch voor gezinnen | Kosten | Belangrijkste beperking |
| --- | --- | --- | --- | --- |
| **Google** | Direct via de Calendar API, op de server (fase A–D), met de **verificatie vroeg aangevraagd** op basis van een klein OAuth-prototype (G0) | **±22 maart** / eind maart – half april 2027 | €0 | De Google-review (2–12 weken); de omvang van fase A |
| **Outlook persoonlijk** | Direct via Microsoft Graph (fase E), zonder uitgeververificatie | **±half april** / eind april 2027 | €0 (⚠️ mogelijk creditcard voor de verificatie van een Azure-account) | Melding "niet-geverifieerd" |
| **Outlook werk/school** | Graph na uitgeververificatie (echte bedrijfsgegevens) | ±mei / juni 2027 | €0 | Bedrijfsgegevens nodig |
| **Apple (iCloud, Apple Agenda)** | **Een eigen app** (Capacitor) met **EventKit**, via TestFlight in de bèta; een eigen kleine plug-in | **±eind april** / half mei – begin juni 2027 | Apple Developer $99 per jaar; iOS-bouw via Xcode Cloud (inbegrepen) | iOS laat de app niet betrouwbaar op de achtergrond draaien: sync bij openen of als iOS de app wekt; uitgeversgegevens openbaar in de App Store |
| Apple, terugvaloptie | Thuisplanner als CalDAV-server (alleen de agenda "Thuisplanner") | ±half april / mei 2027 | €0–30 | iCloud-afspraken komen niet in Thuisplanner |
| Niet doen | CalDAV met een iCloud-app-wachtwoord (toegang tot mail en contacten); commerciële aanbieders (Nylas versnelt de verificatie niet, Cronofy ±$9.800 per jaar, beide extra verwerker) | – | – | – |

- **Versnellingen die het onderzoek aanraadt:** fase A (v3) goedkeuren vóór 5 januari; Google-project, domein en
  merkverificatie in december; het OAuth-prototype en de verificatieaanvraag half januari, los van de motor (winst
  ±3–5 weken); twee schrijvende sessies voor de agenda; TestFlight in plaats van een App Store-publicatie; Outlook
  persoonlijk vóór de uitgeververificatie. **Niet:** de interne proef van 14 dagen inkorten, of gezinnen in de
  Google-testmodus.
- **Gevolgen voor de rest van de planning:**
  - **M-1** krijgt in `push_devices` meteen een kolom `kanaal` (`webpush`, `apns`, `fcm`) en een generiek `token`, zodat
    een app later APNs kan gebruiken zonder herbouw (onderzoek D7). Native push via APNs is op de iPhone bovendien
    betrouwbaarder dan webpush (en vraagt geen beginscherm).
  - Een native app wijzigt het open beslispunt "eerst als web-app" in de roadmap (onderzoek K1/D3): eigen besluit.
  - Android-push via FCM vraagt Firebase: niet nu (onderzoek D6); Android houdt webpush.
  - De App Store vraagt echte, openbare uitgeversgegevens (onderzoek K6/D4): eerst beslissen onder welke naam
    Thuisplanner uitgeeft.
- **Werkpakketten** (onderzoek §13): G-M (Google-project en merkverificatie, 0,5 d + PO), G0 (prototype en aanvraag,
  3–4 d), A (12–15 d), B (9–13 d), C (6–10 d), D (3–5 d + ≥14 dagen proef), E (6–9 d), E2 (0,5 d), N1 (app-schil, APNs,
  TestFlight, 7–10 d), N2 (EventKit-plug-in en toestel-adapter, 12–18 d), N3 (proef op iPhones, 2–3 d + proeftijd).
  Samen ±60–85 werkdagen, in twee agenda-sporen van januari tot mei.

---

## 7. Capaciteit

| Periode | Werkdagen Claude (som van de sporen) | Sessies tegelijk | Jouw tijd (schatting) |
| --- | --- | --- | --- |
| 26 nov – 11 dec | ±20 (M-1 3,5; W2 2,5; W3 3; P1 2; P-fix 1; T1 2; W5 1,5; W0 0,5; reviewherstel 2–4) | 4 | ±1 uur per dag akkoorden en reviews; pushproef ½ dag; interne test 3 × ½ uur; privacyverklaring ½ dag |
| 14 dec – 8 jan | ±18 (B2 4; P2 3; TK 8; B3 1,5; herstel na bètafeedback 2) | 3 | feedback van de gezinnen; intern testen in de kerst naar keuze |
| januari | ±30 (HT 6; AG-A 13; AG-G0 4; AG-N1 begin; SP/PK volgens voorstel; feedback) | 4 | migratie-akkoorden; Google-aanvraag; Apple-inschrijving |
| feb – mei | ±55–70 (AG-B/C/D, AG-E, AG-N1/N2/N3; L 6–10) | 3–4 | Entra; TestFlight-testers; proeven op de telefoons; lanceringsbesluiten |

Het knelpunt is niet de bouwtijd maar jouw akkoorden, de reviews en het testen op de telefoons. Daarom: hoogstens vier
sporen, PR's gebundeld per spoor, en de schakelaars per account zodat een uitrol geen nieuwe build vraagt.

---

## 8. Kosten per maand

| Post | 5 huishoudens | 100 | 1.000 | Toelichting |
| --- | --- | --- | --- | --- |
| Supabase | €0 op staging (Free) of $25 (Pro, eigen bètaorganisatie, besluit O1) | $25 | $25–60 | ⚠️ prijzen nakijken bij O1. Pushmeldingen en personalisatie voegen zelf ±€0 toe (§6.4 van het meldingenplan) |
| Cloudflare (Pages, Access, Turnstile) | €0 | €0 | €0 | Access: gratis tot 50 gebruikers; met meer gezinnen wordt Access-vrij (de Access-poort) nodig |
| Lettermint | €0 | €0–10 | ±€10–30 | Free 300 mails per maand |
| Webpush | €0 | €0 | €0 | Pushdiensten van Apple, Google en Mozilla |
| Google-koppeling | €0 | €0 | €0–10 | API en verificatie gratis; CASA (±$500–4.500 per jaar) alleen als een scope toch *restricted* blijkt (niet verwacht; vaststellen in de console) |
| Apple: eigen app met EventKit | ±€8 | ±€8 | ±€8 | Apple Developer Program, $99 per jaar; iOS-bouw via Xcode Cloud (inbegrepen). Eenmalig: eventueel een Mac (±€700) als Xcode Cloud niet volstaat |
| Microsoft (Graph) | €0 | €0 | €0–10 | mogelijk een creditcard voor de verificatie van een Azure-account |
| Android-app (later, alleen als de uitvraag het vraagt) | – | – | – | Google Play $25 eenmalig |
| Commerciële koppeling | – | – | – | Niet gekozen (Nylas $15 / ±$266 / ±$2.700; Cronofy $819–2.399 per maand) |
| **Totaal** | **±€8–35** | **±€35–55** | **±€55–120** | |

---

## 9. Risico's (de belangrijkste)

| # | Risico | Maatregel |
| --- | --- | --- |
| R1 | Instellingen blijven "niet werken" op de telefoon | P-fix vóór de start, met een e2e en een handmatige iPhone-test (§1.1) |
| R2 | Webpush op de iPhone valt tegen | pushproef eerst; bij falen B1 uit, de bèta start toch |
| R3 | Te veel parallel: conflicten of jij raakt overbelast | hoogstens vier sporen, de conflicttabel (§4.2), één migratie tegelijk |
| R4 | Eén omgeving voor intern en gezinnen | functieschakelaars per account (F0); noodschakelaar meldingen |
| R5 | Te veel instellingen (principe 2) | standaard = zoals nu; alles achter Instellingen; na de bèta snoeien op gebruik |
| R6 | Compact breekt de leesbaarheid of aanraakdoelen | ≥ 44 px; visuele controle op iPhone SE en een grote telefoon |
| R7 | De Apple-route vraagt een eigen app: iOS laat hem niet betrouwbaar op de achtergrond draaien, de App Store vraagt openbare uitgeversgegevens, en er komt een tweede bouwstraat bij | sync bij openen en via een stille push; "laatst bijgewerkt" in beeld; TestFlight in de bèta; eerst de uitgeversnaam kiezen; `push_devices.kanaal` nu al (§6) |
| R7b | De Google-review loopt uit (>8 weken) of de scopes moeten later veranderen | merkverificatie in december, de aanvraag half januari met vastgelegde scopes; de rest van de bèta hangt er niet van af |
| R7c | Agenda en de rest tegelijk overbelasten jouw reviewtijd | twee agenda-sporen pas na B2/P2; hoogstens vier sporen in totaal |
| R8 | Takenmigratie raakt bestaande taken | additief, generale repetitie op een kopie van de export, nacontrole, gate 9 |
| R9 | Kerst | geen nieuwe functies voor gezinnen 23 dec – 3 jan |

---

## 10. Beslispunten

| # | Beslissing | Advies |
| --- | --- | --- |
| **B-D0** | Besluit 20 (lokaal toegevoegd in `productkompas-beslissingen.md`) en deze planning committen, met een verwijzing in de roadmap | Ja, na jouw lezing |
| **B-P1** | Licht/donker, compact/ruim en ordenen van het Overzicht opnemen (S3) | Ja, zoals in §1.2 |
| **B-P2** | Persoonlijke navigatie als "derde knop kiezen" (S1) | Ja; meten wat mensen kiezen |
| **B-P3** | "Nu" altijd bovenaan bij ordenen (S2) | Ja |
| **B-P4** | Startscherm ook na 4 uur afwezigheid (§1.1) | Ja |
| **B-T1** | Taken met tijd en herinnering zoals §2, samen met T2 in één takenmigratie | Ja |
| **B-T2** | Eén tabel `item_reminders` voor afspraken en taken (vervangt `event_reminders`) | Ja |
| **B-T3** | De +: een zin met tijd blijft een afspraak, behalve met "Taak" of een takenwoord | Ja |
| **B-M1** | B2 intern 16 december, gezinnen 4 januari; B3 gezinnen 11 januari | Ja |
| **B-M2** | PR #57: basis omzetten en `@codex review` vóór de merge | Ja |
| **B-F0** | Functieschakelaars per account op de server | Ja |
| **B-O1** | Waar draait de bèta (staging of een eigen Pro-project)? | Beslissen vóór 8 december: het bepaalt waar M-1, de functie en de geheimen komen |
| **B-E** | Einde besloten bèta: (a) vr 28 mei 2027, met tweerichting voor Google, Outlook persoonlijk en Apple; (b) vr 26 maart, koppelingen als updates daarna | **(a)**, want de koppelingen horen bij "functioneel vrijwel compleet" |
| **B-S** | Hoogstens vier parallelle sessies, in de volgorde van §4.2 | Ja |
| **Uit het meldingenplan** | D2–D10, D13 (standaarden, vergrendelscherm, samenvattingen, go/no-go, VAPID, bewaartermijn) | Zoals daar geadviseerd |
| **A-D1** | Ontwerp agenda fase A (v3) definitief goedkeuren, zodat A op 5 januari start | Ja |
| **A-D2** | Apple-route: eigen app met EventKit, met Thuisplanner als CalDAV-server als terugvaloptie; nooit een iCloud-app-wachtwoord | Ja |
| **A-D3** | Het beslispunt "eerst alleen web-app" herzien: een iOS-app (TestFlight in de bèta, App Store vóór de publieke lancering); de PWA blijft | Ja, voor iOS |
| **A-D4** | Onder welke naam Thuisplanner uitgeeft (particulier, eenmanszaak of rechtspersoon), met echte gegevens; daarna het Apple-lidmaatschap | Eerst de naam; inschrijven in januari |
| **A-D5** | iOS bouwen via Xcode Cloud | Ja |
| **A-D6** | Firebase (FCM) voor native push op Android | Nu niet |
| **A-D7** | `push_devices` met `kanaal` en `token` in M-1 | Ja |
| **A-D8** | Entra-tenant (mogelijk creditcardverificatie); persoonlijke accounts eerst; uitgeververificatie pas met echte bedrijfsgegevens | Ja, tenant in februari |
| **A-D9** | Een commerciële aanbieder als tussenstap | Nee |
| **A-D10** | Google: project, DNS en merkverificatie in december; prototype en aanvraag in januari (elk met eigen akkoord) | Ja |
| **A-D11** | Google-testmodus alleen voor jullie eigen gezin en Sanne | Ja |
| Per stap | Elke commit, push, merge, migratie, geheim, registratie, kostenpost en uitrol | Apart, zoals altijd |
