# Thuisplanner K3: archiveren met een bewaartermijn van 30 dagen (bouwbeschrijving)

**Status:** besloten op 15 oktober 2026 (variant A, 30 dagen) en **gebouwd**, alleen lokaal, in migratie
`20261019120000_archief_bewaartermijn.sql`. Zie §9 voor wat er afwijkt van deze beschrijving en voor de testresultaten.

- **Hoort bij:** `docs/thuisplanner-architectuurcontrole.md` §7, variant A. De producteigenaar heeft een
  voorlopige voorkeur uitgesproken voor variant A met een termijn van 30 dagen.
- **Uitgangspunten van de opdracht:**
  - archiveren en definitief verwijderen blijven gescheiden;
  - privégegevens zijn na het archiveren niet toegankelijk voor anderen, maar gaan ook niet onherroepelijk
    verloren;
  - ze blijven niet onbeperkt bewaard zonder doel;
  - er komt geen uitgebreid archiefsysteem.

## 1. In het kort

| Moment | Wat er gebeurt |
| --- | --- |
| **Archiveren** | Het lid is niet meer actief. Gedeelde afspraken blijven. De privé-afspraken van dat lid blijven bewaard, maar zijn voor niemand meer zichtbaar, ook niet als "Bezet". |
| **Binnen 30 dagen** | Een eigenaar of beheerder kan het lid terughalen. De privé-afspraken zijn dan direct weer van de betrokkene, en de anderen zien weer "Bezet". |
| **Na 30 dagen** | Een dagelijkse taak in de database verwijdert de privé-afspraken van dat lid definitief, met alles wat erbij hoort. Het profiel en alle gedeelde inhoud blijven. Terughalen kan dan nog wel, maar zonder de privé-afspraken. |
| **Eerder definitief weg** | Alleen als de betrokkene zelf zijn account verwijdert of het huishouden verlaat. Dat werkt nu al. |

## 2. Wat er nu al geldt (BEWEZEN in de migraties) en wat er verandert

| Onderwerp | Nu | Na K3 |
| --- | --- | --- |
| Details (titel, plek, notitie) van privé-afspraken van een gearchiveerd lid | Voor niemand leesbaar (`is_my_event` vraagt een actief lidmaatschap) | Ongewijzigd |
| De afspraak zelf ("Bezet", tijd, voor wie) | Zichtbaar voor alle leden | **Niet meer zichtbaar** zolang het lid gearchiveerd is: niet in `events` en `event_overview`, en ook niet in `event_participants` en `event_exceptions` |
| Privé-afspraak wijzigen of verwijderen | Alleen de eigenaar (`save_event` en `delete_event` controleren `is_my_event`); een beheerder kan het niet | Ongewijzigd |
| Gedeelde afspraken van het gearchiveerde lid | Blijven zichtbaar en door ieder actief lid te wijzigen | Ongewijzigd |
| Terughalen | Kan niet (er is geen functie; een uitnodiging voor een gearchiveerd lid wordt geweigerd) | `restore_member` |
| Termijn | Geen; bewaren zonder einde | 30 dagen, daarna een automatische opruimtaak |
| Account verwijderen tijdens het archief | Koppelt ook gearchiveerde profielen los; de trigger `drop_private_on_unlink` verwijdert dan de privé-afspraken (KG-T41) | Ongewijzigd |

## 3. Bouwplan (één migratie, bijvoorbeeld `20261019120000_archief_bewaartermijn.sql`)

### 3.1 Eén plek voor de termijn

- `private.archive_retention()` geeft `interval '30 days'` terug.
- Herstel, opruimen en tests gebruiken alle drie deze ene functie. De termijn veranderen is dan één
  regel, plus de tekst in de privacyverklaring.

### 3.2 Zichtbaarheid aan de serverkant (RLS; gate 9)

- **`events_select`:** wordt
  `household_id in (my_household_ids()) and (visibility <> 'private' or owner_member_id not in (gearchiveerde leden van mijn huishoudens))`.
  - De subquery leest `household_members`, onder de RLS die er al is.
  - Er is geen nieuwe security-definer-functie nodig.
  - De planner kan de subquery één keer per query uitvoeren.
- **`event_participants_select` en `event_exceptions_select`:** krijgen de voorwaarde dat de bijbehorende
  afspraak zichtbaar is (`exists (select 1 from events e where e.id = event_id)`, ook onder RLS). Zo
  verraden deelnemers en uitzonderingen niets over verborgen afspraken.
- **`event_overview`:** is `security_invoker` en volgt dit dus vanzelf.
- **Realtime:** stuurt alleen seintjes zonder inhoud. Na een seintje haalt de client opnieuw op via RLS;
  een verborgen afspraak komt dan gewoon niet meer mee. Daar hoeft niets aan te veranderen.

### 3.3 Herstel

`public.restore_member(huishouden, lid)`: een dunne wrapper, met de logica in `private`, net als
`archive_member`.

| Regel | Waarom |
| --- | --- |
| Alleen een eigenaar of beheerder van dat huishouden; dezelfde volgorde van vergrendelen als `archive_member` (`lock_household`) | Dezelfde rechten als archiveren; geen race met de opruimtaak |
| Alleen een lid dat nu gearchiveerd is | Anders is er niets te herstellen |
| Het lid komt terug als `member`, nooit met een beheerrol | Rechten worden niet stilletjes teruggegeven; een eigenaar kan ze daarna bewust weer toekennen |
| Is hetzelfde account intussen onder een ander profiel actief in dit huishouden, dan een duidelijke weigering | De bestaande unieke index staat twee actieve profielen per account niet toe; zonder deze regel zou er een technische fout komen |
| Ingetrokken uitnodigingen blijven ingetrokken | Herstel is geen nieuwe uitnodiging |
| Ná de termijn mag herstel nog wel, maar de privé-afspraken zijn dan weg | Het profiel hoort bij de geschiedenis van het huishouden. De app moet dat vooraf zeggen (§4) |

**Herstel van de privé-afspraken.** Er wordt niets gekopieerd of teruggezet:
- de afspraken zijn nooit verwijderd en de koppeling met het account (`owner_user_id`) is nooit losgemaakt;
- na het herstel is het lid weer actief, en dan zijn ze via de bestaande regels direct weer van de
  betrokkene. Voor de anderen zijn ze weer "Bezet".

Dat is de eenvoudigste vorm van herstel die er is.

### 3.4 Na 30 dagen: definitief verwijderen

- **`private.purge_archived_private()`:** verwijdert de privé-afspraken van leden die langer dan de
  termijn gearchiveerd zijn. Details, deelnemers en uitzonderingen gaan mee via de bestaande
  `on delete cascade`.
  - De functie vergrendelt per huishouden (`lock_household`, zelfde volgorde als bij herstel). Een herstel
    dat precies op dag 30 gebeurt, kan dus nooit half samenvallen met het opruimen: óf eerst hersteld
    (dan blijft alles), óf eerst opgeruimd.
  - Ze is idempotent en raakt alleen privé-afspraken. Gedeelde inhoud, het profiel en andere huishoudens
    blijven onaangeroerd.
  - Ze is alleen uit te voeren door de database zelf (`postgres`). Er is geen recht voor `authenticated`.
- **Planning:** `pg_cron`, dagelijks rond 03:00, met een vaste naam (bijvoorbeeld
  `thuisplanner-archief-opruimen`).
  - `pg_cron` 1.6.4 is lokaal beschikbaar (gecontroleerd); op Supabase is het een standaardextensie
    zonder meerkosten.
  - In de testomgeving zonder `pg_cron` (PostgreSQL 16 in CI) maakt de migratie de extensie en de
    planning alleen aan als ze beschikbaar zijn. De opruimfunctie zelf bestaat altijd en wordt in de tests
    rechtstreeks aangeroepen.
- **Index:** `events (household_id, owner_member_id) where visibility = 'private'`, zodat opruimen en
  de nieuwe RLS-voorwaarde geen volledige tabelscan doen.

### 3.5 Wat niet wordt gebouwd

- Geen bewaartabel en geen kopie van gegevens.
- Geen nieuwe tabellen.
- Geen knop voor de beheerder om andermans privé-afspraken te wissen.
- Geen e-mail naar het gearchiveerde lid.
- Geen schermen: die komen bij het ledenbeheer. Archiveren zit nu nog niet in de app.

## 4. Vooraf waarschuwen

De app heeft nog geen scherm om te archiveren. De waarschuwing hoort bij dat scherm (KG-5H of het
ledenbeheer) en komt dus niet in deze stap. Deze stap legt wel vast wat er moet staan, en zorgt dat de
app de benodigde gegevens kan lezen: `archived_at` is al leesbaar voor leden.

**Bij archiveren** (één bevestiging; principe 5: groter gevolg, dus meer bevestiging):

> **Lotte archiveren?**
> Lotte kan dit huishouden niet meer openen. Gedeelde afspraken, taken en boodschappen blijven staan.
> Haar privé-afspraken zijn voor niemand zichtbaar en worden na 30 dagen definitief verwijderd. Tot
> 15 november kun je Lotte terughalen; dan krijgt ze ze terug.

- Er staat **geen aantal** privé-afspraken in de tekst. Ook een aantal zegt iets over andermans privéleven.
- Bij een gearchiveerd lid staat in de ledenlijst "Te herstellen tot 15 november", en na de termijn
  "Privé-afspraken verwijderd".
- **Het gearchiveerde lid zelf** krijgt nu nog geen bericht, omdat er nog geen e-maildienst is (B4).
  Zodra die er is, krijgt de betrokkene een melding met de datum. Dat is een open punt.

## 5. Meerdere huishoudens

- Alles gebeurt per lidmaatschap en per huishouden. Hetzelfde account in een ander huishouden merkt niets:
  zijn privé-afspraken daar horen bij een ander profiel.
- De opruimtaak werkt per huishouden onder een vergrendeling, en een fout in één huishouden blokkeert de
  andere niet. Met de nieuwe index blijft dit snel bij veel huishoudens.
- Er is geen gedeelde of globale toestand, en geen nieuwe tabel.

## 6. Privacy en beveiliging

| Principe | Hoe |
| --- | --- |
| Gate 9: privacy aan de serverkant | Verbergen gebeurt in RLS, niet in de app. Details blijven via de bestaande regels afgeschermd. |
| "Privacy volgt de situatie" | Na het archiveren ziet niemand de privé-afspraken; na het herstel alleen de eigenaar (en de anderen "Bezet"). |
| "Fouten moeten goedkoop zijn" | Archiveren wist niets; er is een herstelvenster van 30 dagen. |
| Principe 5 (groter gevolg, meer bevestiging) | Het onherroepelijke deel gebeurt pas na de termijn, of na een eigen keuze van de betrokkene. Een beheerder kan andermans privé-afspraken niet wissen. |
| Dataminimalisatie en opslagbeperking (AVG) | Een duidelijk doel (een vergissing herstellen), een vaste termijn en automatisch opruimen. De termijn hoort in de privacyverklaring. |
| Inzage (AVG) | De export uit B3 moet ook de privé-afspraken van een gearchiveerd profiel bevatten, zolang ze bestaan. |
| Back-ups | Een kopie in een back-up verdwijnt pas na de bewaartermijn van die back-up (B4 uit het rapport). Dat hoort in de privacyverklaring. |

**Inschatting, geen juridisch advies:** een korte, vaste termijn met een duidelijk doel en automatisch
opruimen past bij de AVG. Dat geldt meer dan bewaren zonder einde (nu) of direct verwijderen bij een
vergissing.

## 7. Tests (RLS-matrix, tegenproeven en integratie)

| Nieuw | Controleert | Tegenproef (moet dan falen) |
| --- | --- | --- |
| KG-T52 | Na archiveren ziet een ander lid de privé-afspraak niet meer in `events`, `event_overview`, `event_participants` en `event_exceptions`. De gedeelde afspraak van hetzelfde lid blijft zichtbaar en te wijzigen. | De oude policy `events_select` |
| KG-T53 | Herstel binnen de termijn: de eigenaar ziet zijn details weer en de ander ziet weer "Bezet". De rol is `member`. | `restore_member` zonder statuswijziging |
| KG-T54 | Herstel geweigerd voor een gewoon lid, voor een buitenstaander, voor een lid uit een ander huishouden, voor een actief lid, en bij een account dat al onder een ander profiel actief is. | `restore_member` zonder rolcontrole |
| KG-T55 | Opruimen: 31 dagen gearchiveerd betekent privé weg, inclusief details, deelnemers en uitzonderingen. Bij 29 dagen blijft alles. Gedeelde inhoud en het profiel blijven. Andere huishoudens blijven onaangeroerd. Een tweede keer opruimen verandert niets. | Opruimen zonder termijn |
| KG-T56 | Catalogus: één termijnfunctie (30 dagen); de opruimfunctie is niet uitvoerbaar voor `authenticated` en `anon`; op de echte Supabase bestaat de geplande taak. | Uitvoerrecht voor `authenticated` |
| Integratie | Realtime: na archiveren krijgt een ander lid geen inhoud, en de afspraak valt bij de volgende ophaalronde weg. Account verwijderen tijdens het archief wist de privé-afspraken direct (bestaand gedrag, opnieuw bewezen). | — |

Verder worden het aantal scenario's (51 naar 56) en het aantal tegenproeven bijgewerkt, net als
`docs/thuisplanner-inhoud.md`, `docs/thuisplanner-fundament.md`, de changelog en de roadmap.

**Omvang:** één migratie van ongeveer 120 regels, vijf scenario's met tegenproeven en één
integratietest. Er komt geen app-code bij.

## 8. Risico's

| Risico | Maatregel |
| --- | --- |
| De nieuwe RLS-voorwaarde verbergt per ongeluk ook gedeelde afspraken | KG-T52 controleert expliciet dat gedeelde afspraken blijven; de tegenproef gebruikt de oude policy |
| Herstel en opruimen tegelijk op dag 30 | Dezelfde vergrendeling per huishouden; een gelijktijdigheidstest naast de bestaande |
| `pg_cron` ontbreekt of staat uit op staging of productie | De smoketest uit B5 (architectuurrapport) controleert de geplande taak; zonder taak blijven de gegevens langer staan, maar gaat er niets verloren |
| De termijn verandert later | Eén functie; bestaande archieven volgen de nieuwe termijn vanaf het volgende opruimmoment. Dat moet in de privacyverklaring |
| Het gearchiveerde lid weet niet dat er een termijn loopt | Open punt tot er een e-maildienst is (B4) |

## 9. Uitgevoerd (15 oktober 2026, alleen lokaal)

**Gebouwd:**
- Migratie `thuisplanner/supabase/migrations/20261019120000_archief_bewaartermijn.sql`.
- Scenario's KG-T52 t/m KG-T56 in `rls_tests.sql`, met 8 tegenproeven.
- `restore_member` staat ook in de controle op het vergrendelingsprotocol (KG-T31).
- Een integratietest in `sync.test.mjs`.
- Er is geen app-code gewijzigd.

**Verschillen met de beschrijving hierboven:**

| Onderwerp | Beschrijving | Gebouwd | Waarom |
| --- | --- | --- | --- |
| Herstel na de termijn | Mag, maar de privé-afspraken zijn dan weg | Zo, en `restore_member` verwijdert ze dan eerst zelf, als de dagelijkse taak ze nog niet had opgeruimd | Anders zou "na 30 dagen weg" afhangen van het moment waarop de taak draait |
| Publieke functie `restore_member` | Een dunne wrapper | Een wrapper die fouten doorgeeft zonder DETAIL en HINT | Bestaande regel (KG-T46): fouten bevatten nooit rijgegevens |
| Gedeelde afspraak met een gearchiveerde deelnemer | Blijft, en is te wijzigen | Blijft en is te wijzigen. Een gearchiveerd lid kan alleen geen deelnemer meer zijn, dus wie de afspraak wijzigt, laat dat lid weg | Bestaande regel van `save_event` ("Deelnemers moeten actieve leden van dit huishouden zijn"). Het scherm moet het gearchiveerde lid bij het bewerken weglaten of grijs tonen |
| Tegenproeven | Vijf | Acht: de oude policy op afspraken, op deelnemers en op uitzonderingen; herstel zonder statuswijziging; herstel zonder rolcontrole; opruimen zonder termijn; opruimen via de API; herstel na de termijn zonder opruimen | Elk onderdeel apart bewezen |

### Hoe en wanneer definitief verwijderd wordt

| Situatie | Wanneer | Welke actie | Wie |
| --- | --- | --- | --- |
| Gearchiveerd lid, termijn verlopen | Elke nacht om **03:17** (servertijd, UTC) wordt opgeruimd wat ouder is dan 30 dagen. In de praktijk dus tussen 30 dagen en 30 dagen plus een etmaal na het archiveren | De `pg_cron`-taak `thuisplanner-archief-opruimen` roept `private.purge_archived_private()` aan | Niemand hoeft iets te doen; het gebeurt automatisch in de database |
| Herstel na de termijn, voordat de taak heeft gedraaid | Direct bij het herstel | `restore_member` roept `private.purge_member_private` aan, en zet daarna pas het lid terug | Eigenaar of beheerder (het herstel); het verwijderen gebeurt automatisch |
| De betrokkene verwijdert het eigen account | Direct | Account verwijderen (Auth). De bestaande trigger `members_unlink_private` verwijdert de privé-afspraken | De betrokkene |
| De betrokkene verlaat het huishouden | Direct | `leave_household` (zelfde trigger) | De betrokkene. Een gearchiveerd lid kan het huishouden niet meer openen; dit geldt dus vóór het archiveren |
| Het huishouden wordt verwijderd | Direct | `delete_household` | Een eigenaar |
| Een beheerder wil eerder verwijderen | **Kan niet.** | Bewust niet gebouwd; hoort bij de AVG-functies (B3), met een extra bevestiging | — |

**Voorwaarde voor staging en productie:** `pg_cron` moet in het Supabase-project aan staan. De migratie
maakt de extensie en de taak alleen aan als `pg_cron` beschikbaar is.
- Lokaal is dat gecontroleerd: `pg_cron` 1.6.4, met de taak `17 3 * * *`.
- Op staging moet de smoketest controleren dat `cron.job` de taak bevat. Zonder taak gaat er niets
  verloren, maar blijven de gegevens langer staan dan beloofd.
- Of `supabase db push` de extensie mag aanmaken onder de rol van de CLI, is nog een **aanname**; dat
  wordt pas bij staging zichtbaar.

### Testresultaten (lokale stack, alleen 127.0.0.1)

| Test | Uitkomst |
| --- | --- |
| RLS-matrix | 56 van 56 |
| Tegenproeven | 66 van 66; elke K3-tegenproef gevangen door het bedoelde scenario (KG-T52 drie keer, KG-T53, KG-T54, KG-T55, KG-T56 twee keer) |
| Integratie | De K3-test slaagt, in de volledige run en daarna drie keer los |
| Rest van de integratie | Zie de rapportage in de changelog |

**Niet lokaal gedraaid:** de nabootsing op een kale PostgreSQL 16 (de eerste CI-job). Daar ontbreekt
`pg_cron`, en de migratie slaat de planning dan over. Dat is pas in CI te zien.
