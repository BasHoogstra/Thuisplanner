# Thuisplanner KG-5C: inhoudsschema (bouwplan stap 2)

**Status:** gebouwd en lokaal getest op een eigen branch, als aparte PR boven op PR #19. Niet gemerged, niet gedeployd.

De nieuwe app heet voortaan **Thuisplanner**. De technische map `komtgoed/` en de oude documentnamen blijven voorlopig staan.

- **Wat het is:** afspraken, taken en boodschappen in de database, met de privacyregels van gate 9.
- **Migratie:** `komtgoed/supabase/migrations/20261012120000_kg5c_inhoud.sql`.
- **Plan:** `docs/komtgoed-bouwplan.md`, stap 2. Het fundament (stap 1) staat in `docs/komtgoed-fundament.md`.

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

- **Account verwijderen:** de privé-afspraken van dat account verdwijnen echt (met details, deelnemers en voorkomens). Gedeelde afspraken, taken en boodschappen blijven bij het huishouden; het lid blijft bestaan zonder account.
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

**Tegenproeven:** 13 nieuwe sabotages (totaal 39). Elk wordt door het bedoelde scenario gevangen, onder meer:

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
- **Losgemaakte voorkomens houden hun eigen zichtbaarheid.** Maakt de eigenaar later de reeks gedeeld (of privé), dan veranderen eerder losgemaakte voorkomens niet mee.
- **Privé-afspraken na vertrek of archiveren.** Vertrekt een lid of wordt het gearchiveerd, dan blijven zijn privé-afspraken onleesbaar in het huishouden staan; alleen accountverwijdering ruimt ze op. Opruimen bij vertrek is een productvraag.
- **Optimistische versiecontrole bij taken en boodschappen** werkt alleen als de app met `version` filtert (stap 6).
- **Deadlock mogelijk.** Een directe API-wijziging kan tegelijk met een ledenwijziging in een deadlock komen. PostgreSQL breekt er dan één af (fail closed).
- **Nog niet gebouwd:**
  - het wijzigen van de tijdzone;
  - "deze en alle volgende";
  - realtime-seintjes (stap 3).
