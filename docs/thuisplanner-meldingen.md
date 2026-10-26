# Thuisplanner: meldingen, herinneringen en ondersteuningsniveaus

- **Vastgesteld:** 26 oktober 2026, door de producteigenaar, als **toekomstig productvereiste en productrichting**.
- **Status:** niets gebouwd. Geen tabellen, velden, migraties of schermen. Dit document legt vast wat het latere ontwerp
  moet respecteren, zodat de huidige bouw (Agenda, Taken, Vakanties) er niet mee botst.
- **Planning:** in de roadmap staat dit als fase F11. Dat is een faseaanduiding, geen besluit om herinneringen pas aan het
  einde te bouwen. Vóór de eerste test met Sanne beoordelen we welke basisherinneringen daarvoor nodig zijn.
- **Samenhang:** beslissing 4 (pushmeldingen alleen als ze waarde hebben, getoetst aan principe 6) in
  `docs/productkompas-beslissingen.md`; besluit 12 over gescheiden ouders en samengestelde gezinnen (26 oktober 2026,
  "meldingsinstellingen zijn persoonlijk, per account; standaard geen meldingen over de grens van het huishouden");
  `docs/thuisplanner-agenda.md` (Agenda en latere agendakoppelingen).

## 1. Besluiten

| # | Besluit | Toelichting |
| --- | --- | --- |
| M1 | **Eén centraal systeem voor meldingen en herinneringen** | Eén plek in de app: *Instellingen → Meldingen en herinneringen*. Later voor Agenda, Taken, Verjaardagen en Vakanties; uitbreidbaar met andere onderdelen |
| M2 | **Voorkeuren zijn strikt persoonlijk, per account** | Niet per huishouden en niet per lid. De instellingen van Bas wijzigen nooit vanzelf die van Sanne, en andersom. Ook een beheerder van het huishouden kan ze niet voor een ander zetten |
| M3 | **Pushregistratie en toestemming per apparaat** | Toestemming geven of intrekken gebeurt per toestel (de toestemming van de browser of het besturingssysteem). Een nieuw toestel vraagt opnieuw; uitloggen meldt het toestel af |
| M4 | **Per categorie aan of uit** | Bijvoorbeeld Agenda, Taken, Verjaardagen, Vakanties |
| M5 | **Standaardherinneringen** | Per categorie een eigen standaard (bijvoorbeeld 30 minuten vóór een afspraak, de avond ervoor voor een taak) |
| M6 | **Stille uren** | Per account; in die uren geen meldingen, behalve wat de gebruiker zelf als uitzondering kiest |
| M7 | **Afwijken per afspraak** | Bij een afspraak kan de gebruiker een andere herinnering kiezen dan de standaard. Die afwijking is ook persoonlijk: ze verandert niets voor andere gezinsleden |
| M8 | **Ondersteuningsniveau per account: Rustig, Behulpzaam of Actief** | Productrichting, nog geen definitief ontwerp (§2) |

## 2. Productrichting: Thuisplanner als actieve gezinsassistent

Thuisplanner wordt een **actieve gezinsassistent**: het helpt onthouden, voorbereiden en regelen. **Ieder gezinslid met een
account kiest zelf hoeveel ondersteuning het wil**: Rustig, Behulpzaam of Actief. Het niveau is persoonlijk per account,
net als de meldingen (M2), en geldt niet voor het hele huishouden.

Een eerste invulling, ter oriëntatie (nog niet besloten):

| Niveau | Bedoeling | Voorbeelden |
| --- | --- | --- |
| **Rustig** | Alleen wat de gebruiker zelf vroeg | Herinneringen die de gebruiker zelf instelde; geen voorstellen of samenvattingen |
| **Behulpzaam** | Ook wat duidelijk helpt, zonder te storen | De standaardherinneringen per categorie; af en toe een rustig voorstel (zoals nu de meedenker op Vandaag) |
| **Actief** | Meer vooruitdenken en voorbereiden | Vaker voorstellen, een dag- of weekoverzicht, een tijdige herinnering aan voorbereidingen (gymtas, paklijst, cadeau) |

**Wat in elk niveau geldt (vanuit het Productkompas):**
- Het niveau bepaalt **hoeveel aandacht** Thuisplanner vraagt en **hoeveel het voorstelt**, niet wat het zonder toestemming
  mag doen. De risicogrenzen van principe 5 en beslissing 1 blijven in alle niveaus gelijk: bij twijfel één keer vragen,
  en hoe groter het gevolg van een fout, hoe meer bevestiging.
- Ook op Actief moet een melding waarde hebben (principe 6, beslissing 4). Actief betekent niet: alles melden wat bekend is
  (principe 2).
- Een rustige dag mag er rustig uitzien, ook op Actief.
- Wisselen van niveau is één keuze, direct terug te draaien, zonder dat er iets verloren gaat.

**Spanning met het Productkompas, om bij het ontwerp te bewaken:** de woorden "actieve assistent" en het niveau Actief
kunnen botsen met principe 2 (rust boven volledigheid) en principe 6 (meer aandacht besparen dan vragen). De keuze per
persoon en de grenzen hierboven moeten dat voorkomen. Elk concreet ontwerp krijgt eerst de Productkompas-toets.

## 3. Architectuur: wat nu al beschermd moet worden

**Bouw nu niets hiervan.** Maar respecteer in de huidige bouw:

1. **Persoonlijk betekent per account, niet per lid.** Principe 7: account en huishoudlid zijn verschillende dingen. Een
   kind zonder account krijgt geen eigen meldingen. Voorkeuren horen later bij `auth.users` (het account), met RLS die
   alleen het eigen account laat lezen en schrijven. Nooit een kolom op `households` of `household_members` voor
   voorkeuren.
2. **Afwijkingen per afspraak niet op de afspraak zelf.** `events` is gedeeld: een herinneringskolom daarop zou voor
   iedereen gelden en zou zichtbaar zijn voor anderen. Later een aparte tabel per account en afspraak; bij een
   herhalende reeks per voorkomen te sleutelen op de reeks en de datum (het bestaande model met `series_id` en
   uitzonderingen ondersteunt dat).
3. **Toestellen apart van voorkeuren.** Pushregistraties per account per toestel, los van de voorkeuren, zodat een
   toestel weg kan zonder dat de voorkeuren verdwijnen. Uitloggen en accountverwijdering ruimen de registratie op (zoals
   P2 voor onbevestigde opdrachten).
4. **Privacy in de melding zelf.** De inhoud van een pushmelding gaat via een externe dienst. Daarom:
   - zo weinig mogelijk inhoud in het bericht;
   - een privé-afspraak van een ander ("Bezet") levert nooit een melding met inhoud op;
   - gedeelde kindinformatie uit een gekoppeld huishouden (besluit 12) standaard niet over de grens.
5. **Tijd en zone.** Stille uren en herinneringen rekenen in de tijdzone van de gebruiker. Die kan afwijken van
   `households.timezone` (bijvoorbeeld op vakantie in het buitenland).
6. **Versturen gebeurt op de server.** Gepland, idempotent (een herinnering gaat hoogstens één keer per toestel af) en
   zonder geheimen in de app. iPhone: webpush werkt alleen voor een op het beginscherm gezette web-app (zie het open
   punt over de app-winkels in `docs/roadmap.md`).
7. **Ondersteuningsniveau als één persoonlijke instelling.** Het niveau is een standaard voor de andere voorkeuren, geen
   apart rechtenmodel. Wat een niveau precies aanzet, blijft één uitlegbare regel per categorie (geen verborgen logica).

## 4. Gevolgen voor de lopende trajecten

- **Agenda** (`docs/thuisplanner-agenda.md`): niets te bouwen. Afspraken houden stabiele ids (UUID), zodat een latere
  herinnering per afspraak eraan kan hangen. Het detailvenster krijgt later hooguit één regel "Herinnering", in de stijl
  van W1.
- **Taken en Vakanties:** voorbereidingen en vertrekdata zijn later goede bronnen voor herinneringen; nu niets wijzigen.
- **Co-ouderschap (besluit 12):** de voorkeuren blijven per account, ook voor gedeelde items uit een ander huishouden;
  standaard geen meldingen over de grens.
- **Verjaardagen:** bestaat nog niet als onderdeel in Thuisplanner; het meldingensysteem moet het later kunnen opnemen.

## 5. Open punten

| # | Punt | Opmerking |
| --- | --- | --- |
| MO1 | Welk ondersteuningsniveau is de standaard voor een nieuw account? | Principe 2 en 6 pleiten voor terughoudend (Rustig of Behulpzaam). Beslissen bij het ontwerp |
| MO2 | Welke categorieën precies, en welke standaardherinneringen | Bij het ontwerp |
| MO3 | Meldingen via e-mail naast push? | Niet besloten |
| MO4 | Gratis of Premium | Beslissing 3: organiseren blijft gratis. Een eenvoudige herinnering hoort waarschijnlijk bij organiseren; uitgebreide ondersteuning (Actief) kan Premium worden. Niet besloten |
| MO5 | Formeel vastleggen in `docs/productkompas-beslissingen.md` | Als besluit 13, na het vastleggen van besluit 12 (dat wordt in een andere worktree bijgewerkt) |
| MO6 | Gates | Gate 9 opnieuw voor de nieuwe gegevens (voorkeuren, toestellen, afwijkingen per afspraak); de navigatiegate (beslissing 2) voor de plek van Instellingen |
