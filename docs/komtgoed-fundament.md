# KomtGoed KG-1: databasefundament

**Status:** gebouwd en lokaal getest, in een eigen PR; niet gemerged, niet gedeployd.

- **Wat het is:** accounts/profielen, huishoudens, leden, uitnodigingen, rollen en toegangsrechten
  voor de nieuwe app (werknaam KomtGoed).
- **Waar:** `komtgoed/supabase/migrations/20261009120000_kg1_fundament.sql`.
- **Tests:** `komtgoed/supabase/tests/`.
- **Context:** de ontwikkelrichting staat in `docs/roadmap.md` (sectie "Ontwikkelrichting KomtGoed").

## 1. Productkompas-toets (roadmap, werkwijze)

1. **Principes:**
   - 7: het huishouden staat centraal, niet het account. Account en lid zijn gescheiden; een kind
     zonder account is een volwaardig lid.
   - "Privacy volgt de situatie": de server dwingt de toegang af.
   - 10: abonnement per huishouden; nog niet in KG-1.
   - "Fouten moeten goedkoop zijn": archiveren in plaats van verwijderen, en een eigenaar kan het
     huishouden niet per ongeluk wees maken.
2. **Neemt dit werk weg?** Indirect. Het is de voorwaarde voor gedeeld plannen zonder
   deellink-wachtwoord, met intrekbare toegang.
3. **Organiseren, onthouden of uitvoeren?** Ja: wie hoort bij het huishouden en wie mag wat.
4. **Eenvoudiger?** Drie rollen, twee soorten leden, twee statussen. Bewust geen kindaccounts,
   gasten of verwijderen in KG-1.
5. **Aandacht, controle en privacy?** Alles via de server (RLS en functies); de uitnodigingstoken
   wordt alleen als hash bewaard.
6. **Bewijs?** Nog geen gebruik. Het fundament is technisch bewezen met 22 scenario's en 14
   tegenproeven.
7. **Ultieme toets:** ja, als fundament voor de MVP.

**Gates:**
- Gate 9 (privacy) is in KG-1 voorbereid met het zichtbaarheidsprimitief `private.can_read`.
  Ze moet zijn gehaald vóór de eerste inhoudstabel; zie de roadmap.
- De gates voor de import van bestaande planners (besluiten 4, 6, 7, 8) zijn hier niet van toepassing:
  KG-1 importeert niets.

## 2. Model

| Tabel | Kern |
| --- | --- |
| `profiles` | Eén rij per account (`auth.users`): weergavenaam. Alleen het eigen profiel is zichtbaar en wijzigbaar. |
| `households` | Naam, `created_by` (nullable; blokkeert het verwijderen van een account niet). |
| `household_members` | Het lid (persoon) met een eigen `id`. `user_id` is optioneel (account); `kind` adult/child; `role` owner/admin/member; `status` active/archived; kleur, volgorde, `legacy_ids`. Uniek `(household_id, id)` als doel voor samengestelde verwijzingen. |
| `household_invites` | Uitnodiging, optioneel voor een bestaand lid (`member_id`, samengestelde FK binnen hetzelfde huishouden). De rol is admin of member. Alleen `token_hash` (SHA-256) wordt opgeslagen. Geldig 1–30 dagen; intrekbaar; precies één keer bruikbaar. |
| type `visibility` | `household`, `members`, `private`: voor latere inhoudstabellen. |

**Invarianten** (database-checks of triggers):

- Eigenaar en beheerder zijn altijd een actieve volwassene met account.
- Een kind heeft (in KG-1) geen account.
- Een account is per huishouden aan hoogstens één actief lid gekoppeld; over huishoudens heen kan
  hetzelfde account lid zijn van meerdere huishoudens.
- Een bestaand huishouden houdt altijd minstens één actieve eigenaar met account. Dat wordt
  uitgesteld gecontroleerd, zodat overdragen in één transactie kan. Ook het verwijderen van het
  account van de laatste eigenaar wordt geweigerd.
- Identiteit (`id`, `household_id`), koppeling (`user_id`, `linked_at`), rol en status zijn via de
  API niet direct te wijzigen: niet via de kolomrechten, en daarnaast niet via de trigger
  `guard_member`.

## 3. Rechten

- **Toegang komt alleen van een account dat aan een actief lid gekoppeld is.** De hulpfuncties
  `private.is_active_member`, `my_member_id` en `has_role` tellen alleen actieve leden. Archiveren
  trekt de toegang dus direct in.
- **RLS op elke tabel; `anon` heeft nergens rechten.** `authenticated` heeft geen insert of delete op
  de kerntabellen; alleen een beperkt aantal kolommen is direct bij te werken:
  - de huishoudnaam: eigenaar of beheerder;
  - weergavegegevens van leden: beheer voor alle leden, een gewoon lid alleen de eigen naam en kleur;
  - het eigen profiel.
- **Alle andere schrijfacties lopen via functies.** De logica staat als `security definer` met een
  leeg `search_path` in `private`; de dunne `security invoker`-functies in `public` roept de app aan.

| Functie | Wie | Effect |
| --- | --- | --- |
| `create_household(naam, eigen_naam)` | elk account | huishouden + jij als eigenaar |
| `add_member(huishouden, naam, soort)` | eigenaar/beheerder | lid zonder account (volwassene of kind) |
| `create_invite(huishouden, lid?, rol, dagen)` | eigenaar/beheerder (als beheerder uitnodigen: alleen eigenaar) | geeft de token één keer terug |
| `revoke_invite(uitnodiging)` | eigenaar/beheerder | intrekken |
| `accept_invite(token, eigen_naam?)` | elk account | koppelt aan het bestaande lid, of maakt een nieuw lid |
| `set_member_role(huishouden, lid, rol)` | eigenaar | admin ↔ member |
| `archive_member(huishouden, lid)` | eigenaar/beheerder (een beheerder archiveren: alleen eigenaar) | toegang direct weg; open uitnodigingen voor dat lid vervallen |
| `transfer_ownership(huishouden, lid)` | eigenaar | ander wordt eigenaar, jij beheerder |
| `leave_household(huishouden)` | elk lid | je account wordt ontkoppeld; het lid blijft bestaan; de laatste eigenaar kan niet weg |

**Zichtbaarheid van inhoud:** `private.can_read(huishouden, zichtbaarheid, eigenaar_lid, publiek[])`.
- Faalt dicht: geen actief lid, of een onbekende zichtbaarheid, geeft "nee".
- `household`: elk actief lid.
- `members`: de eigenaar en de genoemde leden.
- `private`: alleen de eigenaar.

KG-1 heeft nog geen inhoudstabellen; de functie is bewezen op een testtabel die alleen binnen de
testtransactie bestaat (KG-T16).

## 4. Bewuste keuzes in KG-1 (graag expliciet reviewen)

1. **Rollen owner/admin/member.** Er zijn meerdere eigenaren mogelijk. Eigenaar worden gaat alleen via
   overdracht, niet via een uitnodiging of rolwijziging.
2. **Een kind kan in KG-1 geen account krijgen.** Kindaccounts vragen eigen, beperkte rechten. Dat is
   een latere stap; principe 7 ("later een account dat aan het bestaande lid wordt gekoppeld") blijft
   mogelijk.
3. **Verlaten ontkoppelt het account; het lid blijft bestaan.** Archiveren is een aparte keuze van de
   beheerders. Zo verdwijnt een persoon niet stil uit de geschiedenis van het huishouden.
4. **Niets verwijderen via de API.** Leden worden gearchiveerd. Het verwijderen van een huishouden
   (met de AVG-gevolgen) is een latere, aparte stap.
5. **De uitnodigingstoken staat alleen als hash in de database** en is via de API ook als hash niet
   leesbaar (kolomrechten).
6. **Het zichtbaarheidsprimitief is een functie met parameters**, nog zonder publiektabel. Het
   ontwerp van publiek en "bezet zonder details" volgt bij de eerste inhoudstabel; gate 9 geldt daar.
7. **Patronen zijn hergebruikt** uit `supabase/migrations` (Huisplan 1.1/1.2): `private`-hulpfuncties,
   dunne `public`-functies, anon zonder rechten, `guard_member`, de uitgestelde eigenaarscontrole.
   Die bestanden zijn niet gewijzigd.
8. **Contract `docs/identiteit-en-items.md` 5.2** voor zover van toepassing:
   - `status` actief/gearchiveerd en `legacy_ids` staan erin;
   - hulpfuncties tellen alleen actieve leden;
   - `households.created_by` blokkeert het verwijderen van een account niet;
   - verwijzingen blijven binnen het huishouden via samengestelde FK's.

## 5. Testmatrix

| Scenario | Wat |
| --- | --- |
| KG-T01 | Huishouden aanmaken: eigenaar met account |
| KG-T02 | Ongeldige invoer geweigerd |
| KG-T03 | Leden zonder account, ook een kind |
| KG-T04 | Uitnodiging: token één keer, alleen de hash opgeslagen, hash niet leesbaar |
| KG-T05 | Buitenstaander ziet en wijzigt niets |
| KG-T06 | Directe schrijfacties buiten de functies om onmogelijk, ook voor de eigenaar |
| KG-T07 | Accepteren koppelt aan het bestaande lid, met rol beheerder |
| KG-T08 | Eén keer bruikbaar; onbekende of misvormde token werkt niet |
| KG-T09 | Verlopen en ingetrokken uitnodiging; intrekken alleen door beheer |
| KG-T10 | Grenzen bij uitnodigen (kind, eigenaar, gekoppeld lid, geldigheid, beheerder-als-beheerder) |
| KG-T11 | Nieuw lid via een algemene uitnodiging; alleen gewone rechten |
| KG-T12 | Eén account in twee huishoudens; rechten per huishouden |
| KG-T13 | Huishoudens zien elkaars gegevens niet; geen verwijzingen over de grens (ook niet als postgres) |
| KG-T14 | Rollen: alleen de eigenaar; beheer vraagt een volwassene met account |
| KG-T15 | Archiveren trekt toegang direct in; grenzen aan archiveren |
| KG-T16 | Zichtbaarheid `household` / `members` / `private` per persoon, ook gearchiveerd en over huishoudens |
| KG-T17 | Eigendom: laatste eigenaar blijft; overdragen; vertrekken; ook buiten de functies om |
| KG-T18 | Profielen: alleen je eigen |
| KG-T19 | Zonder sessie werkt niets |
| KG-T20 | anon heeft op niets rechten |
| KG-T21 | Catalogus: RLS overal, geen definer in `public`, vast `search_path`, geen anon- of insert-rechten |
| KG-T22 | Een kind krijgt geen account, ook niet buiten de functies om |

**Tegenproeven** (`tegenproeven.txt`): 14 sabotages. Elke sabotage moet het genoemde scenario laten
falen. Voorbeelden:
- RLS openzetten;
- de tokenhash leesbaar maken;
- de samengestelde FK weghalen;
- de status negeren in `is_active_member`;
- de huishoudcheck weghalen uit `has_role`;
- `can_read` laten negeren wat privé is;
- de eigenaarscontrole weghalen.

## 6. Niet in KG-1 (bewust)

- **Geen app en geen deploy:** geen app-schermen, geen deploy, geen koppeling met een Supabase-project.
- **Geen inhoud:** geen inhoudstabellen (agenda, taken, boodschappen, vakantie), geen realtime, geen
  opslag.
- **Nog niet gebouwd:**
  - kindaccounts, gast/oppas, huishouden verwijderen, accountverwijdering/AVG-export;
  - abonnementen (het plan per huishouden volgt in F10);
  - import van bestaande Huisplan-planners.
