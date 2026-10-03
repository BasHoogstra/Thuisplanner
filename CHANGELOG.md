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

