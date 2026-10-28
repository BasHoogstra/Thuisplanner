# Thuisplanner: projectstatus

**Bijgewerkt:** 28 oktober 2026, door de sessie "Thuisplanner v1 mobiele testomgeving" (eigenaar van dit document).
Alleen lezend vastgesteld uit de worktrees, git (na een `fetch`), de documenten en de sessielijst. Wat niet vast te
stellen was, staat als **onbekend**.

Leidend zijn `PRODUCT_PRINCIPLES.md`, `docs/productkompas-beslissingen.md` en `docs/roadmap.md`. Dit document geeft
alleen de stand van zaken; het neemt geen besluiten.

⚠️ De nieuwste besluiten (12–17), de releaseroadmap en de bèta-voorbereiding staan op `thuisplanner-deel2`
(`02fd98d`), nog niet op deze hoofdlijn. Zie §4, B2.

## 1. In één oogopslag

| Onderdeel | Stand | Branch · worktree | Laatste commit | Online? |
| --- | --- | --- | --- | --- |
| Basisapp (Agenda 0–4, Vakanties en paklijsten, Later nodig, de foutgrens) | Klaar | `thuisplanner-vakanties` · `Thuisplanner-vakanties` (hoofdlijn) | `488f347` online; lokaal `116c4de` (docs) | Ja, staging `488f347` |
| Slimme + (afspraak, taak, boodschap, vakantie, Later nodig, herontwerp) | Klaar | idem | idem | Ja, staging |
| Slimme +: vragen ("Welk modelnummer heeft onze vaatwasser?") | In ontwikkeling | `thuisplanner-spullen` · `Thuisplanner-spullen` | niets gecommit | Nee |
| Mijn spullen & Documenten: demo | Lokaal gebouwd (volgens de bouwsessie: tests groen) | idem | niets gecommit | Nee |
| Mijn spullen & Documenten: documentopslag (Storage, RLS, uploaden in twee fasen) | **Lokaal getest, nog niet online** (op een eigen lokale stack: RLS 94/94 met 164/164 tegenproeven, scheidingstests 8/8 met 8/8 tegenproeven, volgens de bouwsessie) | idem | niets gecommit (drie commits voorbereid) | Nee |
| Sanne-test (staging-overstap stap 10–11) | **Stap 10 bezig:** Sanne is uitgenodigd. Lettermint registreerde de uitnodigingsmail als *Delivered*, maar **ontvangst en acceptatie zijn nog niet bevestigd** (H14 niet bewezen). | hoofdlijn (sessie "Slimme + met Vakanties afronden") | – | Ja, op staging |
| Bèta-omgeving | Gepland (alleen het plan) | plan op `thuisplanner-deel2` | `02fd98d` (docs) | Nee |
| Promotiewebsite: sectie Mijn spullen & documenten | Lokaal gebouwd, gecommit | `thuisplanner-website` · `Thuisplanner-website` | `8902f3e` (niet op origin) | Nee |
| Promotiewebsite: video en schermopname | Klaar | idem | `4235ed7` | Op de besloten testomgeving (volgens de videosessie) |
| Lanceringsmelding | Lokaal gebouwd | idem | `2237343` ("niets aangemaakt of verstuurd") | **Onbekend** of de melding online aan staat |
| Besluiten 12–17, roadmap, bèta-voorbereiding, AI-proef, spullenontwerp | Lokaal vastgelegd | `thuisplanner-deel2` · `Thuisplanner-pr23` | `02fd98d`, 4 commits voor op origin (`75d167f`) | Nee (alleen docs) |
| Agenda-branch | Opgenomen in de hoofdlijn | `thuisplanner-agenda` · `Thuisplanner-agenda` | `49326e5` | Via de hoofdlijn |
| Demolijn (I3/I4) | Gestopt; geen uniek werk meer | `thuisplanner-demo` · `Thuisplanner-demo` | `41d075d`, met een onafgemaakte merge | Nee |

## 2. Omgevingen

| Omgeving | Wat draait er | Commit | Migraties | Laatste controle |
| --- | --- | --- | --- | --- |
| Staging (`mcyjpnnjqxlqfwqhkqrl`, `thuisplanner-staging.pages.dev`, achter Access) | De hoofdlijn | `488f347` | 19 (tot en met `20261027120000`) | 9b.4–9b.6 geslaagd (27–28 oktober): nacontrole tegen stand 27, de toestellen nagelopen |
| Bèta (eigen Pro-project) | Bestaat nog niet | – | – | – |
| Website, besloten test | De video-integratie | `4235ed7` (deployment `c9906973`, volgens de videosessie) | – | **Onbekend** |
| Website, publiek (`mijnthuisplanner.nl`) | **Onbekend** | **Onbekend** | – | – |

## 3. Werksporen

### 3.1 Basisapp en slimme + — eigenaar: "Slimme + met Vakanties afronden"
- **Doel:** roadmap mijlpaal 1 (Sanne) en 1b.
- **Stand:** online op staging. De echte iPhone-test (demo) is geslaagd.
- **Open:** mijlpaal 1b (KG-5E licht, herhalende taken, de kleine afwerking); migratie 28 (de reviewpunten voor
  Vakanties); een minimale app-versie; de volledige testopzet voor de uitnodigingsmail en k1 AC-11/12.
- **Volgende stap:** de Sanne-test (§3.3), daarna mijlpaal 1b.

### 3.2 Mijn spullen & Documenten — eigenaar: "Mijn spullen & Documenten: eerste versie bouwen"
- **Doel:** roadmap mijlpaal 2d (besluit 17): bedoeld voor bèta 1, mits veilig en aantoonbaar getest; anders start de
  bèta zonder.
- **Stand:** de demo en de vragen via de + zijn lokaal gebouwd. Het echte pad (Storage, RLS, Edge Functions) is in
  ontwikkeling. Er is een voorstel voor de nacontrole (`docs/voorstel-verbinding-controle-spullen.md` in die
  worktree). Niets gecommit, en geen migratie of bucket buiten de lokale stack.
- **Open:** gate 9 met de negatieve tests op bestanden; de verwijderprocedure met bestanden; de export met bestanden;
  een test op een echte telefoon.
- **Wacht op:** het rapport van de sessie, en het akkoord van de producteigenaar voor commits en migraties.

### 3.3 Sanne-test — eigenaar: de producteigenaar
- **Doel:** stap 10–11 van `docs/thuisplanner-staging-overstap.md`.
- **Stand:** Access staat op 1 maand en Sanne staat in de Access-policy. De producteigenaar heeft Sanne uitgenodigd, maar
  de mail kwam eerst niet aan (volgens de eerste melding). Lettermint heeft de uitnodiging inmiddels als **Delivered**
  geregistreerd. **Of Sanne de mail echt heeft ontvangen en de uitnodiging heeft geaccepteerd, is nog niet
  bevestigd.** De sessie "Slimme + met Vakanties afronden" onderzocht het alleen lezend; er is niets gewijzigd.
- **Volgende stap:** bevestigen dat de mail binnenkwam (ook in de spammap) en dat Sanne heeft geaccepteerd; daarna de
  afvinklijst van stap 11.
- **Opruimpunt vóór de bèta:** het oude beheerdersaccount van 17 oktober (een eigen testadres van de producteigenaar)
  blijft voorlopig staan.

### 3.4 Bèta voor 3–5 gezinnen — eigenaar: deze sessie
- **Doel:** roadmap mijlpaal 2. Plan in `docs/thuisplanner-beta-voorbereiding.md` (op `thuisplanner-deel2`).
- **Stand:** het plan staat. De besluiten zijn genomen: de bèta wordt later productie, Access gaat pas uit na de
  online controles, en er moet een aantoonbare verwijderprocedure zijn.
- **Open:** het verwijderscript met bewijs; de buildmodus `beta`; `functies.ps1 -Omgeving beta`; de nacontrole voor
  publishable keys; het besluit over Pro (T2); het project, de geheimen en het domein; de Access-poort; back-up en
  herstel; de privacyverklaring; feedback.

### 3.5 Promotiewebsite en lanceringsmelding — eigenaar: "Thuisplanner promotiewebsite"
- **Stand:** de sectie Mijn spullen staat lokaal (`8902f3e`, alle websitetests groen). De lanceringsmelding is lokaal
  afgebouwd.
- **Open:** de eindcontrole door de websitesessie; uploaden naar de testomgeving (akkoord); of de lanceringsmelding
  online aan staat (**onbekend**).

## 4. Beslissingen en akkoorden van de producteigenaar

| # | Wat | Blokkeert |
| --- | --- | --- |
| B1 | Het herstel van de uitnodigingsmail goedkeuren, zodra de oorzaak bekend is (stap 10; Sanne is al uitgenodigd) | De proef met twee accounts |
| B2 | `thuisplanner-deel2` (`02fd98d`) in de hoofdlijn mergen, zodat er één documentlijn is; pushen apart | Een eenduidige roadmap op de hoofdlijn |
| B3 | Commits en migraties van Mijn spullen (lokaal), en de test van de demo op de telefoon | Mijlpaal 2d |
| B4 | Pro aanschaffen (T2) en het bètaproject aanmaken | De bèta |
| B5 | Starten met het bèta-werk (verwijderscript, buildmodus `beta`, migratie 28, minimale app-versie, testopzet) | De bèta |
| B6 | Website: `8902f3e` pushen of uploaden naar de testomgeving; de status van de lanceringsmelding bevestigen | De website |
| B7 | Opruimen: `thuisplanner-demo`, de tijdelijke firewallregels, de oude exports (21 en 22 oktober), sessies afsluiten | Overzicht |
| B8 | Wanneer mijlpaal 1b begint (KG-5E licht, herhalende taken) | Mijlpaal 1b |

## 5. Sessies en worktrees

| Sessie | Worktree · branch | Rol | Status | Afsluiten? |
| --- | --- | --- | --- | --- |
| Thuisplanner v1 mobiele testomgeving | `Thuisplanner-pr23` · `thuisplanner-deel2` | Overzicht, staging, bèta, docs | Actief | Nee |
| Slimme + met Vakanties afronden | `Thuisplanner-vakanties` · `thuisplanner-vakanties` | **Enige schrijver** op de hoofdlijn | Stil | Nee |
| Mijn spullen & Documenten: eerste versie bouwen | `Thuisplanner-spullen` · `thuisplanner-spullen` | Bouwt mijlpaal 2d | Bezig | Nee |
| Thuisplanner promotiewebsite | `Thuisplanner-website` · `thuisplanner-website` | Website | Eindcontrole | Na de controle |
| Storyboard en videoprototype | – (eigen kladmap) | Video, afgerond (`4235ed7`) | Stil | Ja |
| I3/I4: demobranch | `Thuisplanner-demo` · `thuisplanner-demo` | Gestopt; dubbel werk | Stil | Ja, en de worktree opruimen |
| Agenda: UX-onderzoek | `Thuisplanner-agenda` · `thuisplanner-agenda` | Gepauzeerd; alles opgenomen | Stil | Ja, of laten staan voor Agenda-stap 5+ |
| Vakanties: analyse | – | Afgerond | Stil | Ja |
| Co-ouderschap | – | Besluit 12 vastgelegd; geparkeerd | Stil | Ja |
| App feature brainstorm, masterdocument (14 oktober), telefoonproef (13 oktober) | – | Oud | Stil | Ja |

## 6. Bekende risico's en aandachtspunten
- **Nummerconflict van migratie 28:** de bouwsessie van Mijn spullen gebruikte "migratie 28", terwijl 28 al gepland is
  voor de reviewpunten van Vakanties. De bouwsessie heeft haar migratie lokaal hernoemd naar 29 (nog niet gecommit). Het
  conflict moet **vóór het samenvoegen** aantoonbaar zijn opgelost: unieke tijdstempels in de goede volgorde, en de
  nacontrole (`SCHEMA_PER_STAND`) daarop bijgewerkt.
- **De gedeelde lokale stack "thuisplanner" (55321) is op 28 oktober tot drie keer kort herstart** door een test van een
  andere sessie (de edge_runtime en de db). Er is geen dataverlies vastgesteld en de stack draait met 19 migraties. Tests
  of proeven die rond die tijd op 55321 liepen, moeten mogelijk opnieuw.
- **De eerste online uitnodigingsmail** (stap 10): Lettermint meldt *Delivered*, maar ontvangst en acceptatie zijn niet
  bevestigd. Tot die bevestiging is H14 niet bewezen. Dat raakt ook de bèta, waar gezinnen hun partner per mail
  uitnodigen.
- Twee documentlijnen (`deel2` en de hoofdlijn) tot merge B2.
- `116c4de` (hoofdlijn) en `8902f3e` (website) staan alleen lokaal; `thuisplanner-website` staat niet op origin.
- Het spullenontwerp staat in pr23 en in de spullen-worktree; volgens de bouwsessie lopen ze gelijk, met daar §14–15
  erbij.
- Bekende testbeperkingen: k1 AC-11/12 en de uitnodigingsmail draaien niet in elke worktree (Docker-logboeken en de
  lokale geheimen); 4 RLS-tegenproeven slaan op de gedeelde lokale database eerder aan (140/140 op een schone database).
- Supabase Free: staging pauzeert na een week zonder gebruik, en heeft geen automatische back-ups.

## 7. Prioriteiten

**Prioriteit 1 (besluit van de producteigenaar, 28 oktober 2026): de promotiewebsite openbaar lanceren.** Elke stap
(uploaden naar de testomgeving, publiceren, DNS, Cloudflare) met een eigen akkoord.

Daarna, richting een veilige bèta:
2. **De Sanne-test (stap 10–11)** op staging: bevestigen dat de uitnodiging is ontvangen en geaccepteerd, dan het eerste
   echte bewijs met twee accounts.
3. **Het bèta-werk dat de lancering blokkeert, lokaal:** het verwijderscript met bewijs, de buildmodus `beta`, migratie
   28 (Vakanties) en de minimale app-versie, de volledige testopzet. Daarna Pro en de Access-poort.
4. **Het echte pad van Mijn spullen & Documenten afmaken en samenvoegen** (na het oplossen van het nummerconflict), en
   dan beslissen of het in bèta 1 meegaat.

## 8. Wijzigingslog
- 28 oktober 2026: eerste versie.
- 28 oktober 2026: stap 10 bijgewerkt (Sanne uitgenodigd; de uitnodigingsmail kwam niet aan; diagnose loopt), en het
  opruimpunt voor het oude beheerdersaccount.
- 28 oktober 2026: de website openbaar lanceren is prioriteit 1; Mijn spullen lokaal getest, nog niet online; het
  nummerconflict van migratie 28; de herstarte gedeelde lokale stack; de uitnodiging voor Sanne als Delivered gemeld,
  ontvangst en acceptatie niet bevestigd; de spelregel dat alleen de eigenaar dit document aanpast.

**Spelregels (besluit van de producteigenaar, 28 oktober 2026):** alleen de eigenaar van dit document ("Thuisplanner v1
mobiele testomgeving") past het aan. Andere Claude-sessies passen het **niet** zelfstandig aan; zij melden hun voortgang
aan die sessie. Bijwerken bij elke commit die de stand verandert, en minstens aan het eind van elke werkdag.
