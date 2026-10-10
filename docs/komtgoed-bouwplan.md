# KomtGoed technisch bouwplan (KG-5A)

Opgesteld 10 oktober 2026 (KG-5A). Dit is de vastgelegde versie van het bouwplan dat eerst als Claude-document is gedeeld; vanaf nu is dit bestand leidend. Wijzigingen in het plan gaan via een PR op dit bestand.

KomtGoed is een werknaam. Dit plan raakt de bestaande Huisplan-app (`index.html`, `supabase/`) niet en gebruikt geen bestaand online Supabase-project.

We bouwen de echte gezinsapp op Supabase door PR #19 eerst te verstevigen en te testen op een echte lokale Supabase, daarna de inhoudstabellen toe te voegen met privé-afspraken als aparte detailtabel, en de bestaande React-app via één datalaag te koppelen. Elke stap is klein, lokaal getest en zonder deploy; staging volgt pas na jouw keuze voor een nieuw Supabase-project.

## Genomen productbeslissingen (10 oktober 2026)

De drie productvragen uit KG-5A zijn beantwoord volgens het advies:

1. **Gewone gezinsleden mogen gedeelde afspraken, taken en boodschappen wijzigen** (ieder actief lid met een account; niet alleen maker en beheerders).
2. **Privé-afspraken van anderen verschijnen uitsluitend als "Bezet"**, zonder titel, locatie, notities of andere privégegevens.
3. **Taken en boodschappen zijn voorlopig alleen gedeeld**; geen privé-taken of privé-boodschappen in stap 1 tot en met 9.

Stap 1 landt als vervolgcommits op PR #19 (zelfde onderwerp: KG-1 verstevigen). Stap 2 en verder komen op een nieuwe branch bovenop #19. Merge-volgorde later: #19, dan #20, dan de rest.

## Beoordeling PR #19 (database)

PR #19 is een goed fundament, maar niet productieklaar: het is alleen getest tegen een nabootsing van Supabase, en het kan privé-afspraken als "bezet" niet veilig dragen. De opbouw zelf is sterk: samengestelde verwijzingen binnen één huishouden, schrijven via functies, een uitgestelde eigenaarscontrole, `anon` zonder rechten, uitnodigingstokens alleen als hash en tegenproeven.

| # | Bevinding | Ernst | Oplossing | Status |
| --- | --- | --- | --- | --- |
| 1 | Rij-beveiliging (RLS) toont een rij helemaal of niet. `private.can_read` kan dus geen "bezet zonder titel" opleveren: een privé-afspraak van een ander is óf onzichtbaar, óf helemaal zichtbaar. | Hoog | Tijd en deelnemers in `events`, titel/plek/notitie in een aparte tabel `event_details` met strengere RLS (zie Beveiligingsregels). | Stap 2 |
| 2 | Alleen getest tegen een eigen stub op PostgreSQL 16. Echte Supabase (auth, PostgREST, standaardrechten, realtime) is nooit gebruikt; `config.toml` noemt bovendien PostgreSQL 17. | Hoog | Een CI-job met `supabase start` (Docker op de GitHub-runner) die de migratie en de matrix tegen de echte lokale stack draait. Versie gelijktrekken. | Opgelost in KG-5B |
| 3 | Een account verwijderen faalt voor de enige eigenaar: de FK `on delete set null` botst met de eigenaarscheck. Een AVG-verwijderverzoek kan dan niet. | Middel | Een vaste flow: eerst overdragen of het huishouden opheffen. | Opgelost in KG-5B (bleek erger: zie onder) |
| 4 | Elk lid ziet de account-UUID (`user_id`) van de andere leden. Niet geheim, wel onnodig. | Middel | Kolomrechten zonder `user_id`; "heeft account" en "ben ik" via een functie of view. | Opgelost in KG-5B |
| 5 | RLS roept per rij een hulpfunctie aan (`is_active_member(household_id)`). Goed genoeg voor leden, traag voor duizenden afspraken. | Middel | Nieuwe tabellen: `household_id in (select private.my_household_ids())`, één keer per query geëvalueerd. | Opgelost in KG-5B (ook voor de bestaande tabellen) |
| 6 | De uitnodigingslink is nog niet ontworpen; een token in de querystring belandt in serverlogs. Iedereen kan onbeperkt huishoudens aanmaken. | Laag | Token in het URL-fragment (`#`). Een eenvoudige limiet op huishoudens per account. | Limiet opgelost in KG-5B; fragment volgt in stap 7 (de link wordt dan pas gebouwd) |
| 7 | Realtime staat uit in `config.toml`; er zijn nog geen inhoudstabellen. | Info | Hoort bij de volgende stappen. | Lokaal aan in KG-5B om te bewijzen dat er niets uitlekt |

**Ontdekt tijdens KG-5B (op de echte lokale stack):** niet alleen de enige eigenaar, maar *elk* gekoppeld account kon niet worden verwijderd. De FK zette `user_id` op null maar liet `linked_at` staan, wat de check `household_members_linked_check` brak. Opgelost met een trigger op `auth.users` (zie `docs/komtgoed-fundament.md`).

## Beoordeling PR #20 (frontend)

De domeinlogica van PR #20 is herbruikbaar; alleen de opslag moet eruit. De schermen praten nu rechtstreeks met één in-memory reducer (`store.ts`), en daar zit de hele demo-staat in.

| Onderdeel | Oordeel | Wat ermee gebeurt |
| --- | --- | --- |
| `lib/datum`, `herhaling`, `kalender`, `filter`, `vandaag`, `boodschappen` | Goed: puur, getest, met tegenproeven | Blijft. Wordt de gedeelde domeinlaag. |
| `lib/types.ts` (Afspraak, Taak, Boodschap) | Bruikbaar als domeinmodel | Blijft. Een vertaallaag zet databaserijen om naar deze typen. |
| `lib/rechten.ts` (`zichtbaarVoor`, `titelVoor`) | Juiste regel, verkeerde plek om te vertrouwen | Blijft als tweede laag; de server wordt de eerste. |
| `lib/store.ts` (reducer, melding, ongedaan maken) | Demo-opslag, één momentopname voor ongedaan maken | Wordt `DemoOpslag` achter een interface; ongedaan maken wordt per actie (bijv. een verwijdering terugdraaien). |
| Reeks-uitzonderingen als array in de reeks | Werkt lokaal, maar twee toestellen tegelijk overschrijven elkaar | Wordt een eigen tabel `event_exceptions`. |
| ID's als `a-nieuw-…` | Alleen voor de demo | UUID's die de app zelf maakt, zodat een herhaalde opdracht niets dubbel opslaat. |
| Schermkeuze via `#/agenda` en `useState` | Te beperkt voor inloggen en uitnodigingslinks | Een kleine router met routes per pagina. |
| E2e-tests op 360/390/desktop, sandbox-test | Waardevol | Blijven draaien in demo-modus; nieuwe tests tegen een lokale Supabase erbij. |

## Doelarchitectuur

```
 ┌──────────────────────────── React-app (komtgoed/app) ────────────────────────────┐
 │  paginas/  (Vandaag, Agenda, Boodschappen, Meer; later Inloggen, Uitnodiging)    │
 │      │ alleen hooks (useAfspraken(periode), useTaken(), …)                       │
 │  app/      router, sessie, huishoudenkeuze, cache (TanStack Query), meldingen    │
 │      │                                                                           │
 │  data/opslag.ts  ── één interface ──┬── data/demo/      DemoOpslag (fictief gezin)│
 │                                     └── data/supabase/  SupabaseOpslag            │
 │  domein/   datum, herhaling, kalender, filter, vandaag, boodschappen (puur)      │
 └─────────────────────────────────────┬────────────────────────────────────────────┘
                                       │ supabase-js (HTTPS: PostgREST, Auth; WebSocket: Realtime)
 ┌─────────────────────────────────────▼──────────────── Supabase ──────────────────┐
 │  Auth (e-mailcode)        PostgREST: alleen schema public, RLS op elke tabel     │
 │  public:  tabellen + dunne functies (security invoker)                           │
 │  private: hulpfuncties en schrijffuncties (security definer, niet via de API)    │
 │  Realtime: private kanalen household:<id>, alleen een seintje {tabel, id, versie}│
 │            → de app haalt het item opnieuw op via de beveiligde Data-API         │
 └──────────────────────────────────────────────────────────────────────────────────┘
```

Pagina's kennen alleen hooks en de opslag-interface; daaronder wisselt demo of Supabase. Realtime stuurt alleen een seintje, waarna de app opnieuw ophaalt via de beveiligde Data-API.

## Database: tabellen

Vier tabellen uit PR #19 blijven, zes inhoudstabellen komen erbij. Elke inhoudstabel heeft `household_id`, samengestelde verwijzingen naar leden van hetzelfde huishouden, `version` (een trigger telt op), `created_at`/`updated_at` en `deleted_at` (zacht verwijderen, nodig voor synchronisatie).

| Tabel | Kern | Status |
| --- | --- | --- |
| `profiles` | Eigen weergavenaam per account | Bestaat (PR #19) |
| `households` | Naam; nieuw: `timezone` (standaard `Europe/Amsterdam`) | Bestaat, kleine uitbreiding (stap 2) |
| `household_members` | Lid met rol, soort (volwassene/kind), status; account optioneel | Bestaat; kolomrechten zonder `user_id` (KG-5B) |
| `household_invites` | Uitnodiging, alleen tokenhash, eenmalig, verloopt | Bestaat |
| `events` | Wanneer en van wie: `start_date`, `start_time` (leeg = hele dag), `end_date`, `end_time`, `owner_member_id`, `visibility` (`household` of `private`), herhaling (`recurrence_freq`, `recurrence_until`), losgemaakt voorkomen (`series_id`, `original_date`) | Nieuw |
| `event_details` | Wat en waar: `title`, `location`, `notes`, `preparation`; één rij per afspraak | Nieuw, strengere RLS |
| `event_participants` | Voor wie: (`event_id`, `member_id`) | Nieuw; vervangt de lijst `wie` |
| `event_exceptions` | Verwijderde voorkomens van een reeks: (`series_id`, `occurrence_date`) als sleutel | Nieuw; vervangt de array `uitzonderingen` |
| `tasks` | `title`, `due_date` (leeg = ooit), `assignee_member_id`, `done_on`, `done_by_member_id` | Nieuw |
| `shopping_items` | `name`, `name_key` (kleine letters), `checked_at`; uniek per huishouden op `name_key` zolang niet verwijderd | Nieuw |

**Tijd:** afspraken staan als lokale datum en tijd plus de tijdzone van het huishouden, niet als UTC-moment. Zo blijft een wekelijkse les om 09:15 ook na de wisseling naar wintertijd om 09:15.

**Geen dubbelingen in de database zelf:**

- uniek (`series_id`, `original_date`) voor losgemaakte voorkomens;
- de sleutel van `event_exceptions` voorkomt dubbele uitzonderingen;
- een losgemaakt voorkomen kan geen eigen herhaling hebben (check);
- uniek `name_key` per huishouden voor boodschappen.

## Beveiligingsregels

De server beslist alles; de app toont alleen wat de server teruggeeft. Dit is de uitwerking van gate 9: gedeelde en afgeschermde gegevens worden in de database gescheiden, niet in het scherm.

| Regel | Hoe afgedwongen |
| --- | --- |
| Niemand zonder actief lidmaatschap ziet iets van een huishouden | RLS op elke tabel: `household_id in (select private.my_household_ids())`; `anon` heeft nergens rechten; geen standaardrechten, alles expliciet |
| Een gearchiveerd lid verliest direct alle toegang | Hulpfuncties tellen alleen actieve leden (bestaat al) |
| Privé-afspraak van een ander = "bezet" | `events` (tijd, eigenaar, deelnemers) leesbaar voor het hele huishouden; `event_details` alleen als `visibility = household` of jij de eigenaar bent. Een view met `security_invoker` koppelt beide; titel en plek blijven leeg voor wie ze niet mag zien |
| Alleen de eigenaar wijzigt of verwijdert een privé-afspraak, en alleen de eigenaar kiest privé of gedeeld | RLS op `update` van `events` en `event_details`, plus een guard-trigger op `visibility` en `owner_member_id` |
| Wie gedeelde items mag wijzigen | Ieder actief lid (beslissing 1) |
| Vaste kolommen veranderen nooit | Guard-trigger: `id`, `household_id`, `owner_member_id`, `series_id`, `original_date` |
| Geen verwijzing over de grens van een huishouden | Samengestelde FK's (`household_id`, `member_id`) en (`household_id`, `event_id`) |
| Verwijderen = markeren | Geen `delete`-recht via de API; `deleted_at` via `update`. Echt opruimen later met een serverjob |
| Acties over meerdere rijen zijn atomair | Functies (security definer in `private`, dunne invoker in `public`): `edit_occurrence`, `delete_occurrence`, `delete_series`, `add_shopping_items` |
| Realtime alleen voor het eigen huishouden | Kanalen `household:<id>` zijn privé; een RLS-beleid op `realtime.messages` laat alleen actieve leden toe. Berichten bevatten geen inhoud (zie Herhaling, synchronisatie en realtime) |

**Gate 9 is gehaald** als de testmatrix voor elke tabel en elke rol slaagt, inclusief tegenproeven, tegen een echte lokale Supabase. Dat is een voorwaarde vóór de eerste echte gegevens.

## Herhaling, synchronisatie en realtime

De database bewaart regels, de app rekent voorkomens uit, en realtime stuurt alleen een seintje dat er iets veranderde, nooit de inhoud. Dat houdt de server eenvoudig en voorkomt lekken via realtime.

**Herhaling**

- Een reeks is één rij in `events` met `recurrence_freq` en eventueel `recurrence_until`. Voorkomens rekent de bestaande `herhaling.ts` uit, één implementatie voor alle schermen.
- "Alleen deze wijzigen" = de functie `edit_occurrence`. Die maakt in één transactie een losgemaakte afspraak (`series_id`, `original_date`). De regel "niet naar een dag waarop de reeks al staat" geldt ook op de server.
- "Alleen deze verwijderen" = een rij in `event_exceptions`. "Hele reeks verwijderen" = de reeks plus de losgemaakte voorkomens in één transactie.
- Later: "deze en alle volgende" = de reeks splitsen (de oude stopt een dag eerder, er begint een nieuwe). Het model hoeft daarvoor niet te veranderen.

**Synchronisatie**

- Online eerst. Lezen per periode (dag, week of maand) en per lijst, met een cache in de app.
- Schrijven is optimistisch: het scherm past zich meteen aan en herstelt bij een fout.
- Elke nieuwe rij krijgt een UUID van de app. Een herhaalde opdracht (slecht bereik, dubbel tikken) slaat dus niets dubbel op.
- Bijwerken alleen als `version` nog klopt. Klopt hij niet, dan haalt de app de nieuwe stand op en meldt: "Iemand anders heeft dit net aangepast."
- Zonder verbinding kan het scherm lezen uit de cache, maar niet schrijven, en dat zegt het duidelijk. Een wachtrij voor offline wijzigingen komt later: Huisplan liet zien hoeveel complexiteit dat meebrengt.

**Realtime**

- Na elke wijziging stuurt een databasetrigger een bericht naar het privékanaal `household:<id>` met alleen `{tabel, id, versie}`.
- De app haalt het item daarna opnieuw op via de gewone, met RLS beveiligde weg.
- Bewust niet `postgres_changes`: dat stuurt hele rijen mee, en bij verwijderingen geldt RLS niet volledig.
- Na het opnieuw verbinden haalt de app de zichtbare periode opnieuw op. Eenvoudig en altijd juist.

## Frontend-onderdelen

Pagina's praten alleen met hooks, en hooks alleen met één opslag-interface. Daardoor kun je een pagina herbouwen zonder de data aan te raken, en de data van demo naar Supabase wisselen zonder een pagina aan te raken.

| Map | Inhoud | Herkomst |
| --- | --- | --- |
| `src/domein/` | Pure logica en typen: datum, herhaling, kalender, filter, vandaag, boodschappen | Verhuisd uit `lib/`, ongewijzigd |
| `src/data/opslag.ts` | De interface: afspraken lezen per periode, bewaren, voorkomen wijzigen/verwijderen; taken; boodschappen; leden; huishoudens | Nieuw |
| `src/data/demo/` | `DemoOpslag`: de huidige reducer achter de interface; fictief gezin | Uit `store.ts` |
| `src/data/supabase/` | `SupabaseOpslag`: supabase-js, vertaling rij ↔ domein, gegenereerde databasetypen, realtime-kanaal | Nieuw |
| `src/app/` | Router, sessie (inloggen), keuze van het huishouden, cache, meldingen en ongedaan maken | Deels uit `App.tsx` |
| `src/paginas/<naam>/` | Per pagina: scherm, eigen hooks (`useAfspraken(periode)`, `useTaken()`, …) en onderdelen | Vandaag, Agenda, Boodschappen, Meer verhuizen; later Inloggen, Uitnodiging, Huishoudens |
| `src/ui/` | Gedeelde onderdelen: Venster, Rijen, Navigatie, Iconen, stijlen en tokens | Uit `components/` en `styles/` |

**Bibliotheken** (versies vastgezet, minstens twee weken oud):

- `@supabase/supabase-js` voor auth, data en realtime;
- `@tanstack/react-query` voor de cache per periode, optimistisch schrijven en opnieuw ophalen na een realtime-seintje;
- `react-router` voor routes per pagina, ook voor de uitnodigingslink.

**Configuratie:** `VITE_SUPABASE_URL` en de publieke sleutel van Supabase komen uit de omgeving, nooit uit de code. Ontbreken ze, dan start de app in demo-modus, zodat de huidige demo en alle bestaande tests blijven werken.

## Tests

Elke laag krijgt een eigen test, en de beveiligingstests draaien tegen een echte lokale Supabase in GitHub Actions. (In KG-5B bleek dat ook in de Claude-werkomgeving te kunnen; de PostgreSQL-stub blijft als snelle lokale controle.)

| Laag | Wat | Waar |
| --- | --- | --- |
| Database: rechten | Matrix per tabel en per rol (eigenaar, beheerder, lid, gearchiveerd, ander huishouden, `anon`): lezen, schrijven, vaste kolommen, grens tussen huishoudens; tegenproeven per regel | SQL-matrix tegen `supabase start` (CI) |
| Database: privé | Andermans privé-afspraak: tijd zichtbaar, titel/plek/notitie nergens, ook niet via view, functie of realtime | SQL-matrix + integratietest met supabase-js |
| Database: herhaling | Geen dubbele uitzondering of losgemaakt voorkomen; atomaire functies; verplaatsen naar een bezette reeksdag geweigerd | SQL-matrix |
| Realtime | Abonneren op het kanaal van een ander huishouden faalt; een bericht bevat geen inhoud; gearchiveerd lid krijgt niets meer | Integratietest met supabase-js tegen de lokale stack (CI) |
| Opslag-contract | Eén testsuite voor de interface, gedraaid tegen `DemoOpslag` én `SupabaseOpslag` | Vitest; Supabase-deel in CI |
| Domein | Datum, herhaling, filter, boodschappen (bestaat: 54 tests) | Vitest |
| Gebruikersflows | Bestaande e2e in demo-modus (138); nieuw: inloggen met code (lokale mailbox van de CLI), uitnodigen en accepteren, twee browsers die elkaars wijziging zien | Playwright op 360, 390 en desktop |
| Veiligheid rondom | Geen secrets in de repo, geen externe aanvragen in demo-modus, Huisplan-bestanden onaangeroerd | Statische controles (bestaan deels in PR #19) |

## Bouwstappen

Negen stappen, elk een eigen kleine PR die lokaal of in CI getest wordt. Tot en met stap 8 is er geen deploy en geen echt Supabase-project. Stap 1 tot en met 4 raken de schermen niet.

1. **KG-5B · PR #19 verstevigen.** Bevindingen 2, 4, 5 en 6 oplossen; CI-job met `supabase start`; PostgreSQL-versie gelijktrekken. Geen nieuwe tabellen.
   - Klaar als: de bestaande matrix (22 scenario's) en 14 tegenproeven slagen tegen de echte lokale Supabase.
   - Uitkomst KG-5B: 27 scenario's en 22 tegenproeven slagen op de stub (PostgreSQL 16) én op de echte lokale stack (PostgreSQL 17.6), plus een integratietest met supabase-js. Bevinding 3 (account verwijderen) is ook opgelost. Zie `docs/komtgoed-fundament.md`.
2. **KG-5C · Inhoudsschema.** Zes inhoudstabellen, de view voor afspraken, de functies voor herhaling en boodschappen, en de RLS.
   - Klaar als: de matrix voor privé, herhaling en dubbelingen slaagt met tegenproeven (gate 9 technisch gehaald).
3. **KG-5D · Realtime op de server.** Trigger naar `household:<id>` en het beleid op `realtime.messages`.
   - Klaar als: integratietests aantonen dat een ander huishouden niet kan meeluisteren en dat berichten geen inhoud bevatten.
4. **KG-5E · Frontend herindelen, zonder zichtbaar verschil.** Mappen `domein`, `data`, `app`, `paginas` en `ui`; de opslag-interface met `DemoOpslag`; cache en router.
   - Klaar als: alle bestaande tests ongewijzigd slagen en de screenshots gelijk blijven.
5. **KG-5F · Lezen uit Supabase.** `SupabaseOpslag` voor lezen, met de contracttests tegen de lokale stack. De demo-modus blijft.
   - Klaar als: de contractsuite slaagt voor beide opslagen.
6. **KG-5G · Schrijven naar Supabase.** Optimistisch, met UUID's van de app en `version`-controle; herhaling via de functies.
   - Klaar als: contract- en e2e-tests tegen de lokale stack slagen, inclusief een conflict tussen twee toestellen.
7. **KG-5H · Inloggen en huishoudens.** Inloggen met een e-mailcode, een huishouden aanmaken of kiezen, een uitnodiging accepteren. Dit zijn de eerste nieuwe pagina's: pas na jouw akkoord.
   - Klaar als: e2e van inloggen tot eerste afspraak slaagt, ook voor iemand in twee huishoudens.
8. **KG-5I · Realtime in de app.** Seintje ontvangen, opnieuw ophalen, opnieuw verbinden.
   - Klaar als: in een e2e-test met twee browsers ziet de tweede binnen enkele seconden de wijziging van de eerste.
9. **KG-5J · Staging.** Pas na besluit B2: een nieuw Supabase-project in de EU, migraties via CI, statische hosting en een beveiligingsreview van gate 9. Nog geen echte gebruikers.
   - Klaar als: de review akkoord is en de e2e tegen staging slaagt.

## Nu nodig versus later

De basis is wat een echt gezin nodig heeft om veilig samen te plannen; de rest past later in hetzelfde model zonder herbouw.

| Noodzakelijke basis (stap 1–9) | Later, zonder herbouw |
| --- | --- |
| Inloggen met e-mailcode | Inloggen met Apple of Google |
| Meerdere huishoudens, rollen, uitnodigen, archiveren | Kindaccounts met beperkte rechten; gasten of oppas |
| Privé-afspraken als "bezet" | Zichtbaarheid `members` (alleen genoemde leden) |
| Afspraken, taken, boodschappen in de database | Meerdere boodschappenlijsten, winkelvolgorde, categorieën |
| Herhaling: elke dag, week, maand, jaar; alleen deze of hele reeks | "Deze en alle volgende"; herhalende taken; om de twee weken |
| Realtime-seintje en opnieuw ophalen | Offline wijzigingen in een wachtrij; pushmeldingen |
| Gate 9 technisch gehaald | Account en huishouden verwijderen, AVG-export (vóór echte gebruikers). *Account en huishouden verwijderen zijn in KG-5B al in de database opgelost; de schermen en de AVG-export volgen later.* |
| Staging op een nieuw project | Productie, abonnementen, import uit Huisplan (met de gates uit de roadmap) |

## Risico's

Het grootste risico is een fout in de rij-beveiliging waardoor privé-gegevens uitlekken; daarom staat de beveiliging vóór elke schermkoppeling en wordt ze tegen een echte Supabase getest.

| Risico | Gevolg | Maatregel |
| --- | --- | --- |
| Fout in RLS lekt privé-afspraken of gegevens van een ander huishouden | Ernstig vertrouwensverlies | Detailtabel apart; matrix per tabel en rol met tegenproeven; review van gate 9 vóór echte gegevens |
| Realtime stuurt inhoud mee | Lek buiten RLS om | Alleen seintjes zonder inhoud; privékanalen; test dat inhoud ontbreekt |
| Tests draaiden tot nu toe op een nabootsing | Verschillen met echte Supabase blijven onopgemerkt | Stap 1: CI met `supabase start` (gedaan in KG-5B) |
| Herhaling werkt in de app anders dan de database verwacht | Verkeerde of dubbele afspraken | Eén implementatie (`herhaling.ts`); de database bewaakt alleen sleutels en uniciteit; tests rond maandgrenzen en schrikkeljaren (bestaan) |
| Twee toestellen wijzigen tegelijk | Een wijziging gaat verloren | `version`-controle per rij; uitzonderingen als rijen, niet als lijst |
| Zomer- en wintertijd | Afspraken verschuiven een uur | Lokale datum en tijd plus tijdzone van het huishouden |
| E-mailcodes komen niet aan | Niemand kan inloggen | Lokaal de mailbox van de CLI; vóór echte gebruikers een eigen SMTP-dienst in de EU |
| Een enige eigenaar kan het account niet verwijderen | AVG-verzoek loopt vast | Verwijderflow ontwerpen vóór echte gebruikers (database-deel gedaan in KG-5B) |
| Offline verwachtingen groeien | Complexiteit zoals bij Huisplan | Bewust online eerst; offline is een aparte, latere stap |
| Afhankelijkheid van Supabase | Overstappen wordt duur | Gewone PostgreSQL en SQL-functies; de app praat via één opslag-interface |

## Productvragen

Drie keuzes bepalen de beveiligingsregels van stap 2. Beantwoord op 10 oktober 2026 volgens het advies (zie bovenaan).

1. **Wie mag gedeelde afspraken en taken wijzigen en verwijderen?** Advies: ieder actief lid met een account. Dat zijn nu alleen volwassenen; kinderen hebben nog geen account. Alternatief: alleen de maker en beheerders. Dat is strenger, maar minder handig in een gezin. → **Gekozen: advies.**
2. **Is "bezet" de juiste weergave van een privé-afspraak?** Advies: ja. Het hele huishouden ziet tijd en voor wie, nooit titel, plek of notitie. Alternatief: helemaal onzichtbaar. Dan kan niemand zien dat je niet kunt. → **Gekozen: advies.**
3. **Taken en boodschappen alleen gedeeld in de basis?** Advies: ja, geen privé-taken of privé-boodschappen in stap 1 tot en met 9. Later toe te voegen met dezelfde detailtabel-aanpak. → **Gekozen: advies.**

## Wat er nog nodig is

- [x] De drie productvragen (beantwoord 10 oktober 2026).
- [x] Waar stap 1 landt: als vervolgcommits op PR #19.
- [ ] Stap 4–5: akkoord op drie nieuwe bibliotheken (`@supabase/supabase-js`, `@tanstack/react-query`, `react-router`). *De integratietest van KG-5B gebruikt `@supabase/supabase-js` al, maar alleen als testafhankelijkheid, los van de app.*
- [ ] Stap 7: akkoord op de eerste nieuwe pagina's (inloggen, huishoudens, uitnodiging).
- [ ] Stap 9 (besluit B2):
  - een nieuw Supabase-project voor KomtGoed in de EU (bijvoorbeeld Frankfurt), aangemaakt door jou;
  - een keuze voor statische hosting van de staging-app;
  - vóór echte gebruikers: een SMTP-dienst voor de inlogcodes.

Tot en met stap 8 is er geen geheim, geen bestaand Supabase-project en geen deploy nodig. Huisplan blijft volledig ongemoeid.
