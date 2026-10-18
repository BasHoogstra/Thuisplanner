# Thuisplanner KG-5C: inhoudsschema (bouwplan stap 2)

**Status:** gebouwd en lokaal getest op een eigen branch, als aparte PR boven op PR #19. Niet gemerged, niet gedeployd.

De nieuwe app heet voortaan **Thuisplanner**. De technische map `thuisplanner/` en de oude documentnamen blijven voorlopig staan.

- **Wat het is:** afspraken, taken en boodschappen in de database, met de privacyregels van gate 9.
- **Migraties:** `thuisplanner/supabase/migrations/20261012120000_kg5c_inhoud.sql`, en `20261013120000_kg5c_herstel1.sql` (herstelronde 1, sectie 9) en `20261014120000_kg5c_herstel2.sql` (herstelronde 2, sectie 10).
- **Plan:** `docs/thuisplanner-bouwplan.md`, stap 2. Het fundament (stap 1) staat in `docs/thuisplanner-fundament.md`.

## 1. Productkompas-toets

| Vraag | Antwoord |
| --- | --- |
| Welke stap? | Bouwplan stap 2 (KG-5C): zes inhoudstabellen, de view voor afspraken, de functies voor herhaling en boodschappen, en de RLS. Niets uit stap 3 en later: geen realtime-berichten, geen app-koppeling, geen nieuwe schermen. |
| Gates | **Gate 9 (beslissing 9):** privacy wordt in de database afgedwongen, niet in het scherm. Dat geldt per domein; hier voor afspraken, taken en boodschappen. Andere gates zijn niet geraakt: geen import en geen Huisplan-data. |
| Productbeslissingen (10 oktober 2026) | 1. Gedeelde afspraken, taken en boodschappen mag ieder actief lid wijzigen. 2. Een privé-afspraak van een ander verschijnt alleen als "Bezet". 3. Taken en boodschappen zijn alleen gedeeld. |
| Principes | "Privacy volgt de situatie" (gedeeld waar logisch, privé waar nodig). "Fouten moeten goedkoop zijn": verwijderen is markeren, en versies voorkomen dat een wijziging stilletjes verloren gaat. |
| Botsingen | Geen. De interpretatie van "Bezet" (hieronder) volgt het goedgekeurde advies en het prototype van PR #20. |

## 2. Wat "Bezet" precies betekent

Bij een privé-afspraak van een ander lid ziet de rest van het huishouden:

- **wel:** wanneer (datum en tijden), van wie (de eigenaar), voor wie (de deelnemers) en of de afspraak herhaalt;
- **nooit:** titel, plek, notities en voorbereiding, ook niet via een filter, een view, een functie of realtime.

Dit volgt het advies uit KG-5A ("het hele huishouden ziet tijd en voor wie") en het prototype (`zichtbaarVoor` in PR #20). Moet ook "voor wie" verborgen worden, dan is dat een kleine aanpassing in de view en de RLS van `event_participants`.

## 3. Model

| Tabel | Inhoud | Lezen | Schrijven |
| --- | --- | --- | --- |
| `households` (+ `timezone`) | Tijdzone, standaard `Europe/Amsterdam` (gecontroleerd tegen de tijdzonelijst) | lid | nog niet (later) |
| `events` | Wanneer, van wie, privé of gedeeld, herhaling, losgemaakt voorkomen (`series_id`, `original_date`), `version`, `deleted_at` | ieder lid (ook privé: "Bezet") | alleen via functies |
| `event_details` | Titel, plek, notities, voorbereiding | alleen bij een gedeelde afspraak, of als jij de eigenaar bent | alleen via functies |
| `event_participants` | Voor wie (leeg = hele huishouden) | ieder lid | alleen via functies |
| `event_exceptions` | Verwijderde of losgemaakte reeksdatums | ieder lid | alleen via functies |
| `tasks` | Titel, datum (leeg = ooit), voor wie, afgerond op/door, `version`, `deleted_at` | ieder lid | ieder lid, via de API |
| `shopping_items` | Naam, `name_key` (zonder hoofdletters en extra spaties), afgevinkt, `version`, `deleted_at` | ieder lid | ieder lid, via de API of `add_shopping_items` |
| view `event_overview` | Afspraak + details + deelnemers; `is_busy` en lege tekstvelden bij andermans privé | ieder lid (RLS van de lezer: `security_invoker`) | — |

- **Huishoudgrens:** elke verwijzing is samengesteld met `household_id`: eigenaar, deelnemer, toegewezen lid, reeks, details en uitzonderingen. Een verwijzing naar een ander huishouden kan de database niet opslaan, ook niet als `postgres`.
- **Tijd:** lokale datum en tijd plus de tijdzone van het huishouden, geen UTC-moment.
- **Geen dubbelingen in de database zelf:**
  - één losgemaakt voorkomen per (`series_id`, `original_date`);
  - één uitzondering per reeksdatum;
  - een losgemaakt voorkomen herhaalt niet;
  - één open boodschap per naam.
- **Vaste kolommen** (`id`, `household_id`, `owner_member_id`, `series_id`, `original_date`, `created_at`) veranderen nooit. Triggers bewaken dat, ook voor `postgres`. Elke wijziging verhoogt `version`.

## 4. Functies

Alle functies zijn `security definer` in `private`, met een dunne `security invoker`-functie in `public`.

| Functie | Wat |
| --- | --- |
| `save_event(...)` | Maakt een afspraak (`p_version` leeg) of werkt hem bij (`p_version` = bekende versie). Afspraak, details en deelnemers in één transactie. **Verouderde versie →** `PT409` (HTTP 409). **Andermans privé-afspraak →** "niet gevonden", dezelfde fout als bij een onbekend id. **Privé of gedeeld kiest alleen de eigenaar.** Een losgemaakt voorkomen herhaalt niet en gaat niet naar een dag waarop de reeks al staat. |
| `edit_occurrence(...)` | "Alleen deze wijzigen": een uitzondering plus een losgemaakte afspraak, met dezelfde eigenaar en zichtbaarheid als de reeks. Geweigerd: een datum buiten de reeks, een voorkomen dat al is aangepast, of een dag waarop de reeks of een ander losgemaakt voorkomen al staat. |
| `delete_occurrence(series, datum)` | "Alleen deze verwijderen": een uitzondering. |
| `delete_event(id, versie)` | Markeert als verwijderd. Bij een reeks: de hele reeks, inclusief losgemaakte voorkomens. |
| `add_shopping_items(huishouden, ids[], namen[])` | Zonder dubbelingen, met dezelfde regels als het prototype: **nieuw**, **al_op_lijst**, **terug** (was afgevinkt). Een herhaalde opdracht met dezelfde ids slaat niets dubbel op. |

De herhalingsregels van `private.occurs_on` zijn gelijk aan `herhaling.ts` in de app:

- maandelijks op de 31e slaat maanden zonder 31e over;
- jaarlijks op 29 februari komt alleen in schrikkeljaren voor;
- `recurrence_until` telt mee (inclusief).

**Taken en boodschappen via de API:**

- **Rechten:** kolomrechten plus RLS. Er is geen `delete`-recht: verwijderen is `deleted_at` zetten.
- **Versie:** de app wijzigt met `... where id = x and version = v`. Is het aantal geraakte rijen 0, dan is er een conflict.
- **Trigger:** de guard-trigger zet de versie en de tijden zelf en controleert het lidmaatschap opnieuw.

## 5. Vergrendeling (protocol uit herstelronde 1, uitgebreid)

- **Inhoudswijzigingen:** functies én de API-trigger vergrendelen het huishouden **gedeeld**
  (`private.lock_household_shared`, `FOR SHARE`). Daarna controleren ze het lidmaatschap opnieuw.
  - Wijzigingen van lidmaatschap of rollen vergrendelen exclusief, dus een inhoudswijziging kan niet langs een lopende intrekking heen.
  - Inhoudswijzigingen onderling blokkeren elkaar niet.
- **Afspraken:** daarna de rij van de afspraak of reeks (`FOR UPDATE`, via `private.lock_event`). De controles op versie, privé en eigenaar gebeuren op die vergrendelde, actuele rij.
- **Account verwijderen:** dat vergrendelt de huishoudens zoals in stap 1.

## 6. Verwijderen en AVG

- **Account verwijderen of vertrekken:** de privé-afspraken van dat account in dat huishouden verdwijnen echt (met details, deelnemers en voorkomens). Gedeelde afspraken, taken en boodschappen blijven bij het huishouden; het lid blijft bestaan zonder account. Zie sectie 9.
- **Archiveren (K3, 15 oktober 2026; `docs/thuisplanner-k3-archiveren.md`):** archiveren wist niets.
  - De privé-afspraken van het gearchiveerde lid zijn voor niemand zichtbaar, ook niet als "Bezet". Dat
    geldt ook voor hun deelnemers en uitzonderingen.
  - Gedeelde afspraken blijven zichtbaar en te wijzigen. Een gearchiveerd lid kan wel geen deelnemer meer
    worden; wie zo'n afspraak wijzigt, laat dat lid weg.
  - Binnen **30 dagen** haalt een eigenaar of beheerder het lid terug (`restore_member`), en dan zijn de
    privé-afspraken direct weer van de betrokkene.
  - Na 30 dagen verwijdert `private.purge_archived_private()` ze definitief. Dat gebeurt dagelijks om 03:17 UTC
    via `pg_cron` (taak `thuisplanner-archief-opruimen`), en ook direct bij een herstel na de termijn.
  - De termijn staat op één plek: `private.archive_retention()`.
- **Huishouden verwijderen:** neemt alle inhoud mee.
- **Gemarkeerd als verwijderd** (`deleted_at`) blijft voorlopig in de database. Echt opruimen volgt later met een serverjob (bouwplan).

## 7. Tests

| Test | Wat |
| --- | --- |
| KG-T32 | Gedeelde afspraak: ieder lid ziet alles, ook details en deelnemers |
| KG-T33 | Privé = "Bezet": wanneer, van wie en voor wie wel; titel, plek, notities en voorbereiding nergens. Generieke controle: in geen enkele tabel of view die een ander lid kan lezen, staat een privé-tekst. Wijzigen en verwijderen geven "niet gevonden"; alleen de eigenaar kiest privé |
| KG-T34 | Ieder lid wijzigt gedeelde afspraken; versie loopt op; verouderde versie → PT409; dubbele aanmaak geweigerd |
| KG-T35 | Huishoudgrens: niets zien, schrijven of verwijzen over de grens (ook als `postgres`) |
| KG-T36 | Herhaling: regels gelijk aan de app; geen dubbele uitzondering of losgemaakt voorkomen; niet naar een reeksdag; atomair; hele reeks verwijderen |
| KG-T37 | Taken: maken, afvinken, versie, markeren als verwijderd; geen echte delete, geen eigen versie, geen vaste kolommen |
| KG-T38 | Boodschappen: geen dubbelingen, afgevinkt komt terug, herhaalde opdracht, directe dubbeling geweigerd |
| KG-T39 | Een gearchiveerd lid ziet en schrijft geen inhoud meer |
| KG-T40 | Catalogus: geen delete-recht, afspraken alleen via functies, view met `security_invoker`, protocol in elke inhoudsfunctie |
| KG-T41 | AVG: privé-afspraken van een verwijderd account weg, gedeelde inhoud blijft; huishouden verwijderen neemt alles mee |
| KG-T42–T44 | Herstelronde 1: privé hoort bij het account; reeksverwijdering laat andermans privé-voorkomens staan; één actief voorkomen per reeksdag (sectie 9) |
| KG-T45–T46 | Herstelronde 2: foutmeldingen zonder DETAIL/HINT (geen account-ID's); elke publieke functie volgt die regel (sectie 10) |

**Tegenproeven:** 13 nieuwe sabotages in KG-5C (totaal toen 39; nu 43, zie sectie 9). Elk wordt door het bedoelde scenario gevangen, onder meer:

- een open detailbeleid;
- een view zonder `security_invoker`;
- een lekkende extra view;
- versie zonder trigger;
- deelnemer zonder samengestelde FK;
- dubbele losgemaakte voorkomens;
- foute herhalingsregel;
- delete-recht;
- dubbele boodschappen;
- schrijven door een gearchiveerd lid;
- AVG zonder het verwijderen van privé-afspraken.

**Gelijktijdigheid** (`tests/integratie/gelijktijdig.test.mjs`, aparte verbindingen, eindtoestand ná COMMIT):

- archiveren tijdens een taakwijziging: met tegenproef (zonder gedeelde vergrendeling glipt de wijziging erdoor);
- privé maken terwijl een lid een voorkomen aanpast;
- twee leden met dezelfde versie: één wint, de ander krijgt PT409;
- twee keer hetzelfde voorkomen losmaken: er komt er één;
- dezelfde boodschap tegelijk: één op de lijst.

**API en Realtime** (`tests/integratie/integratie.test.mjs`, supabase-js):

- Via PostgREST ziet een ander lid alleen "Bezet". Filters (`ilike`, `or`) en directe detailqueries geven niets terug. Wijzigen geeft "niet gevonden", een verouderde versie HTTP 409. De buitenstaander en `anon` zien niets.
- Realtime, met `event_details` tijdelijk in een publicatie: de eigenaar krijgt haar privédetails, een ander lid nooit. Tegenproef: dat lid krijgt de gedeelde details wél, met een aantoonbaar live abonnement.
- In gewone werking staat geen enkele tabel in een publicatie (KG-T27). Seintjes volgen in stap 3.

## 8. Bekende grenzen en open punten

- **"Voor wie" is zichtbaar bij andermans privé-afspraak.** Dat volgt het goedgekeurde advies; wil je het strenger, dan is dat een productkeuze.
- **Losgemaakte voorkomens houden hun eigen zichtbaarheid.** Maakt de eigenaar later de reeks gedeeld (of privé), dan veranderen eerder losgemaakte voorkomens niet mee. Een gedeelde reeks verwijderen laat andermans privé-voorkomens staan (sectie 9).
- **Archiveren:** opgelost in K3. Er geldt een bewaartermijn van 30 dagen, met herstel en daarna definitief opruimen (zie sectie 6).
- **Een gedeelde afspraak hoort bij het profiel.** Wordt een ander account aan dat profiel gekoppeld, dan mag dat account de gedeelde afspraak wijzigen en privé maken, net als ieder lid. De privé-inhoud hoort dan bij het nieuwe account.
- **Gedeelde voorkomens van een privé-reeks gaan mee.** Wordt een privé-reeks echt verwijderd (accountverwijdering of vertrek van de eigenaar), dan gaan ook gedeelde losgemaakte voorkomens van die reeks mee, via de reeksverwijzing. Dat kan alleen als de reeks eerst gedeeld was, toen werd aangepast, en daarna weer privé werd gemaakt.
- **Optimistische versiecontrole bij taken en boodschappen** werkt alleen als de app met `version` filtert (stap 6).
- **Deadlock mogelijk.** Een directe API-wijziging kan tegelijk met een ledenwijziging in een deadlock komen. PostgreSQL breekt er dan één af (fail closed). Binnen afspraken is de volgorde altijd eerst de reeks, dan het voorkomen.
- **Nog niet gebouwd:**
  - het wijzigen van de tijdzone;
  - "deze en alle volgende";
  - realtime-seintjes (stap 3).

## 9. Herstelronde 1 (review van `700c3d9`)

Migratie `20261013120000_kg5c_herstel1.sql`. Elke bevinding is eerst met een test gereproduceerd op `700c3d9` en daarna opgelost.

| # | Bevinding | Oplossing | Test (faalt op `700c3d9`, slaagt nu) |
| --- | --- | --- | --- |
| 1 (hoog) | Na vertrek kon een ander account aan hetzelfde lidprofiel worden gekoppeld en las dan de oude privé-afspraken (eigenaar = profiel) | **a.** Privé-inhoud hoort bij het account: `events.owner_user_id`, niet leesbaar via de API. Details van een privé-afspraak zijn alleen leesbaar voor dát account via zijn actieve profiel (`private.event_details_visible`, ook gebruikt door realtime). Wijzigen, verwijderen en losmaken controleren hetzelfde. **b.** Komt een account los van een profiel (vertrek, accountverwijdering, elke route), dan verwijdert een trigger de privé-afspraken van dat profiel echt. | KG-T42: herkoppeling na vertrek; plus een privé-afspraak die nog aan het profiel hangt maar van het vorige account is: het nieuwe account ziet alleen "Bezet" en kan hem niet wijzigen of verwijderen; archiveren en daarna accountverwijdering |
| 2 (middel) | Een gedeelde reeks verwijderen nam ook losgemaakte privé-voorkomens van een ander mee | `delete_event` markeert alleen voorkomens die de verwijderaar zelf mag wijzigen (gedeeld, of eigen privé). Andermans privé-voorkomens blijven staan, met hun eigen zichtbaarheid. | KG-T43 |
| 3 (middel) | Twee losgemaakte voorkomens konden tegelijk naar dezelfde dag | Vaste vergrendelvolgorde: `save_event` vergrendelt bij een losgemaakt voorkomen eerst de reeks, dan het voorkomen (zoals `edit_occurrence` en `delete_event`). Daarnaast een unieke index (`series_id`, `start_date`) voor actieve voorkomens. | `gelijktijdig.test.mjs` (twee verplaatsingen tegelijk; op `700c3d9` "fout niet geblokkeerd") en KG-T44 (index) |

**Geen nieuwe deadlock.** Een gelijktijdigheidstest verplaatst een voorkomen terwijl een ander de reeks verwijdert. De tweede transactie wacht op de reeks en gaat daarna verder, zonder deadlock (`40P01`).

**Tegenproeven:** vier nieuwe (totaal 43):

- trigger weg;
- detailcontrole op profiel in plaats van account;
- reeksverwijdering die alle voorkomens meeneemt;
- index weg.

**De vijf reparaties uit PR #19** (P1–P5, KG-T28–T31) blijven groen in dezelfde runs.

## 10. Herstelronde 2 (herreview van `427542d`)

Migratie `20261014120000_kg5c_herstel2.sql`.

| # | Bevinding | Oplossing | Regressietest |
| --- | --- | --- | --- |
| 1 (middel) | Een verwijderde reeks blokkeerde nog datums. Daardoor kon een achtergebleven privé-voorkomen niet vrij worden verplaatst. | `private.occurrence_taken` telt het reekspatroon alleen mee als de reeks niet verwijderd is. Botsingen met andere actieve voorkomens van dezelfde reeks blijven geweigerd (functie en unieke index). | KG-T43, uitgebreid met het scenario uit de review: reeks vanaf 7 november 2026, privé-voorkomen naar 15 november, de gedeelde reeks wordt door een ander lid verwijderd, en de eigenaar verplaatst het voorkomen naar 28 november. Daarna controleert de test: de eigenaar leest, wijzigt, verplaatst en verwijdert het voorkomen; het andere lid ziet alleen "Bezet" en kan het niet wijzigen of verwijderen. |
| 2 (middel) | Account-ID's via foutdetails. Binnen een functie met eigenaarsrechten (`security definer`) zet PostgreSQL bij een constraintschending de hele rij in DETAIL ("Failing row contains …"), ook kolommen die de aanroeper niet mag lezen. PostgREST stuurt `details` en `hint` mee. | Elke publieke functie (de enige weg naar `private`) is een dunne plpgsql-functie die fouten doorgeeft met dezelfde SQLSTATE en melding, zonder DETAIL en HINT. Meldingen zelf bevatten nooit rijgegevens; eigen meldingen noemen geen account-ID's. | KG-T45 (vier foutpaden: geen DETAIL/HINT, foutcode blijft), KG-T46 (catalogus: elke publieke functie volgt de regel en is `security invoker`), integratietest via PostgREST (de foutrespons bevat geen enkel account-ID uit `auth.users`) |

**Onderzoek bevinding 2 op de echte lokale stack** (PostgREST, `427542d`), per foutpad met de volledige API-respons:

| Foutpad | Vóór herstel | Na herstel |
| --- | --- | --- |
| `save_event` (ander lid, einddatum vóór start) | `details` met de hele rij, **inclusief het account-ID van de eigenaar** | `details: null` |
| `edit_occurrence` (einddatum vóór start) | idem, **lek** | `details: null` |
| `save_event` (herhaling eindigt vóór start) | idem, **lek** | `details: null` |
| `save_event` (plek te lang) | rij van `event_details` (geen account-ID, wel onnodige data) | `details: null` |
| Huishoudnaam, ledennaam of -kleur, taak via de API (direct) | `details: null`: PostgreSQL toont alleen kolommen waarop de aanroeper leesrecht heeft | ongewijzigd |
| Eigen meldingen (`raise`) in functies | geen DETAIL | ongewijzigd |

Waarom dit nu dicht is:

- **Directe API-schrijfacties** lopen als `authenticated`. Kolommen met account-ID's zijn voor die rol niet leesbaar (KG-T29), dus PostgreSQL laat ze uit DETAIL weg.
- **Functies met eigenaarsrechten** zijn alleen via de publieke functies bereikbaar, want schema `private` is niet via de API ontsloten. Die publieke functies halen DETAIL en HINT altijd weg.
- **Eigen meldingen** in de functies noemen nooit account-ID's.

**Vóór en na herstel:**

| Wat | Op `427542d` (oude migraties, verse lokale stack) | Op de herstelde code |
| --- | --- | --- |
| **Complete nieuwe matrix** op de oude code | Faalt bij het eerste nieuwe scenario: KG-T43 ("achtergebleven privé-voorkomen niet te verplaatsen na reeksverwijdering"). Omdat de matrix bij de eerste fout stopt, zijn KG-T45 en KG-T46 daarna los gedraaid: KG-T45 "fout bevat DETAIL/HINT: Failing row contains (…)" en KG-T46 "public.create_household geeft fouten door met DETAIL/HINT". | 46 van 46 |
| **Complete nieuwe integratiesuite** op de oude code | 21 van 22: alleen de nieuwe foutresponstest faalt ("details/hint in de foutrespons: Failing row contains …") | 22 van 22 |
| **Gerichte tegenproeven** (sabotage op de nieuwe code, in `tegenproeven.txt`) | — | De oude `occurrence_taken` wordt gevangen door KG-T43, `save_event` zonder foutfilter door KG-T45, en een publieke functie in SQL door KG-T46. Totaal 46 van 46. |

