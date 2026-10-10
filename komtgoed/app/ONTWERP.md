# KG-2: ontwerp en Productkompas-toets

**Status:** prototype met fictieve gegevens, in een eigen PR. Niet gemerged en niet gedeployd.
KG-2 hangt niet af van KG-1 (PR #19).

## 1. Productkompas-toets

1. **Principes:**
   - **2. Rust boven volledigheid.**
     - Vandaag beantwoordt "Wat moet ik nu weten of doen?".
     - Er is één nadrukkaart (de eerstvolgende afspraak); de rest zijn rustige lijsten.
     - Lege onderdelen verdwijnen.
     - Een rustige dag toont alleen "Niets dat vandaag van je vraagt."
   - **6. Aandacht besparen.**
     - Geen badges, tellers of meldingen, en geen "AI heeft...".
     - Het enige signaal is een gewone zin met twee knoppen.
   - **7. Het huishouden staat centraal.** Kinderen zijn leden zonder account (zichtbaar onder Meer)
     en kunnen in afspraken en taken voorkomen.
   - **8. Werkelijk gebruik.** De navigatie volgt de hypothese Vandaag, Agenda, Boodschappen, +.
   - **9. Organiseert het huishouden, niet de mensen.**
     - Geen scores, verdeling per persoon of confetti.
     - "Wie pakt het op?" is optioneel.
   - **Fouten moeten goedkoop zijn:** elke toevoeging en elk afvinken heeft "Ongedaan maken".
   - **Privacy volgt de situatie:** een privé-afspraak van een ander staat er als "Bezet", zonder titel
     of plek.
2. **Neemt het werk weg?** Het prototype bewijst nog niets. Het is een ervaringstest van de rust en de
   vorm van Vandaag.
3. **Organiseren, onthouden of uitvoeren?** Ja: de dag, de taken en de boodschappen.
4. **Eenvoudiger?**
   - Eén scherm met vier onderdelen.
   - Eén invoervenster voor drie soorten.
   - Geen instellingen.
5. **Aandacht, controle en privacy?**
   - Er wordt niets vanzelf toegevoegd; het signaal vraagt eerst.
   - Er worden geen gegevens verstuurd; de tests controleren dat.
6. **Bewijs?** Nog geen. Dit prototype is bedoeld om feedback op te halen.
7. **Ultieme toets:** de vorm moet laten zien dat het huishouden minder hoeft te onthouden. Dat moet
   blijken uit gebruik.

## 2. Bewuste keuzes (graag reviewen)

1. **Techniek:**
   - Vite + React + TypeScript; tests met Vitest/Testing Library en Playwright.
   - Dit is een **voorstel voor besluit B3**, niet het besluit zelf.
   - Gekozen omdat het gangbaar is, goed te testen is, met weinig afhankelijkheden, en er een los
     HTML-bestand uit te bouwen is.
   - Een andere keuze bij B3 kost alleen dit prototype.
2. **Navigatie:**
   - Vandaag, Agenda, (+), Boodschappen, Meer: op mobiel onderaan, op desktop als zijbalk.
   - Dit is de hypothese uit principe 8. De navigatiegate (beslissing 2) blijft gelden: de definitieve
     navigatie wordt getoetst aan werkelijk gebruik.
3. **Meedenken:**
   - Een vaste, uitlegbare regel. Als een afspraak van morgen een voorbereiding heeft, komt er één
     vraag, en alleen als die nog niet als taak bestaat.
   - Accepteren zet een taak op de lijst; "Niet nodig" laat het signaal verdwijnen.
   - Dit volgt beslissing 1 ("bij twijfel één keer vragen").
   - Geen AI, en geen zelfstandige automatisering.
4. **Privé:**
   - De demo bootst na wat de server later moet doen: een privé-afspraak van een ander komt binnen zónder
     titel en plek.
   - De echte afdwinging hoort in de database (KG-1: `private.can_read`; gate 9 vóór de eerste
     inhoudstabel).
5. **Volgorde:**
   - Het MVP-bouwplan zette Vandaag (F6) na de domeinen.
   - Op jouw verzoek komt er nu eerst een visueel prototype. Dat raakt geen gate, omdat er geen echte
     gegevens of backend zijn.
   - Het prototype vervangt F2 (app-skelet met inloggen, op staging) en F6 niet; het geeft ze richting.
6. **Geen opslag:**
   - Ook geen `localStorage`. Zo blijft het een demo, en kan niemand denken dat er iets bewaard is.
7. **Lettertypen:** systeemlettertypen, dus geen externe bronnen.
8. **Licht en donker:** volgen het toestel.
9. **Fictieve gegevens:** Familie De Boer bestaat niet. Er staan geen echte namen, adressen of
   Huisplan-gegevens in.

## 3. Wat nog moet gebeuren buiten deze PR

- **Roadmap:** in `docs/roadmap.md` een regel voor KG-2 toevoegen. Dat kan pas als de sectie
  "Ontwikkelrichting KomtGoed" uit PR #19 op `main` staat; nu toevoegen zou een conflict met #19
  geven.
- **CHANGELOG:** de regel voor KG-2 volgt om dezelfde reden samen met de roadmapregel.
- **Open besluiten:** B2 (omgevingen), B3 (techniek; zie het voorstel hierboven) en B4 (inloggen).
