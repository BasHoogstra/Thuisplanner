# Changelog Huisplan

Elke stap uit de roadmap krijgt hier een regel. Wijzigingen staan eerst in de testversie
(`test/index.html`) en gaan pas na de tests naar de live-versie (`index.html`).

## 1.0.0 — Fase 0, stap 0.1 (testversie)
- Testvangnet in `tests/`: data-roundtrip, oude toewijzingen, rooktest van alle schermen
  (licht en donker, 390 px breed). Draaien met `node tests/run.js` (testversie) of
  `node tests/run.js --target=root` (live-versie).
- Versienummer `APP_VERSION` in de app.

## 1.0.1 — Fase 0, stap 0.2 (testversie)
- Bewaking: staat er in de serverdata `meta.migratedTo` (planner verhuisd) of een
  `meta.minAppVersion` die nieuwer is dan de app, dan slaat de app niets meer op in Firebase
  en toont een melding. Lokale wijzigingen blijven in de lokale cache. Verdwijnt de
  markering, dan gaat de app gewoon verder en slaat de lokale wijzigingen alsnog op.
- Geldt voor elk schrijfpad: gewoon opslaan, opnieuw proberen na een conflict en opslaan
  bij het sluiten van de app.
- De app schrijft deze velden zelf niet; dat gebeurt pas in fase 1.
- Tests: `tests/guard.test.js`; de nagebootste database geeft nu net als Firebase een
  412 bij een verouderde ETag.

## 1.0.2 — Fase 0, stap 0.3 (testversie)
- Gezins-DNA heeft een zijmarge en een kop zoals de andere schermen; kaarten lopen niet meer buiten beeld.
- Instellingen verwijst naar de deelknop in plaats van het niet-bestaande "Vandaag → Kopieer link".
- De signalen bovenaan Vandaag staan echt op urgentie (dagen tot het moment), zoals de instelling belooft.
- Onderhoud zonder "laatst gedaan" heet "Nog niet ingepland" en telt niet meer als dringend
  (Meer-teller, signalen, briefing, Vandaag).
- Afwijking van de roadmap: "garanties en kluis gebruiken dezelfde naamvelden" vervalt; dat
  bleek bij nader onderzoek geen fout in de app (garanties gebruiken overal `text`, de kluis `naam`).

## 1.0.3 — Fase 0, stap 0.4 (testversie)
- Eén manier van verwijderen: losse items gaan direct weg met "Ongedaan maken" (vaste taken,
  backlog, garanties, kluis, recepten, notities, verjaardagen, onderhoud, bestellingen,
  gewoonten, favorieten, verlanglijstje, vaste lasten, meerdaagse taken, vakantie-to-do's,
  uitgaven en paklijstitems). Ongedaan maken zet het item terug op dezelfde plek met hetzelfde id.
- Grotere dingen (een hele vakantie, een eigen lijst, iemand uit de paklijsten) houden hun
  bevestigingsvraag; een verwijderde vakantie is daarna ook ongedaan te maken.
- Vegen telt alleen als de beweging duidelijk zijwaarts is; schuin scrollen verwijderde eerder
  soms een item.
- Vaste taken op Vandaag hebben een menu met "Overslaan voor vandaag" (kon alleen met vegen).
- Afwijking: bij notities, kluis, verjaardagen, recepten en gewoonten is de bevestigingsvraag
  vervangen door "Ongedaan maken", zodat alles op dezelfde manier werkt.

## 1.0.4 — Fase 0, stap 0.5 (testversie)
- Taken die automatisch naar vandaag worden doorgeschoven, krijgen het veld `movedFrom`
  (oorspronkelijke datum) en tonen "oorspronkelijk di 27 sep". Oudere versies van de app laten
  dit veld ongemoeid.
- Onafgemaakte taken ouder dan 30 dagen bleven onzichtbaar op hun oude dag. Nu verschijnt op
  Vandaag "Er staat 1 oude taak open" met de keuze Naar vandaag, Opnieuw plannen of Klaar,
  elk met "Ongedaan maken"; bij meerdere ook "Alles naar vandaag".
- Bugfix (hoort bij 0.4): een gewone melding verborg een direct daarna getoonde melding met
  "Ongedaan maken" te vroeg, waardoor die niet meer aan te tikken was. Beide delen nu één timer.
- Tests: `tests/oldtasks.test.js` en een regressietest in `tests/delete.test.js`; de
  nagebootste database schermt de plannerlijst af zoals een goed beveiligde Firebase.

## 1.0.5 — Fase 0, stap 0.6 (testversie)
- Dagvenster (Dag openen, plus in Week, dag in Maand) gebruikt dezelfde rijen als Vandaag:
  afvinkcirkel, gegevens in één regel, menu per taak. Alles wat eerder losse knopjes waren zit
  in dat menu: bewerken, verplaatsen naar een datum, toewijzen, bestelstatus (besteld → geleverd
  → weg), verwijderen met ongedaan maken, reacties. Vegen om te verwijderen blijft.
- Het invoerformulier is volledig gebleven; categorie, prioriteit, voor wie, dagdeel, meerdere
  dagen en herinnering staan achter "Meer opties". De opgeslagen taak is identiek aan voorheen (getest).
- Het actiemenu kan nu ook boven het dagvenster openen (stond eronder).
- `recIntervalLabel` sorteert de dagen niet meer in de data zelf.
- Bekend, ongewijzigd gelaten: afvinken in het dagvenster schrijft geen regel in het
  Huisgeheugen, afvinken op Vandaag wel (was al zo).

## 1.0.6 — Fase 0, stap 0.7 (testversie)
- Maandweergave: cellen tonen stippen per taak in de kleur van de categorie (vaste taken als
  ring, afgevinkt vaag) in plaats van afgekapte tekst; meerdaagse taken als dunne balk; een
  klein vierkantje als er een dagnotitie is.
- Onder de maand de lijst van de geselecteerde dag (standaard vandaag) met afvinken en
  "Dag openen". Eerste tik selecteert een dag, nogmaals tikken opent het dagvenster.
- Elke cel heeft een toegankelijk label ("vrijdag 2 oktober, 7 items") en werkt met het toetsenbord.

## 1.0.7 — Fase 0, stap 0.8 (testversie)
- Onderhoud, Garanties, Vervaldata-kluis, Bestellingen, Recepten, Verjaardagen, Backlog en
  Vaste taken openen op de inhoud. Het invoerformulier staat achter de knop "Nieuw …"/"… toevoegen"
  en opent als sheet; het sluit na een geslaagde toevoeging en blijft open bij een fout.
- Velden, id's, validatie en het opgeslagen object zijn ongewijzigd (getest per scherm).
- Bij het openen van deze schermen springt het toetsenbord niet meer omhoog; de focus gaat
  naar het eerste veld zodra het formulier opent.

## 1.0.8 — Fase 0, stap 0.9a (testversie): Wie is waar
- Lijn-iconen i.p.v. emoji voor de statussen (twee nieuwe iconen: werk, sporten), "Vandaag"-label
  i.p.v. ster, blokjes zijn echte knoppen met een toegankelijk label, tekst minimaal 13 px.

## 1.0.9 — Fase 0, stap 0.9b (testversie): Vakanties
- Nieuwe vakantie toevoegen zoals op Vandaag; vakanties en de vijf subtabbladen als chips op één
  regel (To-do liep over twee regels); kop met één menu voor kopiëren, afvinkjes resetten en
  verwijderen; labels en aftelling zonder emoji.
- "Kopieer van…" gebruikte de browservensters `prompt()` en `confirm()` ("voer het nummer in");
  nu een keuzemenu en de eigen bevestigingsdialoog. Het kopiëren zelf is ongewijzigd.

## 1.0.10 — Fase 0, stap 0.9c (testversie): Gewoonten
- Lijstrijen en afvinkcirkels zoals op Vandaag, prullenbak-knop, lege staat, invoer onderaan als
  veld met plusknop. Het gekozen icoon per gewoonte (data) blijft getoond.

## 1.0.11 — Fase 0, stap 0.9d (testversie): Kluis, Huisgeheugen, Recepten
- Lijn-iconen in een gekleurd vlak i.p.v. emoji (kluis per soort document, huisgeheugen per soort
  gebeurtenis, recepten); de receptcategorie staat nu als tekst in de kaart.
- "Recept openen" en "… ingrediënten naar lijst" als gewone knoppen; lege staat bij Recepten.
- De keuzelijst van de maaltijdplanner toont alleen de receptnaam (gebruikte de verwijderde emoji).
- Rooktest controleert nu ook dat binnen elk scherm niets rechts buiten beeld valt.

## 1.0.12 — Fase 0, stap 0.9e (testversie): Gezins-DNA en Statistieken
- Gezins-DNA: lijn-iconen in een gekleurd vlak i.p.v. emoji op kaarten en inzichten.
- Statistieken: categorieën met een gekleurde stip i.p.v. emoji.

## 1.0.13 — Fase 0, stap 0.9f (testversie): Vaste lasten
- Openklappen van een categorie met het chevron-icoon i.p.v. het teken ▸.

## 1.0.14 — Fase 0, stap 0.9g (testversie): Notitieboek
- "Nieuwe notitie" als primaire knop met icoon, zoals de andere schermen.

## 1.0.15 — Fase 0, stap 0.9h (testversie): Ochtendbriefing
- Letter en labels van de app i.p.v. de krantenletter; logo i.p.v. 📰; weericoon als lijn-icoon
  (zelfde als bovenaan Vandaag); aandachtspunten met lijn-iconen; geen emoji in koppen.
- Inhoud, volgorde en het automatisch openen zijn ongewijzigd.
- Afwijking: Weekoverzicht en Verlanglijstje zijn niet aangepast; die voldeden al na stap 3a.

## 1.0.16 — Fase 0, stap 0.10 (testversie)
- Herinnering: onder het tijdveld staat dat de melding alleen komt als Huisplan op dit toestel
  open of op de achtergrond actief is (er zijn nog geen echte pushmeldingen; fase 4).
- Woorden gelijkgetrokken: "Verwijder" en "Weggooien" zijn overal "Verwijderen".
- Weekscore op vrijdag: geen percentage of oordeel meer, maar "Deze week samen N taken afgerond";
  geen melding als er nog niets is afgerond.
- Gezins-DNA: de kaart "Meeste taken afgerond" (een winnaar) is "Samen afgerond" geworden; de
  verdeling per persoon blijft eronder staan.

## 1.0.17 — Fase 0, stap 0.11 (testversie)
- Instellingen → "Vandaag": ochtendbriefing, seizoenstips en het weekoverzicht op vrijdag zijn
  per toestel uit te zetten. Standaard staat alles aan (zelfde gedrag als voorheen).
- De keuze staat alleen in de lokale opslag van het toestel, niet in de gedeelde data.
- De briefing blijft altijd met de knop te openen.
- Tests: `tests/options.test.js`.

## 1.0.18 — Fase 0, stap 0.12 (testversie)
- Opgeruimd, alleen wat aantoonbaar nergens meer gebruikt wordt:
  - vier functies die nergens werden aangeroepen: `renderBriefjes`, `openWatEtenWeFromBtn`,
    `personColor`, `getMaaltijdWeekKey`;
  - ruim 290 CSS-regels voor klassen die in geen enkele HTML of JavaScript meer voorkomen
    (oude kop, oude Meer-kaarten, oude taak-, boodschappen- en cadeau-opmaak, briefjes).
    Klassen die de app met code opbouwt (`status-…`, `prio-…`, `exp-…`) zijn bewust blijven staan.
- Data blijft onaangeroerd: de velden `briefjes` en `cadeaus` blijven bestaan en worden nog
  steeds gelezen en bewaard. (`renderBriefjes` werd nooit aangeroepen, dus het automatisch
  opruimen van oude briefjes gebeurde al niet.)
- Controle: alle 60 screenshots van de rooktest (licht en donker) zijn vóór en na het opruimen
  byte-identiek; volledige testset geslaagd.

## 1.0.19 — Fase 0, stap 0.13 (testversie)
- Dataformaat vastgelegd: `docs/dataformaat-v1.md` (beschrijving) en
  `docs/dataformaat-v1.schema.json` (JSON-schema). Het schema is ruim: onbekende velden blijven
  toegestaan.
- De app zet `meta.schemaVersion = 1` als dat ontbreekt, **alleen bij een opslag die toch al
  gebeurt**. Alleen openen veroorzaakt geen extra schrijfactie, een bestaande waarde wordt nooit
  overschreven en de rest van `meta` blijft staan.
- Achterwaarts compatibel: getest dat de live-versie het veld bewaart als zij opslaat.
- Tests: `tests/schema.test.js` (de testdata en wat de app opslaat voldoen aan het schema, het
  schema keurt foute data af, en de live-versie houdt het veld). De andere tests negeren alleen
  dit ene nieuwe veld.

## 1.0.19 — Fase 0 live
- De testversie (1.0.0 t/m 1.0.19, stappen 0.1 t/m 0.13) is overgenomen in de live-versie
  (`index.html`). Geen wijzigingen uit fase 1; nog steeds Firebase.
- Enige verandering aan bestaande data: `meta.schemaVersion = 1` bij de eerstvolgende gewone opslag.

## Fase 1, stap 1.1 — Supabase-omgevingen en migraties (geen app-wijziging)
- Twee omgevingen: productie `tmkhpiomdnneeoscsjge` (bestaand, leeg) en staging
  `rfgmaqqsjvsuibfucdrp` (nieuw, eu-west-1). Zie `supabase/README.md`.
- De twee bestaande migraties staan letterlijk in `supabase/migrations/` (md5 gelijk aan productie).
- `supabase/config.toml` voor de Supabase CLI; `supabase/tests/schema_fingerprint.sql` om staging
  en productie te vergelijken.
- `tests/supabase.test.js`: migratienamen en -volgorde, toegepaste migraties mogen niet meer
  veranderen, geen service-role- of secret-sleutels in de repository, app gebruikt nog geen Supabase.
- `.env` en `.env.*` in `.gitignore`.
- Migraties op staging toegepast met de Supabase CLI (zie fase-1-notities, punt 6).
- Correctie: migratie `20261002064401` maakt `pgcrypto` nu expliciet aan en roept
  `extensions.gen_random_bytes` aan. Zonder dat liep `supabase db reset --linked` vast, omdat de CLI
  migraties uitvoert zonder `extensions` in het `search_path`. Bewuste uitzondering op "toegepaste
  migraties veranderen niet": de productiehistorie wijkt daardoor tekstueel af van Git; het schema is
  gelijk. Nieuwe test: geen extensiefuncties zonder `extensions.` in migraties.
- `.gitattributes`: `*.sql text eol=lf`. Een Windows-checkout met CRLF gaf op staging functies met
  CR-tekens en daardoor een andere schema-vingerafdruk dan productie. Nieuwe test: geen CR in migraties.
- **Afgerond (3 okt 2026):** staging volledig herbouwd met `supabase db reset --linked` vanuit een
  LF-checkout van `supabase/migrations/`. Schema-vingerafdruk staging = productie: 97 onderdelen,
  md5 `3e81d04cd0775634d6bac6604db9aa3d`. Productie ongewijzigd; testset 52/52.

## Fase 1, stap 1.2 — Schema voor leden, sync, import en bestanden (geen app-wijziging)
- Nieuwe migratie `20261003090000_leden_sync_import_opslag.sql` (bestaande migraties ongewijzigd).
- Leden: eigen member-ID, account optioneel (kinderen en niet-aangemelde volwassenen zijn gewone
  leden), naam, soort (volwassene/kind), kleur, volgorde, oude namen. Koppelen aan een account alleen
  via een uitnodiging; een uitnodiging voor een bestaand lid maakt geen tweede lid.
- Beheerders (`owner`, meerdere mogelijk) en gezinsleden (`member`); altijd minstens één beheerder met
  account. Nieuwe functies `transfer_ownership` en `leave_household`.
- Items: grafstenen (`deleted_at`, geen hard verwijderen via de API), revisieteller `rev`,
  `created_at`/`created_by`.
- `legacy_imports` voor de import in 1.12; bucket `household-files` met regels per huishouden.
- Beveiliging: rechten van `anon` ingetrokken (ook voor toekomstige tabellen), geen truncate meer
  voor ingelogde gebruikers, security-definer-functies naar schema `private`.
- Tests: `supabase/tests/rls_tests.sql` (20 scenario's), lokaal draaiend via
  `supabase/tests/lokaal/run.sh` en in `node tests/run.js`.
- Staging (3 okt 2026): volledig herbouwd met `db reset --linked` (drie migraties).
  **RLS-tests 20/20 op staging** (volledige `supabase/tests/rls_tests.sql` in de SQL-editor; daarvoor
  al 17/17 via de Claude-koppeling, die geen `delete`/`truncate` kan uitvoeren). Lokaal ook 20/20.
  Na afloop staging leeg (0 gebruikers, 0 rijen, 0 bestanden). Beveiligingsadviseur: geen meldingen.
  Prestatie-adviseur: alleen "index nog niet gebruikt" (INFO, lege tabellen). Productie ongewijzigd.
- **Stap 1.2 afgerond op staging.** Productie volgt pas na akkoord (zie `supabase/README.md`).
- **Productie (3 okt 2026):** `20261003090000` met `supabase db push` toegepast; `migration list`
  toont drie migraties gelijk lokaal en remote. Eindcontrole alleen lezend: vingerafdruk productie =
  staging = 169 onderdelen, md5 `2780289b7b9822eeb2a50688a89f36b3`; beveiligingsadviseur 0 meldingen;
  productie leeg (0 gebruikers, 0 rijen, 0 bestanden, alleen de lege bucket `household-files`). Geen
  RLS-tests op productie. Daarna de lokale CLI teruggekoppeld naar staging `rfgmaqqsjvsuibfucdrp`.
  **Stap 1.2 definitief afgerond.**

## 1.3.0 — Fase 1, stap 1.3 (testversie): opslaglaag gescheiden
- Alles wat met Firebase praat staat nu achter één interface in `test/index.html`:
  `store.load()`, `store.save(data)` en `store.subscribe(fn)`. De bestaande code is de `FirebaseStore`
  (`createFirebaseStore`): database-URL en deellink (`?db=…&p=…`), ophalen met ETag, voorwaardelijk
  opslaan met `if-match`, 412 → ophalen, samenvoegen, opnieuw (max. 5 pogingen), de terugval zonder
  `if-match`, de wachtrij (één opslag tegelijk, 400 ms vertraging), opslaan bij naar de achtergrond
  gaan (`keepalive`), polling elke 15 s, de lokale cache en de bewaking uit 0.2.
- De rest van de app werkt met het bestaande `data`-object en reageert alleen op meldingen van de
  store (nieuwe data, wijzigingen van een ander toestel, status, bewaking, eerste keer geladen).
  `saveToServer()` blijft als naam bestaan en roept `store.save(data)` aan.
- Samenvoegen (`merge3`, `mergeData`, `normalizeData`, `canon`) is niet aan Firebase gebonden en staat
  los van de store, zodat een tweede opslag het later kan hergebruiken.
- Geen gedragswijziging: zelfde verzoeken, zelfde opslagsleutels (`plannerDbUrl`, `plannerKey`,
  `plannerCache_<sleutel>`), zelfde cacheformaat, zelfde teksten. Firebase blijft de enige opslag;
  Supabase wordt in de app nog niet gebruikt. Geen databasewijziging, geen datamigratie.
- Live-versie (`index.html`) ongewijzigd.
- Tests: `tests/store.test.js`. Elk scenario draait tegen de oude code (`index.html`) én de testversie
  en vergelijkt het verloop van de verzoeken, de eindstand, de lokale cache en de statusregel: eerste
  keer laden, opslaan, 412-conflict, offline en weer online, opstarten uit de cache met een
  niet-opgeslagen wijziging, naar de achtergrond, 403, open database, deellink, installeren en
  herstellen. Plus twee browsers tegelijk op dezelfde nagebootste database (gelijktijdig opslaan,
  412, offline en weer online), en een controle dat buiten de store geen Firebase-code meer staat.
- De nagebootste database kan nu ook de ETag leesbaar maken (`exposeETag`). Daarmee is gebleken dat
  de bestaande tests het `if-match`-pad nooit raakten (de app kon de ETag niet lezen); de nieuwe
  tests dekken beide paden. Zie `docs/fase1-notities.md`, punt 9.
- **Handmatige controle (3 okt 2026), echte Firebase via de testversie:** de GET-respons bevat
  `Access-Control-Expose-Headers: ETag`, een opslagactie is een `PUT` met een `If-Match`-header met de
  ontvangen ETag, en die gaf `200 OK`. De echte omgeving gebruikt dus het ETag/If-Match-pad, niet de
  terugval. Geen codewijziging.

## 1.3.0 — Fase 1, stap 1.3 live
- De testversie 1.3.0 (opslaglaag met `FirebaseStore`) is overgenomen in de live-versie (`index.html`).
  `index.html` en `test/index.html` zijn weer gelijk.
- Vóór het overnemen op de gemergede `main` nogmaals de vergelijking oude live-code ↔ nieuwe code
  gedraaid (`tests/store.test.js`, 9/9): zelfde verzoeken, eindstand, cache en statusregel, met en
  zonder leesbare ETag, plus twee browsers tegelijk.
- Geen wijziging aan bestaande data, opslagsleutels of cacheformaat; Firebase blijft de enige opslag
  (ETag/If-Match-pad, handmatig bevestigd). Supabase wordt in de app nog niet gebruikt.
- Afwijking van de roadmap: de week gebruik op de testversie is op verzoek overgeslagen; die controle
  gebeurt nu op de live-versie.
- Na de livegang gemeld: bij een eigen nieuwe boodschap stond geen "door <naam>". Onderzocht: geen
  regressie. Boodschappen en eigen lijsten tonen "door <naam>" alleen als iemand ánders het item
  toevoegde (zo sinds "Restyle stap 2b"); `addedBy` wordt vóór en na 1.3 identiek opgeslagen en
  getoond (nagespeeld op beide versies). Nieuwe regressietest `tests/toevoeger.test.js` legt dit
  bestaande gedrag vast, ook voor taken (auteur altijd zichtbaar) en zonder ingestelde toestelnaam.
  Geen codewijziging. **Stap 1.3 afgerond.**

## 1.4.0 — Fase 1, stap 1.4 (testversie): ledenregister
- Nieuw veld `data.members = [{id, name, kind, color, aliases?}]` in de gedeelde data. Alleen
  toegevoegd: alle namen blijven staan waar ze staan (`assignedTo`, `author`, `addedBy`, sleutels van
  `wieIsWaar`, verlanglijstjes en paklijsten). Omzetten naar member-ID's is stap 1.5.
- Het register wordt opgebouwd uit de twee namen op het toestel, `vakantiePersonen` en alle
  naamvelden uit `docs/dataformaat-v1.md` (taken, meerdaagse taken, reacties, bestellingen,
  boodschappen, inbox, eigen lijsten, huisgeheugen, notities, verlanglijstjes, Wie is waar,
  paklijsten). Plaatsvervangers (`me`, `partner`, `ik`) tellen niet als persoon.
- Vast member-ID: `m_` + hash van de genormaliseerde naam. Twee toestellen die tegelijk migreren
  komen op dezelfde ID's uit; het bestaande samenvoegen op `id` maakt er één lid van. Een bestaand lid
  houdt zijn ID. Hoofdletters/spaties zijn dezelfde persoon (zoals `sameName`); bij echte twijfel
  (andere accenten of tekens, bv. `Loïs`/`Lois`) vraagt de app één keer; het antwoord staat in
  `meta.members.same`/`.different`. `kind` is `unknown` (de data zegt niet wie een kind is; volgt in 1.6).
- Per toestel `plannerMemberId` ("wie ben jij op dit toestel"). `myName` blijft de bestaande
  opgeslagen naam (verlanglijstjes hangen aan die spelling); alleen als die ontbreekt komt de naam
  uit het register. De naambalk biedt de namen uit het register als keuze aan.
- Veiligheid: het register wordt alleen aangemaakt op een toestel met `plannerLedenregister = 'aan'`
  (standaard uit), zodat de echte planner pas na een bewuste keuze wordt gemigreerd. Vóór de eerste
  migratie een vangnet met controlesom; idempotent; status in `meta.members`; terugdraaien met
  `huisplanLeden.terugdraaien()`. Oudere versies (1.3) laten `members` en `meta.members` staan (getest).
- Live-versie (`index.html`) ongewijzigd.
- Tests: `tests/leden.test.js` en fixture `tests/fixtures/leden-oud.json`; schema en
  `docs/dataformaat-v1.md` bijgewerkt.
- Extra veiligheidscontroles vóór de merge:
  - Terugdraaien na gewone wijzigingen (boodschap en taak na de migratie): alleen `members` en
    `meta.members` gaan weg, de latere wijzigingen blijven. `plannerLedenBackup` wordt alleen gelezen
    voor de controlesom, nooit teruggezet. Geen codewijziging nodig; test toegevoegd.
  - Tegenstrijdige twijfelantwoorden op twee toestellen ("dezelfde" en "twee personen"): gaf een
    inconsistent register (alias én eigen lid voor dezelfde naam) en een uitkomst die van de volgorde
    afhing. Opgelost: antwoorden staan als twee verzamelingen `same`/`different` die bij het
    samenvoegen allebei blijven; "twee personen" wint; het register herstelt zich daarnaar en een
    toestel volgt zijn eigen naam naar het juiste lid. De sleutels zijn `p_<hash>`, omdat Firebase
    geen `.` of `/` in sleutels toestaat (een naam als "J.P." had anders elke opslag laten mislukken).

## 1.4.0 — Fase 1, stap 1.4 live
- De testversie 1.4.0 (ledenregister) is overgenomen in de live-versie (`index.html`).
  `index.html` en `test/index.html` zijn weer gelijk.
- De migratieschakelaar `plannerLedenregister` staat standaard uit en wordt door de app nergens op
  `'aan'` gezet. Zonder schakelaar schrijft de app geen `members`/`meta.members`; de echte planner
  verandert door deze livegang dus niet. Activeren gebeurt later handmatig, stap voor stap (zie
  `docs/fase1-notities.md`, punt 10).
- Volledige testset tegen test én live; de app-tests van het ledenregister draaien nu ook tegen live.

## 1.4.1 — Fase 1, stap 1.4.1 (testversie): alleen echte huishoudleden in het register
- Praktijk: na activatie op de echte planner maakte 1.4.0 zes leden: Bas, Sanne, Lynn, Loïs, Freya (het
  paard) en Boodschappen (een paklijstkolom). Oorzaak: `vakantiePersonen` en de kolommen van de
  paklijsten zijn vrije labels; 1.4.0 behandelde elke naam daarin als persoon.
- Nieuw uitgangspunt: huishoudlid ≠ elke naam die ergens staat. Direct lid worden alleen namen die de
  app zelf schrijft met de naam van een toestel (auteur, toegevoegd door, toegewezen aan, reacties,
  Wie is waar, verlanglijstjes) en de twee namen op het toestel. Een naam die alleen als label
  voorkomt is kandidaat: de app vraagt één keer "Hoort … bij jullie huishouden?" (met waar de naam
  staat). Antwoorden in `meta.members.member` / `.notMember`; bij tegenstrijdige antwoorden wint "nee".
  Geen namen hardgecodeerd.
- Bestaand 1.4.0-register (`meta.members.version` 1): leden die alleen als label voorkomen worden ook
  gevraagd; bij "nee" gaan ze uit `members`. Blijvende leden houden exact hun ID; `plannerMemberId`
  blijft geldig. De vakantiegegevens (`vakantiePersonen`, paklijsten) worden niet aangeraakt. Daarna
  `version: 2`. Vangnet `plannerLedenBackupV1` met het oude register.
- De schakelaar `aan` wordt `aan-1.4.1`, zodat een nog openstaande 1.4.0-versie op hetzelfde toestel
  de labels niet terugzet (aangetoond: 1.4.0 met `aan` zet Freya en Boodschappen direct terug).
- Geen omzetting naar member-ID's (1.5), geen Supabase, live-versie ongewijzigd.
- Vastgelegd voor later (`docs/fase1-notities.md`, punt 11): een externe gebruiker/gast/oppas die via
  de gedeelde link iets toevoegt mag niet automatisch huishoudlid worden (open punt voor het
  ledenbeheer in 1.6 en vóór/tijdens persoonsmigraties); en voor 1.5: `resolveMember()` moet "geen
  huishoudlid" kunnen teruggeven en persoonsachtige labels worden niet automatisch een member-ID.
- Tests: `tests/leden-praktijk.test.js` (9) met fixtures `leden-praktijk.json` en
  `leden-praktijk-v14.json` (het register zoals 1.4.0 het maakte); `tests/leden.test.js` aangepast aan
  het nieuwe model. `docs/dataformaat-v1.md`: Wie is waar gebruikt alleen "ik" en "partner".

## 1.4.1 — Fase 1, stap 1.4.1 live
- De testversie 1.4.1 (alleen echte huishoudleden in het ledenregister) is overgenomen in de
  live-versie (`index.html`). `index.html` en `test/index.html` zijn weer gelijk.
- Toestellen zonder de schakelaar `plannerLedenregister` schrijven geen `members`/`meta.members`;
  daar verandert niets. Op een toestel waar de schakelaar al op `aan` staat, zet 1.4.1 die om naar
  `aan-1.4.1` en vraagt bij het openen of de vakantielabels bij het huishouden horen. Dat is de
  geplande, handmatige activeringsstap (zie `docs/fase1-notities.md`, punt 11); deze livegang zelf
  wijzigt geen data.
- Volledige testset tegen test én live; de app-tests van het ledenregister 1.4.1 draaien nu ook
  tegen live.

## App-icoon (testversie): definitief Huisplan-logo
- De app-iconen van de testversie (`test/`) tonen nu het definitieve logo uit de huisstijl
  (`logo.svg`: paars huis met deur en blaadje) op de huisstijl-ondergrond `#F8F7F4`, in plaats van
  de witte variant op paars. De iconen zijn rechtstreeks uit `logo.svg` gegenereerd.
- `apple-touch-icon.png` (180×180) voor het iOS-beginscherm: vierkant en dekkend (iOS rondt zelf
  af en maakt transparantie zwart); het logo beslaat 62% van de hoogte, zodat het blaadje ruim
  binnen de afgeronde hoek blijft.
- `manifest.webmanifest`: `icon-192.png` en `icon-512.png` ("any", afgeronde tegel) en
  `icon-maskable-192.png` (nieuw) en `icon-maskable-512.png` ("maskable", dekkend, het hele logo
  binnen de veilige cirkel van 80%).
- Geen wijziging aan HTML, UI of functionaliteit. Een al op het beginscherm gezette app houdt het
  oude icoon tot hij opnieuw wordt toegevoegd (iOS bewaart het icoon bij het toevoegen).

## App-icoon live: definitief Huisplan-logo
- De goedgekeurde app-iconen van de testversie zijn overgenomen in de live-versie (root):
  `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-192.png` (nieuw) en
  `icon-maskable-512.png`, plus de nieuwe maskable-192-regel in `manifest.webmanifest`. Iconen en
  manifest van live en test zijn byte voor byte gelijk.
- Geen wijziging aan HTML, UI of functionaliteit. Een al op het beginscherm gezette app houdt het
  oude icoon tot hij opnieuw wordt toegevoegd.

## 1.4.2-voorbereiding: P1-3 emulatorproef (NW-01, alleen tooling en documentatie)
- Reproduceerbare proef `tools/emulator/p1-3-proef.js` tegen een lokaal gestarte Firebase Realtime
  Database Emulator: ETag/if-match, lege locaties, regelevaluatie en de schrijfvormen
  PUT/PATCH/DELETE/subpad/ouder/meerdere paden/POST (historische sendBeacon-vorm) tegen een
  proefslot. Harde lokale netwerkallowlist, optioneel een eigen netwerknamespace (`--netns`), alleen
  fictieve data, mutatietest.
- Uitkomst: 74 controles, geen afwijking van bekend productiegedrag; 7 punten waarvan het
  productiegedrag onbekend is, en de verschillen tussen emulator en productie zijn benoemd in
  `docs/p1-3-emulatorproef.md`. Besluit P1-3 (6 okt 2026): optie A, de emulator is aanvaard als
  bewijsomgeving binnen die beperkingen; geen toestemming voor productieregels, -data, Supabase of slot.
- Open data-veiligheidspunt (niet hersteld, buiten deze stap; P1-11, moet vóór 1.5 opgelost of
  bewezen zijn): een lijst die Firebase als object teruggeeft (lijst met gaten) wordt door
  `normalizeData` leeg teruggeschreven. Zie `docs/p1-3-emulatorproef.md`, 4.5.
- Test: `tests/emulatorproef.test.js`. Geen wijziging aan de app, Firebase-regels, Supabase of data.

## 1.4.2-voorbereiding: één schrijfcoördinatiemodel (NW-03, E2; testversie)
- `test/index.html`: opslaan, wegzetten bij het sluiten (flush), laden, herpogingen en periodiek
  ophalen volgen één model (`docs/ontwerp-1.4.2.md`, 2.2): `localGen`/`confirmedGen`, hooguit één
  schrijfactie onderweg, en een antwoord of leesactie van vóór een nieuwere generatie zet niets terug.
- Elke schrijfactie is een PUT met `if-match` (`putIfMatch`). Zonder bruikbare ETag wordt niet
  geschreven (besluit 9.1); de app meldt dan "Opslaan kan nu niet veilig" en bewaart alles lokaal. De
  terugval zonder voorwaarde (`noConditional`) is weg, ook in `flush()`.
- Netwerkfout tijdens opslaan = onbekende uitkomst: eerst de serverstand lezen; staat onze versie er
  al, dan geldt hij als bevestigd (geen dubbele wijziging), anders samenvoegen en voorwaardelijk
  opnieuw, met oplopende wachttijd (1–16 s). 412: samenvoegen en opnieuw, hooguit 5 keer per
  wijziging. Daarna blijft de status "Opslaan mislukt" en blijft de wijziging openstaan tot een poll,
  weer online of heropenen. "Opgeslagen" verschijnt pas als alles bevestigd is.
- Geen datamigratie; het dataformaat is gelijk. `APP_VERSION` blijft 1.4.1 tot de integratie (NW-10).
- Tests: `tests/schrijven.test.js` (T1–T5). De nagebootste database maakt de ETag nu standaard
  leesbaar, zoals de echte Firebase; `store.test.js` vergelijkt oud en nieuw alleen nog in die variant.
- Niet live; `index.html` is ongewijzigd.

## 1.4.2-voorbereiding: NW-03 hersteld na de Codex-review (testversie)
- Blocker 1: een lokale wijziging die ontstaat tijdens het tekenen van een binnenkomende stand (bv.
  het doorschuiven van een verlopen taak in Vandaag) werd door `load()` ten onrechte als bevestigd
  gemarkeerd en nooit opgeslagen. `load()` bevestigt nu alleen tot en met de generatie van het moment
  van lezen.
- Blocker 2: na een verloren bevestiging kon het herstel een latere wijziging of verwijdering door een
  ander toestel terugdraaien. Het herstel past nu alleen automatisch iets toe als de uitkomst
  eenduidig is; anders blijft de lokale wijziging bewaard (ook na herladen), wordt er niets geschreven
  en stelt de app één vraag. Een verzoek dat niet vertrekt omdat de browser offline is, telt niet als
  onzeker.
- Een verouderd antwoord verandert de bewakingsstatus niet meer. Elk verzoek heeft een tijdslimiet.
  Na een uitkomst zonder bevestiging wordt eerst gelezen en nooit eerst geschreven. Een bevestiging
  zonder ETag leidt meteen tot een herstellezing, ook als een nieuwere wijziging wacht.
- Tests: 13 nieuwe regressietests in `tests/schrijven.test.js`. De nagebootste database kan nu
  momentopnames, vertraagde bevestiging na verwerking, antwoorden zonder ETag en hangende verzoeken
  nabootsen. T2a verwacht nu de vraag. De grens met P1-11 wordt bewaakt: niet vaker of anders schrijven
  dan live.

## 1.4.2-voorbereiding: NW-03 hersteld na de tweede Codex-herreview (testversie)
- Schrijfjournaal: vóór elke PUT staan de verzonden inhoud en de oude basis synchroon in
  `localStorage` (`plannerJournal_<sleutel>`). Lukt dat niet, dan wordt er niet verstuurd. Na herladen
  met een open journaal begint de app met de verplichte herstellezing. Er wordt niet geschreven en
  nooit "opgeslagen/bijgewerkt" getoond tot de onzekerheid is afgehandeld; een latere wijziging of
  verwijdering door een ander wordt niet teruggedraaid.
- Eén tijdslimiet over het hele verzoek, inclusief de body.
- Automatisch verder na een onbekende uitkomst alleen als de samenvoeging aantoonbaar verliesvrij is
  (`losslessMerge`). Lijsten zonder `id`, gemengde en geneste lijsten tellen alleen als geheel, en een
  lijst met gaten (P1-11) telt nooit als veilig. P1-11 zelf blijft open.
- De vraag noemt welke wijzigingen onzeker zijn en zegt dat latere wijzigingen blijven. De keuze leest
  eerst opnieuw.
- Een nieuwe lokale wijziging toont direct "Opslaan…" in plaats van een verouderd "Opgeslagen". Een
  401/403 tijdens de herstellezing toont "Toegang geweigerd". Na herladen met een open journaal krijgt
  de app dezelfde eerste-laadsignalen. De `schemaVersion`-stempel telt niet als onzekere wijziging.
- Tests: `tests/journaal.test.js` (18), `tests/verliesvrij.test.js` (8), `tests/nepdb.js` (echte lokale
  nepdatabase voor hangende bodies), `tests/schrijfhulp.js`. De store-test voor opstarten uit de cache
  verwacht in de testversie nu eerst de vraag.
- Een schrijfmarkering in de data is niet gebouwd: hooguit een latere UX-verbetering, geen
  veiligheidsvereiste.

## 1.4.2-voorbereiding: NW-03 hersteld na de derde Codex-review (testversie)
- Journaal per venster (`plannerJournal_<sleutel>_<id>`, versie 2) met context (database, planner,
  generatie), eigenaar en hartslag. Inspectie los van de cache met drie uitkomsten: geen journaal,
  geldig, of onbekend/ongeldig. Onbekend/ongeldig (leesfout, kapotte JSON, onbekende versie, ongeldige
  inhoud, andere database/planner/generatie) blokkeert schrijven en hervatten; er wordt niets
  verwijderd en regelmatig opnieuw gekeken. Opstartscherm met "Opnieuw controleren" en
  "Herstelgegevens bewaren".
- Een record verdwijnt pas nadat de afgehandelde toestand duurzaam vastligt: eerst het record als
  `settled` (basis + lokale stand), dan de cache (teruggelezen), dan opruimen. Mislukt een stap, dan
  blijft het record staan, wordt er niets verstuurd en is de status "Lokaal bewaren mislukt".
- Vensters: een venster schrijft en wist alleen zijn eigen record. Een record van een levend venster
  (Web Locks) wordt nooit overgenomen; een nieuw venster wacht. Een verweesd record wordt onder een
  claim-lock overgenomen. Zonder Web Locks: hartslag en vrijgeven bij `pagehide`.
- Na een crash telt de cache alleen als lokale stand als ze aantoonbaar bij het record hoort; anders de
  verzonden stand. Een cache van een ander venster met eigen niet-opgeslagen wijzigingen wordt nooit
  stil gecombineerd.
- De keuze na een onzekere uitkomst schrijft alleen als alles buiten de onzekere wijzigingen
  aantoonbaar verliesvrij samengaat; anders niets, en de vraag komt later terug.
- `flattenPaths`: alle lijsten zonder (unieke) `id` alleen als geheel, ook tekstlijsten; volgorde in
  `id`-lijsten telt; typewisselingen tellen altijd.
- Cache krijgt extra velden (`inst`, `seq`, `db`); `data`, `base` en `t` blijven gelijk.
- Tests: `tests/journaal3.test.js` (19), `tests/verliesvrij.test.js` (12). `tests/lib.js`: opties
  `initScript` en `realClock`.

## 1.4.2-voorbereiding: NW-03 hersteld na de vierde Codex-review (testversie)
- B1: het journaalrecord heeft een revisie en de nieuwste lokale stand; elke lokale opslag gaat eerst
  naar het record, dan naar de cache (spiegel van die revisie). Herstel gebruikt altijd het record;
  een oudere cache kan een nieuwer record nooit meer vervangen.
- B2: fencing met eigendomsgeneratie (`epoch`) en een exacte vergelijking met het eigen laatst
  geschreven record vóór elke mutatie. Een overgenomen venster muteert niets meer, ook niet na een
  late PUT/GET, en meldt "Dit venster is overgenomen".
- I1: de verliesvrij-controle bewaakt de volgorde per paar `id`'s, ook van nieuw toegevoegde items.
- Cache krijgt `jkey`/`jrev` (spiegel van welke recordrevisie); `data`, `base` en `t` blijven gelijk.
- Tests: `tests/journaal3.test.js` (26), `tests/verliesvrij.test.js` (15).

## 1.4.2-voorbereiding: NW-03 hersteld na de vijfde Codex-review (testversie)
- Zonder Web Locks wordt een journaalrecord van een ander venster nooit meer automatisch overgenomen
  (geen veilige vergelijk-en-schrijf in `localStorage`). Hartslag, verlooptijd en vrijgeven bij
  `pagehide` zijn verwijderd. De app blokkeert dan met een eerlijke herstelstatus; niets wordt
  overschreven of opgeruimd. Met Web Locks blijft overnemen ongewijzigd.
- Tests: de Codex-interleaving (A pauzeert na de eigenaarscontrole vóór record, cache of opruimen;
  B probeert over te nemen; A hervat) en "nooit overnemen zonder Web Locks" (open, gesloten,
  gecrasht). `tests/journaal3.test.js`: 28.

## Thuisplanner KG-1 — databasefundament (alleen lokaal, geen app-wijziging)
- Voorlopige ontwikkelrichting Thuisplanner vastgelegd in `docs/roadmap.md` (sectie "Ontwikkelrichting
  Thuisplanner") en als besluit 11 in `docs/productkompas-beslissingen.md`.
- Nieuwe, gescheiden map `thuisplanner/supabase/` met een eigen configuratie (niet gekoppeld) en
  migratie `20261009120000_kg1_fundament.sql`: profielen, huishoudens, leden (ook kinderen zonder
  account), uitnodigingen (token alleen als hash), rollen owner/admin/member, RLS en
  rechtenfuncties. Eén account kan lid zijn van meerdere huishoudens.
- Tests: RLS-matrix KG-T01 t/m KG-T22 (`thuisplanner/supabase/tests/rls_tests.sql`), 14 tegenproeven,
  statische controles en `tests/thuisplanner.test.js`. CI: `.github/workflows/thuisplanner-db.yml`.
- `index.html`, `test/index.html`, `supabase/` en Firebase zijn niet gewijzigd.

## Thuisplanner KG-5B — fundament verstevigd (bouwplan stap 1; alleen lokaal, geen app-wijziging)
- Technisch bouwplan KG-5A vastgelegd in `docs/thuisplanner-bouwplan.md`, met de productbeslissingen van
  10 oktober 2026 (gedeelde items door ieder lid te wijzigen; privé van anderen alleen als "Bezet";
  taken en boodschappen voorlopig alleen gedeeld).
- Migratie `20261010120000_kg5b_verstevigen.sql`: account verwijderen werkt (trigger op `auth.users`;
  enige eigenaar met andere accounts wordt geweigerd), `delete_household`, account-ID's niet meer
  leesbaar (`has_account`, `my_memberships()`), RLS via `my_household_ids()`, hoogstens 10 huishoudens
  als eigenaar.
- Tests: matrix KG-T01 t/m KG-T27, 22 tegenproeven, nu ook op een echte lokale Supabase
  (`run.sh --db`); integratietest met supabase-js (API, Auth, Realtime). CI-job `supabase-lokaal`.

## Thuisplanner KG-5B herstelronde 1 — vijf reviewbevindingen opgelost (alleen lokaal)
- Migratie `20261011120000_kg5b_herstel1.sql`: één vergrendelingsprotocol (eerst het huishouden, dan de
  rechtencontrole, dan rijen, dan het account) in alle muterende functies, `ensure_owner` en de
  API-triggers; uitnodigingen alleen geldig zolang de maker ze nog mag geven; `households.created_by`
  niet leesbaar; limiet van 10 eigen huishoudens ook bij overdracht en gelijktijdig.
- Tests: KG-T28 t/m KG-T31, 26 tegenproeven, gelijktijdigheidstests met aparte verbindingen (met
  tegenproef; reproduceren alle vijf problemen op `6da0f47`), strengere realtime-tests.

## Thuisplanner KG-5C — inhoudsschema (bouwplan stap 2; alleen lokaal, geen app-wijziging)
- De nieuwe app heet voortaan Thuisplanner (technische map `thuisplanner/` blijft).
- Migratie `20261012120000_kg5c_inhoud.sql`: `events`, `event_details` (strengere RLS: privé van een
  ander = "Bezet"), `event_participants`, `event_exceptions`, `tasks`, `shopping_items`,
  `households.timezone` en de view `event_overview` (security_invoker). Afspraken via functies
  (`save_event`, `edit_occurrence`, `delete_occurrence`, `delete_event`) met versiecontrole (PT409 =
  HTTP 409); taken en boodschappen via de API en `add_shopping_items`. Accountverwijdering ruimt
  privé-afspraken op.
- Tests: KG-T32 t/m KG-T41, 39 tegenproeven, gelijktijdigheids-, API- en realtime-tests.

## Thuisplanner KG-5C herstelronde 1 — drie reviewbevindingen opgelost (alleen lokaal)
- Migratie `20261013120000_kg5c_herstel1.sql`: privé-inhoud hoort bij het account (`owner_user_id`,
  niet leesbaar via de API) en verdwijnt zodra een account van een profiel loskomt; een gedeelde reeks
  verwijderen laat andermans privé-voorkomens staan; vaste vergrendelvolgorde (reeks → voorkomen) en
  een unieke index op (reeks, dag).
- Tests: KG-T42 t/m KG-T44 (falen op `700c3d9`), 43 tegenproeven, gelijktijdigheidstest voor twee
  verplaatsingen tegelijk en een deadlockcontrole.

## Thuisplanner KG-5C herstelronde 2 — twee herreviewbevindingen opgelost (alleen lokaal)
- Migratie `20261014120000_kg5c_herstel2.sql`: een verwijderde reeks blokkeert geen datums meer
  (achtergebleven privé-voorkomens zijn vrij te verplaatsen); publieke functies geven fouten door zonder
  DETAIL en HINT, zodat account-ID's (`owner_user_id`) niet via foutdetails lekken.
- Tests: KG-T43 uitgebreid, KG-T45 en KG-T46, integratietest op de foutrespons; 46 tegenproeven.

## Thuisplanner KG-5D — synchronisatie tussen gezinsleden (bouwplan stap 3; alleen lokaal)
- Migratie `20261015120000_kg5d_realtime.sql`: seintjes `{t, id, v, op}` op het private kanaal
  `household:<id>` na elke wijziging (zonder inhoud); RLS op `realtime.messages`: alleen actieve leden
  luisteren, niemand zendt via de client, geen presence.
- `thuisplanner/sync/thuisplanner-sync.js`: synchronisatielaag (opnieuw ophalen op seintje, herverbinden met
  backoff, vangnet, versiecontrole en conflictmelding, UUID's van de client, alles wissen bij verlies van
  toegang). Geen nieuwe app-bibliotheken; het prototype van PR #20 is niet aangeraakt.
- `thuisplanner/dev/`: lokale ontwikkelpagina met twee demo-accounts (alleen 127.0.0.1, alleen de anon-sleutel).
- Tests: KG-T47 en KG-T48, 50 tegenproeven, sync-tests met aparte sessies, e2e met twee browsersessies.

## Thuisplanner KG-5D herstelronde 1 — vier reviewbevindingen (review van 3f3b7da)
- Bevinding 1: generaties in de syncmodule; na `stop()` of verlies van toegang verandert of meldt een laat
  antwoord (ophalen, schrijven, terugdraaien, kanaalstatus) niets meer. Terugdraaien werkt op de huidige stand.
- Bevinding 2: migratie `20261016120000_kg5d_herstel1.sql`: kanaal `household:<id>:<epoch>`; bij elk verlies
  van een actief lidmaatschap met account een nieuw volgnummer, zodat een niet-meewerkende client op het oude
  kanaal niets meer krijgt. `household_channel()` geeft de actuele naam. Gemeten: Realtime trekt zelf pas in
  bij een nieuw token of het verlopen van het token.
- Bevinding 3: toevoegingen als opdracht met een vaste UUID; onbekende uitkomst = "niet bevestigd" (nooit "niet
  opgeslagen"); opnieuw proberen en herstart (optionele opslag) met dezelfde UUID; geen automatische wachtrij.
- Bevinding 4: keyset-paginering op id voor alle soorten, cache pas vervangen als alle pagina's binnen zijn.
- Tests: KG-T49, 55 tegenproeven, `herstel.test.mjs` (12), `sync-tegenproeven.mjs` (11 mutaties), realtime-
  tegenproef met een niet-meewerkende client, e2e voor een verloren antwoord met herladen.

## Thuisplanner KG-5D herstelronde 2 — drie idempotentieproblemen (review van 79a5852)
- Verlopen sessie na een onbekende uitkomst: opdrachten hebben een staat; na één onbekende uitkomst
  verwijdert geen latere fout ze meer. Een eerste poging die door een verlopen sessie zeker niet is
  uitgevoerd, blijft bewaard ("niet opgeslagen") voor na het inloggen.
- Dezelfde titel: opnieuw proberen alleen via de opdrachtidentiteit; nieuwe toevoegingen zijn altijd nieuwe
  opdrachten; bij een onbevestigde gelijke inhoud eerst een keuze (opnieuw proberen of bewust nieuw).
- Opdrachtverlies: paginageheugen (stop/start, unmount) plus `localStorage` met één sleutel per opdracht
  (account en huishouden gecontroleerd); opruimen alleen na bevestiging, zekere weigering of "vergeten";
  waarschuwing als opslag geweigerd wordt; inhoud van privé-afspraken nooit in de opslag.
- Tests: `herstel2.test.mjs` (12), gedeelde `testhulp.mjs`, 21 mutatie-tegenproeven, e2e voor sluiten/heropenen,
  keuze bij mogelijk dubbel, offline invoer en geweigerde opslag.

## Thuisplanner KG-5D herstelronde 3 — twee idempotentiefouten (review van 89e58c5)
- Overlappende pogingen: een opdracht telt haar lopende pogingen; een zekere fout van één poging ruimt de
  opdracht niet op zolang een andere poging (mogelijk al gecommit) nog loopt.
- Migratie `20261017120000_kg5d_herstel3.sql`: register `private.shopping_commands`; een herhaalde
  boodschappenopdracht (zelfde ID) geeft de oorspronkelijke uitkomst terug zonder bijwerking; alleen een nieuwe
  ID volgt de productregels.
- Privacy van de lokale opslag onderzocht en vastgelegd (docs/thuisplanner-sync.md §9); beslissingen P1–P5 open.
- Tests: KG-T50 (matrix 50), 57 SQL-tegenproeven, `herstel3.test.mjs` (R1a, R1b, R2) met tegenproef op de oude
  databasefunctie, 22 mutatie-tegenproeven.

## Thuisplanner React-integratie — prototype met echte synchronisatie (alleen lokaal, fictief)
- De React-app uit PR #20 heeft naast de demo een lokale modus: inloggen als fictief gezinslid en lezen
  en schrijven via de sync-module uit PR #22 tegen een lokale Supabase-stack. Vandaag, Agenda, taken en
  Boodschappen werken met echte gegevens en synchroniseren tussen twee accounts.
- Eén centrale sessie per pagina buiten React; unmount en StrictMode stoppen niets, alleen uitloggen.
- Versieconflicten, onbevestigde opdrachten (opnieuw proberen, vergeten, mogelijk dubbel) en de
  opslagwaarschuwing zijn zichtbaar in de app. Privé-afspraken van een ander blijven "Bezet" (server).
- Sync-module: uitzonderingen op herhalende afspraken, taak bijwerken, één voorkomen wijzigen of
  verwijderen.
- Nieuw: `scripts/lokaal.mjs` (fictief gezin, twee telefoons), e2e met twee accounts, integratietest,
  CI-stap. Alleen `@supabase/supabase-js` toegevoegd. P1–P5 niet ingevoerd. Documentatie:
  `docs/thuisplanner-app.md`. Geen wijziging aan de Huisplan-app.

## Thuisplanner React-integratie herstelronde 1 — vier reviewbevindingen (alleen lokaal, fictief)
- Afspraken verliezen geen gegevens meer: notities en de einddatum van een meerdaagse afspraak gaan mee
  bij aanpassen (los, één voorkomen, hele reeks); het venster weigert een meerdaagse afspraak niet meer.
- Wifi-route: opdracht-ID's met `crypto.getRandomValues` als `crypto.randomUUID` ontbreekt (geen secure
  context); betere keuze van het wifi-adres (geen Docker- of VPN-netwerk), bereikbaarheidscontrole en
  instructies voor twee telefoons. LAN-proef met browsers op een aparte netwerkhost (`npm run lan-proef`,
  ook in CI). Nog geen proef met echte telefoons.
- Sessie: generatie per actie en auth-aanroepen na elkaar; een oud antwoord kan uitloggen niet meer
  terugdraaien.
- Privé-afspraak zonder bewaarde inhoud: "Opnieuw invoeren" met dezelfde opdracht-ID (geen dubbele).
- Regressietests voor alle vier, met tegenproeven tegen de vorige versie. P1–P5 niet ingevoerd.

## Thuisplanner React-integratie herstelronde 2 — auth-volgorde bij een trage kanaalafmelding
- Uitloggen en inloggen zetten hun auth-aanroep direct in de rij, niet pas nadat de vorige sync zijn
  Realtime-kanaal heeft afgemeld. Een oude uitlog kan zo het token van een nieuwere inlog niet meer wissen;
  een hangende of mislukte afmelding blokkeert niets. Regressietests (11) falen op b867346 en slagen nu.

## Thuisplanner telefoonproef — Windows, Vite-proxy en eerste proef met echte telefoons (13 oktober 2026, alleen lokaal, fictief)
- `scripts/lokaal.mjs` werkt op Windows (hoofdscript-herkenning, Vite en de Supabase-CLI zonder .cmd via
  spawn, wifi-adres zonder Hyper-V/WSL-adapters); `tegenproeven.txt` altijd met LF.
- Vite-proxy: telefoons praten alleen met poort 5180; Auth, REST en Realtime gaan via Vite naar Supabase op
  `127.0.0.1`. Database, Studio en API blijven van het netwerk af (Docker Desktop "Local only"). De lokale
  e2e draait ook via de proxy (`KG_VIA_PROXY=1`) en faalt op elke aanvraag buiten de app-poort.
- Mijlpaal: eerste proef met twee echte telefoons geslaagd. Eva en Thomas logden in; een boodschap die
  Eva toevoegde en Thomas afvinkte, verscheen beide keren automatisch op de andere telefoon.
  Geen wijziging aan de Huisplan-app.

## Thuisplanner deel A — rustiger Toevoegen-venster (14 oktober 2026, demo en lokaal, fictief)
- Besloten (V1–V6, `docs/thuisplanner-snelinvoer.md`); dit is de eerste stap daarvan.
- Hoe laat: één tik op Hele dag, 09:00, 12:00, 15:30 of 18:00; "Andere tijd" opent de klokkiezer en
  "+ Eindtijd" de eindtijd. Hele dag haalt begin- en eindtijd weg.
- Waar, herhalen en privé staan achter "Meer opties" (met wat erachter zit), behalve als er al iets is
  ingevuld; Voor wie staat nu direct onder de tijd. Een nieuwe afspraak past zo op één telefoonscherm.
- Geen wijziging aan gegevens, sync of database; bewerken behoudt alle velden zoals voorheen.
- Tests: `toevoegen-rustig.test.tsx` (12, met tegenproef), e2e bijgewerkt; screenshots 3, 7 en 11 opnieuw
  gemaakt. Lokale e2e (`e2e-lokaal`, echte lokale Supabase): 15 geslaagd, 2 screenshots overgeslagen; één
  test hing eerst in het klaarzetten (`beforeEach`, vóór het venster) en slaagde bij opnieuw draaien.
  Geen wijziging aan de Huisplan-app.

## Thuisplanner herstelronde architectuurcontrole — K1 en K2 (15 oktober 2026, alleen lokaal, fictief)
- Rapport: `docs/thuisplanner-architectuurcontrole.md` (bevindingen, advies en het K3-voorstel in §7).
- K1: een afgevinkte taak krijgt de dag die de app als "vandaag" toont (ook met de testklok `?nu=`), niet
  meer de UTC-datum. Een taak die in Nederland tussen 00:00 en 02:00 werd afgevinkt, telde eerder voor
  gisteren. `taakAfvinken(taak, vandaag)`; zonder datum gebruikt de sync `lokaleDatum()`.
- K2: nieuwe migratie `20261018120000_index_uitzonderingen.sql` met een index op `event_exceptions`
  `(household_id, series_id, occurrence_date)`; de sync haalt uitzonderingen per huishouden op.
- K3 (archiveren gescheiden van verwijderen) is nog niet gebouwd; voorstel ter beslissing.
- Tests: `afvinken-datum.test.tsx` (met tegenproef in de tijdzone Europe/Amsterdam), alle 127 unittests,
  demo-e2e (138 geslaagd, 9 overgeslagen zoals altijd). Op een echte lokale Supabase: RLS-matrix 51 van 51
  (nieuw KG-T51: index per huishouden) en tegenproeven 58 van 58; lokale e2e 15 geslaagd (2 afspraaktests
  slaagden pas bij opnieuw draaien, zelfde instabiliteit als in deel A). De integratietests konden op deze
  Windows-computer niet draaien (ze starten `psql` direct en er is geen `psql.exe`); `sync.test.mjs` controleert
  nu ook de opgeslagen datum, maar die controle draait pas in CI. Geen wijziging aan de Huisplan-app.

## Thuisplanner integratietests H2a en R2 deterministisch gemaakt (15 oktober 2026, alleen tests, lokaal)
- Oorzaak: na een poging met een verloren antwoord haalt de sync meteen opnieuw op (`vernieuw()`) en bevestigt de
  opdracht zelf als de rij al op de server staat. Was dat sneller dan de herhaling van de test, dan gaf
  `opnieuwProberen` `{ ok: false }` (niets meer open) en faalde de test, terwijl het product juist werkte. Op Windows
  gebeurde dat vaak, omdat elke `sql()` van de test daar via `docker exec` ongeveer 330 ms kost.
- Oplossing, alleen in de tests: een blijvende poort op de volledige ophaalronde van de tabel (`isOphalen` in
  `testhulp.mjs`, herkenbaar aan het filter op `deleted_at`) tot na de herhaling. De gerichte controle na een dubbel
  id gaat gewoon door. Nieuw is ook de expliciete voorwaarde dat de opdracht vóór de herhaling nog openstaat, met een
  duidelijke melding als de race toch optreedt. H2a controleert daarna ook dat de sync precies twee taken toont.
- Tests (lokaal, tijdelijke Supabase-stack): H2a en R2 tien keer achter elkaar groen (eerder ongeveer de helft
  rood); integratie 61 van 61; tegenproeven, waaronder R2 (oude databasefunctie), en sync-tegenproeven 22 van 22,
  waaronder H2a en H2b. Een afgedwongen race laat de nieuwe voorwaarde falen zoals bedoeld. Geen wijziging aan app,
  sync of database.

## Thuisplanner K3 — archiveren met een bewaartermijn van 30 dagen (15 oktober 2026, alleen lokaal, fictief)
- Besloten: variant A met 30 dagen (`docs/thuisplanner-k3-archiveren.md`). Migratie
  `20261019120000_archief_bewaartermijn.sql`.
- Archiveren wist niets. De privé-afspraken van het gearchiveerde lid zijn voor niemand meer zichtbaar, ook niet als
  "Bezet", en dat geldt ook voor hun deelnemers en uitzonderingen (RLS). Gedeelde afspraken blijven zichtbaar en te
  wijzigen; een gearchiveerd lid kan alleen geen deelnemer meer zijn (bestaande regel).
- Binnen 30 dagen haalt een eigenaar of beheerder het lid terug (`restore_member`), als gewoon lid. De privé-afspraken
  zijn dan direct weer van de betrokkene.
- Na 30 dagen verwijdert `private.purge_archived_private()` de privé-afspraken definitief: dagelijks om 03:17 UTC via
  `pg_cron` (taak `thuisplanner-archief-opruimen`), en ook direct bij een herstel na de termijn. Het profiel en de
  gedeelde inhoud blijven. Een beheerder kan andermans privé-afspraken niet wissen. De termijn staat op één plek
  (`private.archive_retention()`).
- Tests (lokale Supabase-stack): RLS-matrix 56 van 56 (KG-T52 t/m KG-T56), tegenproeven 66 van 66, de nieuwe
  K3-integratietest groen (volledige run en drie keer los), unittests en demo-e2e groen. App-e2e tegen de stack:
  14 van 15 per run. De mislukte test verschilde per run ("onbevestigd: maar wel aangekomen", daarna het klaarzetten
  van "privé: Eva ziet…") en slaagde los telkens. In het Realtime-log stond tijdens de runs "ReplicationConnectionDown".
- Niet opgelost (bestaat ook zonder K3, aangetoond met een A/B-proef op een database zonder deze migratie): R1a
  in `herstel3.test.mjs` faalt hier steeds door dezelfde race als H2a en R2. Wisselvallig in de volledige run: H1b en
  H2a (time-out, terwijl Realtime haperde).
- Geen wijziging aan de app of de sync; niet gepusht.

## Thuisplanner integratietest R1a deterministisch gemaakt (16 oktober 2026, alleen tests, lokaal)
- Zelfde race als H2a en R2: na het (her)verbinden van het Realtime-kanaal haalt de sync alles opnieuw op en
  bevestigt de opdracht zelf als de taak al op de server staat. Kwam dat vóór de herhaling van de test, dan stond er
  niets meer open en faalde R1a (lokaal 0 van 3, ook zonder K3).
- Oplossing, alleen in de test: de ophaalronde voor taken (`isOphalen('tasks')`) blijft vast tot na stap 4, plus de
  expliciete voorwaarde dat de opdracht vóór de herhaling nog openstaat.
- Tests (lokaal): R1a 10 van 10 groen; integratie 62 van 62; tegenproeven groen; sync-tegenproeven 22 van 22
  (nummer 22 nog steeds gevangen door R1a). Geen wijziging aan app, sync of database.

## Thuisplanner-staging voorbereid (16 oktober 2026, alleen lokaal; online nog niets aangemaakt)
- Besluiten: Cloudflare Pages (`thuisplanner-staging`), een eigen Supabase-project in de organisatie Thuisplanner
  (Frankfurt), Cloudflare Access, twee testers, alleen gratis abonnementen. Stappen en instellingen: `docs/thuisplanner-staging.md`.
- Stagingmodus (`npm run build:staging`):
  - alleen precies `https://<20 letters>.supabase.co`, nooit een Huisplan-project;
  - geen demo-accounts of -wachtwoord, en geen geheime sleutels: zowel de app als de build weigert dat, en de build
    controleert achteraf ook de gebouwde bestanden;
  - een vaste markering "Testomgeving";
  - de sessie blijft op de telefoon bewaard (`localStorage`), en een sessie uit de URL wordt nooit overgenomen.
- Elke build krijgt `_headers` voor Cloudflare Pages: een strenge CSP (`connect-src` alleen de eigen site plus het
  stagingproject), `noindex`, `no-referrer`, `nosniff`, `frame-ancestors 'none'` en cacheregels.
- SQL-scripts voor het dashboard: twee testers in één testhuishouden (`staging/testers.sql`), en de verwijdering na
  30 dagen controleren (`staging/archief-proef.sql`, `staging/archief-controle.sql`).
- Tests:
  - unit 136/136 (9 nieuw);
  - stagingbuild in de browser met CSP, 5/5 (`npm run e2e:staging`, ook in CI), met tegenproeven;
  - buildbewaking: acht onjuiste configuraties geweigerd;
  - de scripts en `pg_cron` zelf op de lokale stack;
  - demo-e2e (138) en lokale e2e (15/15) groen.
- Geen wijziging aan de Huisplan-app, de Huisplan-database of GitHub Pages.

## Thuisplanner KG-5H deel 1: onboarding met huishouden en uitnodigen (16 oktober 2026, lokaal)
- Wie inlogt zonder huishouden, maakt er een aan (en wordt eigenaar), of plakt een uitnodigingslink.
- In Meer → Huishouden:
  - leden bekijken en toevoegen (ook kinderen);
  - uitnodigen via een link met de deelfunctie of kopiëren, 7 dagen geldig en één keer te gebruiken; de eigenaar
    nodigt standaard uit als beheerder;
  - open uitnodigingen intrekken;
  - wisselen als je in meer huishoudens zit.
- Accepteren gebeurt alleen na een klik. Daarna kun je meteen weer weg ("Toch niet").
- Het token gaat meteen uit de adresbalk, staat alleen in `sessionStorage` van dat tabblad (en is na 24 uur weg), en
  overleeft het inloggen.
- Alleen de bestaande databasefuncties en RLS; geen databasewijziging. Eigenaar en beheerder zijn gelijk voor alle
  dagelijkse dingen; de eigenaar heeft alleen uitzonderlijke rechten en staat los van een latere betaler.
- Tests:
  - unit 150/150 (14 nieuw, met tegenproeven op het wegnemen uit de URL en op niet-automatisch accepteren);
  - lokale e2e 18/18, waarvan 3 nieuw tegen de echte stack: eerste huishouden, accepteren na inloggen als beheerder,
    samen live, eenmalig, ingetrokken, twee huishoudens wisselen en gescheiden;
  - staging-e2e 5/5;
  - demo-e2e 138.
- Plan en controles: `docs/thuisplanner-onboarding.md`.

## Thuisplanner KG-5H deel 1b: uitnodigingen op e-mailadres (17 oktober 2026, lokaal)
- Een beheerder kan iemand uitnodigen op een e-mailadres (optioneel). Alleen een account met dat **bevestigde** adres
  ziet en accepteert de uitnodiging. De database dwingt dat af, ook via de link. Het adres komt uit `auth.users` en
  nooit uit het token.
- De genodigde ziet na het inloggen "Uitnodigingen voor jou", zonder link of plakken. Dat staat op het welkomstscherm,
  als één rustige melding op Vandaag (met "Later") en in Meer. Accepteren en weigeren kan, ook voor wie al in een
  huishouden zit, en met meer uitnodigingen naast elkaar. De beheerder ziet "geweigerd".
- Opnieuw uitnodigen op hetzelfde adres trekt de vorige uitnodiging in. Er staan hoogstens 10 uitnodigingen per
  huishouden open.
- Een uitnodiging zonder adres (link) werkt zoals in deel 1.
- Privacy: het adres verdwijnt bij elke sluiting (trigger plus controle) en na het verlopen (dagelijkse taak
  `thuisplanner-uitnodigingen-opschonen`). Alleen eigenaar en beheerder zien het. Geen enkele functie meldt of een adres
  een account heeft.
- Stabiele foutcodes TPU01–TPU10; de app vertaalt alleen de code (contracttest).
- Stagingcontrole: een veilige modus `-Bijwerken` voor een tweede migratie, en een nacontrole op de daadwerkelijke
  opruiming van adressen. Niets uitgevoerd op staging.
- Tests:
  - RLS 64/64 en tegenproeven 85/85, met misbruikscenario's;
  - Auth-integratie 2/2;
  - unit 164/164;
  - lokale e2e 21/21;
  - staging-e2e 5/5;
  - demo-e2e 138;
  - statische controles.
- Bouwverslag en afwijkingen: `docs/thuisplanner-uitnodiging-email.md` §12. Nog niet op staging; daarvoor is een apart
  akkoord nodig.

## Thuisplanner KG-5H deel 2: inloggen met een e-mailcode (17 oktober 2026, lokaal)
- Inloggen en aanmelden met een code van zes cijfers uit de mail, zonder wachtwoord. Eigen codelaag (K1): de code
  staat versleuteld en gehasht in de database, met grenzen per code, per account, per toestel en voor onbekenden, ook
  onder gelijktijdige verzoeken. Supabase geeft zelf de sessie uit.
- Toegangspoort: alleen een sessie die met een code is gestart, krijgt toegang (RLS, RPC's, Realtime, Edge Functions).
  Een vooraf gezet of later toegevoegd wachtwoord geeft nergens toegang. "Uitloggen op alle toestellen" werkt direct.
- Besloten test: alleen testers of genodigden maken een huishouden (G1).
- App:
  - het codescherm, dat herladen overleeft (M1);
  - altijd zichtbaar met welk adres je bent ingelogd (M2);
  - geen uitlog bij een netwerkfout;
  - Account met uitloggen overal en adres wijzigen met twee codes;
  - de naam wordt één keer gevraagd.
- Uitnodigingsmail (D6):
  - de mail bevat geen token;
  - hoogstens één mail per poging;
  - "nog eens sturen" hoogstens 3 keer, één per 10 minuten;
  - 20 per huishouden per dag;
  - een status bij de uitnodiger.
- Nacontrole voor staging bijgewerkt (15 migraties, schakelaars van de poort, Storage, Auth-instellingen).
- Tests:
  - RLS 72/72 en tegenproeven 101/101;
  - integratie 88/88;
  - K1- en D6-tegenproeven 17/17;
  - sync-tegenproeven 22/22;
  - unit 188/188;
  - lokale e2e 24 (2 overgeslagen);
  - staging-e2e 5/5;
  - demo-e2e 138;
  - statische controles.
- Bouwverslag, afwijkingen, wat lokaal bewezen is en de stappen vóór testers: `docs/thuisplanner-deel2-bouwverslag.md`.
  Niet gepusht en niet op staging.

## Thuisplanner D6: uitnodigingsmails automatisch versturen (18 oktober 2026, lokaal)
- De database verstuurt de uitnodigingsmail zelf, ook als niemand de app open heeft:
  - een seintje na elke nieuwe mail (pg_net, met de URL en het geheim uit Vault);
  - een vangnet dat elke minuut kijkt (pg_cron).
- Opnieuw proberen bij een storing na 1, 4 en 9 minuten, daarna "mislukt"; 429 volgt de wachttijd van de aanbieder.
- Nooit dubbel: een onzekere poging (verloren antwoord) gaat alleen opnieuw met een bewezen idempotente aanbieder.
- "Aangenomen", "bezorgd" en "niet bezorgd" zijn apart, via ondertekende meldingen (`mail-bezorging`).
- De koppeling met de mailaanbieder is verwisselbaar (`functions/_gedeeld/aanbieder.ts`); de definitieve aanbieder volgt later.
- De app verstuurt niets meer zelf en toont alleen de stand.
- De nacontrole kent pg_net, Vault, de vijfde taak en de stand van de wachtrij.
- Tests:
  - integratie 95/95;
  - K1- en D6-tegenproeven 26/26;
  - RLS 75/75, tegenproeven 111/111;
  - unit 188/188;
  - lokale e2e 24, staging-e2e 5/5, demo-e2e 138.
- Beschikbaarheid online, afhankelijkheden en kosten: `docs/thuisplanner-uitnodigingsmail-verzending.md` §6. Niets online.

## Thuisplanner: publieke website, gedeelde ontwerpbasis en Lettermint (18 oktober 2026, lokaal)
- Website voor mijnthuisplanner.nl (`thuisplanner/website`):
  - een hoofdpagina, privacy, "Welke mails sturen wij?", bedrijfsgegevens en 404;
  - zonder JavaScript, cookies of bronnen van buiten (CSP), en geen afhankelijkheden;
  - de knop "Meedoen met de bèta", die later met één instelling naar de app gaat;
  - de publicatiebouw weigert lege bedrijfsgegevens.
- Gedeelde ontwerpbasis (`thuisplanner/ontwerp`): kleuren (licht en donker), typografie, en een voorstel voor pictogram en logo. De app gebruikt ze zonder zichtbare wijziging; het tabbladpictogram komt uit dezelfde bron.
- Lettermint-koppeling voor codes en uitnodigingen:
  - de idempotentiesleutel gaat altijd mee, maar telt pas als bewezen na een online proef;
  - een 409 is onzeker;
  - ondertekende bezorgmeldingen.
- De omgevingen staan in `thuisplanner/omgevingen.json`. Het pushscript kent `-Omgeving staging|beta|productie` en weigert een projectkenmerk van een andere omgeving.
- Tests: website-bouw, website-e2e (390 en 1280 px), ontwerpbasis, Lettermint-adapter, omgevingen; de volledige bestaande sets opnieuw (zie `docs/thuisplanner-website.md`).
- Niets online: geen Pages-project, geen DNS, geen push.

## Thuisplanner: de enige productnaam (18 oktober 2026, lokaal)
- De oude werknaam is uit het project gehaald:
  - de map heet `thuisplanner/` (app, supabase, website, ontwerp, sync, dev);
  - de workflows heten `thuisplanner-app.yml` en `thuisplanner-db.yml`;
  - verder bijgewerkt: `tests/thuisplanner.test.js`, de pakketnamen, de lokale `project_id`, de zichtbare titels in de app, en de documentatie (besluit 11: alleen de naam in de tekst).
- Bewust ongewijzigd:
  - de migraties 1–11 (al online uitgevoerd), met twee technische namen in de database: de trigger `komtgoed_before_account_delete` en de slotsleutel `komtgoed:eigenaar:`. Een migratie die die namen wijzigt, is een voorstel en nog niet beoordeeld (niet in de repository);
  - de git-geschiedenis;
  - de neutrale codes `KG-…` en de variabelen `KG_…`.
- Huisplan ongewijzigd; alle testsets opnieuw gedraaid. Niets online.

## Thuisplanner: twee testreparaties na de eerste CI-run van deel 2 (19 oktober 2026)
- De unit-tests draaien altijd in Nederlandse tijd (`TZ` in `vite.config.ts`); de CI-runner draait in UTC, waardoor één tekst met een kloktijd verschoof. De app zelf is ongewijzigd.
- `gelijktijdig.test.mjs` zet de testpoort (`huishouden_open`) zelf open en daarna terug, zodat de test ook op een kale PostgreSQL slaagt (daar draait `seed.sql` niet).
- Lokaal: unit 191/191 (ook met `TZ=UTC`); RLS 75/75 en tegenproeven 111/111; gelijktijdigheid 12/12 met de poort dicht. Tegenproef: de oude testversies falen precies zoals in CI.

## Thuisplanner P1 en P2: wat het toestel bewaart (19 oktober 2026, lokaal)
- Besluit: akkoord met P1, P2 en P4 uit `docs/thuisplanner-sync.md` §9. P5 blijft open.
- P1: op het toestel staat van een onbevestigde afspraak, taak of boodschap alleen de identiteit, nooit de inhoud. Na herladen bevestigt de eerste ophaalronde wat de server al heeft; de rest staat als "inhoud niet op dit toestel" en wordt opnieuw ingevoerd onder dezelfde opdracht-ID (`acties.opnieuwInvoeren`), dus nooit dubbel.
- P2: uitloggen (ook overal, en in de onboarding) met onbevestigde opdrachten vraagt eerst: "Eerst laten nakijken" of "Van dit toestel wissen en uitloggen". Wissen geldt voor alle huishoudens van dat account, niet voor een ander account.
- P3/P4: de ontwikkeldemo bewaart met `bewaarInhoud: true` ook de inhoud (fictief; privé nooit). Niets wordt stil gewist.
- Geen databasemigratie: de server herkent een herhaalde UUID al.
- Tests: `p1p2.test.mjs` (integratie, 5) en `app/tests/p1p2.test.tsx` (6), twee nieuwe e2e-scenario's, drie nieuwe sync-tegenproeven (25 van 25). B3d en H3b toetsen nu expliciet de ontwikkelmodus.
- Huisplan ongewijzigd; niets online.

## Thuisplanner: race in de D6-test "herstel" (20 oktober 2026, alleen testcode)
- De test maakte Vault leeg terwijl er nog een aanroep met het geheim onderweg kon zijn (het vangnet van pg_cron, of de lus van de functie). Die pakte de nieuwe mail terecht op, waardoor de test soms "aangenomen" zag in plaats van "wacht" (CI op PR #27).
- Nu wacht de test eerst tot pg_net niets meer onderweg heeft, plus een korte marge (`rust()`).
- Tegenproef met een opzettelijk uitgelokt verzoek: de oude test 2 van 3 keer rood, de nieuwe 3 van 3 groen; daarna 8 van 8 en het hele bestand 2 keer 14 van 14.

## Thuisplanner: leesrace in de D6-test "opnieuw proberen" (20 oktober 2026, alleen testcode)
- De test las stand, pogingen en "volgende" in drie losse query's. Pakte de functie de mail er tussendoor op, dan zag de test "wacht" van de vorige poging en al het nieuwe aantal pogingen, en mat hij een tijd die nooit zo gepland was (CI: "na 4 min: -1.757 s"). Nu komen ze uit één lezing (`gepland()`); de bewerings en grenzen zijn ongewijzigd.
- De klaargezette antwoorden van de nagebootste aanbieder worden na die test altijd opgeruimd, ook bij een fout. Anders kreeg de mail van de volgende test (T17) een overgebleven "503".
- Tegenproef met een verbreed gat tussen de lezingen: de oude test 4 van 4 keer rood met hetzelfde patroon; de nieuwe stabiel (8 van 8, ook 3 van 3 met trage weigeringen) en het hele bestand 3 keer 14 van 14.
