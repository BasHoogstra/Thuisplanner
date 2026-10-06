# Identiteit en items: contract (voorstel)

**Status: voorstel, nog niet vastgesteld.** Dit document legt vast hoe Huisplan personen en items
identificeert, hoe de persoonsmigratie van fase 1.5 veilig verloopt, en hoe items aan elkaar
gekoppeld zijn. Het moet vastliggen voordat 1.4.2 en 1.5 code krijgen.

- **Opgesteld:** 6 oktober 2026, op basis van een eigen controle van de code op `main` (`b6ea4c5`).
- **Herzien:** 6 oktober 2026, na de review van Codex op PR #12. Zie sectie 8 voor wat er is
  overgenomen en wat bewust anders is opgelost.
- **Plaats in de leesvolgorde:** stap 4 uit `CLAUDE.md` (fase- en technische documentatie), dus na
  `PRODUCT_PRINCIPLES.md`, `docs/productkompas-beslissingen.md` en `docs/roadmap.md`. Bij
  tegenstrijdigheid gaan die drie voor.
- **Opbouw:**
  1. uitgangspunten;
  2. identiteit;
  3. veiligheid van de migratie in 1.5;
  4. items en relaties (voor fase 2, niet voor 1.4.2);
  5. roadmap en voorwaarden;
  6. teststrategie;
  7. beslispunten;
  8. verwerking van de review.
- Er wordt nog niets geïmplementeerd. Geen code, geen migratie, en geen wijziging aan Firebase of
  Supabase.

**Bindende termen.** "Moet" is een eis van het contract. "Voorkeur" en "advies" zijn een aanbeveling.

## 1. Uitgangspunten

### Personen

1. **Een huishoudlid en een account zijn verschillende identiteiten.**
   - Een account (een login) hoort bij een gebruiker.
   - Een huishoudlid is een persoon in het huishouden, met of zonder account.
   - Een kind zonder account is een volwaardig lid. Een account is aan hoogstens één lid per
     huishouden gekoppeld.
2. **Identiteit is geen autorisatie.**
   - Toegang komt van een account dat aan een lid is gekoppeld, en alleen de server bepaalt die.
   - Een keuze op een toestel ("ik ben Bas") is nooit een bewijs van toegang.
3. **De member-UUID wordt vanaf fase 1.5 de blijvende doelidentiteit.** Dezelfde UUID wordt later
   `household_members.id` in Supabase.
4. **Bestaande `m_…`-ID's blijven als legacy-alias behouden.** Ze zijn uniek binnen het huishouden
   en blijven overal leesbaar, bijvoorbeeld in `plannerMemberId` op een toestel.
5. **`resolveMember()` maakt nooit zelfstandig een huishoudlid aan en geeft bij twijfel `null`
   terug.** Twijfel betekent: geen treffer, meer dan één treffer, een label dat als "geen lid" is
   aangemerkt, of een onopgelost conflict.
6. **Activiteit of auteurschap betekent nooit automatisch lidmaatschap.** Wie iets toevoegt,
   bewerkt, claimt of erop reageert, wordt daardoor geen huishoudlid.
7. **Gasten, oppassen en andere niet-leden worden geen huishoudlid door activiteit.** Hun naam
   blijft een label bij wat ze deden.
8. **Twee personen met dezelfde naam moeten ondersteund kunnen worden.** Een naam is nooit de
   identiteit en nooit de sleutel van een beslissing over een persoon (zie 2.2).
9. **Bij correcties op lidmaatschap wint een nieuwere bewuste keuze veilig van een oudere.**
   - Een correctie die aantoonbaar op een eerdere beslissing voortbouwt, vervangt die.
   - Twee keuzes die onafhankelijk van elkaar zijn gemaakt, vormen een conflict. Dat wordt niet op
     de klok beslist.
   - Een oud of offline toestel mag een correctie niet terugdraaien (zie 3.1).
10. **Correcties zijn goedkoop voor het huishouden.** Een foutief "nee" herstel je door de keuze
    te corrigeren. Je hoeft geen lid opnieuw aan te maken en geen verwijzingen met de hand opnieuw
    te koppelen.

### Items

11. **Eén item kan in meerdere contexten of weergaven zichtbaar zijn zonder te worden gekopieerd.**
    Eén keer afronden werkt overal door.
12. **Gerelateerde handelingen mogen aparte, gekoppelde items zijn.** Samenhang betekent niet
    automatisch hetzelfde item.
13. **Ontwerpregel: "Als het ene klaar is, is het andere dan per definitie ook klaar?"**
    - Ja: het is **één item** met meerdere weergaven.
    - Nee: het zijn **twee items** met een relatie.
    - Dit is een hulpmiddel bij handelingen. Het is geen volledige definitie van identiteit: een
      verjaardag heeft bijvoorbeeld geen zinvolle toestand "klaar".
14. **Vandaag is een weergave.** Alleen het tonen (renderen) van Vandaag mag geen huishouddata
    wijzigen. Deze ontwerpregel geldt nu al.
15. **De centrale `+` moet later één invoer kunnen vertalen naar meerdere gekoppelde acties.**
    - Automatisering volgt beslissing 1: binnen expliciet verleende toestemming mag Huisplan
      zelfstandig handelen, zichtbaar en herstelbaar.
    - Bij een onduidelijke bedoeling of wezenlijke gevolgen vraagt Huisplan het één keer.
16. **Huisplan bouwt geen generiek graafmodel en geen universele alles-entiteit.**
    - Gemeenschappelijk zijn alleen de identiteit en de wijzigingsadministratie.
    - Elk type houdt zijn eigen betekenisvolle velden.

## 2. Identiteit

### 2.1 Begrippen en hun technische vorm

| Begrip | Vorm | Regel |
| --- | --- | --- |
| **Account** | `auth.users.id`, alleen in Supabase. In de Firebase-tijd bestaat dit niet; daar is er alleen een toestel. | Nooit hetzelfde als een lid. De koppeling loopt via `household_members.user_id` en ontstaat alleen via een uitnodiging. |
| **Toegang** | in Supabase: account gekoppeld aan een *actief* lid. In de Firebase-tijd: wie de deellink heeft. | Alleen de server beslist. Zie 2.5. |
| **Huishoudlid** | member-UUID, met `name`, `kind`, `color`, `status` (`active`/`archived`) en `legacyIds[]` | Ontstaat alleen door een expliciete keuze (zie 2.2). |
| **Actor** (wie iets invoert) | `byMember` (UUID of `null`) en `byLabel` (tekst of `null`) | `byMember` alleen als het toestel aan een lid gekoppeld is, anders alleen `byLabel`. Maakt nooit een lid aan en is geen bewijs van toegang. |
| **Toegewezen persoon** | `memberIds[]`; voor niet-leden `forLabel` (tekst) | Alleen bestaande leden komen in `memberIds`. "Voor oma" blijft tekst. |
| **Historisch label** | de oorspronkelijke tekst blijft staan (`legacyName`) | Alleen voor weergave. Geen bewijs van lidmaatschap. |
| **Gast, oppas, niet-lid** | alleen een label, eventueel met een toestel-ID | Wordt nooit lid door activiteit. In Supabase kan een niet-lid niet schrijven. |

### 2.2 Labels, kandidaten en leden

Er zijn drie niveaus, en ze worden niet door elkaar gebruikt.

| Niveau | Wat het is | Voorbeeld |
| --- | --- | --- |
| **Label** | een stuk tekst op een plek in de data (een veld, een kolom, een sleutel) | de paklijstkolom "Freya"; auteur "Oma" bij een taak |
| **Kandidaat** | een label met zijn bronnen, waarover een keuze nodig is | "Lynn" komt alleen voor in `vakantiePersonen` en paklijsten |
| **Lid** | een persoon met een UUID | Lynn, `uuid …` |

- **Beslissingen gaan over labels, niet over personen.** "Freya is geen lid" betekent: het label
  "Freya" wordt niet aan een lid gekoppeld. Het betekent niet dat niemand met die naam ooit lid
  kan worden.
- **Koppeling via een labelkaart.** In 1.5 worden labels via een expliciete labelkaart naar leden
  vertaald. Per genormaliseerd label is de uitkomst `uuid`, `notMember`, `ambiguous` of
  `unresolved`. Alleen `uuid` wordt een verwijzing; al het andere blijft tekst.
- **Gelijke namen.** Hebben twee leden dezelfde naam, dan is het label `ambiguous`. Bestaande
  verwijzingen blijven tekst en worden gemarkeerd voor een handmatige keuze. Een nieuw lid neemt
  bestaande labels nooit vanzelf over.
- **In de Firebase-data van nu is een naam het enige gegeven.** Twee personen met dezelfde naam zijn
  daar niet uit elkaar te houden. Vanaf 1.5 schrijft de app nieuwe verwijzingen als UUID, zodat het
  probleem niet verder groeit.

### 2.3 Van `m_…` naar UUID: herhaalbare migratiemapping

- **Bestaande leden krijgen een deterministische UUID**: een UUIDv5 uit een vaste namespace, de
  plannersleutel en het `m_`-ID. Twee toestellen die tegelijk migreren, berekenen daardoor dezelfde
  UUID. Er ontstaan geen dubbele leden, en hervatten na uitval maakt geen nieuwe identiteiten.
- **Nieuwe leden** (vanaf 1.5) krijgen een willekeurige UUIDv4.
- **De mapping wordt opgeslagen.** De migratie bewaart haar status als `meta.migration15` (`mapping`,
  dan `rewriting`, dan `done`), samen met de mapping. De uitvoering:
  1. eerst wordt de mapping met een gecontroleerde schrijfactie (ETag) vastgelegd;
  2. daarna worden de verwijzingen omgezet.
- **Bij een conflict wint de opgeslagen mapping.** Staat er al een mapping op de server, dan wordt
  die hergebruikt en wordt de lokale berekening verworpen. Door de deterministische afleiding zijn
  ze normaal gelijk; een verschil is een fout die de migratie stopt.
- **Omzetten is idempotent.** `resolveMember()` begrijpt zowel `m_` als UUID. Een tweede keer omzetten
  verandert dus niets.
- **`m_`-aliassen** zijn uniek binnen het huishouden en worden nooit hergebruikt.
- **In 1.12** (import) gaan de UUID's ongewijzigd mee als `household_members.id`. De `m_`-ID's
  worden aliassen in `legacy_ids`. Er volgt dus geen tweede omzetting van verwijzingen.

### 2.4 Correcties: een beslislogboek zonder klokken

- **Opslag.** Beslissingen worden een logboek met alleen toevoegingen:
  `meta.members.decisions[opId] = {label, state, basedOn: [opId, …], byMember, at}`.
  - `opId` is uniek per handeling. Hetzelfde verzoek opnieuw verzenden is daardoor herkenbaar en
    heeft geen extra effect.
  - `basedOn` is altijd een **lijst** van voorgangers: de `opId`'s van alle beslissingen die deze
    keuze vervangt. De lijst kan leeg zijn, één voorganger bevatten of meerdere:
    - **leeg** (`[]`): de eerste keuze over het label;
    - **één voorganger**: een gewone correctie op de enige geldende keuze;
    - **meerdere voorgangers**: het oplossen van een conflict. De lijst bevat dan **alle**
      conflicterende koppen.
  - Een nieuwe beslissing neemt in `basedOn` altijd alle koppen van dat label op die het toestel op
    dat moment kent.
  - `at` is alleen informatief, voor weergave. Het beslist nooit.
- **Samenvoegen.** Omdat elke beslissing een eigen sleutel is, behoudt de bestaande samenvoeglogica
  (`merge3` op objecten) gelijktijdige beslissingen allebei. Er gaat niets verloren en er ontstaat
  geen mengvorm van twee beslissingen.
- **Uitkomst per label.**
  - De **koppen** zijn de beslissingen die in geen enkele `basedOn`-lijst van een andere beslissing
    voorkomen.
  - Een beslissing is vervangen zodra één beslissing haar in `basedOn` noemt. Dat geldt ook als die
    nieuwere beslissing eerder binnenkomt dan haar voorganger.
  - Eén kop, of meerdere koppen met dezelfde uitkomst: die uitkomst geldt.
  - Meerdere koppen met verschillende uitkomst: een **conflict**. `resolveMember()` geeft dan
    `null`, en de app stelt één vraag om het op te lossen.
  - Het antwoord op die vraag is een nieuwe beslissing met **alle** conflicterende koppen in
    `basedOn`. Daarna is er weer één kop en is het conflict aantoonbaar opgelost. Een antwoord dat
    maar één kop noemt, laat het conflict bestaan.
- **Voorbeeld.**
  1. Toestel A en toestel B zijn allebei offline. A legt `d1` vast ("Lynn" = lid,
     `basedOn: []`), B legt `d2` vast ("Lynn" = geen lid, `basedOn: []`).
  2. Na het samenvoegen zijn `d1` en `d2` allebei kop, met verschillende uitkomst. Er is een
     conflict.
  3. Het antwoord `d3` ("Lynn" = lid, `basedOn: [d1, d2]`) vervangt beide. `d3` is de enige kop en
     "Lynn" is lid.
  4. Een latere correctie `d4` ("Lynn" = geen lid, `basedOn: [d3]`) heeft één voorganger.
- **De bestaande 1.4.1-antwoorden** (`member` / `notMember`) worden in 1.5 omgezet naar één
  beslissing per label met `basedOn: []`. Daarbij wordt het huidige "nee wint" nog één keer
  toegepast, zodat de uitkomst gelijk blijft.
- **Dezelfde persoon herstellen of een andere persoon toevoegen:**
  - **Een label werd ten onrechte "geen lid".** De correctie is een nieuwe beslissing `member` met
    de huidige kop of koppen in `basedOn`. Bestond er nog geen lid, dan ontstaat het lid nu, en alle
    verwijzingen met dat label volgen automatisch. Er hoeft niets met de hand te worden gekoppeld.
  - **Een lid werd ten onrechte gearchiveerd.** Het lid wordt teruggezet, met **dezelfde UUID**.
  - **Een werkelijk andere persoon met dezelfde naam.** Een nieuw lid met een nieuwe UUID. Het label
    wordt dan `ambiguous` (zie 2.2).
- **Doorverwijzingen** (`redirects[oudId] = nieuwId`) zijn alleen voor een bewuste samenvoeging van
  twee dubbele leden. Ze blijven binnen hetzelfde huishouden, vormen nooit een kringloop, en zijn
  geen automatische uitweg bij naamverwarring.

### 2.5 Identiteit tegenover autorisatie (Supabase)

Vier handelingen worden apart beschreven en apart afgedwongen.

| Handeling | Wat er gebeurt | Wat het huidige schema verhindert of mist |
| --- | --- | --- |
| **Identiteit en historie behouden** | Het lid en zijn verwijzingen blijven bestaan; `status` wordt `archived`. | Er bestaat nog geen `status`. |
| **Toegang intrekken** | Een gearchiveerd lid of een ontkoppeld account heeft geen toegang meer. | `private.is_member()` kijkt alleen naar `user_id = auth.uid()`. Archiveren trekt dus geen toegang in; het criterium moet ook `status = 'active'` controleren. |
| **Account ontkoppelen of verwijderen** | Het lid blijft bestaan zonder account. | `user_id … on delete cascade` verwijdert de persoon. Met `set null` botst het voor een beheerder op de check `household_members_owner_has_account`, ook als er nog een andere beheerder is. |
| **Beheer overdragen en de laatste beheerder beschermen** | Eerst beheer overdragen (of de beheerder tot lid maken), dan pas ontkoppelen. De laatste beheerder met account kan niet weg zonder overdracht of het opheffen van het huishouden. | `ensure_owner` blokkeert al, maar de volgorde (eerst overdragen, dan ontkoppelen) is nog niet beschreven. `households.created_by … on delete restrict` blokkeert accountverwijdering van de aanmaker. |

## 3. Veiligheid van de migratie in 1.5

### 3.1 Oude schrijvers daadwerkelijk uitsluiten

**Huidige situatie.** De bewaking `meta.minAppVersion` (stap 0.2) wordt alleen bij het *ophalen*
gecontroleerd. Dat laat drie gaten open:

- **Opslaan zonder ETag-controle.** Na één netwerkfout bij een gecontroleerde PUT staat de terugval
  `noConditional` de rest van de sessie aan (`index.html`, `push`).
- **Opslaan bij wegzetten.** `flush()` (bij het naar de achtergrond gaan) schrijft zonder eerst op te
  halen. Met die terugval aan schrijft hij zonder enige controle.
- **Te oude apps.** Apps van vóór 1.0.1 kennen de bewaking helemaal niet.

Een markering in de data is bovendien niet genoeg als slot. Een oude app neemt bij het samenvoegen
elke nieuwe `meta`-waarde van de server gewoon over en stuurt die bij de volgende schrijfactie
terug.

**Eisen:**

1. **Nieuwe clients schrijven veilig (1.4.2).**
   - De terugval naar ongecontroleerd opslaan staat niet langer sessiebreed aan.
   - `flush()` schrijft nooit zonder ETag.
   - De migratie van 1.5 schrijft alleen gecontroleerd.
2. **De server dwingt de uitsluiting af: harde gate vóór de migratie van 1.5.**
   - Geen migratie-schrijfactie van 1.5 voordat de server aantoonbaar elke schrijfactie van een
     verouderde client weigert.
   - Het mechanisme is **nog niet ontworpen en niet bewezen.** Het ontwerp en het bewijs vallen onder
     E6 (5.1).
   - Een aanpassing van de Firebase-configuratie vraagt een apart, expliciet akkoord
     (beslispunt 7).
   - **Een onderzochte variant volstaat niet zoals beschreven:** een Firebase-regel die alleen eist
     dat het meegestuurde schrijftoken (`meta.writeToken`) verschilt van het token op de server.
     1. Een oude client haalt token A op.
     2. Een nieuwe client slaat daarna token B op.
     3. De oude client stuurt bij een ongecontroleerde schrijfactie A terug.
     4. A verschilt van B en wordt dus geaccepteerd, terwijl de schrijver oud is.

     Een tokenvariant mag alleen worden gekozen als ze aantoonbaar aan het acceptatiescenario
     hieronder voldoet.
   - **Acceptatiescenario (verplicht, in de geïsoleerde tests, zie 6):** na de migratie kan een oude
     client de server niet meer wijzigen. Dat geldt ook
     - als die client eerder een token (of andere servermarkering) heeft opgehaald en dat terugstuurt;
     - voor schrijfacties van die client die al onderweg waren of in een wachtrij stonden
       (bijvoorbeeld een `flush()` bij het wegzetten, of een herpoging na een netwerkfout).
3. **Offline wijzigingen van een oude app gaan niet verloren.**
   - Ze blijven in de lokale cache van dat toestel.
   - Na de update past de nieuwe app dezelfde deterministische mapping (2.3) toe op die cache,
     voordat hij samenvoegt.
   - Daardoor komen er geen oude identiteiten terug en verdwijnt er niets stil.
   - Kan de cache niet worden omgezet, dan blijft hij onaangeroerd bewaard en meldt de app dat.

### 3.2 Gedrag bij fouten in cache en opslag

- **Mislukt het opslaan van de herstelkopie vóór de migratie** (download niet bevestigd, serverkopie
  niet teruggelezen, of `localStorage` vol), dan **start de migratie niet**.
- **Mislukt het schrijven naar de lokale cache terwijl er niet-gesynchroniseerde wijzigingen zijn**,
  dan:
  - toont de app een blijvende melding ("Je wijzigingen zijn nog niet veilig bewaard");
  - claimt hij niet dat iets is opgeslagen;
  - probeert hij direct te synchroniseren.
- **Een lege `catch` mag niet meer verbergen dat bewaren is mislukt.**

### 3.3 Herstel: huidige stand en eis

**Huidige stand** (feitelijk; gecorrigeerd na de review):

- **Rollback van het ledenregister** (`huisplanLeden.terugdraaien()`): gebruikt de blijvende lokale
  opslag (`plannerLedenBackup`). Dat werkt ook na herladen, maar alleen op het toestel dat migreerde
  en alleen voor het register.
- **"Terugzetten" van een back-upbestand** (Instellingen): vervangt alle data. Ongedaan maken kan
  alleen met de melding direct daarna, binnen dezelfde sessie.
- **De server** (Firebase) bewaart geen eerdere versies.

**Dit is geen volledige herstelprocedure voor verloren of overschreven huishouddata.**

**Eis vóór 1.5 (E1):**
- een herstelkopie buiten het toestel (een bevestigde download, of een serverkopie die wordt
  teruggelezen);
- een geteste hersteloefening op een kopie, niet op de echte planner.

### 3.4 Bestaande data classificeren (E5)

E5 levert meer op dan een telling. Het onderzoek gebeurt op een gecontroleerde export, niet op de
live planner, en levert per veld:

1. de vorm, en of elk element een `id` heeft;
2. het gedrag bij samenvoegen (per element of "lokaal wint");
3. welke persoonsverwijzingen het veld bevat;
4. de actie per categorie: `id` toevoegen, ongemoeid laten of apart behandelen;
5. welke onopgeloste gevallen 1.5 blokkeren.

**Eerste indeling** (uit `docs/dataformaat-v1.md`; wordt door E5 bevestigd of gecorrigeerd):

| Categorie | Velden | Persoonsverwijzingen (1.5) |
| --- | --- | --- |
| **Zelfstandig item** | `tasks`, `multiDayTasks`, `recurring`, `backlog`, `inbox`, `boodschappen`, `lijsten[].items`, `bestellingen`, `onderhoud`, `garanties`, `vervaldata`, `verjaardagen`, `vakanties`, `notities`, `recepten`, `gewoonten`, `budget` | `assignedTo`, `author`, `addedBy`, `editedBy`, `reactions`; `verjaardagen.naam` is een naam, geen lid |
| **Onderdeel van een item** | `vakanties[].paklijst` (kolom = label), `vakanties[].todos`, `vakanties[].budget.uitgaven`, `onderhoud[].log` | paklijstkolommen = labels (2.2) |
| **Afvinkhistorie en logboek** | `recurringDone`, `gewoontenDone`, `huisgeheugen`, `boodschappenHistory` (zonder `id`) | `huisgeheugen.auteur` |
| **Per persoon of per dag** | `wieIsWaar`, `verlanglijstjes` (sleutel = naam), `maaltijdplan`, `notes` | sleutels en `claimedBy` |
| **Instelling** | `winkels`, `boodCatOverrides`, `vasteBoodschappen`, `vakantiePersonen`, `budgetCustomCats`, vlaggen (`*Seeded`, `winkelsSet`) | `vakantiePersonen` = labels |
| **Archief, niet zichtbaar** | `cadeaus`, `briefjes`, `notitieboek` | geen; ongemoeid laten |

Deze indeling is ook nodig vóór de itemmigratie van fase 2 en vóór een gesloten waardenlijst voor
`kind` in Supabase. Niet alles hoeft een item te worden.

## 4. Items en relaties (voor fase 2; niet voor 1.4.2)

### 4.1 Gemeenschappelijk tegenover per type

- **Gemeenschappelijk voor elk item:**
  - `id`: een UUID, uniek binnen het huishouden en niet per collectie;
  - `household`;
  - `kind`;
  - `createdAt`/`createdBy`, `updatedAt`, `rev`, `deletedAt` (grafsteen).
- **Per type:** de betekenisvolle velden.
  - Een taak of boodschap heeft `status` (open of klaar), `when` en `memberIds`.
  - Een verjaardag heeft een datum en een persoon, maar geen "klaar".
  - Een vakantie heeft een periode.
- **Weergaven** (Vandaag, Agenda) combineren deze typen zonder ze tot taken te reduceren.
- **Een ander type krijgen** gebeurt alleen via een betekenisvolle conversie (bijvoorbeeld van "Ooit"
  naar taak). Het `id` blijft dan gelijk en de typespecifieke velden worden omgezet. Een vrij
  wisselbare `kind` zonder regels is er niet.

### 4.2 Relaties

| Relatie | Betekenis | Toegestane doelen | Gedrag |
| --- | --- | --- | --- |
| `context` | hoort bij | vakantie, (later) project | Informatief. De taak blijft bestaan als het doel wordt gearchiveerd; de relatie toont dan "(gearchiveerd)". |
| `about` | gaat over een specifieke gebeurtenis | één *voorkomen* van een verjaardag of afspraak (zie 4.4) | Mag een afgeleide deadline geven (zie 4.4). |
| `supports` | helpt bij; geen gedeelde status | taak of boodschap | Informatief. Klaar zijn wordt nooit doorgegeven. |

- **Herkomst** ("komt voort uit een invoer of foto") wordt **pas in fase 3** uitgewerkt. Dan:
  - wijst de relatie van het gemaakte item naar een invoerrecord;
  - is het invoerrecord geen itemtype;
  - is voor het ongedaan maken van een hele invoer een handelingslogboek nodig, met welke items
    zijn gemaakt en of iemand ze daarna heeft aangepast.

**Regels voor alle relaties:**
- beide kanten horen bij hetzelfde huishouden;
- een relatie wijst naar een `id`;
- verwijderen of archiveren van het doel verwijdert de relatie niet stil;
- het terugvinden ("welke taken horen bij deze vakantie?") gaat via een index of zoekopdracht op
  `links`, niet via een gekopieerde lijst op het doel.

### 4.3 Drie uitgewerkte voorbeelden

1. **"Luiers halen vanmiddag".** Eén `shopping`-item met `when` (vandaag, middag), zichtbaar in
   Boodschappen en op Vandaag. Eén keer afvinken werkt overal door.
2. **"Zonnebrand kopen" en "Zonnebrand inpakken" voor de vakantie Frankrijk.**
   - Kopen is een `shopping`-item met `context` → vakantie.
   - Inpakken is een paklijst-onderdeel van de vakantie.
   - Kopen heeft `supports` → inpakken.
   - Gekocht betekent niet ingepakt.
3. **"Cadeau voor oma regelen".** Een `task` met `about` → *de verjaardag van oma in 2026*, dus één
   voorkomen en niet de jaarlijkse reeks. Er is een afgeleide deadline (zie 4.4). Is de taak klaar,
   dan blijft de verjaardag zoals hij is; volgend jaar ontstaat geen automatisch nieuw cadeau.

### 4.4 Herhaling en afgeleide datums (klein contract, vóór die functionaliteit)

- **Reeks tegenover voorkomen.** Een jaarlijkse verjaardag is een reeks. Een relatie wijst naar één
  voorkomen (`{seriesId, date}`).
- **Hele dag tegenover tijdstip.** `when` is een datum (hele dag), een datum met dagdeel, of een
  datum met tijd. Een dagdeel krijgt pas een standaardtijd als dat nodig is, bijvoorbeeld voor een
  herinnering.
- **Afgeleid tegenover bewust overschreven.** Een afgeleide deadline (bijvoorbeeld de dag vóór de
  verjaardag, of de week vóór vertrek) schuift mee met het doel. Wordt hij met de hand aangepast,
  dan blijft hij staan (`dueOverride`).
- **Afronden bij herhaling.** Afronden geldt voor één voorkomen (zoals nu `recurringDone` per
  datum), niet voor de reeks.

### 4.5 Vandaag en de centrale `+`

- **Vandaag** is een projectie: een selectie uit de items, zonder ze te wijzigen.
  - Het huidige doorschuiven van open taken (in `renderVandaag()`) wordt een weergave ("nog open
    sinds di").
  - Wanneer dat gebeurt, is een aparte keuze (beslispunt 6). Het hangt niet aan de migratie van 1.5.
- **De centrale `+`:**
  - de parser (stap 3.2) levert een lijst acties met relaties op;
  - binnen expliciet verleende toestemming mag een actie, ook een wijziging, zelfstandig worden
    uitgevoerd, zichtbaar en herstelbaar (beslissing 1);
  - zonder die toestemming, of bij wezenlijke gevolgen, wordt een wijziging aan een bestaand plan
    voorgesteld in plaats van stil uitgevoerd;
  - een correctie wijzigt alleen het gecorrigeerde deel.
- **Gedachte, voornemen en besluit:**
  - gedachte → notitie of "Nog uitzoeken";
  - voornemen → taak zonder datum ("Ooit");
  - besluit → taak met moment of persoon.
- **Boodschappenhistorie is geen voorraadkennis.**

## 5. Roadmap en voorwaarden

### 5.1 Stap 1.4.2: voorbereiding 1.5 (klein)

1.4.2 bevat **werkende gedragswijzigingen in de code, maar geen datamigratie.** De omzetting van
bestaande data gebeurt pas in 1.5, onder de schrijfblokkade.

| # | Voorwaarde vóór 1.5 | Aard |
| --- | --- | --- |
| **E1** | Herstelkopie buiten het toestel en een geteste hersteloefening op een kopie (3.3) | code + oefening |
| **E2** | Veilig schrijven: geen sessiebrede terugval naar ongecontroleerd opslaan, `flush()` alleen met ETag, en de migratie alleen gecontroleerd (3.1, eis 1) | code |
| **E3** | Gedrag bij cache- en opslagfouten (3.2) | code |
| **E4** | Het beslislogboek (2.4) kan worden gelezen en geschreven; `resolveMember()` volgens 2.2–2.4. Zonder schermen. | code |
| **E5** | Classificatie van de bestaande data op een export (3.4) | onderzoek |
| **E6** | Het mechanisme voor het server-side uitsluiten van oude schrijvers (3.1, eis 2) ontwerpen en in een geïsoleerde omgeving bewijzen tegen het acceptatiescenario van 3.1, plus een besluit over de uitvoering. Het doorvoeren in Firebase gebeurt aan het begin van 1.5, na akkoord. Geen migratie-schrijfactie zonder dit bewijs. | ontwerp + bewijs + besluit |

**Niet in 1.4.2:** items, relaties, herhaling, het wijzigen van Vandaag, de parser, en de schermen
voor ledenbeheer.

**Grens met 1.6.** 1.4.2 en 1.5 leggen de data en de regels vast. Een correctie kan tot 1.6 via de
bestaande bevestigingsdialoog of het ontwikkelhulpmiddel (`huisplanLeden`). De schermen voor
ledenbeheer, herstel en samenvoegen komen in 1.6.

### 5.2 Supabase: vóór de eerste echte schrijver

Schemawijzigingen die lege tabellen aannemen, moeten zijn doorgevoerd **vóór de eerste echte
schrijver.**
- Op staging vóór de eerste tests met data in 1.7–1.8.
- In productie vóór het eerste echte huishouden. Volgens de roadmap start dat in 1.8 ("een nieuw
  huishouden start volledig in Supabase"), dus uiterlijk vóór 1.8 in productie, niet pas vóór 1.10.

Wat later komt, moet zijn ontworpen voor gevulde tabellen.

Nu wordt geen migratie uitgevoerd. Het gaat om deze ontwerpbeslissingen:

- **`items`:**
  - de sleutel wordt `(household_id, id)` met een UUID;
  - het type is geen deel van de sleutel;
  - een typewissel gaat alleen via een conversie (4.1);
  - een gesloten waardenlijst voor het type pas na de classificatie (3.4).
- **`household_members`:**
  - een kolom `status` (`active`/`archived`) en `legacy_ids` (uniek binnen het huishouden);
  - `private.is_member()` en `is_owner()` tellen alleen actieve leden mee;
  - het ontkoppelen van een account volgt 2.5 (eerst beheer overdragen, dan ontkoppelen). Een kale
    `set null` is niet genoeg, door de check op beheerders.
- **`households.created_by`:** mag accountverwijdering niet blokkeren.
- **Ledensoort:** een vertaling voor `kind = 'unknown'` (de app gebruikt die waarde sinds 1.4), of
  een uitbreiding van de toegestane waarden.
- **Grafstenen en revisies:** bijwerken op basis van `rev`, en een regel voor verwijderen tegenover
  offline bewerken.
- **Relaties:** blijven binnen hetzelfde huishouden (database-check of controle in de functie).
- **Privacy-gate van 1.10:** blijft daarnaast gelden.

### 5.3 Overige roadmapvoorstellen

- **Itemcontract vóór 2.1.** Het minimale itemcontract (4.1–4.4) wordt vastgelegd vóór de bredere
  weergaven van 2.1. Zo bouwt 2.1 Vandaag direct als projectie, zonder tijdelijke conversielogica.
  Een volledige dataconversie hoeft daar niet op te wachten.
- **Gebruik.** Nu al kwalitatief observeren in het eigen huishouden; een eenvoudig dagboek is genoeg.
  Meten met tellers volgt na 1.10.
- **Een prototype moet echt geïsoleerd zijn.** De map `/test/` is dat niet: die deelt het domein en
  de lokale opslag (`plannerDbUrl`, `plannerKey`) met de live-app en verbindt dus met de echte
  planner. Een prototype:
  - leest die sleutels niet;
  - gebruikt een eigen, nagebootste opslag;
  - maakt geen netwerkverbinding met Firebase of Supabase;
  - staat bij voorkeur op een eigen adres.
- **Schoolbrief-onderzoek.** Alleen met fictieve of volledig geanonimiseerde voorbeelden, niet met
  echte brieven.

## 6. Teststrategie (bewijs vóór 1.5 live gaat)

Op een geïsoleerde omgeving met fictieve data, niet op de echte planner:

1. **Twee migratoren tegelijk:** zelfde UUID's, geen dubbele leden.
2. **Onderbroken migratie hervat:** idempotent, geen nieuwe identiteiten.
3. **Afwijkende klokken:** de uitkomst van het beslislogboek hangt niet van `at` af.
4. **Gelijktijdige tegenstrijdige correcties:**
   - de uitkomst is een conflict met `null`, niet een willekeurige winnaar;
   - een oplossing met alle conflicterende koppen in `basedOn` levert één kop op;
   - een antwoord dat maar één kop noemt, laat het conflict bestaan.
5. **Oude schrijver na de migratie (acceptatiescenario van 3.1):**
   - wordt door de server geweigerd, ook met een eerder opgehaald token of andere servermarkering;
   - ook schrijfacties die al onderweg waren of in een wachtrij stonden, wijzigen de server niet;
   - zijn offline wijzigingen komen na de update terug, met omgezette identiteiten.
6. **Mislukte opslag** (`localStorage` vol, herstelkopie niet bevestigd): de migratie start niet, en
   de app meldt dat er niet-bewaarde wijzigingen zijn.
7. **Gelijke namen:** het label wordt `ambiguous` en de verwijzing blijft tekst.
8. **Herstel:** een hersteloefening op een kopie levert aantoonbaar de stand van vóór de migratie op.
9. **(Supabase, vóór 1.8)** Relaties over huishoudgrenzen worden geweigerd. Archiveren trekt
   toegang in. Ontkoppelen en overdragen volgen 2.5.

## 7. Beslispunten

| # | Beslispunt | Advies |
| --- | --- | --- |
| 1 | De member-UUID als doel-ID in 1.5: deterministisch (UUIDv5) voor bestaande leden, willekeurig voor nieuwe, `m_…` als alias | Ja |
| 2 | Het beslislogboek met `opId` en een lijst voorgangers (`basedOn: []`, één of meerdere) vervangt "nee wint". Conflicten geven `null` en één vraag; het antwoord bouwt voort op alle conflicterende koppen. | Ja |
| 3 | Persoonsvelden `memberIds[]`, `byMember`/`byLabel` en `forLabel`; identiteit is geen autorisatie | Ja |
| 4 | Supabase: een item-ID dat niet van de collectie afhangt, typewissel alleen via conversie, de schemafixes uit 5.2, en dat alles **vóór de eerste echte schrijver** (uiterlijk vóór 1.8 in productie) | Ja |
| 5 | 1.4.2 als in 5.1: E1 t/m E6, code zonder datamigratie, verder niets | Ja |
| 6 | Vandaag als weergave: de ontwerpregel geldt nu. Wanneer wordt het doorschuiven omgebouwd? | **Open:** een eigen kleine stap vóór 2.1, of samen met 2.1 |
| 7 | Uitsluiten van oude schrijvers aan de serverkant | **De eis is besluitrijp:** een harde gate vóór de migratie van 1.5. **Open onder E6:** het mechanisme (nog te ontwerpen en te bewijzen tegen het acceptatiescenario van 3.1) en het akkoord om de Firebase-configuratie te wijzigen. |

## 8. Verwerking van de review (Codex, PR #12)

**Overgenomen:**
- een herhaalbare migratiemapping;
- een correctiemodel zonder klokken;
- labels, kandidaten en leden als aparte niveaus;
- dezelfde persoon herstellen tegenover een nieuwe persoon;
- beperkingen op doorverwijzingen;
- identiteit tegenover autorisatie, inclusief de check op beheerders en `is_member`;
- oude schrijvers aan de serverkant uitsluiten;
- gedrag bij opslagfouten;
- classificatie van de data;
- minder gemeenschappelijke itemvelden;
- afgebakende relaties;
- een klein contract voor herhaling en datums;
- isolatie van prototypes;
- privacy bij schoolbrieven;
- automatisering volgens beslissing 1;
- de grens tussen 1.4.2 en 1.6;
- de Supabase-timing vóór de eerste schrijver;
- het itemcontract vóór 2.1;
- nu al kwalitatief observeren;
- de correctie van de herstelbeschrijving;
- een teststrategie.

**Bewust anders opgelost:**
- **Mapping:** een deterministische UUIDv5 in plaats van alleen één keer gezamenlijk vastleggen.
  Gelijktijdige migratoren komen dan vanzelf op dezelfde uitkomst. De opgeslagen mapping blijft
  leidend en is een extra controle.
- **Conflictmodel:** een logboek met alleen toevoegingen, waarin elke beslissing een eigen sleutel
  heeft. Daardoor werkt het met de bestaande samenvoeglogica, zonder nieuwe synchronisatielaag.
- **Oude schrijvers:** de review noemt het probleem; dit voorstel voegt het concrete gat in `flush()`
  toe, plus de valkuil dat een markering in `meta` door oude apps gewoon wordt overgenomen.
- **Herkomstrelatie (`source`):** niet nauwkeuriger gemaakt maar uitgesteld naar fase 3, omdat die
  pas met een handelingslogboek zinvol is.
