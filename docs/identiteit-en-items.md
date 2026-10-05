# Identiteit en items: contract (voorstel)

**Status: voorstel, nog niet vastgesteld.** Dit document legt vast hoe Huisplan personen en items
identificeert, en hoe items aan elkaar gekoppeld zijn. Het moet vastliggen voordat fase 1.5 code
krijgt.

- **Opgesteld:** 6 oktober 2026, na een onafhankelijke codereview (Codex) en een eigen controle van de
  code op `main` (`b6ea4c5`).
- **Plaats in de leesvolgorde:** stap 4 uit `CLAUDE.md` (fase- en technische documentatie), dus na
  `PRODUCT_PRINCIPLES.md`, `docs/productkompas-beslissingen.md` en `docs/roadmap.md`. Bij
  tegenstrijdigheid gaan die drie voor.
- **Opbouw:**
  1. de uitgangspunten, die als ontwerpregels gelden;
  2. het identiteitscontract en het item- en relatiecontract, als uitwerking;
  3. de zes beslispunten die nog open staan;
  4. de voorgestelde roadmapwijzigingen en de voorwaarden voor Supabase.
- Er wordt nog niets geïmplementeerd. Geen code en geen Supabase-migratie.

## 1. Uitgangspunten

### Personen

1. **Een huishoudlid en een account zijn verschillende identiteiten.**
   - Een account (een login) is van een gebruiker.
   - Een huishoudlid is een persoon in het huishouden, met of zonder account.
   - Een kind zonder account is een volwaardig lid. Een account kan aan hoogstens één lid per
     huishouden gekoppeld zijn.
2. **De UUID van een huishoudlid wordt vanaf fase 1.5 de blijvende doelidentiteit.** Dezelfde UUID
   wordt later `household_members.id` in Supabase.
3. **Bestaande `m_…`-ID's blijven als legacy-alias behouden.** Ze verwijzen naar de UUID en blijven
   overal leesbaar, bijvoorbeeld in `plannerMemberId` op een toestel.
4. **`resolveMember()` maakt nooit zelfstandig een huishoudlid aan en geeft bij twijfel `null`
   terug.** Twijfel betekent: geen treffer, meer dan één treffer, of een naam die als niet-lid is
   aangemerkt.
5. **Activiteit of auteurschap betekent nooit automatisch lidmaatschap.** Wie iets toevoegt,
   bewerkt, claimt of erop reageert, wordt daardoor geen huishoudlid.
6. **Gasten, oppassen en andere niet-leden worden geen huishoudlid door activiteit.** Hun naam
   blijft een label bij wat ze deden.
7. **Twee personen met dezelfde naam moeten ondersteund kunnen worden.** De identiteit is nooit de
   naam.
8. **Bij correcties op lidmaatschap wint een nieuwere bewuste keuze veilig van een oudere keuze.**
   Ook een oud of offline toestel mag een correctie niet terugdraaien.

### Items

9. **Eén item kan in meerdere contexten of weergaven zichtbaar zijn zonder te worden gekopieerd.**
   Eén keer afronden werkt overal door.
10. **Gerelateerde handelingen mogen aparte, gekoppelde items zijn.** Samenhang betekent niet
    automatisch hetzelfde item.
11. **Ontwerpregel: "Als het ene klaar is, is het andere dan per definitie ook klaar?"**
    - Ja: het is **één item** met meerdere weergaven.
    - Nee: het zijn **twee items** met een relatie.
12. **Vandaag is uiteindelijk een weergave.** Alleen het tonen (renderen) van Vandaag mag geen
    huishouddata wijzigen.
13. **De centrale `+` moet later één invoer kunnen vertalen naar meerdere gekoppelde acties.**
14. **Huisplan bouwt geen generiek graafmodel en geen universele alles-entiteit.** Er is een klein,
    vast aantal soorten items en relaties met een vaste betekenis.

## 2. Identiteitscontract

### 2.1 Begrippen en hun technische vorm

| Begrip | Vorm | Regel |
| --- | --- | --- |
| **Account** | `auth.users.id`, alleen in Supabase. In de Firebase-tijd bestaat dit niet; daar is er alleen een toestel. | Nooit hetzelfde als een lid. De koppeling loopt via `household_members.user_id` en ontstaat alleen via een uitnodiging. |
| **Huishoudlid** | member-UUID, met `name`, `kind`, `color`, `status`, `legacyIds[]` | Ontstaat alleen door een expliciete keuze: het register met bevestiging, ledenbeheer of een uitnodiging. |
| **Actor** (wie iets invoert) | `byMember` (UUID of `null`) en `byLabel` (tekst of `null`) | `byMember` alleen als het toestel aan een lid gekoppeld is. Anders alleen `byLabel`. Maakt nooit een lid aan. |
| **Toegewezen persoon** | `memberIds[]`; voor niet-leden `forLabel` (tekst) | Alleen bestaande leden in `memberIds`. "Voor oma" blijft tekst. |
| **Historisch auteurslabel** | de oorspronkelijke tekst blijft staan (`legacyName`) | Alleen voor weergave. Geen bewijs van lidmaatschap. |
| **Gast, oppas, niet-lid** | alleen een label, eventueel met een toestel-ID | Wordt nooit lid door activiteit. In Supabase kan een niet-lid niet schrijven. |

### 2.2 Blijvende identiteit van een lid

- Een lid krijgt een **willekeurige UUID**, nooit afgeleid van de naam.
- **In 1.5** krijgt elk lid in het bestaande register een UUID. Het oude `m_…`-ID gaat naar
  `legacyIds[]`.
- **Nieuwe leden** krijgen vanaf 1.5 altijd direct een willekeurige UUID. De naam-afleiding
  `memberIdFor(name)` dient daarna alleen nog om bij het samenvoegen dubbele oude registers te
  herkennen.
- **In 1.12** (import) gaan de UUID's ongewijzigd mee als `household_members.id`. De `m_`-ID's
  worden aliassen. Zo worden alle verwijzingen maar **één keer** omgezet, in 1.5, en niet nog
  eens bij de overstap.
- `resolveMember(x)` accepteert een UUID, een `m_`-alias, een naam of de oude waarden
  `'me'`/`'partner'`. Het volgt doorverwijzingen (zie 2.4) en geeft een lid of `null` terug.

### 2.3 Gelijke namen

- De identiteit is de UUID. Op het scherm maken een kleur, een initiaal of een bijnaam het verschil
  duidelijk.
- Zoeken op naam met meer dan één treffer geeft `null`. Bij een migratie blijft de verwijzing dan
  tekst, en wordt die gemarkeerd voor een handmatige keuze.
- De naam-afleiding mag geen nieuwe leden meer maken vanaf het moment dat leden kunnen worden
  toegevoegd (1.6).

### 2.4 Correcties op lidmaatschap

- **Beslissingsrecord.** Elke keuze over een naam wordt vastgelegd als
  `{state: 'member' | 'notMember', rev, at, byMember}`.
- **Conflictregel.** Bij een conflict wint de hoogste `rev`; bij gelijke `rev` het laatste `at`.
  Dit vervangt de 1.4.1-regel **"nee wint"**: die was goed voor tegelijk gegeven eerste antwoorden,
  maar blokkeert een latere bewuste correctie.
- **Oude toestellen.** 1.5 zet `meta.minAppVersion` (de bewaking uit stap 0.2). Een oude 1.4.x-app
  stopt dan met opslaan en kan geen correctie terugdraaien.
- **Van lid naar niet-lid.** Het lid krijgt `status: 'archived'` en wordt nooit hard verwijderd.
  Verwijzingen blijven geldig en tonen de naam.
- **Van niet-lid naar lid.** Er komt een nieuw lid met een nieuwe UUID bij. Oude labels worden
  alleen na een expliciete vraag aan dit lid gekoppeld ("Ook eerdere vermeldingen van Oma aan dit
  lid koppelen?").
- **Twee dubbele leden samenvoegen.** Via `redirects[oudId] = nieuwId`. `resolveMember()` volgt die
  verwijzing, zodat bestaande verwijzingen geldig blijven.
- **Scope vóór 1.5.** Alleen dit datacontract hoort vóór 1.5. De schermen voor ledenbeheer blijven
  in 1.6.

## 3. Item- en relatiecontract

### 3.1 Gemeenschappelijke identiteit van elk item

| Veld | Betekenis |
| --- | --- |
| `id` | UUID, uniek binnen het huishouden (niet per collectie) |
| `kind` | `task`, `shopping`, `event`, `trip`, `birthday` of `note`. Mag veranderen, bijvoorbeeld van "Ooit" naar taak, of van "Nog uitzoeken" naar boodschap. |
| `title` | korte omschrijving |
| `status` | `open`, `done` of `cancelled`, met `doneAt` en `doneBy` |
| `when` | optioneel: datum, tijd, dagdeel, einddatum, herhaling |
| `memberIds[]`, `forLabel` | voor wie (zie 2.1) |
| `links[]` | relaties (zie 3.2) |
| `createdAt`, `createdBy`, `updatedAt`, `rev`, `deletedAt` | audit, conflictdetectie en grafsteen |

Soortspecifieke velden (bijvoorbeeld winkel en categorie bij een boodschap) mogen erbij, maar de
gemeenschappelijke velden hierboven hebben overal dezelfde betekenis.

### 3.2 Relaties

Er zijn vier vaste soorten. Een relatie gaat één stap ver; er wordt niet verder door relaties heen
gezocht. Een relatie wordt opgeslagen op het item als `links: [{rel, to}]`.

| Relatie | Betekenis | Voorbeeld |
| --- | --- | --- |
| `context` | hoort bij | "Vignet regelen" → vakantie Frankrijk |
| `about` | gaat over; een deadline mag daarvan afhangen | "Cadeau voor oma regelen" → verjaardag van oma |
| `supports` | helpt bij; geen gedeelde status | "Zonnebrand kopen" → "Zonnebrand inpakken" |
| `source` | komt voort uit | een invoer of foto → de items die daaruit zijn gemaakt, zodat ze samen ongedaan te maken zijn |

### 3.3 Hetzelfde item of twee gekoppelde items

Gebruik de ontwerpregel uit uitgangspunt 11.

- **"Luiers halen vanmiddag": één item.** Een boodschap met `when`, zichtbaar in Boodschappen en op
  Vandaag. Eén keer afvinken werkt overal door.
- **"Zonnebrand kopen" en "Zonnebrand inpakken": twee items.** Gekocht is niet ingepakt. Ze worden
  gekoppeld met `supports`.
- **"Vignet regelen voor Frankrijk": twee items.** Een taak met `context` naar de vakantie. Zodra
  die relevant wordt, verschijnt de taak op Vandaag.
- **"Cadeau voor oma regelen": twee items.** Een taak met `about` naar de verjaardag, met een
  natuurlijke deadline.

### 3.4 Vandaag en de centrale `+`

- **Vandaag:**
  - toont een selectie uit de items, maar wijzigt ze niet;
  - het huidige doorschuiven van open taken naar vandaag (in `renderVandaag()`) wordt een weergave
    ("nog open sinds di") in plaats van een verplaatsing;
  - wat geregeld of voorbij is, maakt plaats voor wat nog aandacht nodig heeft.
- **De centrale `+`:**
  - de parser (stap 3.2) geeft een **lijst** acties met relaties terug, niet één voorstel;
  - hij maakt alleen nieuwe items of **stelt** een wijziging aan een bestaand item voor. Een
    bestaand betekenisvol plan wordt nooit stilzwijgend gewijzigd;
  - een correctie wijzigt alleen het gecorrigeerde deel.
- **Gedachte, voornemen en besluit** passen op bestaande vormen:
  - gedachte → notitie of "Nog uitzoeken";
  - voornemen → taak zonder datum ("Ooit");
  - besluit → taak met moment of persoon.
- **Boodschappenhistorie is geen voorraadkennis.** Suggesties uit de historie blijven suggesties.

## 4. Beslispunten (open)

Vóór 1.5 code krijgt, beslist de producteigenaar over:

1. **Doel-ID in 1.5.** Wordt de member-UUID het doel-ID van 1.5, met `m_…` als alias?
2. **Correcties.** Vervangen beslissingsrecords met revisie de regel "nee wint", en zet 1.5
   `meta.minAppVersion`?
3. **Veldnamen voor personen.** Komen `byMember`/`byLabel`, `forLabel` en `memberIds[]` er zoals in
   2.1?
4. **Supabase-schema.** Wordt `items` vóór 1.10 omgebouwd naar een UUID-sleutel en een wijzigbare
   `kind`, samen met de schemafixes uit 5.2?
5. **Stap 1.4.2.** Worden E1 t/m E5 (zie 5.1) een aparte stap 1.4.2 vóór 1.5?
6. **Vandaag.** Wordt Vandaag een weergave die niets wijzigt, en wanneer: nu (in 1.4.2) of bij 2.1?

## 5. Voorgestelde roadmapwijzigingen en voorwaarden

### 5.1 Nieuwe stap 1.4.2: voorbereiding 1.5

Voorwaarden vóór de start van 1.5:

| # | Voorwaarde | Waarom |
| --- | --- | --- |
| **E1** | Een betrouwbare back-up vóór de migratie, buiten `localStorage` (download of serverkopie), met een geteste hersteloefening | De vangnetten van 1.4 en 1.4.1 staan alleen in `localStorage`, en de herstelfunctie werkt alleen binnen de sessie |
| **E2** | De migratie van 1.5 schrijft alleen gecontroleerd (ETag). De terugval naar opslaan zonder controle staat niet langer sessiebreed aan na één netwerkfout. | Na één netwerkfout schrijft de app nu de rest van de sessie zonder ETag-controle. Daardoor kan een gelijktijdige wijziging verloren gaan. |
| **E3** | Mislukt opslaan in de lokale cache wordt gedetecteerd en gemeld | De cache negeert nu schrijffouten (bijvoorbeeld een volle opslag door foto's) |
| **E4** | Beslissingsrecords met revisie in plaats van "nee wint" (zie 2.4) | Anders legt 1.5 een niet-corrigeerbare keuze vast in alle verwijzingen |
| **E5** | Een telling, alleen-lezend, van oude lijst-items zonder `id` in de echte data | Een lijst met zo'n item wordt bij samenvoegen in zijn geheel "lokaal wint" |

### 5.2 Voorwaarden voor Supabase vóór 1.10

Dit zijn ontwerpbeslissingen. **Nu wordt geen migratie uitgevoerd.** Ze worden later via een nieuwe
migratie doorgevoerd, terwijl de tabellen nog leeg zijn.

- **`items`:**
  - de sleutel wordt `(household_id, id)`, met `id` als UUID;
  - `coll` wordt een wijzigbare kolom `kind`;
  - nu bevat de sleutel `coll`, en een trigger verbiedt het wijzigen daarvan. Een item kan dus niet
    van soort veranderen.
- **`household_members`:**
  - een kolom `legacy_ids` voor de `m_`-aliassen;
  - `user_id … on delete set null` in plaats van `cascade`. Nu verwijdert het verwijderen van een
    account ook de persoon, en dat strijdt met stap 4.6.
- **`households.created_by`:** het verwijderen van het account van de aanmaker mag niet blokkeren
  (nu `on delete restrict`).
- **Ledensoort:**
  - een vertaalregel voor `kind = 'unknown'`; de app gebruikt die waarde sinds 1.4, maar Supabase
    staat alleen `adult` en `child` toe;
  - of een uitbreiding van die toegestane waarden.
- **Grafstenen en revisies:** een contract voor bijwerken op basis van `rev` en voor
  verwijderen tegenover offline bewerken, inclusief tests.
- **Laatste beheerder:** een proces voor vertrek en accountverwijdering. De trigger `ensure_owner`
  blokkeert al, maar er is geen proces voor wat er dan moet gebeuren.
- **Bestanden:** de privacy van bestanden valt onder de privacy-gate van 1.10. Het opruimen van
  bestanden bij verwijderde items volgt later.

### 5.3 Overige voorstellen

- **Gebruik meten:** direct na 1.10 in plaats van in 2.14, want het is pas zinvol met meerdere
  huishoudens.
- **Een kleine vertical slice:**
  - nu: een klikbaar prototype met nepdata in `test/`, zonder risico voor data;
  - na 2.2: dezelfde stroom op echte data, binnen dit contract.
- **Schoolbrief:** een onderzoek zonder code. Leg echte brieven met de hand aan Claude voor en
  noteer welke acties en relaties eruit komen.
