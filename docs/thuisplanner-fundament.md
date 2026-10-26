# Thuisplanner KG-1: databasefundament

**Status:** gebouwd en lokaal getest, in een eigen PR; niet gemerged, niet gedeployd. Verstevigd in
KG-5B (stap 1 van het bouwplan `docs/thuisplanner-bouwplan.md`): zie sectie 7, en herstelronde 1 na de
onafhankelijke review: zie sectie 8. Getest op een nabootsing
(PostgreSQL 16) én op een echte lokale Supabase-stack (PostgreSQL 17.6, `supabase start`).

- **Wat het is:** accounts/profielen, huishoudens, leden, uitnodigingen, rollen en toegangsrechten
  voor de nieuwe app (Thuisplanner).
- **Waar:** `thuisplanner/supabase/migrations/20261009120000_kg1_fundament.sql`.
- **Tests:** `thuisplanner/supabase/tests/`.
- **Context:** de ontwikkelrichting staat in `docs/roadmap.md` (sectie "Ontwikkelrichting Thuisplanner").

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
4. **Niets verwijderen via de API.** Leden worden gearchiveerd. *Sinds KG-5B:* een eigenaar kan het
   hele huishouden verwijderen (`delete_household`), en een account verwijderen werkt (sectie 7).
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
| KG-T23 | (KG-5B) Account-ID's (`user_id`, `created_by`, `accepted_by`) niet leesbaar, ook niet via `select *` of een filter; `has_account` en `my_memberships()` wel |
| KG-T24 | (KG-5B) Hoogstens 10 huishoudens als eigenaar per account |
| KG-T25 | (KG-5B) Huishouden verwijderen: alleen een actieve eigenaar; leden en uitnodigingen gaan mee; andere huishoudens blijven |
| KG-T26 | (KG-5B) Account verwijderen (AVG): lid en beheerder lukt (lid blijft zonder account); enige eigenaar met andere accounts geweigerd; anders gaat het huishouden mee |
| KG-T27 | (KG-5B) Realtime: geen tabel uit `public` in een publicatie |
| KG-T28 | (herstel P2) Uitnodiging alleen geldig zolang de maker haar nog mag geven: oud-eigenaar kan niet via een eigen oude token terugkomen; nieuwe, geautoriseerde uitnodiging werkt wel |
| KG-T29 | (herstel P4) Geen kolom die naar een account verwijst leesbaar via de API (ook `households.created_by`), behalve je eigen profiel |
| KG-T30 | (herstel P5) Limiet van 10 eigen huishoudens ook bij eigendomsoverdracht |
| KG-T31 | (herstel P1) Protocol: elke muterende functie vergrendelt eerst het huishouden (of het account), vóór de rechtencontrole |

**Tegenproeven** (`tegenproeven.txt`): 26 sabotages (14 uit KG-1, 8 uit KG-5B, 4 uit herstelronde 1). Elke sabotage moet het genoemde scenario laten
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
- **Geen inhoud:** geen inhoudstabellen (agenda, taken, boodschappen, vakantie), geen realtime-berichten,
  geen opslag.
- **Nog niet gebouwd:**
  - kindaccounts, gast/oppas, AVG-export, schermen voor account of huishouden verwijderen;
  - abonnementen (het plan per huishouden volgt in F10);
  - import van bestaande Huisplan-planners.

## 7. KG-5B: verstevigd (bouwplan stap 1)

Migratie `thuisplanner/supabase/migrations/20261010120000_kg5b_verstevigen.sql`. Geen nieuwe tabellen en
geen nieuwe app-functies; alleen beveiliging en privacy van het fundament. Bevindingen uit
`docs/thuisplanner-bouwplan.md` ("Beoordeling PR #19"):

| Bevinding | Wat er is gedaan |
| --- | --- |
| 2. Alleen getest op een nabootsing | `run.sh --db <url>` draait matrix en tegenproeven ook op een echte lokale Supabase (`supabase start`, PostgreSQL 17.6, zoals `config.toml`). Nieuwe integratietest met supabase-js (`tests/integratie/`) tegen de echte API, Auth en Realtime. Nieuwe CI-job `supabase-lokaal`. Tegenproeven lopen nu in een teruggedraaide transactie, zodat ze op beide doelen werken. |
| 3. Account verwijderen | **Bleek erger:** het verwijderen van *elk* gekoppeld account faalde (`household_members_linked_check`). Nu ontkoppelt een trigger op `auth.users` het account eerst: het lid blijft bestaan als lid zonder account en zonder beheerrol. Is het account de enige eigenaar van een huishouden waarin nog iemand anders een account heeft, dan weigert de database met een duidelijke melding (eerst eigendom overdragen of het huishouden verwijderen). Heeft verder niemand een account, dan gaat het huishouden mee (met kinderen en leden zonder account). Profiel en uitnodigingsverwijzingen gaan via de bestaande FK's. |
| 4. `user_id` zichtbaar voor alle leden | Kolomrechten: `user_id` (leden) en `created_by`/`accepted_by` (uitnodigingen) zijn niet meer leesbaar via de API. Nieuw: `has_account` (gegenereerde kolom) en `my_memberships()` (je eigen lidmaatschappen: huishouden, lid, rol). Ook realtime volgt de kolomrechten (gecontroleerd in de integratietest). |
| 5. Hulpfunctie per rij in RLS | Lees-RLS van huishoudens en leden en de bijwerk-RLS van leden gebruiken `private.my_household_ids()` / `my_memberships()`, één keer per query. |
| 6. Onbeperkt huishoudens aanmaken | Hoogstens 10 als eigenaar per account. (Het token in het URL-fragment hoort bij de uitnodigingslink in stap 7.) |
| 7. Realtime | Lokaal aan, alleen om te bewijzen dat er niets uitlekt: geen tabel in een publicatie (KG-T27 en integratietest, met tegenproef), private kanalen `household:<id>` dicht voor iedereen (er is nog geen beleid op `realtime.messages`). |
| Nieuw | `delete_household(id)`: een eigenaar verwijdert het hele huishouden. |

**Gevolgen voor de app (later):** `select *` op `household_members` of `household_invites` faalt nu
via de API; de app moet kolommen expliciet noemen. "Ben ik dit lid?" gaat via `my_memberships()`.

**Integratietest** (`thuisplanner/supabase/tests/integratie/`, alleen tegen een lokale stack; weigert andere
adressen):
- `anon` krijgt geen rijen en mag geen functies aanroepen;
- een buitenstaander ziet geen huishouden, leden of uitnodigingen;
- `user_id`, `token_hash`, `created_by` en `accepted_by` zijn niet selecteerbaar of filterbaar via PostgREST;
- schema `private` is niet bereikbaar via de API;
- `postgres_changes` levert lid en buitenstaander niets op. Tegenproef: met de tabel tijdelijk in de
  publicatie ontvangt het lid wél berichten (dus de test meet echt iets), zonder `user_id`, en de
  buitenstaander nog steeds niets;
- private kanalen `household:<id>` zijn dicht voor buitenstaander én lid;
- account verwijderen via de Auth-admin-API (zoals een AVG-verzoek): lid lukt, enige eigenaar met
  anderen geweigerd, daarna beheerder en eigenaar lukt en het huishouden verdwijnt.

## 8. KG-5B herstelronde 1 (review van `6da0f47`)

Migratie `thuisplanner/supabase/migrations/20261011120000_kg5b_herstel1.sql`. Een onafhankelijke review vond
vijf beveiligingsproblemen; alle vijf zijn eerst met een test gereproduceerd op `6da0f47` en daarna
opgelost.

| # | Probleem | Oplossing | Test |
| --- | --- | --- | --- |
| P1 | Race: een autorisatie die op een oude momentopname was gecontroleerd, kon na intrekking van de toegang alsnog een mutatie uitvoeren (`delete_household`, `set_member_role`, …) | Vergrendelingsprotocol (hieronder) in alle muterende functies en in de triggers voor directe API-wijzigingen | `gelijktijdig.test.mjs` (P1 ×2), KG-T31 |
| P2 | Een oud-eigenaar kon via een eigen, eerder uitgegeven beheerdersuitnodiging weer beheerder worden | Een uitnodiging is alleen geldig zolang de maker haar nu nog mag geven (beheerdersuitnodiging: actieve eigenaar; gewone: actieve eigenaar of beheerder). `accept_invite` controleert dat; bij elke rol-, archiverings-, vertrek- of accountwijziging vervallen zulke uitnodigingen ook direct. Een nieuwe uitnodiging van de huidige eigenaar werkt gewoon | KG-T28 |
| P3 | Twee eigenaars die tegelijk vertrekken, konden samen de laatste eigenaar laten verdwijnen | `leave_household` en de uitgestelde controle `ensure_owner` vergrendelen het huishouden en tellen daarna opnieuw | `gelijktijdig.test.mjs` (P3) |
| P4 | `households.created_by` (account-ID) leesbaar via de API | Kolomrechten: alleen `id`, `name`, `created_at`, `updated_at` | KG-T29, integratietest |
| P5 | Limiet van 10 eigen huishoudens gold niet bij overdracht en niet bij gelijktijdige transacties | Limiet ook in `transfer_ownership`; tellen gebeurt pas na een accountvergrendeling (`create_household` en `transfer_ownership`) | KG-T30, `gelijktijdig.test.mjs` (P5 ×2) |

### Vergrendelingsprotocol

Geldt voor elke wijziging van lidmaatschap, rollen, uitnodigingen of het huishouden zelf:

1. **Eerst het huishouden vergrendelen:** `private.lock_household(h)` zet een rijvergrendeling
   (`FOR NO KEY UPDATE`) op de rij van het huishouden. Alle mutaties binnen één huishouden lopen daardoor
   na elkaar. Raakt een mutatie meerdere huishoudens (account verwijderen), dan vergrendelt ze die in
   oplopende volgorde van id.
2. **Pas daarna de autorisatie** (`has_role`, `is_active_member`, …) en alle andere controles. In read
   committed krijgt elke opdracht na het wachten een verse momentopname, dus een rol die intussen is
   ingetrokken, wordt gezien. `lock_household` weigert andere isolatieniveaus (fail closed): daar zou
   een oude momentopname blijven gelden.
3. **Dan de rijen** van leden en uitnodigingen (`FOR UPDATE`), en als laatste, alleen waar een account
   eigenaar wordt, de **accountvergrendeling** `private.lock_owner_count(user)` (advisory lock op het
   account). Zo klopt de telling van eigen huishoudens over huishoudens heen.

Vaste volgorde: huishouden(s) → rijen → account. Ook de uitgestelde controle "minstens één eigenaar"
vergrendelt het huishouden en telt daarna opnieuw. Directe API-wijzigingen (naam van het huishouden,
weergavegegevens van een lid) controleren de rol opnieuw ná de vergrendeling, in een trigger
(`households_guard`, `guard_member`).

### Gelijktijdigheidstests

Bestand: `thuisplanner/supabase/tests/integratie/gelijktijdig.test.mjs`, met node-postgres en drie aparte
verbindingen. De test draait op de nabootsing (`run.sh --gelijktijdig`) en op de echte lokale stack.

- **Opzet per scenario:** verbinding 1 voert een geautoriseerde wijziging uit en houdt haar transactie
  open. Verbinding 2 start de concurrerende wijziging. Een derde verbinding stelt via `pg_stat_activity`
  vast dat verbinding 2 echt op een vergrendeling wacht. Daarna COMMIT 1, dan 2, en de eindtoestand
  wordt ná COMMIT gecontroleerd.
- **Is verbinding 2 meteen klaar** (geen vergrendeling, zoals vóór de fix), dan laat de test haar
  uitgestelde controles nog vóór COMMIT 1 lopen. Dat is precies wat gebeurt als beide tegelijk
  committen.
- **Tegenproef** (`KG_TEGENPROEF=1`): de vergrendelfuncties worden tijdelijk vervangen door een lege
  functie; dan moet elke race weer optreden. Daarna worden de originele definities teruggezet.
- **Op `6da0f47` (vóór de fix):** alle vijf scenario's falen ("fout niet geblokkeerd"), en KG-T28 t/m
  KG-T31 falen met de verwachte melding.

### Realtime-tests aangescherpt

- **Kanaal moet live zijn:** een abonnement telt alleen als het SUBSCRIBED is én een eigen
  broadcast-echo via de server terugkomt, vóór en ná het meetvenster. Een time-out of foutstatus geldt
  nooit als geslaagde controle.
- **Weigering moet expliciet zijn:** een private-kanaalweigering moet een CHANNEL_ERROR met
  autorisatiereden zijn.
- **Tegenproef voor private kanalen:** met een tijdelijk toegangsbeleid voor één testkanaal gaat een
  privékanaal wél open.

### Bekende grenzen

- Een directe API-wijziging van een lid kan tegelijk met een functie in een deadlock komen. Het
  rijslot komt dan vóór het huishoudslot; PostgreSQL breekt één van beide af (fail closed).
- Mutaties vragen read committed. Dat is de standaard van PostgREST en Auth.
