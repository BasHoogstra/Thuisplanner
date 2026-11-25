# Persoonlijke instellingen en pushmeldingen tijdens de besloten bèta (onderzoek en plan)

- **Bijgewerkt (25 november 2026, tweede ronde):** de planning, de fasering en de agendaparagraaf zijn opgenomen in en
  vervangen door `docs/thuisplanner-centrale-beta-planning.md`. Vervallen door keuzes van de producteigenaar: K3/D4 (taken
  krijgen wél een optioneel tijdstip en een optionele herinnering, zie de centrale planning §2), het aparte
  `event_reminders` (wordt `item_reminders`), en D12a (ICS is voor Apple geen eindoplossing). Het technisch ontwerp van de
  meldingen (§2) blijft gelden.
- **Status:** concept, 25 november 2026. Alleen onderzoek en planning. Er is niets gebouwd, geen migratie aangemaakt,
  niets gecommit, gepusht, gemerged of uitgerold, en er is geen VAPID-sleutel, project of externe registratie gemaakt.
- **Opdracht:** alle voorgestelde persoonlijke instellingen, inclusief pushmeldingen, al **tijdens** de besloten bèta
  beschikbaar maken (gefaseerd), in plaats van erna; de agendakoppelingen met Apple, Google en Outlook meenemen. De
  start van de bèta blijft **maandag 14 december 2026**.
- **Gelezen (in de verplichte volgorde):** `PRODUCT_PRINCIPLES.md`; `docs/productkompas-beslissingen.md` (besluiten
  1–19, stand van `origin/thuisplanner-overzicht`); `docs/roadmap.md` (idem); daarna `thuisplanner-besluit20-bouwvoorstel.md`,
  `thuisplanner-meldingen.md` (M1–M8), `thuisplanner-beta-voorbereiding.md`, de drie agenda-adviezen
  (`-integratie-advies`, `-tweerichting-advies`, `-ontwerp-fase-a`), `thuisplanner-uitrol-55-56-58.md`, PR #57 (diff en
  beschrijving), PR #58, de migraties tot en met `20261124120000_account_preferences.sql` en de overdrachtsnotitie van P0.
- **Niet aangeraakt:** het lopende bugonderzoek naar de persoonlijke instellingen op staging.

Leeswijzer: §0 eerst gemeld (botsingen) · §1 de set instellingen en meldingen · §2 technisch ontwerp · §3 parallel werk ·
§4 uitrol in fasen · §5 agendakoppelingen · §6 planning, capaciteit, kosten en risico's · §7 beslissingen.

---

## 0. Eerst gemeld: botsingen en gaten

| # | Wat | Waarom het ertoe doet | Voorstel |
| --- | --- | --- | --- |
| **K1** | **Besluit 20 staat nog niet in `productkompas-beslissingen.md`.** Op `origin/thuisplanner-overzicht` eindigt het bij besluit 19; de tekst van besluit 20 staat alleen in het bouwvoorstel (§1), terwijl PR #58 er al op steunt | De gate "meldingen" en de verruiming van besluit 16 moeten formeel vastliggen vóór de eerste meldingenmigratie (CLAUDE.md: eerder document gaat voor) | Besluit 20 vastleggen, aangevuld met dit plan (beslissing **D1**). Het Productkompas zelf niet wijzigen |
| **K2** | **Alle meldingen in de bèta** gaat verder dan besluit 20 zoals voorgesteld (A3: activiteit pas *na* de bètastart) en veel verder dan besluit 16 ("een kleine set") | Principe 6 en beslissing 4: alleen aandacht vragen bij echte waarde. Beslissing 10 stelde "toasts over wijzigingen door anderen" al ter discussie | Kan, mits: **activiteit en samenvattingen staan standaard uit**, komen pas in fase B2 (na de start, tijdens de bèta), achter een server-schakelaar, en we meten het gebruik. Zo blijft de rustige standaard intact |
| **K3** | **Taken hebben geen tijd.** `public.tasks` heeft alleen `due_date` (migratie `kg5c_inhoud`), dus "herinnering taak met tijd" (bouwvoorstel §4) kan niet zonder migratie in het takendomein | Een tijdkolom raakt de app, de sync, de + en gate 9 voor taken, en botst in volgorde met de taakstatus-migratie (T2) | In de bèta **geen tijd op taken**. Een taak met een datum komt in de ochtendsamenvatting; los daarvan kan iemand kiezen voor "taken van vandaag om 8:00" (één bundel). Een tijd op taken pas na een eigen besluit (**D4**) |
| **K4** | **Agendakoppelingen:** op 29 oktober koos je voor echte tweerichting, "geen tijdelijke ICS-oplossing", en "de gezinstest begint pas als de koppelingen betrouwbaar werken" | De tweerichtingskoppeling met Google kost ±27–40 werkdagen plus 2–3 weken proef plus de Google-verificatie (5–8+ weken). Dat past niet vóór 14 december en ook niet in december/januari. De bètastart van 14 december botst dus met die voorwaarde | Bevestigen dat de bèta zonder koppeling start (de facto al zo gepland in besluit 20). Tijdens de bèta: fase A–C bouwen, Google eerst voor jullie eigen gezin in testmodus. Een **alleen-lezen ICS-feed uit Thuisplanner** (naar de telefoonagenda) is goedkoop en voor Apple de enige verantwoorde route, maar botst met "geen ICS". Jouw keuze (**D12**) |
| **K5** | **M7 (afwijken per afspraak) en M8 (Rustig/Behulpzaam/Actief)** horen bij "alle voorgestelde instellingen" | M8 is een productrichting zonder ontwerp en schuurt met principe 2 en 6 (`thuisplanner-meldingen.md` §2). M7 vraagt een eigen tabel per account en afspraak | M7 in fase B3 (klein, persoonlijk, past in het ontwerp). M8 **niet** als aparte knop in de bèta: de standaardset is "Behulpzaam"; pas na bètagebruik beslissen of niveaus als voorinstelling zinvol zijn (**D7**) |
| **K6** | **Verjaardagen** zijn geen eigen soort: een jaarlijkse hele-dagafspraak (de + herkent "jarig"). Er is geen markering in de database | Een eigen verjaardagsmelding vraagt een markering of besluit 14 (contacten, eigen gate 9) | Verjaardagen volgen de herinnering voor hele-dagafspraken (en komen in de samenvatting). Geen eigen schakelaar in de bèta |
| **K7** | **PR #57 heeft als basis `thuisplanner-overzicht`**, dat al gemerged is | Mergen zonder de basis aan te passen landt niet op `thuisplanner-staging` | De basis van #57 omzetten naar `thuisplanner-staging` (met jouw akkoord) en de CI opnieuw laten draaien |
| **K8** | **Cloudflare Access op staging en meldingen.** Tikken op een melding opent de beginscherm-app; is de Access-sessie verlopen, dan komt eerst de Access-inlog (bouwvoorstel §5.3) | Draait de bèta op staging achter Access (jouw voorkeur van 10 november), dan treft dit ook de bètagezinnen, en dat ondermijnt de waarde van meldingen | Access-sessieduur op staging zo lang als verantwoord (bijvoorbeeld 30 dagen) of de bèta zonder Access na de Access-poort. Hangt samen met besluit O1/O3 (**D11**) |
| **K9** | **Kerstperiode.** 24 december – 3 januari valt midden in de bètafasen | Nieuwe meldingen uitrollen als niemand kan reageren op fouten, botst met "fouten moeten goedkoop zijn" | Geen uitrol tussen 23 december en 4 januari (**D8**) |

---

## 1. De volledige set instellingen en meldingen

### 1.1 Uitgangspunten (uit het Productkompas en de besluiten)

- **Per account, nooit per huishouden of lid** (M2, besluit 12 en 16). Een kind zonder account heeft geen instellingen.
  De eigenaar van het huishouden kan niets voor een ander zetten.
- **Toestemming per toestel, pas als iemand zelf meldingen aanzet** (M3, besluit 16). Nooit bij het eerste openen,
  nooit als stap in de onboarding.
- **Rustige standaard** (principe 2 en 6): herinneringen aan wat jou aangaat staan aan; meldingen over wat anderen doen
  en samenvattingen staan uit. Nooit een melding over een eigen actie.
- **Privacy in de melding** (besluit 14, 16 en 20): een privé-afspraak van een ander geeft nooit een melding; een eigen
  privé-afspraak toont nooit een titel; huishoudkennis, notities en plek staan nooit in een melding.
- **Elke instelling lost een waargenomen behoefte op** (besluit 20, B1). Wat niet nodig blijkt, gaat er na de bèta weer
  uit (principe 8).

### 1.2 Weergave (al gebouwd, PR #58, op staging)

| Onderdeel | Sleutel | Keuzes (standaard **vet**) | Stand |
| --- | --- | --- | --- |
| Startscherm | `startscherm` | **Overzicht**, Agenda, Taken, Boodschappen | Op staging |
| Overzicht: onderdelen | `overzicht.afspraken`, `.taken`, `.boodschappen`, `.verder` | alle vier **aan**; het laatste kan niet uit | Op staging |
| Agenda: standaardweergave | `agenda.weergave` | Dag, **Week**, Maand, Taken | Op staging |
| Agenda: wiens agenda | `agenda.wie` | **Iedereen**, Ik | Op staging |
| Herstellen (weergave) | `reset_preferences('weergave')` | – | Op staging |

Ongewijzigd gelaten (bewust, besluit 20 §2): geen instellingen voor Taken (ingeklapt is al rustig), Boodschappen,
kleuren, aantallen, thema's of sortering.

### 1.3 Meldingen per functie en per gebeurtenis

**Ontvanger** = wie de melding kan krijgen. "Accounts van de afspraak" = de accounts van de leden in de afspraak; bij
een afspraak voor het hele gezin of alleen voor een kind zonder account: alle **volwassen** accounts
(`household_members.kind = 'adult'`, met `user_id`). De actor krijgt nooit een melding over zijn eigen actie.

| # | Functie | Gebeurtenis | Ontvanger | Standaard | Termijn (instelbaar) | Fase |
| --- | --- | --- | --- | --- | --- | --- |
| N1 | Agenda | Herinnering afspraak met tijd | Accounts van de afspraak | **Aan** | **30 min** vooraf; keuze 0, 5, 10, 15, 30, 60, 120 min, 1 dag | B1 |
| N2 | Agenda | Herinnering hele-dagafspraak (ook verjaardagen) | Idem | **Aan** | **08:00** op de dag; keuze 07:00–10:00 per kwartier, of 19:00–21:00 de avond ervoor | B1 |
| N3 | Taken | Taak aan jou gegeven | De nieuwe verantwoordelijke | **Aan** | direct (gebundeld per 2 min) | B1 |
| N4 | Taken | Jouw taken van vandaag (één bundel) | De verantwoordelijke | Uit | 08:00 (zelfde keuzes als N2) | B1 |
| N5 | Taken | Taak te laat (één keer, de ochtend erna) | De verantwoordelijke | Uit | met N4 / de ochtendsamenvatting | B2 |
| N6 | Taken | Taak afgerond door een ander | De maker en de verantwoordelijke (niet de afvinker) | Uit | gebundeld per 10 min | B2 |
| N7 | Agenda | Afspraak nieuw | Accounts van de afspraak, niet de maker | Uit | gebundeld per 10 min | B2 |
| N8 | Agenda | Afspraak verplaatst (datum of tijd) of verwijderd | Idem | Uit | gebundeld per 10 min | B2 |
| N9 | Boodschappen | Boodschappen toegevoegd | Alle accounts behalve wie toevoegt | Uit | hoogstens één bundel per uur | B2 |
| N10 | Vakanties | Vertrek morgen; open voorbereidingen | Accounts van de leden van de vakantie | Uit | 19:00 de avond ervoor | B2 |
| N11 | Overzicht | **Ochtendsamenvatting**: vandaag | Wie het aanzet | Uit | **07:30**; keuze 06:00–10:00 per kwartier | B2 |
| N12 | Overzicht | **Avondsamenvatting**: morgen | Wie het aanzet | Uit | **20:00**; keuze 18:00–22:00 per kwartier | B2 |
| N13 | Agenda | Eigen herinnering bij één afspraak (M7) | Alleen jij | – | per afspraak, dezelfde keuzes als N1/N2 | B3 |
| – | Plannen, Spullen | Geen eigen meldingen in de bèta. Plan-taken met een datum zijn gewone taken (N3–N6); garantie-einddatums pas met de update van Spullen | – | – | – | na bèta |

**Waarom N3 als enige activiteit standaard aan:** iemand vraagt jou iets; zonder melding mis je het (principe 6: dit
bespaart aandacht). Bij N1/N2 geldt: herinneringen aan wat jou aangaat zijn de kern van "minder onthouden".

**Samenvattingen (N11, N12):** alleen als er iets is; op een rustige dag niets (principe 2). Inhoud: aantallen en het
eerste item, bijvoorbeeld *"Vandaag: 2 afspraken (09:00 Tandarts · Loïs) en 3 taken"*. "Bezet" telt mee, zonder titel.
Staat de ochtendsamenvatting aan, dan vervallen N2 en N4 voor diezelfde ochtend (geen dubbele melding, §1.6).

### 1.4 Algemene meldingsinstellingen

| Instelling | Sleutel | Keuzes (standaard **vet**) | Fase |
| --- | --- | --- | --- |
| Meldingen in Thuisplanner (hoofdschakelaar account) | `meldingen.aan` | **aan** (pas werkzaam op een toestel met toestemming) | B1 |
| Dit toestel | (rij in `push_devices`, geen voorkeur) | aan/uit per toestel; de lijst toont "Op deze iPhone: aan; op je laptop: uit" | B1 |
| Stille uren | `meldingen.stil.aan`, `.van`, `.tot` | **aan, 22:00–07:00**; per kwartier | B1 |
| Herinneringen mogen door stille uren heen (M6-uitzondering) | `meldingen.stil.herinneringen` | **uit** | B3 |
| Vergrendelscherm | `meldingen.inhoud` | **Tijd en titel** (gedeelde items); *Alleen dat er iets is* | B1 |
| Herstellen (meldingen) | `reset_preferences('meldingen')` | zet alle `meldingen.*` terug; laat weergave staan | B1 |

**Stille uren:** gerekend in de tijdzone van het toestel (M-architectuur §3.5). Een melding binnen de stille uren
schuift door naar het einde, behalve een herinnering met tijd waarvan de afspraak dan al begonnen is: die vervalt.
Activiteit (N6–N9) die binnen de stille uren valt, gaat op in de ochtend (één bundel), niet in de nacht.

**Vergrendelscherm (A5 uit besluit 20):** een webapp kan niet zien of het scherm vergrendeld is; het besturingssysteem
beslist (iOS: *Toon voorvertoning: bij ontgrendeld*). Daarom bepaalt Thuisplanner wat er in de melding *staat*:
- *Tijd en titel* (standaard): *"15:30 · Zwemles · Loïs"*. Een eigen privé-afspraak: *"15:30 · Privé-afspraak"*.
  Taken: *"Taak voor jou: Gymtas inpakken"*.
- *Alleen dat er iets is*: *"Herinnering · 15:30"*, *"Er is een taak voor je"*, *"Je overzicht voor vandaag"*. De titel
  verschijnt pas na het openen, in de app (na inloggen).
- Altijd: nooit notities, plek, deelnemers buiten het eigen huishouden of huishoudkennis. In de schermen staat één
  regel uitleg met een verwijzing naar de voorvertoning-instelling van de telefoon.

### 1.5 Wat het scherm toont (één ingang, geen tweede instellingenwereld)

*Meer → Voor jou → Persoonlijke instellingen → Meldingen* (M1), met vier blokken: **Dit toestel** (stand en knop),
**Herinneringen** (N1, N2, N4 met termijn), **Van anderen** (N3, N5–N10; in fase B1 alleen N3 zichtbaar),
**Rust** (stille uren, vergrendelscherm, samenvattingen). Een blok of schakelaar verschijnt pas als zijn fase aan staat:
geen grijze "binnenkort"-knoppen (principe 2).

### 1.6 Geen dubbele of overbodige meldingen (regels)

1. **Eén keer per toestel per item, per gebeurtenis, per voorkomen** (unieke sleutel in het verzendlog, §2.4).
2. **Op het toestel vervangen in plaats van stapelen:** elke melding krijgt een `tag` (`soort:item:datum`); een nieuwe
   melding met dezelfde tag vervangt de oude stil (`renotify: false`). Zo wordt ook een zeldzame dubbele verzending na een
   storing onzichtbaar.
3. **Rangorde per item per uur:** een herinnering gaat vóór activiteit. Is een afspraak binnen 2 uur en wordt hij
   verplaatst, dan komt alleen de herinnering op de nieuwe tijd, niet ook "afspraak verplaatst".
4. **Samenvatting gaat vóór losse ochtendmeldingen:** met N11 aan vervallen N2, N4 en N5 die ochtend; met N12 aan valt
   N2-"de avond ervoor" weg.
5. **Bundelen:** N3 per 2 minuten, N6–N8 per 10 minuten, N9 per uur, per ontvanger: *"Sanne zette 4 dingen op de
   boodschappenlijst"*.
6. **Gemist is gemist:** een herinnering die door een storing meer dan 10 minuten te laat zou komen, vervalt (geen
   stortvloed achteraf).
7. **Nooit over een eigen actie, nooit over privé van een ander**, ook niet in een bundel of een aantal.
8. **Verlies van toegang** (lid gearchiveerd, account uit het huishouden) → per direct geen meldingen meer; gecontroleerd
   op het moment van verzenden, niet bij het plannen.

### 1.7 Productkompas-toets (kort)

| Vraag | Antwoord |
| --- | --- |
| Principes | 1 (meer gemak dan gedoe), **2** (rust), 3, **6** (aandacht), 7 (account ≠ lid), 9 (geen oordeel: geen "Bas deed meer"-meldingen), "Privacy volgt de situatie" |
| Neemt het werk weg? | Ja: herinneringen en "taak aan jou" nemen onthouden over. Activiteit en samenvattingen: onzeker, daarom standaard uit en gemeten |
| Kan het eenvoudiger? | Ja, en dat doen we: één scherm, schakelaars verschijnen pas in hun fase, geen niveaus (M8) in de bèta, geen tijd op taken |
| Aandacht, controle, privacy | Standaard rustig; stille uren aan; vergrendelscherm instelbaar; server dwingt privacy af bij verzenden |
| Bewijs | Hypothese; de bèta meet per soort hoeveel mensen hem aanzet, uitzet en op meldingen tikt (zonder inhoud, §2.7) |
| **Besluit 16** | Verruimd door besluit 20 (D1); de voorwaarden (pushproef, gate 9, geen privé-details) blijven volledig |
| **Besluit 20** | Volgt de uitgangspunten; nieuw zijn de samenvattingen, de vergrendelscherm-keuze en het tijdpad (D1) |
| **Ultieme toets** | Ja voor herinneringen en N3; voor de rest is de bèta de toets |

---

## 2. Technisch ontwerp

### 2.1 Voorkeuren: voortbouwen op `account_preferences`

Geen nieuwe tabel voor voorkeuren. De migratie van de meldingen breidt alleen de sleutelcontrole uit:

- `create or replace function private.voorkeur_geldig(...)` met de nieuwe sleutels; de bestaande `check`-constraint
  roept deze functie aan en blijft staan. Additief: bestaande rijen blijven geldig.
- **Waarden uit vaste lijsten**, nooit vrije tekst:

| Sleutel | Geldig |
| --- | --- |
| `meldingen.aan`, `meldingen.stil.aan`, `meldingen.stil.herinneringen` | boolean |
| `meldingen.n1` … `meldingen.n12` (aan/uit per soort) | boolean |
| `meldingen.n1.min` | `0, 5, 10, 15, 30, 60, 120, 1440` |
| `meldingen.n2.tijd`, `.n4.tijd`, `.n11.tijd`, `.n12.tijd`, `meldingen.stil.van`, `.tot` | `"HH:MM"`, regex `^([01]\d|2[0-3]):(00|15|30|45)$`, plus per sleutel het toegestane bereik (§1.3) |
| `meldingen.n2.moment` | `"dag"`, `"avond"` |
| `meldingen.inhoud` | `"titel"`, `"verborgen"` |

- **Ontbrekende sleutel = standaard**, zoals nu. Zo heeft ieder account zonder backfill meteen de rustige set.
- `reset_preferences` krijgt de scope `'meldingen'` (haalt alle `meldingen.*` weg); `'weergave'` laat ze staan, zoals de
  migratie al aankondigt.
- De lijst in de app (`lib/voorkeuren.ts`, `SLEUTELS`) en de databasecontrole worden met één contracttest gelijk gehouden.
- **Geen tijdzone in de voorkeuren:** die hoort bij het toestel (§2.2), omdat iemand op vakantie in een andere zone kan
  zitten.

### 2.2 Toestellen: `push_devices` (nieuw)

| Kolom | Toelichting |
| --- | --- |
| `id uuid pk` | – |
| `user_id uuid not null references auth.users on delete cascade` | Account, niet lid |
| `endpoint text not null unique`, `p256dh text`, `auth text` | Het abonnement; **nooit** leesbaar voor de app |
| `label text` | Uit een vaste lijst ("iPhone", "iPad", "Android", "Computer"), afgeleid in de app |
| `timezone text` | Gecontroleerd tegen `pg_timezone_names` (zoals `households.timezone`); bij elke start bijgewerkt |
| `enabled boolean default true` | "Dit toestel" aan/uit |
| `created_at`, `last_seen_at`, `last_ok_at`, `failures int` | Opruimen en foutafhandeling |

- **RLS:** geen directe toegang. RPC's via de toegangspoort: `register_push_device(endpoint, p256dh, auth, label,
  timezone)` (upsert op endpoint; een endpoint dat al aan een ander account hing, wordt overgezet: dat toestel is van
  account gewisseld), `set_push_device_enabled(id, bool)`, `unregister_push_device(id)` en `my_push_devices()` (alleen
  `id`, `label`, `enabled`, `last_ok_at`, en `is_dit_toestel` op basis van een hash van het endpoint dat de app meestuurt).
- **Uitloggen** roept eerst `unregister_push_device` aan en zegt het abonnement in de browser op. **Toestemming
  ingetrokken** in iOS/Android: bij elke start vergelijkt de app `Notification.permission` en `pushManager.getSubscription()`
  met de server en ruimt op.

### 2.3 Gebeurtenissen: `notification_outbox` (nieuw, al in B1)

Activiteit (N3, en vanaf B2 N5–N10) ontstaat in **triggers** op `tasks`, `events`, `shopping_items` en vakanties. Een
trigger schrijft alleen `household_id`, `soort`, `item_id`, `actor_user_id` (= `auth.uid()`), `actor_member_id`,
`aangemaakt`, en voor N3 de nieuwe `assignee_member_id`. **Geen titels of inhoud** in de outbox. In B1 bestaat alleen de
trigger voor N3; B2 voegt triggers toe zonder de tabel te wijzigen.

### 2.4 Verzendlog en idempotentie: `notification_log` (nieuw)

| Kolom | Toelichting |
| --- | --- |
| `id`, `user_id`, `device_id` | – |
| `soort` (`n1`…`n13`), `item_id` (null bij samenvattingen), `voorkomen date` | Wat |
| `fire_at timestamptz` | Het geplande moment (na stille uren) |
| `status` (`geclaimd`, `verzonden`, `gemist`, `mislukt`, `overgeslagen`), `pogingen`, `geclaimd_op`, `fout` (code, geen tekst van de dienst) | Afhandeling |
| **uniek** (`device_id`, `soort`, `coalesce(item_id, nil)`, `voorkomen`, `fire_at`) | Dé idempotentiesleutel |

- **Claimen in plaats van versturen-en-hopen**, hetzelfde patroon als `20261116120000_uitnodigingsmail_claimronde`:
  `insert … on conflict do nothing returning id` maakt de claim; alleen een nieuw ingevoegde rij wordt verstuurd. Twee
  rondes tegelijk sturen dus nooit dubbel.
- **Crash na de claim:** een rij die >2 min op `geclaimd` staat, mag één ronde later opnieuw, hoogstens 3 pogingen en
  alleen binnen het venster van 10 minuten (§1.6, regel 6). Een dubbele verzending in dat zeldzame geval wordt op het
  toestel onzichtbaar door de `tag` (§1.6, regel 2).
- **Een gewijzigde afspraak** krijgt een andere `fire_at` en dus een nieuwe sleutel; de oude tijd komt niet meer voor in
  de berekening, dus die gaat nooit af. **Verwijderd of uitzondering** → komt niet meer voor → niets.
- **Bewaren 14 dagen** (opruimen via pg_cron). Korter dan de 30 dagen van het bouwvoorstel: genoeg om dubbelingen en
  klachten na te gaan, en het log blijft bij 1.000 huishoudens klein (§6.3). Niet leesbaar voor de app.

### 2.5 Plannen (wat gaat er af?)

Eén SQL-functie `private.meldingen_te_versturen(p_nu timestamptz)` bepaalt elke minuut wat er de komende 2 minuten af
moet, **uit de huidige gegevens** (niets vooraf ingepland dat kan verouderen):

- **N1/N2:** voorkomens in het venster via één tussenfunctie `private.voorkomens_in_venster(huishouden, van, tot)`, die
  nu `private.occurs_on`, `event_exceptions` en losgemaakte keren gebruikt, in `households.timezone`. Fase A van de
  agenda (rijkere herhaling, tijdzone per afspraak) vervangt later alleen die tussenfunctie: de meldingen hoeven dan
  niet opnieuw gebouwd te worden.
- **Zomer- en wintertijd:** per voorkomen van lokale tijd naar UTC. (Geen omschakeling tijdens de bèta tot 28 maart
  2027, maar wel getest met een vaste klok.)
- **N3, N5–N10:** uit de outbox, na de bundeltijd (§1.6, regel 5).
- **N4, N11, N12:** per account op het gekozen kwartier in de zone van het toestel, met een vaste spreiding van 0–4
  minuten per account (hash van het account). Zo komen 2.000 ochtendsamenvattingen niet in dezelfde minuut.
- **Filters vóór de claim:** `meldingen.aan`, de soort aan, het toestel aan, stille uren (§1.4), de rangorde (§1.6,
  regel 3–4), en de **rechten** (zie §2.6).

### 2.6 Rechten en privacy bij verzenden (gate 9 "meldingen")

De functie draait met de service-rol en past daarom zelf de regels van de RLS toe, via één `security definer`-functie
die dezelfde logica gebruikt als `event_overview`/`event_details_visible`:

- het account is **nu** actief lid van het huishouden van het item;
- het account mag het item zien; een privé-afspraak van een ander levert **geen rij** op (geen melding, geen aantal,
  geen "Bezet" in een activiteitsbundel; in een samenvatting alleen "Bezet" zonder titel, net als het Overzicht);
- de inhoud wordt pas in de functie opgebouwd, volgens `meldingen.inhoud`; notities, plek, voorbereiding en
  huishoudkennis worden nooit opgehaald.

**Tegenproeven (gate 9):** A leest of wijzigt de toestellen, het log en de voorkeuren van B niet, ook niet als eigenaar;
een privé-afspraak van een ander geeft nooit een melding of telling; na archiveren van het lid of verlaten van het
huishouden komt er niets meer; de actor krijgt niets; de outbox bevat geen inhoud; een endpoint is via geen enkele RPC
terug te lezen. Elke tegenproef wordt bewust stukgemaakt en moet dan falen.

### 2.7 Versturen: de Edge Function `stuur-meldingen`

- **Aanroep:** pg_cron elke minuut → `private.meldingen_ronde()` → pg_net met URL en geheim uit Vault, precies zoals
  `uitnodigingsmail_ronde()`. Geen nieuwe externe dienst: de pushdiensten van Apple, Google en Mozilla horen bij het
  toestel en zijn gratis.
- **Code:** de versleuteling (aes128gcm, RFC 8291) en VAPID (RFC 8292, ES256) uit `scripts/pushproef-stuur.mjs` van
  PR #57, omgezet van `node:crypto` naar WebCrypto voor Deno. De bestaande test ontsleutelt al met WebCrypto en is de
  referentie. Geen nieuw pakket.
- **Porties:** de ronde claimt hoogstens 200 meldingen per aanroep en roept de functie zo vaak aan als nodig. Reden:
  de CPU-tijd per aanroep van een Edge Function is begrensd (⚠️ ±2 s); per melding kost de versleuteling enkele
  milliseconden, en het VAPID-token wordt per pushdienst hergebruikt (geldig tot 12 uur), zodat er per ronde maar een
  paar handtekeningen nodig zijn.
- **Fouten:** 404/410 → toestel verwijderen; 413 → inhoud inkorten (komt niet voor bij <1 kB); 429/5xx → volgende
  ronde opnieuw, hoogstens 3 keer; 5 mislukkingen op rij → toestel uit, de app vraagt bij de volgende start opnieuw.
- **Meten zonder inhoud:** per soort en per dag het aantal verzonden, gemist en mislukt, en het aantal accounts dat een
  soort aan of uit zette. Geen titels en geen item-ID's in logboeken.
- **Noodschakelaar:** een rij `private.meldingen_config` (`actief`, `soorten_aan text[]`). Met één SQL-regel gaan alle
  meldingen of één soort uit, zonder nieuwe build. Dit is ook de **server-schakelaar per fase** (§4).

### 2.8 De app

- **PWA-basis:** PR #57 (manifest, `sw.js` zonder cache, registratie). De service worker toont al `title`, `body`,
  `url` en `tag`; nieuw is alleen `renotify: false` en eventueel `timestamp`.
- **Adressen naar één item:** `#/agenda/<id>[/<datum>]` en `#/taak/<id>` in `uitHash()` (`App.tsx`). Is het item weg of
  niet (meer) zichtbaar, dan opent de dag met "Deze afspraak bestaat niet meer", zonder te verraden of het privé was.
- **Meldingenscherm** onder *Persoonlijke instellingen*, met de eigen uitleg vóór de systeemvraag (voorbeeld 7 uit
  `besluit20-instellingen-mobiel.html`) en de iPhone-uitleg "eerst op het beginscherm zetten" als Safari geen push kent.
- **Schakelaars:** `VITE_MELDINGEN=aan` voor het scherm (zoals `VITE_VOORKEUREN`); welke blokken zichtbaar zijn, volgt
  `meldingen_config.soorten_aan` (gelezen via een RPC), zodat een nieuwe fase geen nieuwe build vraagt.
- **Pushproef opruimen:** `VITE_PUSHPROEF` na de proef weghalen; het proefscherm blijft alleen in de proefbuild.

### 2.9 Databasewijzigingen (elk met een eigen akkoord)

| # | Werknaam | Inhoud | Fase |
| --- | --- | --- | --- |
| M-a | `…_meldingen.sql` | sleutels in `voorkeur_geldig`, scope `meldingen` in `reset_preferences`, `push_devices`, `notification_outbox`, `notification_log`, `meldingen_config`, de RPC's, de trigger voor N3, de plan- en rondefunctie, Vault-sleutels, pg_cron (ronde en opruimen) | B1 |
| M-b | `…_meldingen_activiteit.sql` | triggers voor N5–N10, samenvattingen | B2 |
| M-c | `…_herinnering_per_afspraak.sql` | `event_reminders` (account, afspraak of reeks + datum, termijn); RLS eigen rij; cascade | B3 |

Geen wijziging aan bestaande tabellen of policies. Het volgnummer wordt bij de bouw gekozen, afgestemd met P7
(vakantietaken, loopt in een andere sessie) en de taakstatus-migratie T2. Uitrolvolgorde zoals altijd: eerst de
database (dry-run, generale repetitie op een kopie van de laatste export, nacontrole), dan de functie, dan het geheim,
dan de app. `verbinding.ps1`, de nacontrole (`SCHEMA_PER_STAND`, `VERWACHTE_TAKEN`), het verwijderscript, de export en
`statisch.js` gaan mee.

### 2.10 Geheimen

- **Eén VAPID-sleutelpaar per omgeving.** Draait de bèta op staging (jouw voorkeur van 10 november), dan is het één paar
  voor staging = bèta. Advies: maak **nu het definitieve paar** voor de pushproef, zodat de abonnementen van de proef
  blijven werken. De private sleutel alleen als Supabase-geheim van de functie en in de wachtwoordkluis; de publieke in
  `VITE_VAPID_PUBLIC_KEY`. Gaat de bèta later naar een eigen project, dan een eigen paar en opnieuw abonneren (de app
  doet dat vanzelf bij de volgende start).
- Het wachtrijgeheim voor pg_net in Vault, net als bij de uitnodigingsmail.

---

## 3. Parallel bouwen: werkstromen, afhankelijkheden, kritiek pad en gates

### 3.1 Werkstromen

| Stroom | Inhoud | Hangt af van | Kan parallel met | Sessie |
| --- | --- | --- | --- | --- |
| **W0 Pushproef** | PR #57 basis omzetten, CI, VAPID-paar, stagingbuild met `VITE_PUSHPROEF`, proef op de telefoons van jou en Sanne | jouw akkoorden | alles | bestaande sessie *p0-pwa-push* |
| **W1 Database** | M-a: tabellen, sleutels, RPC's, trigger N3, plan- en rondefunctie, RLS-matrix en tegenproeven (gate 9) | het **contract** (dag 1, zie hieronder) | W2, W3 | nieuwe worktree |
| **W2 Functie** | `stuur-meldingen`: WebCrypto-versleuteling, VAPID, porties, foutafhandeling, unit met vaste klok en een nep-pushdienst | contract; W0 voor de echte proef | W1, W3 | nieuwe worktree |
| **W3 App** | meldingenscherm, toestemming, toestelregistratie, tijdzone, adressen `#/agenda/<id>` en `#/taak/<id>`, demo met geheugenopslag, e2e | contract; PR #57 (basis) | W1, W2 | nieuwe worktree |
| **W4 Bètawerkplan** | privacyverklaring met een alinea over push (pushdiensten van Apple/Google/Mozilla, bewaartermijn 14 dagen), testersuitleg "op het beginscherm zetten", Access-sessieduur (K8) | – | alles | jij + bestaande bètasessie |
| **W5 Integratie** | W1–W3 samen op de lokale stack; generale repetitie; staging | W1–W3 | – | één sessie |
| **W6 Fase B2** | M-b, samenvattingen, activiteit | W5 gemerged | W7 | na 14 december |
| **W7 Agenda fase A** | herhalingscontract, tijdzone per afspraak, meerdaags | ontwerpgoedkeuring fase A; **na** W5 (deelt `voorkomens_in_venster`) | W6 | na 14 december |

**Het contract (dag 1, één document van ±1 pagina):** de namen en kolommen van de tabellen, de RPC-handtekeningen, de
JSON-inhoud van een push (`title`, `body`, `url`, `tag`), de sleutels en waarden van §2.1, en de foutcodes. Daarna
werken W1–W3 los van elkaar, elk in een eigen worktree, zonder elkaars bestanden te raken (W1: `supabase/`, W2:
`supabase/functions/stuur-meldingen`, W3: `app/`).

### 3.2 Kritiek pad

**W0-proef (werkt webpush op beide telefoons?) → W1 (gate 9) → W5 (integratie, generale repetitie) → staging (migratie,
functie, geheim, schakelaar) → 2–3 dagen echt gebruik door jou en Sanne → go/no-go → 14 december.**

W2 en W3 liggen er net naast: ze kosten minder tijd dan W1 en zijn klaar vóór W5.

### 3.3 Gates

| Gate | Wanneer | Geslaagd als |
| --- | --- | --- |
| **Pushproef** (besluit 16) | vóór de migratie M-a op staging | Op de iPhone van jou en Sanne (beginscherm-app, iOS ≥ 16.4) en op een computer: de melding komt aan met de app open, op de achtergrond, dicht en vergrendeld; tikken opent het juiste scherm; werkt na een herstart en na een dag. Uitkomst vastgelegd. Faalt de iPhone, dan **stoppen en melden** |
| **Gate 9 "meldingen"** (besluit 16 en 20) | vóór M-a op staging | RLS-matrix en alle tegenproeven van §2.6 groen, lokaal en in CI |
| **Besluit 20 vastgelegd** (K1) | vóór M-a | Tekst in `productkompas-beslissingen.md`, met jouw akkoord |
| **Go/no-go push in de bèta** | vr 11 december | Zie §4.2 |
| **Gate 9 opnieuw** | vóór M-b en M-c | Dezelfde matrix, uitgebreid met de nieuwe soorten en `event_reminders` |

---

## 4. Gefaseerde uitrol tijdens de besloten bèta

### 4.1 De fasen

| Fase | Wanneer | Wat erbij komt | Schakelaars |
| --- | --- | --- | --- |
| **B0 – nu** | op staging | Weergave (PR #58) | `VITE_VOORKEUREN=aan` |
| **B1 – bètastart** | **ma 14 december** | N1, N2, N3, N4; stille uren; vergrendelscherm; herstellen; meerdere toestellen | `VITE_MELDINGEN=aan`; `meldingen_config.soorten_aan = {n1,n2,n3,n4}` |
| **B2 – activiteit en samenvattingen** | **ma 11 januari 2027** (na 2 werkdagen intern) | N5–N12 | migratie M-b; `soorten_aan` uitgebreid |
| **B3 – verfijning** | **ma 25 januari 2027** | N13 (eigen herinnering per afspraak, M7), stille-uren-uitzondering, en wat de bèta van B1/B2 leert | migratie M-c |
| **Agenda** | zie §5 | ICS-feed (als je dat kiest), daarna Google in tweerichting | eigen schakelaars per koppeling |

Elke fase eerst 2–3 dagen bij jou en Sanne (staging), dan bij de bètagezinnen. Een soort kan per direct uit
(noodschakelaar, §2.7) zonder nieuwe build. Tussen 23 december en 4 januari geen uitrol (K9).

### 4.2 Go/no-go voor push op 14 december

- pushproef geslaagd op beide iPhones;
- gate 9 "meldingen" groen;
- in 2–3 dagen echt gebruik: **nul** meldingen over privé van een ander, **nul** dubbele meldingen op één toestel,
  **nul** meldingen in de stille uren, en de herinneringen op tijd (±1 minuut);
- uitloggen en toestemming intrekken ruimen het toestel aantoonbaar op;
- de privacyverklaring noemt push (W4).

**Niet gehaald?** De bèta start toch op 14 december, met meldingen uit (de schakelaar), en B1 volgt zodra het wel klopt.
De startdatum blijft; de kwaliteitspoort gaat voor de functie.

---

## 5. Agendakoppelingen tijdens de bèta

### 5.1 Per aanbieder

| | **Google Agenda** | **Outlook (Microsoft)** | **Apple iCloud** |
| --- | --- | --- | --- |
| Tweerichting technisch | Ja (Calendar API, `syncToken`, eigen event-id, RRULE) | Ja (Graph, `calendarView/delta`) | Alleen CalDAV met een **app-specifiek wachtwoord** dat toegang geeft tot mail, contacten en agenda van iCloud |
| Alleen-lezen inkomend (ICS-in) | "Geheim adres in iCal-indeling" (bevat ook privé-details) | "Agenda publiceren" (kan "alleen beschikbaarheid") | "Openbare agenda" (iedereen met de link) |
| Alleen-lezen uitgaand (ICS-uit: Thuisplanner in de telefoonagenda) | Abonneren via URL; Google ververst pas na 8–24 uur | Abonneren werkt; verversing uren (meten) | Abonnementsagenda op iPhone/Mac; verversing instelbaar (5 min – 1 week) |
| OAuth en verificatie | Gevoelige scopes (`calendar.app.created`, `calendar.events.owned`); verificatie gratis maar 5–8+ weken; testmodus: ≤100 testers, tokens verlopen na **7 dagen**; CASA (betaald) alleen als een scope *restricted* blijkt (U1, vaststellen in de console) | Entra-app; uitgeververificatie met echte bedrijfsgegevens; mogelijk creditcard voor een Azure-account (U5) | Geen OAuth, geen programma |
| Privacy en risico | Smalste scope: alleen eigen afspraken en de eigen agenda "Thuisplanner"; Limited Use in de privacyverklaring; tokens versleuteld, intrekken bij ontkoppelen | Breder (`Calendars.ReadWrite`); werkaccounts kunnen geblokkeerd zijn | Een breed wachtwoord bij ons opslaan botst met "geen opgeslagen toegang" en met dataminimalisatie |
| **Verantwoord tijdens de bèta?** | **Tweerichting: bouwen tijdens de bèta**, eerst voor jullie eigen gezin in testmodus (vraagt een eigen besluit, B-F5); voor gezinnen pas na de verificatie | **Niet in de bèta** (fase E, na Google) | **Alleen ICS-uit** (als je dat kiest); CalDAV niet |

### 5.2 Advies

1. **ICS-uit: "Thuisplanner in je telefoonagenda"** (alleen-lezen, uitgaand). Eén geheime link per account (≥128 bit,
   alleen als HMAC bewaard), direct ongeldig bij uitloggen op alle toestellen, verlies van lidmaatschap of "nieuwe link".
   Inhoud: alleen wat dat account mag zien, **nooit** privé van anderen (ook niet als "Bezet"), eigen privé alleen als
   de gebruiker dat aanzet, geen notities. Dit is voor Apple-gebruikers de enige verantwoorde route, ook op lange termijn,
   en dus niet alleen "tijdelijk". Het lost de dubbele invoer **niet** op (afspraken uit Google komen er niet mee in).
   Bouwtijd ±3–4 dagen plus gate 9 voor de feed. **Botst met je keuze van 29 oktober (geen ICS)**: jouw beslissing (D12a).
2. **ICS-in** (alleen-lezen inkomend): technisch ±8–11 dagen en een geheime link met privé-details van derden op onze
   server. **Niet doen**: het is precies de tijdelijke oplossing die je afwees, en de tweerichtingskoppeling vervangt hem.
3. **Google in tweerichting:** fase A (model, ±12–15 dagen, ontwerp v3 klaar voor goedkeuring) → B (motor, 9–13) →
   C (Google-adapter, 8–12) → D (proef ≥ 14 dagen met ≥ 3 echte accounts + de demovideo + verificatie aanvragen).
   Bij start op 5 januari en één sessie: A klaar ±22 januari, B ±10 februari, C ±26 februari, verificatie indienen
   ±12 maart, gezinnen met Google op zijn vroegst **half april 2027** (bij 5–8 weken verificatie: eind april – mei).
   Twee sessies parallel (A en een deel van B) winnen hoogstens ±1,5 week; de verificatie blijft het knelpunt.
4. **Outlook:** na Google (fase E, 6–9 dagen), pas na een akkoord over Azure en de uitgeververificatie (echte
   bedrijfsgegevens, nooit verzonnen). Realistisch mei–juni 2027.
5. **Apple tweerichting:** niet, tenzij Apple een autorisatie voor derden opent (U6).

**Verband met meldingen:** afspraken uit een koppeling worden gewone afspraken met een stabiel id; herinneringen werken
er dan vanzelf op, via `voorkomens_in_venster` (§2.5). Een afspraak uit Google geeft geen tweede herinnering naast die
van Google zelf als de gebruiker dat kiest: een schakelaar per koppeling "herinneringen van Thuisplanner" (standaard
uit voor geïmporteerde afspraken, om dubbele meldingen te voorkomen). Dat ontwerp hoort bij fase C.

---

## 6. Planning, capaciteit, kosten en risico's

### 6.1 Planning tot de bètastart (vandaag is woensdag 25 november)

| Datum | Wat | Wie | Akkoord nodig |
| --- | --- | --- | --- |
| wo 25 nov | Dit plan; beslissingen D1–D15 | jij | – |
| do 26 nov | PR #57: basis naar `thuisplanner-staging`, CI; het VAPID-paar; het contract voor W1–W3 | Claude (p0-pwa-push) + jij | basis omzetten, VAPID |
| do 26 – vr 27 nov | #57 mergen; stagingbuild met `VITE_PUSHPROEF` en de publieke sleutel | jij | merge, Pages-variabelen, uitrol |
| vr 27 – ma 30 nov | **Pushproef** op beide iPhones en een computer (ook na een herstart en na een dag) | jij en Sanne | – |
| do 26 nov – vr 4 dec | **W1, W2, W3** parallel, lokaal, met tests | 3 Claude-sessies | elke commit |
| ma 30 nov – wo 2 dec | W4: alinea privacyverklaring, testersuitleg, Access-sessieduur | jij + Claude | publicatie |
| do 3 – vr 4 dec | W5: integratie op de lokale stack; generale repetitie op een kopie van de export | 1 sessie | – |
| ma 7 dec | PR(s) klaar; `@codex review` (privacy, migratie); herstel | jij + Claude | push, PR |
| di 8 dec | Merge; migratie M-a op staging; functie; geheimen; `VITE_MELDINGEN=aan` | jij | **elk apart** |
| wo 9 – vr 11 dec | **Interne test** met echte herinneringen | jij en Sanne | – |
| **vr 11 dec** | **Go/no-go push** (§4.2) | jij | – |
| **ma 14 dec** | **Bètastart** met B0 + B1 (of B0 met meldingen uit) | jij | toelaten per gezin |

### 6.2 Na de start

| Periode | Werk | Capaciteit |
| --- | --- | --- |
| 14 – 22 dec | Bètafeedback B1; **W6** (B2) lokaal bouwen | 1–2 sessies |
| 23 dec – 3 jan | Geen uitrol (K9). Alleen herstel bij een ernstige fout, met de noodschakelaar | – |
| ma 4 – vr 8 jan | B2 op staging (migratie M-b), 2 dagen intern | 1 sessie |
| **ma 11 jan** | **B2 voor de gezinnen** | – |
| 5 – 22 jan | **W7**: agenda fase A (na ontwerpgoedkeuring); ICS-uit als D12a = ja (±3–4 dagen, parallel) | 1–2 sessies |
| 12 – 22 jan | B3 (M7, uitzondering stille uren) | 1 sessie |
| **ma 25 jan** | **B3 voor de gezinnen** | – |
| feb – mrt | Agenda fase B en C; Google-project voor staging (testmodus, eigen besluit); proef met jullie eigen accounts | 1–2 sessies |
| ±12 mrt | Google-verificatie aanvragen (met demovideo; privacyverklaring met Limited Use) | jij |
| apr – mei | Google-koppeling voor gezinnen na goedkeuring; daarna Outlook (fase E) | – |

### 6.3 Capaciteit (werkdagen van Claude, inclusief tests)

| Onderdeel | Dagen | Opmerking |
| --- | --- | --- |
| W0 pushproef (afronden #57) | 0,5 | gebouwd; basis, CI, opruimen |
| W1 database + gate 9 | 3–3,5 | kritiek pad |
| W2 Edge Function | 2–2,5 | |
| W3 app | 2,5–3 | |
| W5 integratie + staging | 1,5 | |
| **B1 totaal** | **±10–11** | **±6–7 kalenderdagen met 3 sessies** |
| B2 (activiteit, samenvattingen) | 3–4 | |
| B3 (M7, uitzondering) | 2 | |
| ICS-uit (optioneel) | 3–4 | |
| Agenda fase A–D (Google) | 27–40 | plus ≥ 14 dagen proef en de verificatie |
| Outlook (fase E) | 6–9 | |

### 6.4 Kosten per maand

Uitgangspunten: 2 accounts per huishouden, 1,3 toestel per account, ±8 meldingen per account per dag als alles aan
staat (in werkelijkheid minder: activiteit staat standaard uit). Pushdiensten zijn gratis. Supabase-prijzen ⚠️
nakijken bij het Pro-besluit (O1): Pro $25 met $10 rekentegoed; Edge Functions Free 500.000 / Pro 2 miljoen aanroepen,
daarna ±$2 per miljoen; egress Pro 250 GB; database Free 0,5 GB / Pro 8 GB.

| Huishoudens | Meldingen/maand | Edge-aanroepen (meldingen) | Log (14 dagen) | **Extra door meldingen** | Met ICS-uit (feeds, ±elk kwartier per toestel) | Supabase totaal |
| --- | --- | --- | --- | --- | --- | --- |
| **5** | ~3.000 | ~45.000 | <1 MB | **€0** | ~30.000 → €0 | €0 op staging (Free) of $25 met een eigen Pro-bèta |
| **100** | ~60.000 | ~50.000 | ~10 MB | **€0** | ~600.000 → €0 op Pro | $25 (Pro) |
| **1.000** | ~600.000 | ~60.000 + porties | ~60 MB | **€0–5** (eventueel een grotere rekeninstantie bij piekmomenten) | ~6 miljoen aanroepen en ±100–300 GB egress → **±$10–30** (te verlagen met ETag/304 en een langere verversing) | **±$25–60** |

Overig: Google-projecten, Calendar API en verificatie €0 (CASA, alleen als een scope *restricted* blijkt: ±$500–4.500
per jaar, te vermijden met de smalle scopes); Microsoft €0, mogelijk een creditcard voor de verificatie van een
Azure-account; Lettermint ongewijzigd. Op 1.000 huishoudens is staging op Free geen optie meer (pauzeren, geen
back-ups, 0,5 GB); dat volgt al uit de bèta-voorbereiding (§9a: bèta wordt productie op Pro).

### 6.5 Risico's

| # | Risico | Kans | Gevolg | Maatregel |
| --- | --- | --- | --- | --- |
| R1 | Webpush op de iPhone onbetrouwbaar (oude iOS, niet op het beginscherm, iOS trekt het abonnement in) | middel | B1 deels waardeloos voor iPhone-gezinnen | pushproef eerst; uitleg "beginscherm"; de app herstelt het abonnement bij elke start; tellen hoeveel toestellen afhaken |
| R2 | Access-inlog na tikken op een melding (K8) | hoog op staging | Meldingen voelen kapot | Access-sessie lang, of de bèta zonder Access na de Access-poort (D11) |
| R3 | Te veel meldingen (principe 6) | middel | Mensen zetten alles uit of haken af | rustige standaard; bundelen; rangorde; per soort meten; noodschakelaar |
| R4 | Privacylek in een melding (titel van privé, kennis) | laag | Ernstig (vertrouwen, AVG) | gate 9 met tegenproeven; inhoud pas in de functie opgebouwd; standaardinhoud zonder notities/plek |
| R5 | Dubbele meldingen | laag | Ergernis | unieke sleutel + claim; `tag` op het toestel |
| R6 | CPU-limiet Edge Function bij pieken | laag tot 1.000 huishoudens | Late of gemiste meldingen | porties van 200; spreiding van samenvattingen; VAPID-token hergebruiken |
| R7 | Gratis stagingproject pauzeert of loopt tegen limieten | laag bij dagelijks gebruik | Geen meldingen | controleren in het dagoverzicht; Pro-besluit O1 |
| R8 | Kritiek pad loopt uit (gate 9 of integratie) | middel | Geen push op 14 december | start toch, met meldingen uit (§4.2) |
| R9 | VAPID-sleutel kwijt | laag | Alle abonnementen ongeldig | in de wachtwoordkluis; de app abonneert opnieuw |
| R10 | Kerst | – | Fouten zonder reactie | geen uitrol 23 dec – 3 jan (D8) |
| R11 | Google-verificatie duurt lang, of een scope is *restricted* (CASA) | middel | Koppeling later of duurder | vroeg indienen; smalle scopes; U1 meteen in de console vaststellen |
| R12 | Fase A raakt de herhaling waar meldingen op steunen | middel | Regressie in herinneringen | `voorkomens_in_venster` als enige aansluiting; de herinneringstests draaien mee in de regressieset van fase A |
| R13 | Migratievolgorde botst met P7 en taakstatus T2 | middel | Hernummeren, generale repetitie opnieuw | volgnummer pas bij de bouw; afstemmen via de gedeelde notitiemap |

---

## 7. Beslissingen voor jou

| # | Beslissing | Advies |
| --- | --- | --- |
| **D1** | Besluit 20 vastleggen in `productkompas-beslissingen.md`, met de verruiming: alle meldingen in de bèta, gefaseerd (B1–B3), activiteit en samenvattingen standaard uit (K1, K2) | Ja; het Productkompas zelf niet wijzigen |
| **D2** | De set en de standaarden van §1.3 en §1.4 | Ja |
| **D3** | Ontvangers bij "hele gezin" of een kind zonder account: alle volwassen accounts (A4) | Ja; ieder kan het zelf uitzetten |
| **D4** | Taken met tijd: (a) geen tijd in de bèta, taken in N4/de samenvatting; (b) een tijdkolom (migratie in het takendomein, gate 9) | **(a)** |
| **D5** | Vergrendelscherm: standaard "tijd en titel", met de keuze "alleen dat er iets is" (A5) | Ja |
| **D6** | Samenvattingen: ochtend 07:30 en avond 20:00, standaard uit, alleen als er iets is | Ja |
| **D7** | M7 (eigen herinnering per afspraak) in B3; M8 (niveaus) niet in de bèta | Ja |
| **D8** | Geen uitrol tussen 23 december en 4 januari | Ja |
| **D9** | Go/no-go voor push op vr 11 december (§4.2); bij no-go start de bèta met meldingen uit | Ja |
| **D10** | Nu het definitieve VAPID-paar maken (voor staging = bèta), in de wachtwoordkluis | Ja, met je akkoord op het moment zelf |
| **D11** | Access en meldingen (K8): lange Access-sessie op staging, of de bèta zonder Access na de Access-poort; en waar draait de bèta (O1) | Lange sessie voor de interne test; vóór de gezinnen de Access-poort |
| **D12** | Agenda: (a) ICS-uit tijdens de bèta (botst met 29 oktober); (b) fase A starten op 5 januari, na de ontwerpgoedkeuring v3; (c) Google-testmodus voor jullie eigen gezin (B-F5); (d) Outlook pas na een akkoord over Azure en uitgeververificatie; (e) Apple alleen via ICS | (a) ja, als blijvende Apple-route; (b) ja; (c) ja, tijdelijk; (d) ja; (e) ja |
| **D13** | Bewaartermijn verzendlog 14 dagen (in plaats van 30) | Ja |
| **D14** | Drie parallelle worktrees voor W1, W2 en W3, na het contract | Ja |
| **D15** | De basis van PR #57 omzetten naar `thuisplanner-staging` | Ja |
| Per stap | Elke commit, push, merge, migratie, VAPID-sleutel, Pages-variabele, functie-uitrol en het toelaten van elk gezin | Apart, zoals altijd |

**Stand:** dit is alleen een plan. Lokaal: dit document (niet gecommit). Staging: ongewijzigd door deze sessie (PR #58
en migratie 25 staan er al). Live (`mijnthuisplanner.nl`): niet aangeraakt.
