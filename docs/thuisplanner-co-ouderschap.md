# Thuisplanner: gescheiden ouders en samengestelde gezinnen

**Status:** productbesluit genomen (besluit 12 in `docs/productkompas-beslissingen.md`, 26 oktober 2026, met de keuzes
O1–O8). **Er is niets gebouwd.** Alle technische oplossingen in dit document (sectie 4 en verder) zijn een
📝 **ontwerpvoorstel**: niet geïmplementeerd, niet getest en niet bewezen veilig. Een migratie volgt pas na uitleg en
afzonderlijk akkoord, en na de gates in sectie 10.

- **Optie A (basis):** zelfstandige huishoudens delen geselecteerde kindgerelateerde afspraken, taken en informatie,
  zonder toegang tot elkaars overige huishoudgegevens.
- **Optie B (toekomstig, optioneel):** een co-ouderschapsomgeving met verblijfsroosters, overdrachtsmomenten en
  eventueel kostenverdeling. Niet bouwen zonder afzonderlijk productbesluit (sectie 9).
- **Gerelateerd:** `docs/thuisplanner-fundament.md` (huishoudens, leden, uitnodigingen), `docs/thuisplanner-inhoud.md`
  (afspraken, privé als "Bezet"), `docs/thuisplanner-sync.md` (ophalen en seintjes), `docs/thuisplanner-agenda.md`
  (Agenda-traject, §5: latere koppelingen en alleen-lezen afspraken met herkomst). Let op: dat Agenda-document staat
  op 26 oktober 2026 nog niet gecommit op branch `thuisplanner-agenda`; de verwijzingen ernaar gelden voor de versie
  van die datum.

## 1. Productkompas-toets

| Vraag | Antwoord |
| --- | --- |
| Principes | 3 (één keer vertellen: de afspraak van het kind maar één keer invoeren), 5 (één keer vragen: standaard per kind), 6 (aandacht: geen meldingen over de grens), 7 (huishouden centraal), 9 (niet oordelen over gezag of eerlijkheid), "Privacy volgt de situatie", "Fouten moeten goedkoop zijn", "Huisplan groeit mee" |
| Neemt het werk weg? | Waarschijnlijk veel: schoolafspraken, sport en dokter worden nu dubbel bijgehouden of los doorgegeven. Nog een hypothese (principe 8). |
| Hoort het bij het huishouden? | Ja: het organiseren van het leven van een kind dat in twee huishoudens woont. |
| Eenvoudiger? | Optie A zonder wijzigen over de grens, zonder realtime, zonder roosters en zonder geld. Gezinnen zonder koppeling zien niets nieuws, behalve één regel in de huishoudinstellingen. |
| Aandacht, controle en privacy | Hoog risico: twee huishoudens met mogelijk conflict, en kindgegevens. Daarom server-side, per koppeling en per account, met een eigen gate en een AVG-beoordeling. |
| Bewijs | Nog geen gebruik. Optie B pas na gebruik van optie A. |
| Ultieme toets | Ja, als het delen zelf weinig moeite kost (standaard per kind) en niets ongemerkt deelt. |

**Bewuste uitzondering op principe 7.** Binnen een huishouden ziet elk actief lid alle gedeelde inhoud. Voor
koppelingen geldt de toegang per account, zodat een nieuwe partner nooit automatisch iets van de andere ouder ziet.
Dit volgt uit "Privacy volgt de situatie" en verandert principe 7 niet.

## 2. Besluiten (26 oktober 2026)

| # | Besluit |
| --- | --- |
| O1 | Gedeelde afspraken zijn voor het andere huishouden alleen-lezen. |
| O2 | Nieuwe toegang tot gedeelde kindinformatie vereist instemming van beide kanten. |
| O2a | Instemming kan later worden ingetrokken. |
| O2b | Een toegangsverzoek verloopt na 14 dagen. |
| O3 | Delen staat per gekoppeld kind standaard uit. Bij het koppelen kan de gebruiker bewust kiezen om afspraken over dat kind voortaan standaard te delen. Per afspraak blijft zichtbaar of hij gedeeld wordt; de instelling is aan te passen. Privé-afspraken en "Bezet" worden nooit gedeeld. |
| O4 | Notities worden standaard niet gedeeld; alleen met een expliciete keuze per afspraak. |
| O5 | De ontvanger ziet uitsluitend het eigen label voor het andere huishouden. |
| O6 | Eerste versie: periodiek ophalen, geen realtime. Niet presenteren als direct gesynchroniseerd. Intrekken direct server-side; lokaal aanwezige gegevens veilig afhandelen (sectie 6). |
| O7 | Meerdere koppelingen per huishouden, hoogstens één per kind; het ontwerp blijft voorbereid op meer per kind. |
| O8 | Optie A is gratis; optie B kan later eventueel Premium worden. |

**Aanvullende uitgangspunten:** twee huishoudens blijven volledig zelfstandig; gedeelde afspraken blijven één
onderliggend item zonder kopieën; nieuwe partners krijgen nooit automatisch toegang; de bestaande RLS en
huishoudgrenzen worden niet verzwakt; optie B wordt niet gebouwd zonder afzonderlijk besluit; privacy, kindgegevens,
toestemming, intrekking en de AVG-beoordeling zijn voorwaarden vóór implementatie.

## 3. Het huidige model: waar het één huishouden per item aanneemt

Feitelijke stand van de 16 migraties in `thuisplanner/supabase/migrations` (branch `thuisplanner-deel2`).

| Plek | Aanname | Gevolg voor delen |
| --- | --- | --- |
| `household_members` (`unique (household_id, id)`) | Een persoon bestaat per huishouden als eigen rij; er is geen persoonsidentiteit over huishoudens heen. | Hetzelfde kind is in beide huishoudens een eigen lidrij. Er is een expliciete koppeling "dit kind hier = dat kind daar" nodig. |
| `events`, `event_details`, `event_participants`, `event_exceptions`, `tasks` | Eén `household_id` per rij; eigenaar, deelnemers, toegewezen lid, reeks en details verwijzen samengesteld binnen dat huishouden (ook `postgres` kan niet over de grens verwijzen; KG-T13, KG-T35). | Een gedeelde afspraak kan het kind van het andere huishouden niet als deelnemer hebben; bij het lezen wordt het kind vertaald. |
| RLS: `household_id in (select private.my_household_ids())` | Lezen = actief lid van het huishouden van de rij (via `private.uid()` en de toegangspoort). | Een apart leespad voor gedeelde items; de bestaande beleidsregels blijven ongewijzigd. |
| `private.event_details_visible`, `is_my_event`, privé als "Bezet" | "Bezet" is bedoeld voor leden van hetzelfde huishouden. | Privé en "Bezet" gaan nooit over de grens. |
| Realtime `household:<id>:<epoch>`, `private.may_listen`, `ping_*` | Seintjes alleen op het kanaal van het eigen huishouden; het volgnummer draait bij verlies van lidmaatschap. | O6: in de eerste versie geen seintjes over de grens; aan het realtimebeleid verandert niets. |
| Sync-module (`thuisplanner/sync/thuisplanner-sync.js`) | Eén huishouden per generatie; de cache staat in het geheugen en wordt bij verlies van toegang gewist; alleen onbevestigde eigen toevoegingen staan duurzaam op het toestel (per account en huishouden). | Gedeelde items als aparte, alleen-lezen soort in het geheugen; nooit duurzaam bewaren (sectie 6). |
| Uitnodigingen (`household_invites`, op e-mail) | Uitnodigen = lid worden van mijn huishouden. | Een koppeling is iets anders: de ander wordt geen lid. Een eigen uitnodigingssoort, met hetzelfde veilige patroon. |
| `households.timezone` | Eén tijdzone per huishouden. | Bij verschillende zones lokale datum en tijd omrekenen, zoals bij externe agenda's (`docs/thuisplanner-agenda.md` §5). |

## 4. Ontwerpvoorstel optie A: het model

📝 Ontwerpvoorstel. Namen zijn werknamen.

**Principe:** geen bestaande kolom, FK of beleidsregel wijzigen. Een item blijft van precies één huishouden; de
zichtbaarheid elders loopt via aparte, expliciete relaties.

1. **Koppeling** (`household_links`): tussen twee huishoudens, met status `voorgesteld` / `actief` / `beëindigd`, wie
   hem voorstelde, en wanneer hij actief werd of eindigde. Elk huishouden geeft de koppeling een **eigen label**
   ("Bij Ouder A", "Bij Ouder B"); alleen dat label ziet de lezer (O5). Een huishouden kan meerdere koppelingen hebben
   (O7), bijvoorbeeld met A voor Kind A en met C voor stiefkind Kind B.
2. **Kindkoppeling** (`household_link_children`): paren (lid in het ene huishouden, lid in het andere), met twee
   samengestelde FK's, elk binnen het eigen huishouden. Alleen `kind = 'child'`. Elke kant bevestigt zelf het eigen
   kind; er wordt nooit op naam gematcht (principe 7, beslissing 6). **Hoogstens één actieve kindkoppeling per kind**
   (O7), als unieke index die later kan worden verruimd; de rest van het model gaat al uit van meerdere.
   Per kindkoppeling en per kant: de standaard "afspraken over dit kind voortaan delen" (O3, standaard uit).
3. **Toegang per account** (`household_link_access`): welke actieve volwassenen met account van elke kant de gedeelde
   items van de andere kant mogen zien. Status `voorgesteld` / `actief` / `ingetrokken` / `verlopen`.
   - De twee accounts die de koppeling aangaan, stemmen in door aan te gaan en te accepteren.
   - **Nieuwe toegang (O2):** de eigen kant stelt voor (eigenaar of beheerder, met zelf toegang); de andere kant stemt
     in (een account dat daar toegang heeft). Toegang gaat in wezen over de items van de ándere kant, dus de
     instemming van die kant is de beslissende.
   - **Verlopen (O2b):** een verzoek zonder instemming verloopt na 14 dagen. Tot instemming is er geen toegang.
   - **Intrekken (O2a):** de andere kant kan haar instemming later intrekken; dat raakt alleen haar eigen gedeelde
     items. De eigen kant kan de toegang van een eigen lid altijd beëindigen.
   - Lid worden van een huishouden geeft **nooit** toegang tot een koppeling.
4. **Deelrelatie per item** (`event_shares`, later `task_shares`): (eigenaarshuishouden, item, kindkoppeling,
   `share_notes`). Het item blijft van het eigenaarshuishouden; er wordt niets gekopieerd. Voorwaarden in de database:
   - alleen een **gedeelde** afspraak (`visibility = 'household'`); privé kan niet worden gedeeld, ook niet als "Bezet";
   - het gekoppelde kind is deelnemer van de afspraak;
   - alleen een account met toegang aan de eigenaarskant zet of stopt het delen;
   - `share_notes` staat standaard uit (O4);
   - wordt de afspraak privé, verwijderd, of is het gekoppelde kind geen deelnemer meer, dan vervalt het delen (fail
     closed);
   - bij een reeks geldt het delen voor de reeks; een losgemaakt voorkomen volgt zijn eigen zichtbaarheid (zoals nu in
     `docs/thuisplanner-inhoud.md` §8).
5. **Apart leespad** voor de ontvanger: een `security definer`-functie in `private` met een dunne
   `security invoker`-functie in `public` (het bestaande patroon), bijvoorbeeld `shared_events(huishouden, van, tot)`,
   met vaste kolommen:
   - id, datum en tijden, herhaling en uitzonderingen, titel en plek;
   - notities alleen als `share_notes` aan staat;
   - de deelnemers **vertaald naar de eigen kindrijen van de lezer**; andere deelnemers vallen weg;
   - herkomst = het label dat de lezer zelf aan de koppeling gaf;
   - versie.
   Niet: `owner_member_id`, `owner_user_id`, andere deelnemers, de huishoudnaam, ledenlijsten, account-ID's.
   Waarom een functie en geen extra beleidsregel op `events`: in PostgreSQL tellen permissive beleidsregels op (OR),
   dus elke extra regel op een bestaande tabel verruimt die tabel. Een apart leespad laat de bestaande RLS
   ongewijzigd.
6. **Schrijven (O1):** alleen door het eigenaarshuishouden, met de bestaande functies. De ontvanger kan niets wijzigen
   of verwijderen. Er is dus geen versieconflict en geen vergrendeling over de grens.
7. **Taken en kindinformatie:** taken volgen hetzelfde patroon in een latere stap; `done_by` en toewijzing alleen
   tonen als het het kind betreft. Voor kindinformatie (school, allergie, huisarts) bestaat nog geen tabel; voorstel:
   een klein kindprofiel per lid met een keuze per veld "delen met de koppeling", standaard uit.
8. **Meldingen:** per account, niet per huishouden of koppeling. Er bestaan nog geen meldingen (beslissing 4). Eis voor
   later: een melding over een gedeeld item gaat alleen naar accounts met toegang én met die instelling aan; standaard
   uit.

## 5. Koppelen, instemmen en stoppen

📝 Ontwerpvoorstel.

**Koppelen**
- Een eigenaar of beheerder van huishouden A nodigt een e-mailadres uit en kiest het kind of de kinderen. Zelfde
  patroon als de uitnodiging op e-mail (`docs/thuisplanner-uitnodiging-email.md`): token alleen als hash, 7 dagen
  geldig, één keer bruikbaar, intrekbaar, het adres verdwijnt na sluiten of verlopen, stabiele foutcodes (werknaam
  TPK01–TPK10). De uitnodiging verraadt niet of het adres al een account heeft.
- Vóór accepteren ziet de ontvanger alleen: wie uitnodigt, de voornaam van het kind of de kinderen, en dat het om een
  koppeling gaat (geen lidmaatschap). Geen huishoudgegevens.
- De ontvanger logt in, kiest het eigen huishouden (als eigenaar of beheerder) of maakt er een aan, wijst zelf het eigen
  kindlid aan (of voegt het toe) en geeft een eigen label. Pas als beide kanten hun kind hebben bevestigd, is de
  kindkoppeling actief.
- Bij het koppelen kiest elke kant per kind bewust of afspraken over dat kind voortaan standaard gedeeld worden
  (O3, standaard uit). Na het koppelen is er nog niets gedeeld.

**Delen in het dagelijks gebruik**
- Bij een afspraak met een gekoppeld kind staat zichtbaar of hij gedeeld wordt ("Ook zichtbaar voor Bij Ouder B"), met
  één schakelaar. Notities hebben een eigen, standaard uitgezette keuze (O4).
- Een privé-afspraak toont geen deelschakelaar.

**Stoppen en intrekken**
- Elke kant kan altijd eenzijdig stoppen: met de hele koppeling, per kind, of met de toegang van één account. Stoppen
  hangt nooit af van de ander (veiligheid bij conflict).
- Effect op de server: in dezelfde transactie geeft het leespad niets meer terug (sectie 6).
- Geen gegevensverlies: er is niets gekopieerd; elk huishouden houdt zijn eigen items.
- Account verwijderen, het huishouden verlaten of gearchiveerd worden beëindigt de toegang van dat account in alle
  koppelingen. Het kind archiveren beëindigt die kindkoppeling. Een huishouden verwijderen beëindigt zijn koppelingen.
- Beide kanten zien dat een koppeling of toegang is beëindigd en wanneer; geen reden, geen melding met toon.

## 6. Intrekken en lokaal aanwezige gegevens (O6)

📝 Ontwerpvoorstel. Feitelijke stand van de app nu: de opgehaalde gegevens staan alleen in het geheugen van de pagina;
duurzaam op het toestel (localStorage) staan alleen de inlogsessie, de huishoudkeuze, de openstaande codeaanvraag en
onbevestigde eigen toevoegingen (per account en huishouden). Er is geen service worker en geen offline cache van
inhoud.

**Server (afdwingen):**
- Het leespad controleert bij elke aanroep opnieuw: koppeling actief, kindkoppeling actief, toegang van dit account
  actief, actief lid van het eigen huishouden, en de toegangspoort (`private.uid()`). Na intrekken is het volgende
  antwoord leeg. Er is geen token of sleutel die na intrekken nog iets opent.
- Intrekken vergrendelt de koppeling, zodat een lopende leesronde niet met een oude momentopname langs een intrekking
  heen kan (zelfde gedachte als het vergrendelingsprotocol in `docs/thuisplanner-fundament.md` §8).

**Client (veilig afhandelen):**
- Gedeelde items staan **alleen in het geheugen** van de sync-module, als aparte soort. Ze worden nooit duurzaam
  bewaard (geen localStorage, IndexedDB of offline cache), ook niet als later een offline-modus komt. Dat wordt een
  statische controle, zoals de bestaande controle op console-uitvoer.
- Bij elke ophaalronde vervangt het antwoord de gedeelde items volledig. Een lege lijst wist ze direct.
- Stoppen, uitloggen, een ander huishouden kiezen of verlies van toegang wist ze, zoals nu de hele cache.
- Gedeelde items vallen buiten onbevestigde opdrachten: door O1 kan de ontvanger er niets aan wijzigen, dus er staat
  nooit een opdracht over een gedeeld item op het toestel.
- Antwoorden van de server krijgen `Cache-Control: no-store`; bij de bouw controleren dat de browser of een
  tussenliggende server ze niet bewaart.

**Restrisico (eerlijk benoemd):**
- Tussen intrekken en de volgende ophaalronde (vangnet van 30 seconden, of bij openen) kan een al geopend scherm de
  oude gedeelde items nog tonen. Ze worden niet bijgewerkt en verdwijnen bij de volgende ronde. Er kan niets nieuws
  meer worden opgehaald. Dit wordt in de privacyuitleg genoemd.
- Wat iemand al heeft gezien, overgenomen of als schermafdruk bewaard, kan Thuisplanner niet terughalen. Ook dat staat
  in de uitleg bij het koppelen.

**Presentatie:** gedeelde items worden niet als direct gesynchroniseerd gepresenteerd. In het detailvenster staat de
herkomst ("Van Bij Ouder B") en zo nodig "Bijgewerkt om 14:32"; geen "live"-aanduiding.

## 7. Gezag en bevoegdheden

- Thuisplanner registreert of controleert geen gezag (principe 9; ook AVG: geen onnodige gevoelige gegevens). Het
  legt alleen vast wat elke kant **mag**.
- Bevoegdheden zijn niet automatisch gelijk. In de eerste versie is lezen de enige bevoegdheid over de grens (O1).
- Kinderen met een eigen account (later, "groeit mee"): een tiener kan lid zijn van beide huishoudens (dat kan nu al
  voor accounts). Toegang tot een koppeling komt dan niet automatisch; dat is een eigen keuze bij die stap.

## 8. Wat niet mag lekken (testlijst voor de gate)

Aan het gekoppelde huishouden, en aan leden zonder toegang in de koppeling:

1. niet-gedeelde afspraken, taken, boodschappen en vakanties, ook niet als aantal, "Bezet" of seintje;
2. privé-afspraken, ook van het gekoppelde kind, ook niet als "Bezet";
3. ledenlijst, namen, kleuren of het bestaan van andere leden (zoals een nieuwe partner of stiefkinderen);
4. deelnemers aan een gedeelde afspraak anders dan het gekoppelde kind; wie de afspraak maakte of wijzigde;
5. notities zonder expliciete keuze per afspraak;
6. account-ID's, e-mailadressen (behalve het adres van de uitnodiging zelf), de huishoudnaam;
7. `done_by` en toewijzing bij gedeelde taken aan iemand anders dan het kind;
8. foutmeldingen met DETAIL/HINT (bestaande regel KG-T45/T46 ook voor de nieuwe functies);
9. na intrekken of na een verlopen verzoek: niets meer, ook niet via een oud antwoord of een lopende leesronde;
10. via filters (`ilike`, `or`), een view zonder `security_invoker` of een extra view;
11. tussen twee koppelingen van hetzelfde huishouden (A en C zien niets van elkaar, ook niet dat de ander bestaat);
12. omgekeerd: delen door A geeft A geen enkel zicht op B.

En de bestaande beveiliging blijft aantoonbaar gelijk: de beleidsregels op bestaande tabellen en op
`realtime.messages` zijn ongewijzigd (catalogustest), en KG-T13, KG-T33 en KG-T35 blijven groen.

## 9. Optie B in hoofdlijnen (toekomstig, niet bouwen)

Alleen richting; een afzonderlijk productbesluit is nodig, op basis van werkelijk gebruik van optie A.

- **Verblijfsrooster:** "wie heeft het kind wanneer" als item van de koppeling zelf (niet van één huishouden), zodat
  Vandaag kan zeggen "Kind A is deze week bij jou". Past bij "Wie is waar" uit Huisplan. Vraagt een eigen eigenaarsvorm
  en dus een eigen gate.
- **Overdrachtsmomenten:** afgeleid uit het rooster ("vrijdag 17:00 overdracht, gymtas mee"), in de stijl van de
  paklijst per persoon bij Vakanties.
- **Kostenverdeling:** het grootste risico voor principe 9 en "Integreren vóór nabouwen". Alleen na afzonderlijk
  onderzoek. Kan later eventueel Premium worden (O8).

## 10. Voorwaarden vóór implementatie

| Voorwaarde | Wat aantoonbaar moet zijn |
| --- | --- |
| ⛔ Gate 9 voor koppelingen (besluit 12) | Testmatrix en tegenproeven voor sectie 8, vóór de eerste koppel- of deeltabel en opnieuw voor ieder volgend gedeeld domein (afspraken, taken, kindprofiel). |
| ⛔ Bestaande beveiliging niet verzwakt | Geen nieuwe of gewijzigde beleidsregel op bestaande tabellen of `realtime.messages`; samengestelde FK's ongewijzigd; bestaande matrix volledig groen. |
| ⛔ Toestemming en intrekking server-side | Koppelen, instemmen (beide kanten), verlopen na 14 dagen, intrekken en stoppen getest, ook bij gelijktijdigheid. |
| ⛔ AVG-beoordeling | Grondslag voor het delen van kindgegevens met een tweede huishouden; toestemming en uitleg bij het koppelen; intrekking; bewaartermijn; vermelding in de privacyverklaring; de koppeling en gedeelde items in de data-export (F10, 4.6); restrisico's uit sectie 6 benoemd. |
| ⛔ Migratie | Alleen na uitleg en afzonderlijk akkoord; niet tijdens een lopend stagingtraject. |
| Afstemming Agenda | Gedeelde afspraken lopen via dezelfde toegangsfuncties (`dagInhoud`/`afsprakenTussen`) en via `lib/rechten.ts` als alleen-lezen afspraak met herkomst, zoals `docs/thuisplanner-agenda.md` §5 voor externe agenda's beschrijft. |
| Optie B | Niet zonder afzonderlijk productbesluit. |

## 11. Samenhang met het Agenda-traject

- `docs/thuisplanner-agenda.md` §5 zegt: "Geen fijnmazige rechten per lid toevoegen." Dat blijft gelden. De rechten
  van besluit 12 zitten op de koppeling, niet op afzonderlijke afspraken of leden binnen een huishouden; gedeeld,
  privé en "Bezet" binnen een huishouden blijven zoals ze zijn.
- Een gedeelde afspraak uit een ander huishouden is voor de ontvanger een alleen-lezen afspraak met subtiele herkomst
  in het detailvenster, net als de geplande externe agenda's. De Agenda-eisen (alles via `dagInhoud`/`afsprakenTussen`,
  rechten uit `lib/rechten.ts`, geen aannames over aantallen of tijdsbereik, betekenisloze ids) zijn ook voorwaarden
  voor optie A.
- Ophalen per periode (`docs/thuisplanner-productiegeschiktheid.md`, F2) en het besluit B-data zijn ook nodig vóór het
  leespad `shared_events(huishouden, van, tot)`.
- Een externe agenda-afspraak wordt niet automatisch gedeeld met een gekoppeld huishouden; dat vraagt dezelfde
  expliciete keuze als elke andere afspraak.

## 12. Roadmap

De volgorde en de gates horen in `docs/roadmap.md`. Die bijwerking is **uitgesteld** tot de lopende
roadmapwijziging van het Agenda-traject is afgerond en geïntegreerd. Voorgestelde stappen (📝):

| Stap | Inhoud | Afhankelijk van |
| --- | --- | --- |
| CO-0 | Productkompas-toets per stap, AVG-beoordeling, afstemming met het Agenda-traject | Besluit 12 |
| CO-1 | Koppeling, kindkoppeling, toegang per account met instemming van beide kanten; nog geen gedeelde items | CO-0, uitnodigen op e-mail, bèta |
| CO-2 | Afspraken delen: één item, alleen-lezen, deelnemers vertaald, periodiek ophalen, veilig wissen | CO-1, Agenda vernieuwd, ophalen per periode (F2) |
| CO-3 | Taken delen en een klein kindprofiel met delen per veld | CO-2 |
| CO-4 | Persoonlijke meldingen over gedeelde items | CO-2, besluit over push (beslissing 4) |
| CO-B | Optie B | Gebruik van CO-1–CO-3 en een afzonderlijk besluit |
