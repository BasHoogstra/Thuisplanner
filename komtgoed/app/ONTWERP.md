# KG-2 en KG-3: ontwerp en Productkompas-toets

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

## 3. KG-3: functioneler, zonder de rust te verliezen

**Productkompas-toets in het kort:** principe 2 (rust) blijft leidend.
- **Vandaag:**
  - toont nog steeds alleen wat vandaag relevant is;
  - afgeronde taken staan ingeklapt in één regel;
  - taken voor later en taken zonder datum staan niet op Vandaag.
- **Fouten moeten goedkoop zijn:**
  - verwijderen gebeurt direct, zonder bevestigingsvraag, maar met "Ongedaan maken";
  - het venster heeft een aparte, rustige knop "Verwijderen".
- **Privacy volgt de situatie:** een privé-afspraak van een ander blijft "Bezet". Openen toont alleen
  tijd en persoon, en wijzigen kan niet.

**Bewuste keuzes:**
1. **Bewerken in hetzelfde venster als toevoegen:** één vorm om te leren.
2. **Aparte knoppen voor afvinken en openen:** afvinken (het rondje) en openen (de naam) zijn twee
   knoppen, zodat je niet per ongeluk afvinkt als je iets wilt aanpassen.
3. **Rechten in de demo:**
   - gedeelde afspraken en taken mag ieder lid aanpassen en verwijderen;
   - een privé-afspraak alleen de eigenaar;
   - alleen de eigenaar kan iets privé of weer gedeeld maken.
   Dit is een **productvoorstel** dat in de echte app server-side moet worden afgedwongen (KG-1 en
   gate 9). Het is een redelijk uitgangspunt voor een gezin, maar nog geen besluit. Bijvoorbeeld: mag
   een kind straks gedeelde afspraken wijzigen?
4. **Week van maandag tot en met zondag**, met ISO-weeknummers zoals in Nederlandse agenda's.
   - Mobiel: onder elkaar; lege dagen zijn één regel.
   - Desktop: zeven kolommen.
5. **Taken in de weekagenda:**
   - geen apart Taken-scherm; de navigatie blijft vier bestemmingen plus +;
   - taken zonder datum staan onderaan de agenda.
6. **Boodschappen zonder dubbelingen:**
   - hetzelfde artikel komt er niet twee keer op;
   - een artikel uit het mandje komt terug naar "nog nodig";
   - de melding zegt eerlijk wat er gebeurde.
7. **"Ongedaan maken" hoort altijd bij de melding ernaast.** Een latere wijziging zonder melding
   (bijvoorbeeld een boodschap afvinken) haalt de oude knop weg, zodat hij nooit iets anders
   terugdraait.

**CI-fix uit KG-2:** op de Ubuntu-runner viel "Boodschappen" in de tabbalk op 360 px net buiten de
ruimte, door een breder systeemlettertype. De kolom voor Boodschappen is nu iets breder. Een test met
een breed lettertype bewaakt dit; de tegenproef met de oude indeling faalt zoals verwacht.

## 4. Wat nog moet gebeuren buiten deze PR

- **Roadmap:** in `docs/roadmap.md` regels voor KG-2 en KG-3 toevoegen. Dat kan pas als de sectie
  "Ontwikkelrichting KomtGoed" uit PR #19 op `main` staat; nu toevoegen zou een conflict met #19
  geven.
- **CHANGELOG:** de regels voor KG-2 en KG-3 volgen om dezelfde reden samen met de roadmapregel.
- **Productbesluit:** wie welke gedeelde items mag wijzigen (zie keuze 3 in sectie 3).
- **Open besluiten:** B2 (omgevingen), B3 (techniek; zie het voorstel hierboven) en B4 (inloggen).
