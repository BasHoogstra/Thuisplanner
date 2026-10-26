# Thuisplanner KG-5H deel 1b: uitnodigingen op e-mailadres (bouwplan)

**Status:** ✅ lokaal gebouwd en getest (17 oktober 2026); **nog niet op staging** (geen push, geen migratie online).
Richting C is besloten op 17 oktober 2026, met vier voorwaarden (§1); besluiten a–e (§10) en de twee aanvullingen zijn
op dezelfde dag goedgekeurd, met drie extra voorwaarden (§11). Voortbouwend op deel 1 (`docs/thuisplanner-onboarding.md`).
Wat er gebouwd is en waar het afwijkt van dit plan: §12.

**Probleem:**
- Een uitnodiging werkt nu alleen via een link met het token in het fragment.
- Dat gaat mis achter Cloudflare Access, bij een magic link, in de browser van WhatsApp of Instagram tegenover de app op
  het beginscherm, en op een ander toestel.
- Plakken is dan de enige uitweg.

**Doel:** een uitnodiging die automatisch en betrouwbaar verschijnt bij de juiste persoon. De bestaande link blijft
bestaan als aanvulling.

## 1. Voorwaarden van de producteigenaar

1. Is een uitnodiging aan een e-mailadres gekoppeld, dan kan **alleen een account met dat bevestigde e-mailadres** hem
   accepteren. Dat geldt ook met de link, en wordt in de database afgedwongen, ook in de bestaande route `accept_invite`.
2. Wie al in een huishouden zit, ziet nieuwe uitnodigingen en kan ze accepteren. Ook **meerdere** tegelijk.
3. Bestaande links **zonder** e-mailadres blijven werken.
4. Definitieve commerciële functionaliteit: privacy, beveiliging, foutafhandeling, migraties en tests. Geen
   staging-oplossing.
5. Het e-mailadres wordt verwijderd zodra de uitnodiging gebruikt, ingetrokken, geweigerd of verlopen is, **met controle
   op de daadwerkelijke opruiming**.

## 2. Het gedrag

| Situatie | Wat er gebeurt |
| --- | --- |
| Beheerder nodigt uit **met** e-mailadres | Je krijgt ook een link. In het scherm staat dat die alleen werkt voor dat adres. Het adres staat bij de open uitnodigingen (alleen voor eigenaar en beheerders) |
| Beheerder nodigt uit **zonder** e-mailadres | Zoals nu (deel 1): alleen de link, en die werkt voor iedereen die hem heeft, één keer |
| De genodigde logt in met dat adres (bevestigd), **zonder** huishouden | Het welkomstscherm toont "Uitnodigingen voor jou": huishoudnaam, wie uitnodigde, rol, geldig tot. Je kunt accepteren of weigeren. Geen link nodig |
| De genodigde zit **al** in een huishouden | Eén rustige melding op Vandaag ("Je bent uitgenodigd voor Familie Test"), plus de lijst in Meer → Huishouden. Accepteren zet je in dat huishouden; je oude huishouden blijft, en je kunt wisselen |
| Meerdere uitnodigingen | Allemaal in de lijst, elk apart te accepteren of te weigeren |
| Iemand opent een **gekoppelde** link met een ander account | Geweigerd door de database: "Deze uitnodiging is voor een ander e-mailadres. Log in met het adres waarop je bent uitgenodigd." Het adres zelf wordt niet genoemd |
| Weigeren | De uitnodiging is gesloten en het e-mailadres is direct weg. De beheerder ziet "geweigerd" |
| Opnieuw uitnodigen op hetzelfde adres in hetzelfde huishouden | De vorige open uitnodiging voor dat adres wordt automatisch ingetrokken. Zo staan er nooit twee naast elkaar |

**Bewust niet:**
- Thuisplanner zegt nooit of een e-mailadres al een account heeft. Dat voorkomt dat iemand kan nagaan wie gebruiker is.
- Er wordt nog geen e-mail verstuurd; dat komt pas met B4 (§8). De beheerder deelt de link zelf, of de genodigde ziet de
  uitnodiging gewoon na het inloggen.

## 3. Database (één migratie: `20261020120000_uitnodigingen_op_email.sql`)

### 3.1 Tabel `household_invites`

| Wijziging | Waarom |
| --- | --- |
| Kolom `invited_email text`, optioneel. Opgeslagen als `lower(btrim(…))`, hoogstens 254 tekens, een eenvoudige vormcontrole (`^[^@\s]+@[^@\s]+\.[^@\s]+$`) | Het adres waarop de uitnodiging geldt |
| Kolom `declined_at timestamptz` | Een genodigde kan weigeren; de beheerder ziet dat |
| Controle: `invited_email is null` zodra `accepted_at`, `revoked_at` of `declined_at` gezet is | De opruiming bij gebruik, intrekken en weigeren is zo **structureel**: een gesloten uitnodiging kan geen adres bevatten. Een functie die dat vergeet, faalt |
| Index op `(lower(invited_email))` waar het adres gevuld is | Snel opzoeken van "mijn uitnodigingen" |
| Leesrecht op de kolommen `invited_email` en `declined_at`, alleen voor eigenaar en beheerder (bestaande policy `invites_select`) | De genodigde ziet het adres niet via de tabel, alleen via de functie hieronder; gewone leden en buitenstaanders zien niets |

### 3.2 Functies (logica in `private`, dunne wrappers in `public` zonder DETAIL/HINT, zoals overal)

| Functie | Regels |
| --- | --- |
| `create_invite(huishouden, lid?, rol, dagen, e-mail?)` | De nieuwe parameter `p_email` heeft een standaardwaarde (null), dus bestaande aanroepen blijven werken. De oude publieke handtekening gaat weg en de nieuwe komt ervoor in de plaats (anders kan de API kiezen tussen twee versies). Normaliseert het adres. Trekt een open uitnodiging voor hetzelfde adres in hetzelfde huishouden in. **Limiet:** hoogstens 10 open uitnodigingen per huishouden (K9, deels nu) |
| `private.my_email()` (intern) | Het e-mailadres uit `auth.users` voor `auth.uid()`, **alleen als `email_confirmed_at` gezet is**, anders null. Niet uit het token (JWT): dat kan oud zijn. Een adreswijziging die nog niet bevestigd is, telt niet |
| `my_invites()` (nieuw) | Geeft id, huishoudnaam, de naam van wie uitnodigde, rol en geldig-tot, voor uitnodigingen met `invited_email = my_email()` die open zijn (niet gebruikt, ingetrokken, geweigerd of verlopen), waarvan de maker nog bevoegd is, en waar je nog geen actief lid bent. Geen e-mailadres in de uitvoer |
| `accept_invite_by_id(uitnodiging, eigen naam)` (nieuw) | Accepteert een uitnodiging uit `my_invites`. Het adres moet gekoppeld zijn en gelijk aan `my_email()`. Verder precies dezelfde regels als `accept_invite`; de gedeelde controle staat in één interne functie |
| `accept_invite(token, eigen naam)` (bestaand) | **Extra regel (voorwaarde 1):** is er een adres gekoppeld, dan moet het gelijk zijn aan `my_email()`, anders volgt een weigering. Zonder gekoppeld adres verandert er niets (voorwaarde 3) |
| `decline_invite(uitnodiging)` (nieuw) | Alleen de genodigde zelf (adres gelijk aan `my_email()`). Zet `declined_at` en wist het adres |
| `revoke_invite` (bestaand) | Wist voortaan ook het adres. De controle in §3.1 dwingt dat af |
| `private.purge_invite_emails()` (nieuw, dagelijks via `pg_cron`) | Wist het adres van uitnodigingen die verlopen zijn. Per huishouden onder vergrendeling, zoals de K3-opruiming. Dit is dezelfde dagelijkse taak (`thuisplanner-archief-opruimen` roept beide aan) of een tweede; advies: een tweede, met een eigen naam, zodat de nacontrole elke taak apart ziet |

**Volgorde van de controles bij accepteren** (beide routes): token of id gevonden → vergrendelen → niet ingetrokken,
niet gebruikt, niet geweigerd, niet verlopen → maker nog bevoegd → **adres** (indien gekoppeld) → nog geen lid. Het
adres komt pas na de andere controles: zo verraadt een fout adres niet of een verlopen uitnodiging ooit gekoppeld was.

### 3.3 Stabiele foutcodes (de richting van KG-5E, punt 5; hier alvast voor dit domein)

Nu gebruiken uitnodigingen grove codes (`22023` voor verlopen, gebruikt en ingetrokken). In deze migratie krijgen alle
uitnodigingsfouten een eigen, stabiele SQLSTATE (5 tekens; Postgres staat eigen codes toe, `PT409` gebruiken we al):

| Code | Betekenis |
| --- | --- |
| `TPU01` | Niet gevonden |
| `TPU02` | Verlopen |
| `TPU03` | Al gebruikt |
| `TPU04` | Ingetrokken |
| `TPU05` | Niet meer geldig (de maker is niet meer bevoegd) |
| `TPU06` | Voor een ander e-mailadres |
| `TPU07` | Al lid |
| `TPU08` | Te veel open uitnodigingen |
| `TPU09` | Ongeldig e-mailadres |
| `TPU10` | Geweigerd |

De app vertaalt **alleen de code** naar een tekst. Een contracttest faalt als een code in de migraties geen tekst heeft
in de app. Rechtenfouten blijven `42501`.

### 3.4 Wat niet verandert

- De link en het token (32 bytes, SHA-256);
- eenmalig, verlopen, intrekken;
- de rol uit de uitnodiging;
- de scheiding tussen huishoudens;
- `invite_creator_authorized`, vergrendelen, RLS;
- bestaande uitnodigingen (zonder adres) blijven geldig.

## 4. App

| Onderdeel | Wijziging |
| --- | --- |
| `lib/lokaal/beheer.ts` | `nodigUit(…, email?)`; `mijnUitnodigingen()`, `accepteer(id, naam)`, `weiger(id)`; de open lijst toont het adres en "geweigerd" |
| `lib/lokaal/sessie.ts` | Na inloggen en bij terugkeer naar de app: `my_invites` ophalen, in de momentopname. `accepteerUitnodigingOpId` naast de bestaande route via het token |
| `lib/foutcodes.ts` (nieuw) | Codes naar teksten in de Thuisplanner-toon. Alleen de uitnodigingscodes en de bestaande algemene codes; de rest volgt in KG-5E |
| S1 Welkom | Bovenaan "Uitnodigingen voor jou" (lijst). Daaronder "Nieuw huishouden" en "Ik heb een link" |
| Vandaag | Hoogstens één rustige melding als er een uitnodiging openstaat (principe 6). Een tik gaat naar de lijst |
| Meer → Huishouden | "Uitnodigingen voor jou", en bij Uitnodigen een veld **E-mailadres (optioneel)** met de uitleg "Dan kan alleen iemand met dit adres accepteren, ook zonder link" |
| S2 (link) | Bij `TPU06` de tekst met de knop "Uitloggen en met een ander adres inloggen". De uitnodiging blijft in het tabblad bewaard |

## 5. Tests

**RLS-matrix (nieuwe scenario's KG-T57 en verder, met een tegenproef per regel):**
- Alleen eigenaar en beheerder zien `invited_email`; een gewoon lid, een buitenstaander en `anon` niet.
- `my_invites`:
  - alleen met een bevestigd, gelijk adres;
  - niets bij een onbevestigd adres (gebruiker zonder `email_confirmed_at`), bij een ander adres, of voor een
    buitenstaander;
  - geen verlopen, ingetrokken, gebruikte of geweigerde uitnodigingen;
  - niet als de maker zijn rechten kwijt is;
  - niet als je al lid bent;
  - meerdere uitnodigingen naast elkaar;
  - geen adres in de uitvoer.
- **Voorwaarde 1:** `accept_invite` met de **link** van een gekoppelde uitnodiging faalt voor een ander account
  (`TPU06`) en slaagt voor het juiste. `accept_invite_by_id` idem.
- **Voorwaarde 2:** een account dat al lid is van een ander huishouden accepteert; daarna is het lid van beide.
- **Voorwaarde 3:** een uitnodiging zonder adres werkt ongewijzigd (de bestaande KG-T07 tot en met T11 en T28 blijven
  groen, met de nieuwe codes).
- **Opruiming:**
  - na accepteren, intrekken en weigeren is het adres weg;
  - de controle weigert een gesloten uitnodiging met een adres;
  - `purge_invite_emails` wist verlopen adressen en niets anders;
  - de geplande taak bestaat.
- Opnieuw uitnodigen op hetzelfde adres trekt de vorige in. De limiet van 10 open uitnodigingen.
- Normalisatie: `Joris@Example.COM ` is gelijk aan `joris@example.com`.
- Catalogus: nieuwe functies in `private` met een vast `search_path`; wrappers zonder DETAIL/HINT (KG-T46 dekt dat
  automatisch); `anon` heeft geen rechten.

**Integratie met een echte Supabase Auth:** een gebruiker met `email_confirm: false` ziet niets; na bevestigen wel.

**Unit en component:** foutcodes en contracttest; de lijst op S1 en in Meer; de melding op Vandaag; het e-mailveld.

**Lokale e2e:**
- Sanne nodigt `joris.demo@test.invalid` uit en deelt **geen** link; Joris logt in en accepteert vanuit de lijst.
- Thomas (in De Boer) ziet de melding, accepteert, en zit in twee huishoudens.
- Thomas opent de link van een uitnodiging voor Joris: geweigerd.
- Een link zonder adres werkt zoals in deel 1.

**Nacontrole op staging:** `verbinding-controle.mjs na` wordt bijgewerkt:
- 12 migraties;
- het nieuwe referentieschema;
- de tweede geplande taak;
- **0 verlopen uitnodigingen met een adres**: de controle op de daadwerkelijke opruiming, ook later te herhalen.

`verbinding.ps1` verwacht dan 12 migraties.

## 6. Privacy en beveiliging

| Punt | Hoe |
| --- | --- |
| Persoonsgegeven van iemand die nog geen lid is | Alleen het adres, alleen zolang de uitnodiging open is. Zichtbaar voor eigenaar en beheerders (die het intikten), nooit voor leden of buitenstaanders. In de privacyverklaring: doel en bewaartermijn (hoogstens de geldigheid, 7 dagen) |
| Nagaan of iemand een account heeft | Geen enkele functie meldt of een adres een account heeft. De weigering `TPU06` noemt geen adres |
| Een overgenomen of onbevestigd account | Alleen een **bevestigd** adres telt, uit `auth.users`, niet uit het token |
| Een doorgestuurde link | Bij een gekoppelde uitnodiging nutteloos voor anderen (voorwaarde 1); bij een niet-gekoppelde blijft het zoals in deel 1 (eenmalig, 7 dagen, intrekbaar) |
| Misbruik (veel uitnodigingen) | Hoogstens 10 open per huishouden; alleen eigenaar of beheerder. Zodra er mail wordt verstuurd (B4) komt er ook een daglimiet |
| Logboeken | De app logt geen adressen of tokens |

## 7. Productkompas-toets

- **Principes:**
  - 1: geen plakken, het verschijnt gewoon;
  - 3: één keer het adres invullen;
  - 5 en 6: één melding, en accepteren blijft een keuze;
  - 7: lid is niet hetzelfde als account;
  - "privacy volgt de situatie": het adres alleen zolang nodig, en alleen voor wie het intikte.
- **Neemt het werk weg?** Ja, de lastigste stap van samen beginnen.
- **Eenvoudiger?** Het adres is optioneel; zonder adres werkt alles zoals nu.
- **Gates:**
  - beslissing 6 blijft gehaald: lidmaatschap alleen door expliciet accepteren;
  - gate 9 verandert niet: geen inhoudstabel.

## 8. Aansluiting op e-mailcodes en registratie (deel 2)

| Straks | Hoe deel 1b daarop aansluit |
| --- | --- |
| Inloggen met een e-mailcode | Een geslaagde code betekent een bevestigd adres (Supabase zet `email_confirmed_at`). Dus `my_invites` werkt direct na het eerste inloggen |
| Nieuwe gebruiker meldt zich aan | Aanmelden met het adres waarop hij is uitgenodigd → code → welkomstscherm met de uitnodiging. Geen link nodig. Een ander adres geeft geen uitnodiging, maar wel de keuze "Nieuw huishouden", en bij de link `TPU06` met uitleg |
| Uitnodiging per mail (B4) | Een Edge Function stuurt bij `create_invite` met een adres een mail met de link, vóór de opruiming (het adres staat er dan nog). Het model verandert niet. Er komt dan een daglimiet per huishouden bij |
| Google | Google levert een geverifieerd adres; zelfde gedrag |
| Apple ("Verberg mijn e-mail") | Apple geeft dan een doorstuuradres; dat is niet het adres van de uitnodiging. Zo iemand accepteert via een uitnodiging **zonder** adres, of koppelt later het eigen adres aan het account (accountkoppeling, deel 2). Dit is een bekende beperking en geen reden om het ontwerp te veranderen |
| Adres wijzigen | Telt pas na bevestigen; dan gelden uitnodigingen voor het nieuwe adres |

## 9. Volgorde en omvang

1. **Akkoord op dit plan**, plus de besluiten in §10.
2. De migratie, met de RLS-scenario's en tegenproeven, lokaal (PostgreSQL 16 en een echte lokale stack); de integratietest
   met Auth.
3. De app: foutcodes, lijsten, melding, e-mailveld; unittests en e2e.
4. Documentatie en changelog, en een lokale commit.
5. **Apart akkoord:** de push naar `thuisplanner-staging` (Cloudflare bouwt) en de **migratie naar de stagingdatabase**
   via `verbinding.ps1 -Push`, met de nacontrole (12 migraties en de controle op de opruiming).

**Omvang:**
- één migratie van ongeveer 250 regels;
- ongeveer 15 nieuwe matrixscenario's met tegenproeven;
- de bestaande uitnodigingsscenario's worden bijgewerkt naar de nieuwe codes;
- ongeveer 6 bestanden in de app;
- 4 e2e-tests.

**Afhankelijkheden:** geen van KG-5E. KG-5E neemt dit mee: het `Opslag`-interface krijgt "uitnodigingen" als gewone
bron, en `lib/foutcodes.ts` wordt uitgebreid naar alle domeinen.

## 10. Besluiten

| # | Vraag | Advies |
| --- | --- | --- |
| a | Hoeveel open uitnodigingen per huishouden? | **10** |
| b | Ziet de genodigde wie uitnodigde (de naam in het huishouden)? | **Ja**: zonder naam weet je niet of je het kunt vertrouwen |
| c | Melding op Vandaag bij een open uitnodiging? | **Ja, hoogstens één**, die verdwijnt na accepteren of weigeren |
| d | Bij opnieuw uitnodigen op hetzelfde adres de vorige intrekken? | **Ja** |
| e | Een eigen geplande taak voor het wissen van adressen? | **Ja** (`thuisplanner-uitnodigingen-opschonen`, dagelijks) |

## 11. Aanvullende voorwaarden bij het akkoord (17 oktober 2026)

1. Uitnodigingen kunnen uitsluitend worden bekeken en geaccepteerd door accounts waarvan het juiste e-mailadres
   daadwerkelijk is bevestigd. De database dwingt dit af. Misbruikscenario's zitten in de tests.
2. Google- en Apple-login en automatische accountkoppeling gelden nog **niet** als bewezen. Die worden later apart
   gecontroleerd (deel 2). §8 beschrijft alleen de verwachting.
3. De centrale producteis: vrienden en kennissen kunnen straks zelf registreren, inloggen en beginnen, zonder vooraf
   aangemaakte accounts, zonder extra Cloudflare-inlog en zonder een uitnodiging opnieuw te plakken. Daarom komt direct
   na deel 1b de definitieve registratie en het inloggen met e-mailcodes, vóór externe testers.

## 12. Gebouwd (lokaal, 17 oktober 2026)

**Database:** `thuisplanner/supabase/migrations/20261020120000_uitnodigingen_op_email.sql`, zoals §3, met deze uitwerking:

| Punt | Hoe gebouwd | Waarom |
| --- | --- | --- |
| Adres wissen bij sluiten | Een trigger (`household_invites_wipe_email`) wist het adres zodra `accepted_at`, `revoked_at` of `declined_at` gezet wordt, **plus** de controle `household_invites_email_closed` als vangnet | Uitnodigingen worden op vijf plekken gesloten (`revoke_invite`, `accept`, `archive_member`, `revoke_unauthorized_invites`, `before_account_delete`). Alleen een controle zou die bestaande routes laten falen, bijvoorbeeld bij het verwijderen van een account. De trigger dekt elke route; zonder trigger faalt de controle (tegenproef KG-T61) |
| Bevestigd adres | `private.my_email()` leest `auth.users.email` alleen met `email_confirmed_at`; nooit het token | Getest met een vervalst `email`/`email_verified` in het token |
| Lijst-route | `accept_invite_by_id` en `decline_invite` werken alleen voor een uitnodiging **met** adres. Een uitnodiging zonder adres bestaat voor die routes niet (TPU01) | Een id is geen geheim zoals het token |
| Volgorde van de controles | geweigerd (TPU10) → ingetrokken (TPU04) → gebruikt (TPU03) → verlopen (TPU02) → maker bevoegd (TPU05) → adres (TPU06) → al lid (TPU07) | Het adres komt na de toestand (§3.2). Kleine afwijking: "geweigerd" komt eerst, omdat een geweigerde uitnodiging later nog door een rolwijziging "ingetrokken" kan worden |
| Weigeren door anderen | Voor iedereen behalve de genodigde (ook eigenaar en beheer) geeft `decline_invite` TPU01 | Beheer trekt in; weigeren is van de genodigde |
| Intrekken na weigeren | Verandert niets; "geweigerd" blijft zichtbaar | |
| `my_invites` | id, huishoudnaam, wie uitnodigde, het gekoppelde profiel (indien), rol, geldig tot. Geen adres, token of huishoud-id | Wat je nodig hebt om te beslissen, niet meer |
| Opschonen | `private.purge_invite_emails()` dagelijks om 03:29 (`thuisplanner-uitnodigingen-opschonen`), per huishouden onder vergrendeling | Besluit e |
| Schema | `private` 68 functies, `public` 21 functies, policies ongewijzigd (18) | Referentie voor de nacontrole |

**Stagingcontrole (alleen bestanden, niets uitgevoerd):**
- `verbinding.ps1` heeft een modus `-Bijwerken`. Die werkt alleen als de migratiegeschiedenis precies het begin is van
  de repository en er nieuwe migraties klaarstaan. Vlak voor de push vergelijkt hij de stand opnieuw. De eerste push
  (lege database) werkt zoals eerder.
- De nacontrole (`na`) controleert:
  - 12 migraties en het nieuwe schema;
  - beide geplande taken, en geen onverwachte;
  - **0 gesloten uitnodigingen met een adres**;
  - **0 uitnodigingen die langer dan 2 dagen verlopen zijn en nog een adres hebben** (de controle op de daadwerkelijke
    opruiming, later te herhalen).
- Lokaal nagelopen tegen de stack, met zeven weigergevallen voor `-Bijwerken`.

**App:**

| Onderdeel | Wijziging |
| --- | --- |
| `lib/foutcodes.ts` (nieuw) | TPU01–TPU10 naar teksten; de app toont nooit de melding van de database. De contracttest `tests/foutcodes.test.ts` vergelijkt de codes met de migraties |
| `lib/lokaal/sessie.ts` | `uitnodigingen` in de momentopname (na inloggen, en bij terugkeer naar de app via `visibilitychange`); `accepteerUitnodigingOpId`, `weigerUitnodiging`; een mislukte actie geeft ook de code mee |
| S1 Welkom | "Uitnodigingen voor jou" bovenaan; zonder uitnodiging de uitleg dat een uitnodiging op je adres vanzelf verschijnt; "Ik heb een uitnodigingslink" blijft als tweede weg |
| S2 | Eén scherm voor link en lijst. Uit de lijst: wie, welk huishouden, welke rol, geldig tot; **Later** en **Weigeren** (met bevestiging). Bij een bestaand profiel geen naamveld. Bij TPU06 via de link: uitleg en "Uitloggen en met een ander adres inloggen" (de link blijft in het tabblad) |
| Vandaag | Hoogstens één rustige melding; "Bekijken" opent die ene (bij meer: naar Meer); "Later" verbergt hem tot de app opnieuw opent |
| Meer → Huishouden | "Uitnodigingen voor jou" voor elke rol; bij Uitnodigen het veld **E-mailadres (optioneel)**; open uitnodigingen tonen het adres en "geweigerd" |

**Tests (alle lokaal groen):**
- RLS-matrix **64/64** op de echte lokale Supabase (PostgreSQL 17). Nieuw zijn KG-T57 tot en met T64:
  - wie het adres ziet;
  - `my_invites` met een onbevestigd adres, een ander account, een vervalst token, en voor anon;
  - voorwaarde 1 met link en id, en misbruik door een doorgestuurde link, het id, een vervalst token, een onbevestigd
    account, en eigenaar of beheer zelf; het adres staat niet in de weigering;
  - voorwaarde 2 en meerdere uitnodigingen naast elkaar;
  - verlopen, ingetrokken, indirect ingetrokken en al lid;
  - opruiming, controle en geplande taak;
  - limiet en ongeldige adressen;
  - voorwaarde 3 en de catalogus.
- **Tegenproeven 85/85** gevangen, waarvan 19 nieuw.
- Integratie met een echte Supabase Auth (`tests/integratie/uitnodiging.test.mjs`, 2 tests):
  - Auth laat een onbevestigd adres niet inloggen;
  - een sessie met een niet-bevestigd adres ziet niets en wordt geweigerd; na bevestigen lukt het met dezelfde sessie;
  - een adreswijziging die nog niet bevestigd is, telt niet;
  - ander account, id en anon worden geweigerd.
- De volledige integratiesuite: 63 van 64 in één run. B1c (herstel, archiveren) liep daarbij één keer in een time-out
  van 60 s; los drie keer achter elkaar groen (ongeveer 4 s). Dat wordt in de gaten gehouden; de oorzaak is niet
  aangetoond.
- Unit **164/164**. Lokale e2e **21/21**, waarvan 3 nieuw:
  - op adres zonder link accepteren;
  - een melding op Vandaag, "Later", en accepteren met een tweede huishouden;
  - een gekoppelde link voor een ander account geweigerd, en weigeren zichtbaar voor de beheerder.
- Staging-e2e 5/5 en de statische controles groen.
- **Niet lokaal gedraaid:** de matrix op de kale PostgreSQL 16 (de nabootsing van CI). Daarvoor ontbreekt hier een
  PostgreSQL 16; CI draait die pas bij een push. De nabootsing (`supabase_stub.sql`) kreeg `email_confirmed_at`.

**Bekende beperkingen:**
- Er gaat nog geen e-mail uit (B4). (Achterhaald: de uitnodigingsmail is in deel 2 gebouwd; zie
  `docs/thuisplanner-uitnodigingsmail-verzending.md`.)
- Google en Apple zijn niet getest (§11, punt 2).
- Het staginginloggen gebruikt nog een wachtwoord en Cloudflare Access. Dat lost deel 2 op (de overstap:
  `docs/thuisplanner-staging-overstap.md`).
