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
