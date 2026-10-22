# Thuisplanner fase 1: Vandaag en de centrale + (bouwvoorstel)

**Status:** 📝 voorstel ter beoordeling (18 oktober 2026). Niets gebouwd. Bouwen pas na akkoord op dit voorstel en op
de besluiten in §5.

**Voortbouwend op:**
- de inventarisatie van 18 oktober 2026 (wat werkt, wat ontbreekt);
- `docs/identiteit-en-items.md`, besluiten 11 tot en met 16 (één item in meerdere weergaven, gekoppelde handelingen,
  geen universele entiteit);
- `docs/thuisplanner-snelinvoer.md` (toevoegen in één zin, V1 tot en met V6, akkoord);
- `docs/thuisplanner-sync.md` §7 tot en met §9 (P1 tot en met P5; P1, P2 en P4 besloten en lokaal gebouwd op 19 oktober 2026, P5 open).

## 1. Doel

Een gezin opent Thuisplanner elke dag omdat Vandaag klopt en toevoegen seconden kost. Fase 1 bouwt daarvoor:
- de samenwerking tussen afspraken en taken (koppelingen);
- de centrale + in één zin;
- een betrouwbaar meedenk-signaal;
- ongedaan maken;
- en Hulp & uitleg.

Er wordt niets herbouwd: de tabellen, de sync en de schermen blijven bestaan.

## 2. Productkompas-toets

| Vraag | Antwoord |
| --- | --- |
| Principes | 1 (meer gemak dan gedoe: toevoegen in één zin), 2 (rust: één signaal, niet meer), 3 (één keer vertellen: een voorbereiding is een echte taak, geen tweede tekst), 5 (automatisering verdiend: het signaal stelt voor, de gebruiker beslist), 6 (aandacht besparen), "fouten moeten goedkoop zijn" (ongedaan maken) |
| Neemt het werk of denkwerk weg? | Ja: minder typen, en een voorbereiding die je niet vergeet, zonder dubbel invoeren |
| Organiseren, onthouden of uitvoeren? | Alle drie |
| Kan het eenvoudiger? | Koppelingen eerst voor één soort (voorbereiding); geen graafmodel (besluit 16) |
| Aandacht, controle en privacy? | Een koppeling draagt geen inhoud. Een koppeling met een privé-afspraak van een ander is onzichtbaar (gate 9, getoetst in de RLS-matrix) |
| Werkelijk gebruik? | Hypothese; de bèta meet hoe vaak de zin en het signaal gebruikt worden (§7 van de snelinvoer) |
| Ultieme toets | Ja: minder onthouden (de voorbereiding), minder regelen (één zin) |
| Gates | **Gate 9** voor de nieuwe tabel(len). P1 tot en met P5 (sync) moeten eerst besloten zijn: ze bepalen wat een toestel van de nieuwe gegevens bewaart |

## 3. Bouwstappen (elk een eigen, kleine commit met tests)

| # | Stap | Wat | Tests |
| --- | --- | --- | --- |
| F1.1 | **Koppelingen** | Een tabel `item_koppelingen` (huishouden, van-type en -id, naar-type en -id, soort; eerst alleen `voorbereiding`: taak → afspraak). RLS via de poortfuncties: zichtbaar als je beide kanten mag zien, nooit naar een privé-afspraak van een ander. Verwijderen van een item ruimt de koppeling op. Sync: één domein erbij. App: een type `Koppeling`. Er wordt niets automatisch omgezet | RLS-matrix (nieuwe scenario's), tegenproeven, de catalogus (KG-T73 tot en met KG-T75), integratie (twee leden, privé), sync-tests |
| F1.2 | **Meedenken via koppelingen** | Het signaal op Vandaag kijkt of er een gekoppelde voorbereidingstaak is, niet meer naar gelijke titels. "Ja, zet erop" maakt de taak **met** koppeling; afvinken laat het signaal verdwijnen. Wegklikken wordt per lid onthouden (server), dus ook op andere toestellen | Unit (Vandaag), integratie, e2e (twee telefoons) |
| F1.3 | **Toevoegen in één zin (deel B)** | Zoals in `thuisplanner-snelinvoer.md` §4 en §6, met de besluiten V1 tot en met V6. Een losse, geteste parser (geen AI); de knop toont wat herkend is; privé alleen bewust (§4.4). "Alles invullen" opent het bestaande venster | Unit (de parser, veel voorbeelden), e2e (390 px) |
| F1.4 | **Ongedaan maken in de echte versie** | Na verwijderen en afvinken een rustige melding "Ongedaan maken" (zoals in de demo). Technisch: de omgekeerde opdracht via dezelfde sync, idempotent, met versiecontrole. Een conflict geeft een uitleg, nooit stil overschrijven | Integratie (gelijktijdig), e2e |
| F1.5 | **Meer → Hulp & uitleg** | Vaste uitleg per onderdeel (Vandaag, Agenda, toevoegen, privé, boodschappen, uitnodigen, inloggen). Een plek voor de knop "Rondleiding opnieuw starten", die pas verschijnt als de rondleiding er is. Een veld "kennismaking gezien" per account (profiel), zodat de kennismaking later niet op elk toestel terugkomt | Unit, e2e |

**Niet in fase 1** (bewust):
- herhalende taken (eigen besluit over het takenmodel, V3; zie §5);
- verjaardagen (fase 2);
- installeren op het beginscherm en meldingen (fase 3);
- vakantie (fase 4);
- meerdaagse afspraken in het venster;
- de echte rondleiding (pas als fase 1 stabiel is).

## 4. Onboarding (ontwerp, bouwen na fase 1)

- **Kennismaking:**
  - optioneel, hoogstens 3 tot 4 rustige kaarten: Vandaag, de +, privé, uitnodigen;
  - pas na het eerste huishouden, nooit tijdens inloggen, de code of een uitnodiging;
  - "Overslaan" is altijd zichtbaar;
  - één keer per account (F1.5).
- **Hulp & uitleg** (F1.5): altijd bereikbaar in Meer. Daar start je de rondleiding opnieuw.
- **De rondleiding wijst echte knoppen aan.** Ze wordt pas gebouwd als die knoppen niet meer veranderen.

## 5. Besluiten die nodig zijn vóór de bouw

| # | Vraag | Advies |
| --- | --- | --- |
| F-A | Koppelingen in fase 1 alleen voor "voorbereiding" (taak → afspraak)? | **Ja.** Klein en direct zichtbaar op Vandaag. Andere soorten (boodschap → afspraak, vakantie-to-do) volgen met hun functie |
| F-B | Blijft de bestaande tekst "voorbereiding" bij een afspraak bestaan? | **Ja, voorlopig.** Het signaal gebruikt de tekst als voorstel. Pas bij "Ja, zet erop" ontstaat een gekoppelde taak. Geen automatische omzetting van bestaande gegevens |
| F-C | Ongedaan maken: voor welke handelingen, en hoe lang? | **Verwijderen en afvinken; tot de volgende handeling, hoogstens 10 seconden**, zoals in de demo |
| F-D | Herhalende taken in fase 1 of later? | **Direct na fase 1** (als F1.6 of fase 1b), na een kort besluit over het takenmodel. Dagelijks belangrijk (vaste klusjes), maar het raakt het datamodel en de sync; eerst de koppelingen stabiel |
| F-E | P1 tot en met P5 (sync, op het toestel en op de server) | **Besluiten volgens de voorstellen in `thuisplanner-sync.md` §9** (P1: alleen de identiteit duurzaam in productie; P2: uitloggen wist onbevestigd na een waarschuwing; P3: de demo blijft; P4: niet automatisch wissen, wel tonen; P5: 90 dagen). Die gelden dan ook voor koppelingen |

## 6. Technische voorwaarden (vóór F1.1)

- **De hernoeming afgerond en gecommit** (een lokale commit op 18 oktober 2026; de technische namen in de database blijven tot een beoordeelde migratie).
- **P1 tot en met P5 besloten** (F-E): P1, P2 en P4 besloten en lokaal gebouwd op 19 oktober 2026 (`thuisplanner-sync.md` §10); P5 nog open.
- **Liefst eerst push en de eerste CI-run** (met akkoord). Zo bouwt fase 1 op een groene, gecontroleerde basis en niet
  op een stapel ongeteste lokale commits.
- **Staging bijwerken** (met akkoord), zodat je fase 1 zelf op je telefoon kunt proberen.
