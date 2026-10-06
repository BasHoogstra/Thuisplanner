# Identiteit en items: contract

**Status: vastgesteld op 6 oktober 2026.** De producteigenaar heeft de zeven architectuurbesluiten
in sectie 7 genomen, daarna besluit 8 als aanvulling op besluit 7, en besluit 9 na de review van het
1.4.2-plan (7.1). Dit document legt vast hoe Huisplan personen en items identificeert, hoe de
persoonsmigratie van fase 1.5 veilig verloopt, en hoe items aan elkaar gekoppeld zijn.

Het is de basis voor 1.4.2 en 1.5. **Eerst 1.4.2, daarna pas 1.5.**

Nog niet besloten, en daarom nog een voorstel:
- de relaties en het contract voor herhaling en afgeleide datums (4.2–4.4);
- de concrete Supabase-schemawijzigingen (5.2). Besluit 4 legt de richting vast; de wijzigingen
  worden apart goedgekeurd vóór de eerste echte Supabase-schrijver;
- de overige roadmapvoorstellen (5.3).

- **Opgesteld:** 6 oktober 2026, op basis van een eigen controle van de code op `main` (`b6ea4c5`).
- **Herzien:** 6 oktober 2026, na de review van Codex op PR #12. Zie sectie 8 voor wat er is
  overgenomen en wat bewust anders is opgelost.
- **Aangevuld:** 6 oktober 2026, met besluit 8 (herbruikbaar verhuisslot; 1.5 en 1.12 blijven
  afzonderlijke migraties) in 3.1, 5.1 en 7.
- **Aangevuld:** 6 oktober 2026, na de review van Codex op het 1.4.2-plan, met besluit 9 (9.1 t/m
  9.9) in 2.3, 2.4, 3.1–3.4, 5.1, 6, 7 en 8.
- **Contract tegenover ontwerp.** Dit document legt alleen eisen en eigenschappen vast. Hoe 1.4.2
  die waarmaakt, staat in het afzonderlijke ontwerpdocument `docs/ontwerp-1.4.2.md`. Dat ontwerp
  is niet bindend zolang het niet is goedgekeurd. Bij tegenstrijdigheid gaat dit contract voor.
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
  7. architectuurbesluiten;
  8. verwerking van de review.
- Dit document zelf implementeert niets. De implementatie volgt in 1.4.2 en 1.5. Een wijziging aan
  de Firebase-configuratie gebeurt niet zonder apart, expliciet akkoord (besluit 7).

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
- **Namespace en invoercodering liggen vast vóór gebruik (besluit 9.9).** De UUIDv5-namespace én
  de exacte invoercodering (welke gegevens, in welke volgorde, met welk scheidingsteken, welke
  normalisatie en welke tekencodering) worden vóór het eerste gebruik definitief vastgelegd en met
  vaste testvectoren getest. Daarna veranderen ze nooit meer. Het voorstel staat in het
  ontwerpdocument; het wordt pas na goedkeuring contract.
- **Nieuwe leden** (vanaf 1.5) krijgen een willekeurige UUIDv4.
- **De migratie gaat van een afgesloten bron naar een nieuw doel (besluit 8).** De migratie
  wijzigt de bron niet ter plekke. Eerst wordt het verhuisslot op de bron actief en bewijst een
  zelftest dat schrijven op de bron wordt geweigerd (3.1, eis 4). Pas daarna wordt de bron gelezen
  en het doel beschreven. Op de bron wordt daarna niets meer geschreven, ook geen status of mapping.
  De afgesloten bron blijft ongewijzigd en is de vaste invoer voor hervatten en herstel.
- **Mapping en voortgang staan op het doel.** Het doel bevat de mapping en de voortgang van de
  omzetting (in dit contract `meta.migration15` genoemd). De volgorde:
  1. het doel wordt veilig geïnitialiseerd (3.1, eis 4);
  2. de mapping wordt met een gecontroleerde schrijfactie (ETag) op het doel vastgelegd;
  3. daarna worden de verwijzingen omgezet;
  4. het resultaat wordt teruggelezen en gecontroleerd;
  5. pas daarna wordt de gereedstatus gezet, op het beschermde control-gedeelte (3.1, eis 4). Het
     doel wordt pas daarna door de app gebruikt.

  De precieze statusnamen, en welke status op het doel en welke op het control-gedeelte staat,
  horen bij het ontwerp (E6) en worden pas na het bewijs vastgelegd.
- **Bij een conflict wint de opgeslagen mapping.** Staat er al een mapping op het doel, dan wordt
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
- **Beslissingen zijn onveranderlijk (besluit 9.2).** Twee beslissingen met hetzelfde `opId` maar
  een verschillende inhoud zijn een **harde fout**:
  - er wordt geen winnaar gekozen en er ontstaat geen mengvorm. De gewone samenvoeglogica zou bij
    een verschil in één veld de lokale waarde kiezen; daarom wordt dit vóór het samenvoegen
    gecontroleerd;
  - de uitkomst voor het betrokken onderwerp wordt `null`, totdat het verschil is onderzocht;
  - de app meldt de fout. Een migratie die zo'n fout tegenkomt, stopt.

  Hetzelfde `opId` met dezelfde inhoud is gewoon een herhaald verzoek en heeft geen extra effect.
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
  toegepast, zodat de uitkomst gelijk blijft. Het `opId` van zo'n omgezette beslissing is
  deterministisch, zodat twee migratoren dezelfde beslissing maken.
- **Een afzonderlijk contract voor `same`/`different` (besluit 9.2).** 1.4.1 bewaart ook antwoorden
  op de vraag of twee spellingen dezelfde persoon zijn (`same`/`different`, "twee personen" wint).
  Dat is een ander onderwerp dan lidmaatschap en krijgt een eigen semantisch contract:
  - **Onderwerp.** Een paarbeslissing gaat over een ongeordend paar van twee genormaliseerde
    labels. Het paar wordt altijd in vaste volgorde vastgelegd, zodat (A, B) en (B, A) hetzelfde
    onderwerp zijn. Een lidmaatschapsbeslissing gaat over één label.
  - **Uitkomsten.** `same`: de twee labels duiden dezelfde persoon aan. `different`: de twee labels
    worden nooit tot één persoon samengevoegd.
  - **Gedeelde motor, gescheiden betekenis.** De logboekmotor (`opId`, `basedOn`, koppen,
    conflicten, onveranderlijkheid) mag voor beide onderwerpen dezelfde zijn. Het onderwerptype
    staat altijd expliciet in de beslissing. `basedOn` verwijst alleen naar beslissingen van
    hetzelfde onderwerptype en hetzelfde onderwerp; een verwijzing daarbuiten is ongeldig.
  - **Geen impliciete effecten.** Een paarbeslissing verandert nooit een lidmaatschap, en een
    lidmaatschapsbeslissing voegt nooit twee labels samen. Wat het samen betekent, staat alleen in
    expliciete effectregels:
    - `same` met een eenduidige, gelijke lidmaatschapsuitkomst voor beide labels: beide labels
      verwijzen naar dezelfde persoon;
    - `same` terwijl de lidmaatschapsuitkomsten van de twee labels verschillen of onbekend zijn:
      geen verwijzing (`null`) en één vraag; niets wordt vanzelf lid of geen lid;
    - `different`, of een conflict tussen paarbeslissingen: nooit samenvoegen. Bij een conflict
      volgt één vraag.
  - **Omzetting uit 1.4.1.** De `same`/`different`-antwoorden worden in 1.5 omgezet naar één
    paarbeslissing per paar met `basedOn: []` en een deterministisch `opId`. Het huidige "twee
    personen wint" wordt daarbij nog één keer toegepast.
  - De opslagplaats en de veldnamen van paarbeslissingen horen bij het ontwerp.
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
   - **Zonder bruikbare ETag wordt niet geschreven (besluit 9.1).** Er is geen terugval naar
     "eerst ophalen, dan ongecontroleerd opslaan", ook niet per schrijfactie. De wijziging blijft
     lokaal bewaard en de app meldt dat opslaan nu niet veilig kan.
   - **Eén schrijfcoördinatiemodel.** Opslaan, wegzetten (`flush`), laden, herpogingen en
     periodiek ophalen volgen samen één model. Er is hooguit één schrijfactie tegelijk onderweg.
     Elke lokale wijziging heeft een oplopende generatie. Een antwoord dat later binnenkomt dan een
     nieuwere generatie, mag die nieuwere generatie nooit terugzetten: niet in de data, niet in de
     basis, niet in de ETag en niet in de cache. Het model zelf staat in het ontwerpdocument.
2. **De server dwingt de uitsluiting af: harde gate vóór de migratie van 1.5.**
   - Geen migratie-schrijfactie van 1.5 voordat de server aantoonbaar elke schrijfactie van een
     verouderde client weigert.
   - Het **principe** ligt vast: een server-side verhuisslot per bronpad (besluit 8, zie eis 4
     hieronder). Het **concrete mechanisme is nog niet ontworpen en niet bewezen.** Het ontwerp en
     het bewijs vallen onder E6 (5.1).
   - De eis is besloten (besluit 7). Een aanpassing van de Firebase-configuratie vraagt daarnaast
     een apart, expliciet akkoord.
   - **Onderzoeksrichting: optie A (besluit 9.3).** Het onderzoek in E6 werkt optie A uit: het
     bronpad afsluiten en naar een nieuw doel migreren. Dat is een keuze voor het onderzoek, geen
     toestemming om Firebase-regels te wijzigen of een slot te activeren.
   - **Voorwaarden vóór het bewijs** (besluiten 9.4–9.6):
     - het bewijs gebeurt in de Firebase Emulator, met een harde lokale netwerkallowlist: een test
       die een ander adres dan de lokale emulator probeert te bereiken, faalt. Een echt
       Firebase-testproject vraagt een afzonderlijk akkoord;
     - de werkelijke Firebase-regels van de betrokken projecten worden vooraf alleen-lezend
       gecontroleerd. Het bewijs geldt alleen voor regels die aantoonbaar dezelfde vorm hebben;
     - de betrokken Firebase-projecten en de historische clientversies die nog in gebruik kunnen
       zijn, worden geïnventariseerd. Het bewijs dekt ook de oudste versie die nog kan schrijven.
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
4. **Het verhuisslot is een herbruikbaar migratiemechanisme per bronpad (besluit 8).**
   - **Afzonderlijke migraties.** 1.5 blijft een afzonderlijke migratie binnen Firebase. 1.12 blijft
     een afzonderlijke migratie naar Supabase. Ze worden niet samengevoegd.
   - **Eén principe, opnieuw toepasbaar.** Het slot dat in 1.4.2 wordt ontworpen en bewezen, wordt
     zo ontworpen dat hetzelfde principe later opnieuw kan worden toegepast, in elk geval bij de
     overgang naar Supabase (1.12).
   - **Wat het contract vastlegt** (de eigenschappen; niet de vorm):
     - een slot hoort bij één bronpad, bijvoorbeeld de plek waar een planner in Firebase staat;
     - zodra het slot actief is, weigert de **server** elke schrijfactie op dat bronpad, ongeacht
       wat er wordt meegestuurd. Het slot hangt dus niet af van een markering of token in de data;
     - **(goedgekeurde eis)** een actief verhuisslot kan alleen door de beheerder worden opgeheven,
       buiten de app. Geen client kan een actief slot zelf opheffen;
     - **(goedgekeurde eis)** de migratie leest de bron pas nadat het slot actief is **én** een
       zelftest heeft bewezen dat schrijven op de bron wordt geweigerd. Pas daarna schrijft zij naar
       het doel. Schrijfacties die vóór het slot binnenkwamen, zitten daardoor in de gelezen bron;
       latere worden geweigerd;
     - het doel wordt gecontroleerd en herhaalbaar beschreven, en na het schrijven teruggelezen en
       vergeleken met de bron. Bij elke afwijking of fout stopt de migratie;
     - een client die op een actief slot stuit, stopt met schrijven, meldt dat de planner is
       verhuisd en laat zijn lokale cache onaangeroerd (zie eis 3);
     - het acceptatiescenario van eis 2 wordt bij **elke** toepassing opnieuw bewezen, voor het
       betreffende doel (in 1.5 binnen Firebase, in 1.12 naar Supabase).
   - **Aanvullende eigenschappen voor optie A** (besluit 9.3; de uitwerking staat in het
     ontwerpdocument en wordt pas na het bewijs vastgelegd):
     - **Beschermd control-gedeelte.** Het slot, de migratiestatus en de gereedstatus staan op een
       control-gedeelte dat buiten de data ligt. Schrijven op de data kan het control-gedeelte niet
       wijzigen of wissen, ook niet via een schrijfactie op een hoger pad. Het slot kan maar één keer
       worden gezet. Een status kan alleen vooruit, nooit terug; terug kan alleen de beheerder,
       buiten de app.
     - **Expliciete migratiestatus en gereedstatus.** Een client gebruikt het doel pas als de
       gereedstatus is gezet. Die wordt pas gezet nadat het doel is teruggelezen en gecontroleerd.
       Tot dan blijft de app alleen-lezen voor deze planner.
     - **Veilige doelinitialisatie.** Het doel wordt alleen beschreven als het leeg is, of als het
       aantoonbaar een eerdere poging van dezelfde migratie bevat. Elke andere inhoud stopt de
       migratie.
     - **Twee migratoren tegelijk.** Die leveren hetzelfde doel op, of de tweede stelt vast dat het
       doel van de eerste gelijk is aan zijn eigen berekening en controleert alleen. Een verschil
       stopt de migratie.
     - **Hervatten.** Vanaf elke tussenstatus kan de migratie hervat worden, met hetzelfde resultaat
       als een ononderbroken migratie.
     - **Rollback.** Vóór het activeren van een slot is beschreven en geoefend hoe wordt
       teruggegaan, zowel vóór als ná de gereedstatus (zie 3.3).
     - **Elke schrijfmethode.** De weigering op de bron geldt voor elke schrijfmethode: een
       vervangende schrijfactie (PUT), een gedeeltelijke of meervoudige schrijfactie (PATCH), een
       verwijdering, en schrijfacties op een hoger of lager pad. PUT en PATCH worden afzonderlijk
       bewezen.
   - **Goedkeuring.** De producteigenaar heeft de twee eisen die hierboven als goedgekeurde eis zijn
     gemarkeerd op 6 oktober 2026 expliciet goedgekeurd, als onderdeel van besluit 8.
   - **Bewust niet vastgelegd.** Hoe een nieuwe app bepaalt waar een planner nu staat (in het ontwerp
     `resolveLocation()`), het exacte formaat en de plaats van het slot, de namen van paden en de
     precieze Firebase-regels zijn onderdeel van het ontwerp in E6. Ze worden alleen vastgelegd
     voor zover ze nodig zijn als contract, en worden niet permanent vastgezet als
     implementatiedetail.
   - **Geen vooraf gegeven toestemming.** Dat het slot herbruikbaar is, geeft geen toestemming voor
     een toekomstige migratie. Het daadwerkelijk wijzigen van Firebase-regels en het activeren van
     een slot vereist **iedere keer** afzonderlijk expliciet akkoord van de producteigenaar.

### 3.2 Gedrag bij fouten in cache en opslag

- **Mislukt het opslaan van de herstelkopie vóór de migratie** (download niet bevestigd, serverkopie
  niet teruggelezen, of `localStorage` vol), dan **start de migratie niet**.
- **Mislukt het schrijven naar de lokale cache terwijl er niet-gesynchroniseerde wijzigingen zijn**,
  dan:
  - toont de app een blijvende melding ("Je wijzigingen zijn nog niet veilig bewaard");
  - claimt hij niet dat iets is opgeslagen;
  - probeert hij direct te synchroniseren.
- **Een lege `catch` mag niet meer verbergen dat bewaren is mislukt.**
- **Een cache per database, planner en opslaggeneratie.** Een lokale cache hoort altijd bij één
  database, één planner en één opslaggeneratie (bijvoorbeeld de Firebase-planner vóór 1.5, het
  doel na 1.5, en Supabase na 1.12). Een cache van een andere database, planner of generatie wordt
  nooit zomaar met de huidige samengevoegd; alleen via een expliciete omzetting.
- **Een oude cache blijft bewaard tot de verwerking is bevestigd.** Pas als de inhoud aantoonbaar
  veilig is opgeslagen (gecontroleerd geschreven en teruggelezen), mag een oude cache worden
  opgeruimd. Lukt het opruimen niet, dan is dat onschadelijk maar wordt het wel gemeld.
- **Ook lees- en verwijderfouten.** Kan een cache niet worden gelezen, dan geldt hij als
  "onbekend", niet als "leeg": hij wordt niet overschreven en de app meldt dat. Een onleesbare
  cache blijft onaangeroerd bewaard.
- **Netwerk én opslag tegelijk weg.** Kan er niet worden gesynchroniseerd en ook niet lokaal worden
  bewaard, dan toont de app dat duidelijk ("Niet bewaard") en blijft hij het opnieuw proberen. Hij
  waarschuwt waar mogelijk vóór het sluiten. Hij claimt nooit dat iets veilig is.

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
- een geteste hersteloefening op een kopie, niet op de echte planner;
- **een volledig ontworpen herstelprotocol** (besluit 9.8), vóór enige oefening of praktijktest.
  Het protocol dekt ten minste:
  - de serverdata, ruw en niet genormaliseerd;
  - lokale wijzigingen die nog niet op de server staan, **inclusief lokale verwijderingen**. Die
    zijn alleen te herkennen tegen de basis, dus de basis hoort bij de kopie;
  - de basis (de laatst bekende serverstand) per toestel;
  - toestellen die offline zijn of niet meedoen: hoe hun cache later veilig wordt verwerkt
    (3.1, eis 3), en wat er gebeurt als dat niet lukt;
  - de identiteit van de opslag: welke database, welke planner en welke opslaggeneratie bij een
    kopie hoort, zonder geheimen in het bestand. Een kopie kan niet per ongeluk in een andere
    planner of generatie worden teruggezet;
  - de UUID-mapping van de migratie;
  - **herstel ná wijzigingen in het doel**: wat er gebeurt met wijzigingen die na de gereedstatus
    in het doel zijn gedaan, als toch wordt teruggegaan. Ze gaan nooit stil verloren; wat ermee
    gebeurt, is een expliciete keuze die vóór het activeren van een slot is vastgelegd.
- **Geen praktijktest van E2/E3 op echte huishouddata** (besluit 9.8). Alle tests en oefeningen
  gebruiken fictieve data in een geïsoleerde omgeving.

### 3.4 Bestaande data classificeren (E5)

E5 levert meer op dan een telling. Het onderzoek gebeurt niet op de live planner, maar lokaal en
geanonimiseerd (besluit 9.7):

- **Bronnen.** Niet alleen een export, maar ook de relevante ruwe serverdata (niet genormaliseerd),
  de lokale caches en de bases van de toestellen. Zo wordt zichtbaar wat `normalizeData` zelf
  aanvult en wat er alleen lokaal bestaat.
- **Lokaal.** Het onderzoek draait op een toestel van de producteigenaar. Er gaat geen huishouddata
  naar buiten.
- **Geanonimiseerd.** Het rapport bevat alleen vormen, aantallen en anonieme kenmerken, geen
  waarden, namen of teksten.

Het onderzoek levert per veld:

1. de vorm, en of elk element een `id` heeft;
2. het gedrag bij samenvoegen (per element of "lokaal wint");
3. welke persoonsverwijzingen het veld bevat;
4. de actie per categorie: `id` toevoegen, ongemoeid laten of apart behandelen;
5. welke onopgeloste gevallen 1.5 blokkeren.

**Acceptatiecriteria voor E5:**
- elk veld dat in **een** van de bronnen voorkomt, is geclassificeerd. Een onbekend veld blokkeert
  1.5;
- per lijst is bekend of elk element een `id` heeft, of `id`'s uniek zijn, en of de lijst gemengd is
  (sommige elementen met en sommige zonder `id`);
- velden met namen als sleutel en geneste lijsten (bijvoorbeeld paklijsten) zijn apart benoemd;
- het verschil tussen ruwe data en genormaliseerde data is per veld zichtbaar;
- elke persoonsverwijzing is aan een veld en een categorie gekoppeld;
- voor elk veld waar samenvoegen "lokaal wint" geeft en dat 1.5 omzet, is beschreven waarom de
  omzetting veilig is, of het is een blokkade;
- het rapport is herhaalbaar: dezelfde invoer geeft hetzelfde rapport;
- het rapport bevat geen huishoudgegevens.

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

### 4.2 Relaties (voorstel)

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

### 4.3 Drie uitgewerkte voorbeelden (voorstel)

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

### 4.4 Herhaling en afgeleide datums (voorstel; klein contract, vóór die functionaliteit)

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
  - Het principe is besloten (besluit 6). De implementatie gebeurt op het passende moment in de
    roadmap en blokkeert 1.5 niet.
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

### 5.1 Stap 1.4.2: voorbereiding 1.5 (klein; besluit 5)

1.4.2 bevat **werkende gedragswijzigingen in de code, maar geen datamigratie.** De omzetting van
bestaande data gebeurt pas in 1.5, onder de schrijfblokkade.

| # | Voorwaarde vóór 1.5 | Aard |
| --- | --- | --- |
| **E1** | Herstelkopie buiten het toestel, een volledig ontworpen herstelprotocol (ook voor lokale wijzigingen en verwijderingen, bases, offline toestellen, opslagidentiteit, UUID-mapping en herstel ná wijzigingen in het doel), en een geteste hersteloefening op een kopie (3.3) | ontwerp + code + oefening |
| **E2** | Veilig schrijven: één schrijfcoördinatiemodel, geen terugval naar ongecontroleerd opslaan, zonder bruikbare ETag niet schrijven, `flush()` alleen met ETag, en de migratie alleen gecontroleerd (3.1, eis 1) | code |
| **E3** | Gedrag bij cache- en opslagfouten, met een cache per database, planner en opslaggeneratie (3.2) | code |
| **E4** | Het beslislogboek (2.4) kan worden gelezen en geschreven, met een afzonderlijk contract voor `same`/`different` en een harde fout bij hetzelfde `opId` met andere inhoud; `resolveMember()` volgens 2.2–2.4; namespace en invoercodering van UUIDv5 vastgelegd en getest (2.3). Zonder schermen. | code |
| **E5** | Classificatie van de bestaande data, lokaal en geanonimiseerd, op export, ruwe data, caches en bases, volgens de acceptatiecriteria van 3.4 | onderzoek |
| **E6** | Het mechanisme voor het server-side uitsluiten van oude schrijvers (3.1, eis 2) ontwerpen als herbruikbaar verhuisslot per bronpad (3.1, eis 4; besluit 8) en in een geïsoleerde omgeving bewijzen tegen het acceptatiescenario van 3.1, plus een besluit over de uitvoering. 1.4.2 ontwerpt en bewijst alleen: er worden geen Firebase-regels gewijzigd, er wordt geen slot geactiveerd en er worden geen productiegegevens of planners aangeraakt. Het doorvoeren in Firebase gebeurt aan het begin van 1.5, na afzonderlijk akkoord. Geen migratie-schrijfactie zonder dit bewijs. | ontwerp + bewijs + besluit |

**Niet in 1.4.2:** items, relaties, herhaling, het wijzigen van Vandaag, de parser, en de schermen
voor ledenbeheer. Ook geen praktijktest van E2/E3 op echte huishouddata (besluit 9.8).

**Ontwerpdocument.** De uitwerking van E1 t/m E6 staat in `docs/ontwerp-1.4.2.md`. Dat document is
een ontwerp, geen contract. Concrete Firebase-regels, padnamen en de werking van
`resolveLocation()` worden pas voorgesteld na het E6-bewijs, en vragen dan een afzonderlijk besluit.

**Grens met 1.6.** 1.4.2 en 1.5 leggen de data en de regels vast. Een correctie kan tot 1.6 via de
bestaande bevestigingsdialoog of het ontwikkelhulpmiddel (`huisplanLeden`). De schermen voor
ledenbeheer, herstel en samenvoegen komen in 1.6.

### 5.2 Supabase: vóór de eerste echte schrijver (richting besloten, uitwerking apart goed te keuren)

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

### 5.3 Overige roadmapvoorstellen (nog niet besloten)

De punten hieronder vallen buiten de architectuurbesluiten van sectie 7 (besluiten 1 t/m 9) en
blijven voorstellen.

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
10. **Schrijfcoördinatie:** een vertraagd antwoord (van opslaan, wegzetten, laden of een herpoging)
    zet nooit een nieuwere generatie terug; zonder bruikbare ETag wordt niet geschreven.
11. **Cache-identiteit en opslagfouten:** een cache van een andere database, planner of generatie
    wordt niet samengevoegd; een oude cache blijft tot de verwerking is bevestigd; lees- en
    verwijderfouten en het tegelijk wegvallen van netwerk en opslag worden gemeld.
12. **Logboek:** hetzelfde `opId` met andere inhoud is een harde fout; `same`/`different` volgen hun
    eigen effectregels en veranderen nooit vanzelf een lidmaatschap; UUIDv5 voldoet aan de vaste
    testvectoren.
13. **Verhuisslot (optie A):** het control-gedeelte is niet via de data te wijzigen; de bron weigert
    PUT, PATCH en verwijderen, ook op hogere en lagere paden; het doel wordt alleen veilig
    geïnitialiseerd; twee migratoren en hervatten geven hetzelfde doel; de app gebruikt het doel
    pas na de gereedstatus.
14. **Herstel ná wijzigingen in het doel:** teruggaan na de gereedstatus verliest geen wijzigingen
    stil.

Alle bewijzen voor het verhuisslot draaien in de Firebase Emulator met een harde lokale
netwerkallowlist (besluit 9.4).

## 7. Architectuurbesluiten (6 oktober 2026)

Genomen door de producteigenaar.

| # | Besluit | Uitkomst |
| --- | --- | --- |
| 1 | **UUID-identiteit.** De member-UUID wordt de blijvende identiteit. Bestaande `m_…`-leden krijgen de afgesproken deterministische UUID (UUIDv5, sectie 2.3); nieuwe leden krijgen UUIDv4. `m_…` blijft legacy-alias. | **Ja** |
| 2 | **Beslislogboek.** Het causale beslislogboek uit 2.4 vervangt "nee wint". `basedOn` is een lijst met nul, één of meerdere voorgangers. Een conflict wordt expliciet opgelost door voort te bouwen op alle conflicterende koppen. | **Ja** |
| 3 | **Persoonsbegrippen gescheiden.** Account, huishoudlid, actor, toegewezen persoon en historisch of niet-lid-label zijn aparte begrippen (2.1). Activiteit of auteurschap maakt nooit iemand lid, en `resolveMember()` maakt nooit zelfstandig een lid aan. | **Ja** |
| 4 | **Itemidentiteit los van collectie.** Items krijgen uiteindelijk een UUID die niet van de collectie afhangt. Er komt geen universele alles-entiteit: elk type houdt zijn eigen betekenisvolle velden, en een typewissel gaat alleen via een bewuste conversie (4.1). Vóór de itemmigratie wordt de bestaande data eerst geclassificeerd (3.4). | **Ja.** De concrete schemawijzigingen in 5.2 worden uitgewerkt en apart goedgekeurd vóór de eerste echte Supabase-schrijver. |
| 5 | **1.4.2 vóór 1.5.** De veiligheidsvoorbereiding van 1.4.2 (E1 t/m E6, sectie 5.1) is een harde voorwaarde voordat 1.5 de bestaande persoonsverwijzingen migreert. | **Ja** |
| 6 | **Vandaag als weergave.** Vandaag is definitief een niet-schrijvende weergave: alleen renderen mag geen huishouddata wijzigen. De implementatie blokkeert 1.5 niet en gebeurt op het passende moment in de roadmap. | **Ja** |
| 7 | **Oude Firebase-clients aan de serverkant blokkeren.** Vóór de migratie van 1.5 moet aantoonbaar server-side zijn geborgd dat oude clients niet meer kunnen schrijven, ook niet met oude of gekopieerde markeringen en niet met schrijfacties die al onderweg zijn (3.1). | **Ja voor de eis; nog geen keuze voor het mechanisme.** Het mechanisme wordt in 1.4.2 onderzocht en bewezen (E6). Een wijziging aan de Firebase-configuratie gebeurt niet zonder apart, expliciet akkoord. (Het principe is uitgewerkt in besluit 8.) |
| 8 | **Herbruikbaar verhuisslot; 1.5 en 1.12 apart** (aanvulling op besluit 7, 6 oktober 2026). 1.5 blijft een afzonderlijke migratie binnen Firebase; 1.12 blijft een afzonderlijke migratie naar Supabase. Het server-side verhuisslot uit 1.4.2 wordt een herbruikbaar migratiemechanisme per bronpad, zodat hetzelfde principe in 1.12 opnieuw kan worden toegepast (3.1, eis 4). | **Ja.** 1.4.2 ontwerpt en bewijst het mechanisme alleen in een geïsoleerde omgeving. `resolveLocation()` en het exacte slotformaat horen bij het ontwerp en worden alleen vastgelegd voor zover ze nodig zijn als contract. Expliciet goedgekeurd: een actief slot kan alleen door de beheerder buiten de app worden opgeheven, en de migratie leest de bron pas nadat het slot actief is én een zelftest heeft bewezen dat schrijven op de bron wordt geweigerd (3.1, eis 4). Status en mapping van de migratie staan op het doel (2.3). Herbruikbaarheid geeft geen toestemming vooraf: het wijzigen van Firebase-regels en het activeren van een slot vereist iedere keer afzonderlijk expliciet akkoord. |

### 7.1 Besluiten na de review van het 1.4.2-plan (6 oktober 2026)

Genomen door de producteigenaar, na de onafhankelijke review van Codex op het implementatieplan
voor 1.4.2. Samen besluit 9.

| # | Besluit | Uitwerking in dit contract |
| --- | --- | --- |
| 9.1 | Zonder bruikbare ETag wordt niet geschreven. | 3.1, eis 1 |
| 9.2 | `same`/`different` krijgt een afzonderlijk semantisch contract naast `member`/`notMember`. De logboekmotor mag gedeeld worden, maar onderwerp en effectregels niet impliciet. Hetzelfde `opId` met andere inhoud is een harde fout. | 2.4 |
| 9.3 | Optie A blijft de onderzoeksrichting voor E6. Dit is geen toestemming om Firebase-regels te wijzigen of een slot te activeren. | 3.1, eisen 2 en 4 |
| 9.4 | De Firebase Emulator is de bewijsomgeving, met een harde lokale netwerkallowlist. Geen echt Firebase-testproject zonder afzonderlijk akkoord. | 3.1, eis 2; 6 |
| 9.5 | De werkelijke Firebase-regels worden vóór het E6-bewijs alleen-lezend gecontroleerd. | 3.1, eis 2 |
| 9.6 | De relevante Firebase-projecten en historische clientversies worden geïnventariseerd. | 3.1, eis 2 |
| 9.7 | E5 wordt lokaal en geanonimiseerd uitgevoerd, en onderzoekt niet alleen exportdata maar ook relevante ruwe data, caches en bases. | 3.4 |
| 9.8 | Geen praktijktest van E2/E3 op echte huishouddata. Het herstelprotocol wordt eerst volledig ontworpen. | 3.3; 5.1 |
| 9.9 | De UUIDv5-namespace én de exacte invoercodering worden vóór gebruik definitief vastgelegd en getest. | 2.3 |

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
- **Oude schrijvers:** de review noemt het probleem; dit contract voegt het concrete gat in `flush()`
  toe, plus de valkuil dat een markering in `meta` door oude apps gewoon wordt overgenomen.
- **Herkomstrelatie (`source`):** niet nauwkeuriger gemaakt maar uitgesteld naar fase 3, omdat die
  pas met een handelingslogboek zinvol is.

### 8.1 Review van het 1.4.2-plan (Codex)

Oordeel van de review: de richting klopt, maar E1, E4 en E6 bevatten nog blokkades en E2, E3 en E5
moeten worden aangescherpt. Verwerkt via besluit 9 (7.1):

- **E1:** het herstel dekt ook lokale wijzigingen en verwijderingen, bases, offline toestellen, de
  identiteit van de opslag, de UUID-mapping en herstel ná wijzigingen in het doel (3.3);
- **E2:** één schrijfcoördinatiemodel; een vertraagd antwoord zet geen nieuwere generatie terug
  (3.1, eis 1);
- **E3:** een cache per database, planner en opslaggeneratie; lees- en verwijderfouten; netwerk en
  opslag tegelijk weg (3.2);
- **E4:** een afzonderlijk contract voor `same`/`different` en een harde fout bij hetzelfde `opId`
  met andere inhoud (2.4);
- **E5:** lokaal, geanonimiseerd, meer bronnen en acceptatiecriteria (3.4);
- **E6:** optie A uitgewerkt met een beschermd control-gedeelte, migratie- en gereedstatus, veilige
  doelinitialisatie, twee migratoren, hervatten, rollback, en PUT en PATCH afzonderlijk (3.1,
  eis 4).

De uitwerking staat in `docs/ontwerp-1.4.2.md`. De open vragen staan daar ook.
