# Thuisplanner: Mijn spullen & Documenten (fase A, ontwerp)

**Status:** 📝 **ontwerpvoorstel** van 28 oktober 2026. **Er is niets gebouwd.** Er is geen migratie, bucket of
Edge Function gemaakt, en er is geen AI-dienst of externe API gebruikt. Besluit 17 is op 28 oktober 2026 door de
producteigenaar genomen en staat in `docs/productkompas-beslissingen.md`; §11 hieronder was het voorstel daarvoor. De
eerste versie wordt lokaal gebouwd in de worktree `Thuisplanner-spullen`. De beslispunten in §12 zijn nog open; waar dit document een keuze maakt, is dat
het **voorlopige advies**.

Leesvolgorde en voorrang: `PRODUCT_PRINCIPLES.md`, `docs/productkompas-beslissingen.md` (vooral 5, 13, 14, 15 en 16),
`docs/roadmap.md` (releaseplanning), daarna dit document.

## 1. Doel

Gezinnen bewaren belangrijke aankopen, aankoopbewijzen en documenten op één plek, vinden ze snel terug, en koppelen ze
aan de rest van Thuisplanner: onderhoud als taak, een garantie die binnenkort afloopt op Vandaag, en de factuur
terugvinden via de centrale +.

Kernbelofte: **minder onthouden, meer geregeld.** Het is geen losse opslagmap. Het is huishoudkennis (besluit 14) met
bestanden.

## 2. Productkompas-toets

| Vraag | Antwoord |
| --- | --- |
| Neemt dit werk of denkwerk weg? | Ja: "wanneer gekocht, waar is de bon, hoe lang garantie" hoeft niemand meer te onthouden (principe 1 en 3) |
| Hoort het bij organiseren, onthouden of uitvoeren? | Ja: onthouden en, via onderhoud, uitvoeren |
| Kan het met minder zichtbare complexiteit? | Ja: één rij onder Meer, de + als ingang, geen hoofdmodule (principe 2, besluit 14) |
| Veilig zonder onnodig aandacht, controle of privacy af te nemen? | Alleen met privé-opslag, RLS en gate 9, alleen bevestigde velden bewaren, en AI alleen met opt-in (besluit 13 en 14) |
| Toont werkelijk gebruik waarde? | Huisplan had Garanties, Vervaldata-kluis en Onderhoud; testen in de bèta |

**Botsingen en voorwaarden (gemeld vóór het bouwen):**
1. **Besluit 5** zegt bij foto's en documenten "nu niet implementeren". Besluit 17 (§11) herprioriteert dat expliciet.
2. **Releaseplanning:** bèta 1 en Maaltijden R1–R3 gaan voor. Deze functie mag die niet vertragen (§10).
3. **KG-5E licht** komt vóór nieuwe domeinen. Fase B en C worden daarom pas na KG-5E licht gebouwd.
4. **Storage staat bewust uit:** `supabase/config.toml` (`[storage] enabled = false`), de RLS-test KG-T71 en de
   nacontrole weigeren elke bucket of storage-policy. Aanzetten is een bewuste wijziging met een eigen gate 9 (§7).
5. **Besluit 14:** hetzelfde privacymodel (persoonlijk of gedeeld, door de server afgedwongen bij lezen, zoeken,
   koppelen, signalen, meldingen en export), en geen hoofdmodule.
6. **Besluit 15:** onderhoud ("elke 3 maanden") vraagt een herhaling met interval. Dat moet in het ontwerp van de
   herhalende taken mee.
7. **Besluit 16:** een garantiemelding toont geen huishoudkennis in de melding zelf.

## 3. Wat we hergebruiken

**Uit Huisplan** (`index.html`; alleen het idee, niet de opzet):

| Overnemen | Bewust niet |
| --- | --- |
| Garantie met aankoopdatum, winkel, serienummer en een foto van de bon (Garanties) | Foto's als base64 in één gedeeld JSON-document dat iedereen met de deellink kan lezen |
| Sorteren op vervaldatum, "nog N dagen" | `window.open(dataURL)` (geblokkeerd door browsers) en `document.write` |
| Onderhoudslog ("nu gedaan" met een notitie) | Een vaste grens van 90 dagen voor "binnenkort" |
| Een eigen herinneringstermijn (Vervaldata-kluis) | "Slim interval" op stukjes woorden ("cv" en "dak" binnen andere woorden) dat een eigen keuze overschrijft |
| Zoeken over meerdere onderdelen | Items die niet te bewerken zijn; ongecontroleerde links (`javascript:` in de tracking) |
| Een melding op Vandaag als iets binnenkort verloopt | Een melding die verdwijnt zodra iets verlopen is |

**Uit Thuisplanner** (bewezen patronen, zie de migraties):
- samengestelde huishoudsleutels (`unique (household_id, id)`) en verwijzingen per huishouden;
- `private.guard_content()` voor versie, tijden en vaste kolommen; een aparte `*_refs`-trigger voor domeinregels;
- `deleted_at` met terugzetten; seintjes zonder inhoud (`{t, id, v, op}`);
- `delete_household` met `on delete cascade`, en `before_account_delete` voor privé-items;
- koppelen zoals Vakanties: een kolom (`tasks.trip_id` → `tasks.possession_id`) en een koppeltabel
  (`trip_shopping_links` → `document_links`);
- persoonlijk of gedeeld volgens besluit 14; persoonlijk betekent hier **helemaal niet zichtbaar** voor anderen (geen
  "Bezet", dus geen aparte detailtabel nodig);
- `maakSamen` en Voorstel v2 uit KG-5E licht: één bevestiging maakt dossier, document en koppeling samen;
- de twee-fasenaanpak van de uitnodigingsmail (wachtrij, bevestiging, opruimen) voor betrouwbaar uploaden.

## 4. Functioneel ontwerp

### 4.1 Begrippen

| Begrip | Wat | Kan bestaan zonder het andere |
| --- | --- | --- |
| **Spul** (aankoopdossier) | Een product of bezit: vaatwasser, fiets, laptop | Ja (zonder bon) |
| **Document** | Eén bestand met gegevens: factuur, bon, garantiebewijs, handleiding, polis, contract, onderhoudsrapport, overig | Ja (bijvoorbeeld een polis zonder spul) |
| **Koppeling** | Document ↔ spul; veel-op-veel (één bon met twee producten; één spul met factuur en handleiding) | – |
| **Logregel** | Onderhoud of reparatie: datum, soort, kosten, notitie, optioneel een document | Hoort bij een spul |
| **Onderhoudstaak** | Een gewone taak met `possession_id`; herhaling volgens besluit 15 | Hoort bij een spul |

**Eén document, meerdere plekken:** de factuur van de vaatwasser is **één rij met één bestand**. Ze verschijnt in
Documenten en in het dossier van de vaatwasser via de koppeling. Er wordt nooit gekopieerd.

### 4.2 Het aankoopdossier

| Blok | Velden | Opmerking |
| --- | --- | --- |
| Product | Naam (verplicht), categorie, merk, model, serienummer, optioneel een productfoto | – |
| Aankoop | Aankoopdatum, winkel of leverancier, prijs (in centen), bestelnummer | – |
| Garantie | Commerciële garantie: termijn en einddatum **zoals de gebruiker invoert**. Aanvullende garantie: einddatum, aanbieder, document | **Geen berekende wettelijke einddatum** (§4.4) |
| Documenten | De gekoppelde documenten, gegroepeerd per soort | Toevoegen, ontkoppelen, vervangen |
| Onderhoud en reparaties | De log en de gekoppelde taken | – |

**Status per veld:** *bevestigd* (gezien of ingevoerd door de gebruiker), *voorstel* (herkend, nog niet bevestigd) of
*ontbreekt*. Een voorstel wordt nooit stil als waar opgeslagen; de controlekaart toont welke velden nog aandacht
vragen.

### 4.3 Bewerken, verplaatsen, vervangen, verwijderen

- **Koppelen aan…** of **ontkoppelen**: alleen de koppeling verandert; het document blijft.
- **Vervangen**: een nieuw bestand wordt het document; het oude gaat naar de prullenbak.
- **Verwijderen**: eerst de **prullenbak**, 30 dagen terug te zetten (zoals de archieftermijn). Daarna wordt de rij en het
  bestand echt gewist. Een spul verwijderen laat gekoppelde documenten staan, tenzij de gebruiker kiest "ook de
  documenten".
- **Persoonlijk of gedeeld wisselen**: alleen de eigenaar van het item.

### 4.4 Garantie en recht (geen juridisch advies in de app)

- De **wettelijke garantie** (conformiteit, art. 7:17 BW) heeft geen vaste termijn: een product moet een redelijke
  levensduur hebben. De bewijslast ligt het eerste jaar na levering bij de verkoper (art. 7:18 lid 2 BW, sinds
  1 januari 2022).
- De **commerciële garantie** (fabrikant of winkel) geldt daarnaast, niet in plaats daarvan. Een **aanvullende**
  (verlengde) garantie is vaak een betaald product.
- Daarom berekent de app **geen** juridische einddatum en meldt hij nooit "garantie verlopen" alsof de rechten op zijn.
  Bij elke garantie staat een vaste, korte uitleg: "Ook na deze datum kun je recht hebben op herstel of vervanging
  (wettelijke garantie)."

### 4.5 Terugvinden

- **Via de +:** "Wanneer hebben we de vaatwasser gekocht?" of "factuur vaatwasser" geeft een **antwoordkaart** (datum,
  winkel, een tik naar het dossier en de factuur). Lokaal, binnen de rechten, zonder AI.
- **In het overzicht:** zoeken op productnaam, merk, model, winkel, soort document en datum.
- Een tik op een resultaat opent het item zelf, niet alleen het scherm.

### 4.6 Vandaag en meldingen

- Vandaag toont **hoogstens één regel**: een **ingevoerde** commerciële of aanvullende garantie die binnen de ingestelde
  termijn afloopt (standaard 30 dagen; per spul aan of uit). Een rustige dag blijft rustig (principe 2).
- Onderhoud verschijnt als een gewone taak (met herhaling volgens besluit 15).
- Een pushmelding (besluit 16) blijft algemeen: "Een garantie loopt binnenkort af", zonder productnaam of bedrag.

## 5. UX en navigatie

- **Plek:** onder **Meer** één rij **"Spullen & documenten"**, met binnenin twee tabbladen: **Spullen** | **Documenten**.
  De onderste balk verandert niet. (Voorlopig advies, beslispunt 2.)
- **De + blijft de ingang:**
  1. In de invoerbalk een knop met paperclip/camera: "Foto maken", "Foto kiezen", "Bestand (PDF)".
  2. Na het kiezen: een **controlekaart** met per veld "zeker", "controleer" of "ontbreekt".
  3. Keuze: **Nieuw spul**, **Koppel aan bestaand** (met een voorstel, bijvoorbeeld "Hoort dit bij de vaatwasser?") of
     **Alleen bewaren**.
  4. **Opslaan.** "Bewaard" verschijnt pas als het bestand op de server bevestigd is (§6.3).
- **Zonder herkenning** werkt alles: het formulier is kort, en "ontbreekt" is zichtbaar zonder te storen.
- **Telefoon:** grote tikvlakken; de camera via `<input type="file" accept="image/*" capture="environment">` (geen extra
  rechten; de `Permissions-Policy camera=()` blokkeert dit niet); foto's op het toestel verkleind (langste zijde rond
  2000 px, ongeveer 0,5 MB) en zonder plaatsgegevens (opnieuw tekenen via canvas); een PDF opent buiten de app in de
  viewer van de telefoon.
- **Delen naar de app:** op Android via `share_target` in het manifest (later). Op een iPhone kan een web-app geen
  gedeelde bestanden ontvangen (WebKit-verzoek 194593); daar "Bewaar in Bestanden" en daarna het bestand kiezen. Dat
  staat eerlijk in de uitleg.

## 6. Technisch ontwerp

### 6.1 Datamodel (één migratie voor het domein; eigen uitleg, gate 9 en akkoord)

| Tabel | Belangrijkste kolommen | Patroon |
| --- | --- | --- |
| `possessions` | `household_id`, `id`, `name`, `category`, `brand`, `model`, `serial`, `purchase_date`, `shop`, `price_cents`, `currency`, `order_number`, `warranty_commercial_until`, `warranty_extra_until`, `warranty_extra_provider`, `notes`, `visibility`, `owner_member_id`, `field_status` (jsonb: bevestigd/voorstel/ontbreekt per veld), `version`, tijden, `deleted_at` | Samengestelde FK's; `guard_content`; seintje |
| `documents` | `household_id`, `id`, `title`, `kind`, `document_date`, `visibility`, `owner_member_id`, `upload_status` (`wacht`/`klaar`/`mislukt`), `storage_path`, `mime`, `size_bytes`, `sha256`, `preview_path`, `fields` (jsonb, alleen bevestigde velden), `version`, tijden, `deleted_at` | Idem |
| `document_links` | `household_id`, `document_id`, `possession_id`, `created_at` | Zoals `trip_shopping_links`; een unieke index "actueel" |
| `possession_log` | `household_id`, `id`, `possession_id`, `log_date`, `kind` (onderhoud/reparatie), `cost_cents`, `note`, `document_id` | Idem |
| `tasks.possession_id` | Kolom met FK `on delete set null` | Zoals `tasks.trip_id` |

- Persoonlijk: de RLS toont de rij alleen aan de eigenaar (`owner_member_id` hoort bij het eigen account). Een
  koppeling naar een persoonlijk document is alleen zichtbaar voor wie het document mag zien (geen aanwijzing dat het
  bestaat, besluit 14).
- Archivering en ontkoppelen van een account: persoonlijke items volgen `drop_private_on_unlink`,
  `purge_member_private` en `before_account_delete`, inclusief de bestanden (§6.4).
- **Geen** IBAN-veld, **geen** opgeslagen volledige OCR-tekst (standaard), **geen** BSN of betaalgegevens (besluit 14).

### 6.2 Opslag

- Eén **privé-bucket** `documenten`, met een maximale bestandsgrootte en toegestane MIME-typen per bucket.
- Paden: `<household_id>/<document_id>/origineel` en `<household_id>/<document_id>/voorbeeld.jpg` (klein, op het
  toestel gemaakt; geen betaalde image transformations).
- Policies op `storage.objects`: per operatie, via de poort (`private.uid()`, `private.my_household_ids()`; nooit
  `auth.uid()`, zoals KG-T73 eist) **en** via de zichtbaarheid van de bijbehorende `documents`-rij.
- Downloaden alleen met een **kort geldige ondertekende link** (bijvoorbeeld 60 seconden) en
  `Content-Disposition: attachment`. Nooit een publieke URL.
- Wat verandert: `config.toml` (storage aan), de start-scripts (niet langer `-x storage-api`), de CSP (`img-src` met
  `blob:`; `connect-src` dekt `/storage/v1` al), KG-T71 en de nacontrole (van "geen opslag" naar een **vaste lijst**
  van verwachte buckets en policies).

### 6.3 Betrouwbaar uploaden (twee fasen)

1. De RPC `documenten_begin` maakt een document met `upload_status = 'wacht'` en geeft het pad terug.
2. De app uploadt het bestand (met de eigen sessie; de policy staat alleen een `wacht`-document van een actief lid toe).
3. De Edge Function `bevestig-upload` controleert: het object bestaat, de grootte, de **magic bytes** (`%PDF-`,
   `FF D8 FF`, `89 50 4E 47`, `RIFF…WEBP`) en het MIME-type. Pas dan `upload_status = 'klaar'`.
4. Daarna maakt `maakSamen` het dossier en de koppelingen. De app toont "Bewaard" pas na stap 3 en 4.

Mislukt stap 2 of 3: de app toont "Niet gelukt, opnieuw proberen", en het document blijft niet als "bewaard" staan. Een
dagelijkse taak verwijdert documenten die langer dan 24 uur op `wacht` staan, met hun object.

### 6.4 Verwijderen, bewaren en back-ups

- Een SQL-cascade verwijdert rijen, **geen bestanden**. Daarom komt er een opruimfunctie (Edge Function met de
  service-rol, gepland via pg_cron en pg_net zoals de uitnodigingsmail) die wist:
  - bestanden van documenten die langer dan 30 dagen in de prullenbak staan;
  - bestanden zonder bijbehorende rij (na `delete_household`, een verwijderd account of een mislukte upload).
- Het **verwijderscript** uit de bèta-voorbereiding (§5.4) krijgt de bestanden erbij, met dezelfde controle "niets meer
  aanwezig".
- **De back-ups van Supabase bevatten geen Storage-bestanden.** De eigen export moet de bestanden dus meenemen
  (uitbreiding van `export.mjs`, met controlesommen). Bij groei (honderden huishoudens) is een EU-opslag voor die kopie
  nodig: een nieuwe verwerker en een eigen besluit.
- Bewaartermijnen in de privacyverklaring: tot de gebruiker verwijdert; de prullenbak 30 dagen; de eigen exports
  hoogstens 4 weken.

### 6.5 Bestandsveiligheid

| Regel | Waarom |
| --- | --- |
| Alleen PDF, JPEG, PNG en WebP; HEIC op het toestel naar JPEG | Geen SVG (scripts), HTML of Office (macro's) |
| Maximaal 10 MB per bestand (voorlopig advies) | Een telefoonfoto wordt eerst verkleind |
| Type controleren op de server (magic bytes), niet op de extensie | De client kan liegen |
| Nooit inline weergeven vanaf de app; afbeeldingen als `blob:`; PDF's openen buiten de app | Een PDF kan scripts of exploits voor de viewer bevatten |
| Plaatsgegevens (EXIF/GPS) eruit op het toestel | Privacy |
| Geen links uit documenten aanklikbaar maken | Geen `javascript:`-links zoals in Huisplan |

### 6.6 Documentherkenning, in stappen

| Stap | Hoe | Kosten | Privacy |
| --- | --- | --- | --- |
| 1 | Alles met de hand, met een kort formulier | €0 | Er gaat niets naar buiten |
| 2 | **Digitale PDF's:** de tekstlaag lezen op het toestel (pdf.js), plus Nederlandse regels voor datum, bedrag, winkel, garantietermijn en serienummer | €0 | Er gaat niets naar buiten |
| 3 | **Foto's van bonnen:** AI met beeldherkenning, pas na een kwaliteitsproef met verzonnen bonnen (zoals `docs/thuisplanner-ai-kwaliteitsproef.md`), een AVG-beoordeling en een kostenplafond | Zie §6.8 | Opt-in per document; alleen de afbeelding gaat naar buiten |

Herkende velden komen altijd als *voorstel* op de controlekaart.

### 6.7 E-mail

| Route | Wanneer | Toelichting |
| --- | --- | --- |
| A. Een PDF-bijlage uploaden | Fase C | De bijlage eerst opslaan, dan kiezen in de app |
| B. Een EML-bestand uploaden | Later | Een parser op de server (bijvoorbeeld `postal-mime`), HTML opschonen of weglaten, bijlagen met dezelfde controles |
| C. Een eigen doorstuuradres | Alleen na een afzonderlijk besluit | Lettermint kan inkomende mail ontvangen; vraagt een geheim adres per huishouden, een controle op de afzender en een DPA. Geen volledige inkomende maildienst bouwen zonder akkoord. |

### 6.8 Kosten (indicatief, per maand)

Aannames: 3 documenten per huishouden per maand, 1,5 pagina, foto's verkleind tot ongeveer 0,5 MB, opslag gemeten na
12 maanden. ⚠️ De prijzen van Azure en Google komen deels uit bronnen van derden; bij Workers AI is verwerking in de EU
niet gegarandeerd.

| | 5 huishoudens | 100 huishoudens | 1.000 huishoudens |
| --- | --- | --- | --- |
| Opslag na 1 jaar | ±0,1 GB, binnen Pro | ±2 GB, binnen Pro | ±18 GB, binnen de 100 GB van Pro |
| Herkenning stap 1–2 | €0 | €0 | €0 |
| Herkenning stap 3 | €0–0,10 | ±€0–5 | ±€2 (Workers AI) tot ±€45 (Azure of Google) |
| Eigen kopie van de bestanden | lokaal | lokaal | een EU-opslag nodig (kleine kostenpost, eigen besluit) |

Bronnen: Supabase Storage (toegang, limieten, prijzen, back-ups), Cloudflare Workers AI (prijzen, privacy), Azure AI
Document Intelligence, Google Document AI, Anthropic (vision, bewaartermijn), WebKit-verzoek 194593 en de
Kamerstukken 36163 (bewijslast). Alleen gelezen op 28 oktober 2026.

## 7. Gate 9 voor het domein "spullen en documenten"

**Testmatrix** (RLS-tests met tegenproeven, plus integratietests tegen de lokale Storage):

| Wie | Lezen rij | Lezen bestand | Wijzigen | Verwijderen | Koppelen |
| --- | --- | --- | --- | --- | --- |
| Lid, gedeeld item | ja | ja (ondertekende link) | ja | ja (prullenbak) | ja |
| Lid, eigen persoonlijk item | ja | ja | ja | ja | ja |
| Ander lid, persoonlijk item | **nee, ook geen aanwijzing** | **nee** | nee | nee | nee |
| Gearchiveerd lid | nee | nee | nee | nee | nee |
| Lid van een ander huishouden | **nee** | **nee** | nee | nee | nee |
| Niet ingelogd / wachtwoordsessie | nee | nee | nee | nee | nee |

**Expliciete negatieve tests** (moeten allemaal falen voor huishouden A op items van B):
- een bekend pad of `document_id` van B in een download- of signed-URL-verzoek;
- een ondertekende link van B na het verlopen;
- een upload naar een pad onder `<household_id van B>/`;
- een upload naar een eigen pad met een `document_id` dat niet op `wacht` staat of bij B hoort;
- een koppeling van een eigen spul aan een document van B (en andersom);
- zoeken of de antwoordkaart in de + met een productnaam van B;
- een realtime-seintje dat iets over B verraadt;
- een persoonlijk document van de partner via een koppeling, een zoekopdracht of de export.

Elke test heeft een tegenproef: met een opzettelijk te ruime policy moet de test falen.

## 8. Teststrategie (overig)

| Onderwerp | Test |
| --- | --- |
| PDF-upload | Een digitale PDF met tekstlaag (verzonnen); een gescande PDF zonder tekstlaag; een PDF met JavaScript (geweigerd bij weergave, niet inline) |
| Foto vanaf de telefoon | iPhone (Safari, ook HEIC) en Android (Chrome); verkleinen; plaatsgegevens verwijderd |
| Grote of ongeldige bestanden | 11 MB; een `.pdf` die eigenlijk HTML is; een SVG; een leeg bestand |
| Onleesbare bon | De herkenning faalt netjes; het document is toch te bewaren, met handmatige velden |
| Ontbrekende gegevens | "Ontbreekt" zichtbaar; opslaan kan |
| Meerdere producten op één bon | Eén document, twee spullen, twee koppelingen |
| Dubbele uploads | Dezelfde SHA-256 in hetzelfde huishouden: "Dit document staat er al", met de keuze om toch te bewaren |
| Verkeerd herkend | Een voorstel corrigeren; nooit stil opslaan |
| Garantie | Geen berekende wettelijke einddatum; de vaste uitleg staat erbij; Vandaag alleen binnen de termijn |
| Zoeken | Op naam, merk, model, winkel, soort, datum; de antwoordkaart in de +; de bestaande herkenning blijft gelijk (46 gevallen in `zin.test.ts` en de mutatietoets) |
| Privé en gedeeld | Wisselen door de eigenaar; de partner ziet niets van een persoonlijk item |
| Scheiding | Zie §7 |
| Uploadonderbreking | Netwerk weg tijdens stap 2 of 3: geen "Bewaard"; opnieuw proberen werkt; de opruimtaak ruimt `wacht` op |
| Verwijderen | Prullenbak, terugzetten, na 30 dagen echt weg (rij en object); het verwijderscript laat niets achter |
| Meerdere apparaten | Een upload op de telefoon verschijnt op de laptop; gelijktijdig bewerken geeft de bekende conflictmelding |
| Demomodus | Geen netwerkverkeer naar Storage; de labels "voorbeeld" en "nagespeeld" zichtbaar |

## 9. Demo-ontwerp (fase B)

**Demogegevens** (allemaal verzonnen en als voorbeeld gemarkeerd):
- Spul: "Afwasser 3000 (voorbeeld)", merk "Voorbeeldmerk", gekocht op 28 oktober 2026 bij "Voorbeeldwinkel",
  €549 (verzonnen), commerciële garantie tot 28 oktober 2028 (voorbeeld).
- Documenten: een verzonnen PDF-factuur met het watermerk "VOORBEELD" en een verzonnen bonfoto, beide meegeleverd in de
  app; een voorbeeldhandleiding.
- Een onderhoudstaak "Filter schoonmaken (voorbeeld)".

**Flow:**
1. Meer → Spullen & documenten.
2. De vaatwasser bekijken.
3. De factuur openen.
4. De aankoopdatum en de garantie bekijken.
5. Via de + een bonfoto of factuur toevoegen.
6. De voorgestelde gegevens controleren. **Het label is duidelijk: "Demo: deze herkenning is nagespeeld."** Enkele
   velden staan bewust op "controleer" of "ontbreekt".
7. Bevestigen.
8. Terugvinden via "Wanneer hebben we de vaatwasser gekocht?".

**Eerlijk onderscheid:** de demo slaat niets echt op (alleen in het geheugen van het tabblad), gebruikt geen Storage,
geen echte herkenning en geen echte persoonsgegevens, en zegt dat ook.

## 10. Fasen en inschattingen

| Fase | Inhoud | Afhankelijk van | Werkdagen |
| --- | --- | --- | --- |
| **A: ontwerp** | Dit document, besluit 17 (voorstel), de gate-9-matrix, de testset van verzonnen bonnen en facturen | – | 2–3 (dit document is de eerste versie) |
| **B: demo** | De schermen, de demogegevens, de verzonnen PDF en foto, de bijlageknop in de + met nagespeelde herkenning, de zoekvraag, koppelen en verplaatsen en verwijderen, de garantieregel op Vandaag; e2e en een iPhone-test | **KG-5E licht** | 5–7 |
| **C1: online basis** | Migratie, bucket en policies, gate 9 met tegenproeven, uploaden in twee fasen, `bevestig-upload`, opruimen, CSP, configuratie en testcatalogus, export met bestanden, het verwijderscript met bestanden | B, Pro, akkoord per migratie | 10–14 |
| **C2: herkenning stap 2** | De tekstlaag van PDF's en Nederlandse regels, met een testset | C1 | 3–4 |
| **Later** | AI voor foto's (na de kwaliteitsproef; 4–6 dagen plus kosten), EML (2–3), delen op Android (1), onderhoud met interval (na besluit 15), garantie als pushmelding (na besluit 16), een doorstuuradres (4–6 plus een dienst) | – | – |

**Plek in de releaseplanning (besluit van 28 oktober 2026, roadmap mijlpaal 2d):** de functie is **bedoeld voor bèta 1**
(3–5 gezinnen), mits beveiliging, documentopslag, huishoudrechten, verwijderprocedure en tests aantoonbaar in orde zijn.
Is ze dan nog niet veilig of stabiel genoeg, dan start bèta 1 zonder deze functie. Het eerdere voorstel (fase B na
KG-5E licht, fase C na bèta 1) is daarmee vervallen.

**Eenvoudiger beginnen:** zonder aparte reparatietabel (de log volstaat), zonder EML en zonder AI. Dossier, document,
koppeling en log dekken het grootste deel van de waarde, en de rest groeit er later bij zonder ombouw.

## 11. Voorstel: besluit 17

> ### 17. Mijn spullen & Documenten (voorstel, 28 oktober 2026)
>
> - **Besluit van de producteigenaar:** Thuisplanner krijgt "Mijn spullen & Documenten": aankoopdossiers van
>   belangrijke spullen en huishoudelijke documenten (facturen, bonnen, garantiebewijzen, handleidingen, polissen,
>   contracten), gekoppeld aan de rest van Thuisplanner. Het beheer staat onder Meer; er komt **geen extra hoofdmodule**.
>   De centrale + is de belangrijkste ingang, ook voor bestanden en foto's.
> - **Productkompas:** principes 1, 2, 3 en 6; de regel "Privacy volgt de situatie"; beslissingen 5, 13, 14, 15 en 16.
>   Dit besluit herprioriteert beslissing 5 voor documenten en foto's.
> - **Uitgangspunten:**
>   - **Eén onderliggend item, meerdere contexten.** Een document is één rij met één bestand, en kan aan meerdere
>     spullen gekoppeld zijn. Documenten en Mijn spullen zijn weergaven van dezelfde gegevens; er wordt niet gekopieerd.
>   - **Persoonlijk of gedeeld**, zoals besluit 14, door de server afgedwongen bij lezen, downloaden, zoeken, koppelen,
>     signalen, meldingen en export. Wie iets niet mag zien, krijgt geen aanwijzing dat het bestaat.
>   - **Privé-opslag:** geen publieke bestands-URL's; alleen kort geldige ondertekende links; de bestandstypen worden
>     op de server gecontroleerd.
>   - **De gebruiker bevestigt.** Herkende gegevens zijn een voorstel. Er wordt niets stil opgeslagen. Alles werkt ook
>     zonder herkenning.
>   - **Geen juridische einddatum.** De app berekent geen einde van de wettelijke garantie. Alleen ingevoerde
>     commerciële of aanvullende garanties krijgen een datum en eventueel een herinnering.
>   - **Minimale gegevens:** alleen bevestigde velden; geen volledige OCR-tekst als standaard; geen IBAN, BSN of
>     betaalgegevens.
>   - **Herkenning in stappen:** eerst handmatig en de tekstlaag van PDF's (zonder externe dienst); AI voor foto's
>     alleen na een kwaliteitsproef, een AVG-beoordeling, een opt-in en een kostenplafond (besluit 13).
>   - **Demo en echt gescheiden:** de demo laat nagespeelde herkenning en opslag duidelijk zien als nagespeeld.
> - **Voorwaarden vóór implementatie:**
>   - gate 9 voor het domein "spullen en documenten", met negatieve tests op bestanden van andere huishoudens (ook via
>     een bekende URL, bestands-id of pad);
>   - Storage alleen na een eigen akkoord; de bestaande controle "geen opslag" wordt een vaste lijst van verwachte
>     buckets en policies;
>   - een aantoonbare verwijderprocedure inclusief bestanden, en een eigen export die de bestanden meeneemt;
>   - geen nieuwe migratie, bucket, dienst of kostenpost zonder uitleg en afzonderlijk akkoord.
> - **Wat niet verandert:** het Productkompas en de beslissingen 1–16.

## 12. Beslispunten (nog open)

| # | Beslissing | Voorlopig advies |
| --- | --- | --- |
| 1 | Besluit 17 vastleggen, en de plek in de roadmap (vóór of na Maaltijden R2–R3) | Vastleggen; fase B na Maaltijden R1, fase C na bèta 1 |
| 2 | Navigatie | Eén rij "Spullen & documenten" onder Meer, met twee tabbladen |
| 3 | Standaard privacy per soort document | Gedeeld: factuur, bon, garantie, handleiding. Persoonlijk: verzekering, contract, overig |
| 4 | Herkenning | Online eerst stap 1–2; AI voor foto's pas na een eigen kwaliteitsproef |
| 5 | Demo | Na KG-5E licht in de echte app; als alternatief nu een losse klikbare prototypepagina buiten de app (1–2 dagen, raakt niets, wordt later weggegooid) |
| 6 | Prullenbak | 30 dagen terugzetten, daarna echt wissen (rij en bestand) |
| 7 | Limieten | 10 MB per bestand; PDF, JPEG, PNG, WebP; foto's verkleind op het toestel |
| 8 | E-mail | A in fase C; B later; C alleen na een eigen besluit |
| 9 | Besluit 15 uitbreiden met "elke N weken of maanden" voor onderhoud | Ja, in het ontwerp van de herhalende taken |

## 13. Vragen via de + (aanvulling van de producteigenaar, 28 oktober 2026; ontwerp, niets gebouwd)

**Uitgangspunt:** de slimme + herkent niet alleen acties, maar ook vragen, en beantwoordt die uit de eigen
huishoudgegevens. Er komt **geen** aparte knop of apart veld voor "Vraag stellen". Alles gaat via dezelfde invoerbalk:
tekst, spraak (zie §13.6) of een bestand of foto (de bijlageknop, §5).

### 13.1 Nulmeting: wat de + nu met een vraag doet (gemeten op 116c4de)

| Invoer | Nu (`begrijp()`) | Gewenst |
| --- | --- | --- |
| "Wanneer hebben we de vaatwasser gekocht?" | Taak met die zin als titel | Antwoord: de aankoopdatum, met bron |
| "Laat de factuur van de vaatwasser zien" | Taak | Het document openen (ondertekende link) |
| "factuur vaatwasser" | Taak "Factuur vaatwasser" | Antwoordkaart met de factuur (zoekvraag zonder vraagteken) |
| "Wanneer verloopt de garantie? Herinner me een maand van tevoren" | Eén taak met de hele zin | Antwoord, daarna een voorstel om iets in te plannen |
| "Wat moeten we nog kopen?" | **Boodschap** "Wat moeten we nog" | Later: een vraag over Boodschappen |
| "Zet zwemles donderdag om 16:00 in de agenda" | Afspraak "Zet zwemles", do 16:00 | Afspraak "Zwemles" ("zet … in de agenda" hoort niet in de titel) |

Een vraag wordt nu dus stil een taak of een boodschap. Dat is de belangrijkste reden voor deze laag.

### 13.2 Eén intentieherkenning, vóór de bestaande herkenning

Een nieuwe pure module `lib/intentie.ts` (geen netwerk, geen klok, geen AI), die vóór `begrijp()` kijkt:

| Intentie | Herkend aan (v1, alleen sterke signalen) | Wat de + toont |
| --- | --- | --- |
| **vraag** | eindigt op "?", of begint met een vraagwoord (wanneer, welk(e), wat, waar, hoe, hoeveel, hoelang, wie, hebben we, is er, staat er), of een opvraagwerkwoord ("laat … zien", "toon", "zoek", "open de factuur") | Een **antwoordkaart** in plaats van de itemkaart |
| **actie** | al het andere | De bestaande kaart, **ongewijzigd** (`begrijp()` blijft precies zoals het is) |
| **vraag en actie** | twee zinsdelen: het eerste een vraag, het tweede met een actiewerkwoord ("herinner me", "zet", "plan") | Eerst het antwoord, daaronder één voorstel; pas na bevestiging bewaard |
| **onduidelijk** | een vraagsignaal zonder passende bron ("Wanneer is het?") | Eén gerichte vervolgvraag, en "Toch toevoegen als taak" |

- **Bij twijfel geldt de bestaande werking.** De intentielaag neemt een zin alleen over bij een sterk vraagsignaal;
  anders gaat de zin ongewijzigd naar `begrijp()`. Zo blijven de 46 gevallen in `zin.test.ts` en de mutatietoets groen.
- **Altijd terug te draaien:** op de antwoordkaart staat "Toch toevoegen als taak" (fouten moeten goedkoop zijn). De
  intentie is geen nieuwe `Soort`: een antwoord is geen item.

### 13.3 Antwoorden: alleen uit gestructureerde gegevens, met bron

- Per domein een **vraagbron** met dezelfde vorm: `vind(vraag, staat)` geeft een antwoord met bron, "ontbreekt", of niets.
  v1: **Spullen & documenten** (aankoopdatum, winkel, prijs, merk, model, serienummer, garantie, en een document laten
  zien). Later Agenda ("wanneer is de tandarts?"), Taken, Boodschappen ("wat moeten we nog kopen?") en Vakanties
  ("wanneer vertrekken we?"), elk als eigen bron, zonder de kern te wijzigen.
- **Niets verzinnen.** Ontbreekt een veld, dan zegt de kaart dat ("Bij Afwasser 3000 staat geen modelnummer", met
  "Aanvullen"). Niets gevonden: "Ik vind niets over vaatwasser." Een veld met de status *voorstel* telt niet als
  antwoord (of staat er als "nog niet bevestigd").
- **Een aanklikbare bron bij elk antwoord:** "Gekocht op 28 oktober 2026 · Voorbeeldwinkel" opent het dossier; de factuur
  opent het document.
- **Rechten:** de bron zoekt alleen in wat de app al mag zien (in het echte pad: wat RLS teruggeeft). De + vraagt nooit
  iets aan de server dat het scherm niet ook mag. Een persoonlijk document van een ander bestaat voor de + niet: geen
  antwoord en geen aanwijzing (besluit 14).
- **Geen duplicaten:** een antwoord maakt niets aan; een vervolgactie hergebruikt een bestaand item (bijvoorbeeld een
  open taak met dezelfde titel en datum) in plaats van een tweede te maken.

### 13.4 Vraag en actie: "Herinner me een maand van tevoren"

Besluit 16 kent nog geen garantieherinnering, en de pushproef (gate) is niet gedaan. De vervolgactie wordt in v1 daarom
een **voorstel voor een gewone taak** "Garantie Afwasser 3000 loopt af", op de garantiedatum min één maand, gekoppeld aan
het spul (`tasks.possession_id`), pas na een tik op Toevoegen. Zodra herinneringen bestaan (besluit 16), wordt dit een
herinnering met een algemene melding zonder productnaam (§4.6). Is er geen garantiedatum, dan maakt de + niets en zegt hij
dat de datum ontbreekt.

### 13.5 Wat dit vraagt van de bestaande slimme +

| Onderdeel | Wijziging | Risico en maatregel |
| --- | --- | --- |
| `lib/zin.ts` (`begrijp`) | **Geen** | – |
| `lib/intentie.ts` (nieuw) | Intentie en zinsdelen; eigen testtabel; regels erbij in `scripts/tegenproeven-invoer.mjs` | Een te ruime vraagherkenning maakt van een taak een vraag: alleen sterke signalen, plus "Toch toevoegen" |
| `lib/vraag/*.ts` (nieuw) | De vraagbronnen; v1 alleen Spullen | Een verzonnen antwoord: alleen *bevestigde* velden, tests op "ontbreekt" |
| `SnelInvoer.tsx` | De antwoordkaart naast de itemkaart; de bijlageknop | Regressie in de bestaande +: de itemkaart blijft ongewijzigd, alleen de keuze welke kaart verschijnt is nieuw; de bestaande e2e en Vitest blijven gelijk |
| `lib/betekenis.ts` | Geen (de antwoordkaart krijgt een eigen tekstfunctie) | – |

**Het aansluiten in de bestaande + gebeurt pas na een afzonderlijk akkoord.** Tot dan bestaan `intentie.ts` en de
vraagbronnen als losse modules met eigen tests, niet gekoppeld aan `SnelInvoer.tsx`. De lopende bèta en de stand voor
Sanne (hoofdlijn `thuisplanner-vakanties`) veranderen niet.

### 13.6 Spraak

Dicteren met de microfoon van het telefoontoetsenbord werkt nu al in de invoerbalk, zonder wijziging. Een eigen
microfoonknop met de Web Speech API stuurt de audio in Safari en Chrome naar Apple of Google: een externe verwerker, die
botst met "geen externe dienst" in deze versie en met besluit 13 en 14. In v1 dus geen eigen spraakknop; dat vraagt een
eigen besluit.

### 13.7 Plaats in de roadmap van de slimme +

1. **Nu (deze branch, los):** `intentie.ts` en de Spullen-bron, met tests; niet aangesloten.
2. **Na akkoord:** aansluiten in de +, eerst in de demo (nagespeeld), daarna lokaal echt.
3. **Na KG-5E licht:** de bronnen lezen via de ene Opslag-interface; daarna de bronnen Agenda, Taken, Boodschappen en
   Vakanties.
4. **Later:** vragen over documentinhoud: eerst de tekstlaag van PDF's op het toestel (§6.6 stap 2), AI pas na de
   kwaliteitsproef en met opt-in (besluit 13).
