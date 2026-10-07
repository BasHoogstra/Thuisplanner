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

