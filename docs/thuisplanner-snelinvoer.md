# Thuisplanner: toevoegen in één zin, en een rustiger Toevoegen-venster

**Status:** voorstel van 14 oktober 2026. **Besloten op 14 oktober 2026** door de producteigenaar:
akkoord met de adviezen bij V1 t/m V6 (§5). Deel A wordt als eerste gebouwd; deel B volgt in eigen,
kleine stappen (§8).

**Stand 20 oktober 2026 (lokaal gebouwd, nog niet gecommit):** deel B, na de telefoonproef en het akkoord op K1–K12.
- **B1:** `begrijp()` in `thuisplanner/app/src/lib/zin.ts`, met `tests/zin.test.ts` (69 gevallen: de vijf voorbeelden van
  de producteigenaar, twijfel, meerdere boodschappen) en `scripts/tegenproeven-invoer.mjs`.
- **B2:** de + opent alleen het zinveld (`components/SnelInvoer.tsx`); wat herkend is, staat er als knop onder, een aanname
  met een stippelrand, twijfel als korte zin, privé altijd zichtbaar bij een afspraak; "Alles invullen" opent het formulier
  van deel A, met alles al ingevuld. Opslaan via de bestaande acties: geen wijziging aan de sync-module of de database.
- **C1:** boodschappen vanzelf in een categorie (`lib/categorie.ts`, 16 categorieën met Overig), op Boodschappen
  gegroepeerd onder "Nog nodig"; de volgorde komt uit `categorieVolgorde()` (later eventueel per winkel, K12).
- **Nog niet:** een boodschap met een dag (B4) en een correctie van de categorie die het huishouden onthoudt (C2); beide
  vragen een migratie met een eigen akkoord.
- **Afwijking van §4.2:** de afkortingen "ma" en "zo" worden bewust niet als dag gelezen (gewone woorden).

- **Hoort bij:** Thuisplanner-fase F7 ("Centrale invoer (tekst)") in `docs/roadmap.md`, sectie
  "Ontwikkelrichting Thuisplanner". Het rustiger venster (deel A) staat los van F7 en kan eerder.
- **Gelezen vóór dit voorstel:** `PRODUCT_PRINCIPLES.md`, `docs/productkompas-beslissingen.md`,
  `docs/roadmap.md`, `docs/identiteit-en-items.md` (4.4, 4.5 en 5.3), `thuisplanner/app/ONTWERP.md`,
  `docs/thuisplanner-app.md`, `docs/thuisplanner-inhoud.md`, en de bestaande snelinvoer van Huisplan
  (`parseQuickAdd()` in `index.html`).

## 1. Waarom

Iets toevoegen kost nu zeven vragen: soort, wat, wanneer, van/tot, waar, herhalen en voor wie. Voor
een afspraak als "zwemles Daan donderdag 16:00, elke week" zijn dat ongeveer tien tikken en een
klokkiezer. Toevoegen is de handeling die een gezin het vaakst doet. Elke tik die daar wegvalt,
scheelt dus elke dag werk.

Het voorstel heeft twee delen:

- **A. Een rustiger Toevoegen-venster.** Hetzelfde formulier, maar alleen de vragen die bijna altijd
  nodig zijn staan open; de rest staat achter "Meer opties". Tijden kies je met één tik.
- **B. Toevoegen in één zin.** Eén invoerveld. Terwijl je typt, verschijnt eronder wat Thuisplanner
  ervan maakt, als kleine knoppen die je met één tik kunt aanpassen. Het formulier uit A blijft
  bereikbaar via "Alles invullen".

## 2. Productkompas-toets

1. **Welke principes raakt dit?**
   - **1. Meer gemak dan gedoe:** het vervangt formuliervelden door één zin. Er komt geen nieuw
     gegeven bij.
   - **2. Rust boven volledigheid:** het venster toont minder vragen tegelijk.
   - **3. Eén keer vertellen is genoeg:** namen van leden en eerder gekochte boodschappen worden
     herkend, zonder dat iemand ze opnieuw hoeft in te voeren.
   - **5. Automatisering moet verdiend worden:** Thuisplanner bewaart niets voordat je op
     "Toevoegen" tikt. Je ziet altijd vooraf wat het wordt. Er wordt nog niets geleerd of
     zelfstandig gedaan.
   - **6. Aandacht besparen:** geen "slim herkend!", geen kop als "Zo begrijp ik het". Alleen de
     knoppen met wat het wordt.
   - **7. Het huishouden staat centraal:** alleen namen van echte leden worden personen. Een andere
     naam ("oma", "Sanne van school") blijft gewoon tekst in de titel.
   - **Fouten moeten goedkoop zijn:** corrigeren is één tik op een knop. Na het toevoegen blijft
     "Ongedaan maken" werken zoals nu.
   - **Privacy volgt de situatie:** het herkennen gebeurt op het toestel, zonder netwerk en zonder
     AI. Bij een afspraak staat altijd zichtbaar of hij gedeeld of privé wordt.
   - **10. Het huishouden is de klant:** de getypte tekst wordt nergens heen gestuurd of bewaard,
     behalve als het item zelf.
2. **Neemt het werk weg?** Ja, als de herkenning in de meeste gevallen klopt. Dat is nog een
   hypothese (zie vraag 6).
3. **Organiseren, onthouden of uitvoeren?** Ja: het vastleggen van afspraken, taken en
   boodschappen.
4. **Kan het eenvoudiger?**
   - Geen symbolen zoals `@naam`, `!` of `#categorie` (die gebruikt Huisplan nu wel). Alleen gewone
     woorden.
   - Eén item per zin, behalve bij boodschappen ("melk, brood en kaas").
   - Geen nieuw scherm of nieuwe navigatie: de bestaande `+` opent het.
5. **Aandacht, controle en privacy?**
   - Er wordt niets bewaard zonder tik op "Toevoegen".
   - Privé of gedeeld staat altijd in beeld bij een afspraak. Een fout daar heeft het grootste
     gevolg (een ander ziet een titel die privé had moeten zijn), dus daar is de bevestiging het
     zichtbaarst.
   - De privacy zelf blijft in de database afgedwongen (gate 9); dit voorstel verandert daar niets
     aan.
6. **Bewijs?** Nog niet. Te testen in de demo en daarna in het eigen huishouden (zie §7).
7. **Ultieme toets:** ja, als het klopt: het gezin hoeft minder te tikken en minder na te denken over
   *hoe* het iets invoert.

**Gates:**
- **Gate 9 (privacy):** niet geraakt. Er komen geen nieuwe tabellen, velden of serverfuncties bij;
  opslaan gaat via de bestaande functies (`toevoegen`, `voegBoodschappenToe`, en daarmee
  `save_event` en dergelijke).
- **Gate 2 (navigatie):** niet geraakt. De navigatie verandert niet; de `+` blijft waar hij is.
- **Beslissing 1 (automatisering):** gevolgd. Thuisplanner stelt voor, de gebruiker bevestigt met één
  tik. Leren van correcties komt pas later, apart getoetst.
- **Beslissing 5 (AI en foto's):** niet geraakt. Er is geen AI; de herkenning bestaat uit vaste,
  geteste taalregels.
- **Importgates (beslissing 6 en 8, besluiten 4, 5 en 7):** niet geraakt. Er is geen Huisplan-data
  bij betrokken.

**Melding: volgorde.** In de roadmap staat F7 na F6 (Vandaag). Dit voorstel haalt F7 naar voren, als
onderdeel van het prototype, net zoals bij KG-2 met Vandaag is gebeurd. Dat raakt geen gate, omdat er
geen nieuwe gegevens of backend bij komen. Het vraagt wel een akkoord van de producteigenaar.

## 3. Deel A: een rustiger Toevoegen-venster

Dit deel geldt ook voor bewerken, omdat dat hetzelfde venster is.

| Nu | Voorstel |
| --- | --- |
| Alle velden staan open | Open: soort, wat, wanneer, hoe laat, voor wie. Achter **Meer opties**: waar, herhalen, privé. |
| Tijd via de klokkiezer van het toestel (`--:--`) | Eén rij tijdknoppen: **Hele dag · 09:00 · 12:00 · 15:30 · 18:00 · Andere tijd**. "Andere tijd" opent de bestaande klokkiezer. |
| Van- en Tot-veld naast elkaar | Alleen het begin. **+ Eindtijd** verschijnt na het kiezen van een begin. |
| Privé-schakelaar onderaan | Onder Meer opties. Staat de afspraak al op privé, dan is Meer opties standaard open. |

Regels:
- **Wat ingevuld is, staat open.** Bij bewerken klapt Meer opties vanzelf open als waar, herhalen of
  privé een waarde heeft. Zo is er nooit een ingevulde waarde die je niet ziet.
- **Tijdknoppen:** vaste tijden in v1. Later kunnen dat de tijden zijn die het huishouden het vaakst
  gebruikt (principe 4), maar dat is een aparte stap.
- **Velden die het venster niet toont blijven bewaard,** zoals nu met `notities` en `eindDatum`.

**Gebouwd (14 oktober 2026)** in `thuisplanner/app/src/components/ItemVenster.tsx`, met de tests in
`tests/toevoegen-rustig.test.tsx`. Kleine uitwerking: "Voor wie" staat nu direct onder "Hoe laat", en de
knop Meer opties noemt wat erachter zit ("Waar · Herhalen · Privé"; alleen wat voor deze afspraak kan).
Bij één voorkomen van een reeks blijft Meer opties dicht: de herhaling staat al in de reekskop.

Wat níet verandert: het "Alleen deze / Hele reeks"-blok, de foutmeldingen, het herinvoeren van een
privé-afspraak zonder inhoud, het Bezet-venster, en de rechten.

## 4. Deel B: toevoegen in één zin

### 4.1 Hoe het eruitziet

```
┌──────────────────────────────────────────────┐
│ Toevoegen                                  ✕ │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ zwemles daan donderdag 16:00 elke week   │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│  Zwemles                                     │
│  [Afspraak] [do 15 okt] [16:00] [● Daan]     │
│  [Elke week] [Gedeeld]                       │
│                                              │
│ [          Toevoegen          ]              │
│              Alles invullen                  │
└──────────────────────────────────────────────┘
```

- De `+` opent dit venster, met de cursor in het veld.
- Onder het veld staat de titel zoals hij bewaard wordt, met daaronder de knoppen. Een tik op een knop
  opent een kleine keuze (dezelfde knoppen als in het formulier). Wat je zo kiest, wint van wat er
  in de zin staat.
- Lege zin: alleen het veld en **Alles invullen**. Geen voorbeeldtekst die gaat knipperen of
  rouleren; wel één vaste voorbeeldzin als placeholder.
- **Alles invullen** opent het formulier uit deel A, met alles wat al herkend is ingevuld.
- Na **Toevoegen** gaat het zoals nu: het venster sluit, er komt een melding met "Ongedaan maken".
- Inspreken via de microfoon van het toetsenbord werkt vanzelf, omdat het een gewoon tekstveld is.
  Dat is geen eigen spraakfunctie (roadmap 3.7).

**Waar je vandaan komt, telt mee:**
- vanuit **Boodschappen** is de soort standaard boodschap;
- vanuit een dag in de **Agenda** is de datum standaard die dag;
- vanuit **Vandaag** is er geen standaard en bepaalt de zin het.

### 4.2 Wat herkend wordt (v1)

Alles wat niet herkend wordt, blijft in de titel staan. De titel krijgt een hoofdletter.

| Onderdeel | Voorbeelden | Wordt |
| --- | --- | --- |
| Dag | `vandaag`, `morgen`, `overmorgen` | die dag |
| | `donderdag`, `do`, `aanstaande donderdag` | eerstvolgende donderdag (vandaag telt niet mee) |
| | `volgende week dinsdag` | dinsdag in de volgende ISO-week |
| | `18 oktober`, `18 okt`, `18-10`, `18/10` | die datum; ligt hij in het verleden, dan volgend jaar |
| Tijd | `16:00`, `16.00`, `16u`, `om 16` | 16:00 |
| | `om 4` | 16:00 (zie besluit V2) |
| | `van 9 tot 10`, `9-10`, `9:30-11` | begin en eind |
| Persoon | `daan`, `voor Daan`, `Lotte en Daan` | leden, alleen bij een exacte naam van een lid (hoofdletters maken niet uit) |
| | `iedereen`, `allemaal`, `met z'n allen` | geen personen = het hele huishouden |
| Herhaling | `elke dag/week/maand/jaar`, `wekelijks`, `dagelijks` | die frequentie |
| | `elke donderdag`, `iedere donderdag` | wekelijks, vanaf de eerstvolgende donderdag |
| | `tot 20 december` (na een herhaling) | laatste keer |
| Plek | `in het Sportfondsenbad`, `bij Sportpark Noord` (aan het eind van de zin) | plek |
| Privé | `privé`, `prive` | privé (alleen als jij de afspraak maakt; zie §4.4) |
| Boodschappen | `melk, brood en kaas` | drie boodschappen, via de bestaande `splitsBoodschappen()` |

**De soort bepalen** (in deze volgorde; de eerste regel die past, wint):
1. Een keuze op de soortknop.
2. Het woord `boodschap`, `boodschappen` of `kopen` aan het begin, of `op de lijst` → boodschap.
3. Een tijd, plek of herhaling → afspraak.
4. Vanuit Boodschappen geopend → boodschap.
5. De hele zin is een boodschap die het huishouden eerder kocht (van de bestaande boodschappenlijst,
   ook afgevinkt) → boodschap.
6. Anders → taak.

**Voorzichtig met dubbelzinnige woorden:**
- Een maandnaam telt alleen naast een getal (`18 mei`). Zo blijft een lid dat "Mei" heet herkenbaar.
- Personen alleen op hele woorden: "Daantje" is geen Daan.
- `bij` en `in` worden alleen een plek aan het eind van de zin, en nooit als er daarna nog herkende
  woorden komen. Komt het verkeerd uit, dan staat het zichtbaar als plek-knop en is het met één tik
  terug in de titel te zetten.
- Een taak heeft hooguit één persoon (`voor` in het model). Noemt de zin meer leden bij een taak, dan
  worden de namen niet gekoppeld en blijven ze in de titel ("Lotte en Daan kamer opruimen").

### 4.3 Wat bewust niet in v1 zit

- **Leren van correcties** ("Lyn is Lynn", "pindakaas is een boodschap"). Dat is principe 4, maar het
  hoort bij een aparte stap met een eigen toets (in de Huisplan-roadmap 3.6).
- **Meerdere items met een verband in één zin** ("zwemles donderdag, tas inpakken woensdag").
  `docs/identiteit-en-items.md` 4.5 vraagt dat de herkenning een *lijst* acties oplevert. Het
  ontwerp in §6 volgt dat al, zodat dit later kan zonder ombouw. In v1 levert alleen een
  boodschappenzin meer dan één item op.
- **Iets bestaands wijzigen met een zin** ("zwemles gaat niet door"). Bewerken blijft het formulier.
- **AI, spraak en foto's.**
- **Herhalende taken.** Die bestaan nog niet in het model (zie besluit V3).

### 4.4 Privé: de enige plek waar een fout duur is

Een gedeelde afspraak die privé had moeten zijn, laat titel en plek zien aan de rest van het
huishouden. Daarom:
- bij elke afspraak staat de knop **Gedeeld** of **Privé** altijd in beeld, niet alleen als het woord
  herkend is;
- `privé` en `prive` worden allebei herkend;
- staat het woord in de zin, dan verdwijnt het uit de titel;
- de database blijft de afdwinging doen (gate 9). Dit voorstel verandert alleen de invoer.

## 5. Besluiten

Vastgesteld op 14 oktober 2026: bij alle zes is het advies hieronder het besluit.

| # | Vraag | Besluit |
| --- | --- | --- |
| V1 | Een taak zonder dag in de zin: vandaag, of zonder datum ("Ooit")? | **Zonder datum**, met de knop **Geen datum** goed zichtbaar en **Vandaag** met één tik ernaast. Zo komt Vandaag niet vol te staan met dingen die er niet om vroegen (principe 2). Huisplan kiest nu wel vandaag; dit is dus een bewuste wijziging. |
| V2 | `om 4`: 04:00 of 16:00? | **1 t/m 6 uur wordt middag (13:00–18:00); 7 t/m 12 blijft zoals getypt.** De knop toont de tijd, dus een vergissing is meteen zichtbaar. Huisplan leest `om 4` nu als 04:00. |
| V3 | "stofzuigen elke vrijdag": taken herhalen nog niet. Wat dan? | **In v1 een herhalende afspraak voor de hele dag**, met één korte, eerlijke regel: "Herhalende taken kunnen nog niet; dit wordt een afspraak." Of herhalende taken er komen, is een apart besluit over het takenmodel. |
| V4 | Opent de `+` straks de zin of het formulier? | **De zin**, met **Alles invullen** eronder. Herzien als de proef (§7) laat zien dat mensen vaak toch het formulier openen. |
| V5 | Volgorde: deel A eerst, los van F7? | **Ja.** Deel A is klein, maakt het venster nu al rustiger, en deel B bouwt erop voort. |
| V6 | F7 naar voren halen in het prototype (zie de melding in §2)? | **Ja**, in de demo- en lokale modus, zoals bij KG-2. |

## 6. Technische schets

- **Een nieuwe pure module**, met dezelfde aanpak als `datum`, `herhaling` en `boodschappen`:

  ```ts
  begrijp(tekst: string, ctx: {
    vandaag: Datum; leden: Lid[]; ik: LidId;
    bekendeBoodschappen: string[];        // namen op de lijst, ook afgevinkt
    standaard?: { soort?: Soort; datum?: Datum };
  }): Voorstel[]
  ```

  `Voorstel` bevat de soort, titel, datum (of `null`), begin, eind, personen, plek, herhaling en
  privé. Daarnaast welke stukken tekst iets betekenden, zodat een knop terug kan naar de titel. De
  functie geeft een **lijst** terug (zie 4.3).
- **Waar:** `src/lib/zin.ts`, of `src/domein/zin.ts` als de herindeling uit het bouwplan (stap 4) al
  gedaan is.
- **Geen `new Date()` in de module:** alles rekent vanaf `ctx.vandaag` (een ISO-datum), zodat de
  uitkomst niet afhangt van tijdzone of tijdstip. Dat is hetzelfde patroon als `datum.ts`.
- **Opslaan** gaat via wat er al is: `app.toevoegen([...])` en `app.voegBoodschappenToe(...)`. Zo
  werkt het in de demo- en de lokale modus zonder wijziging aan de sync-module of de database.
- **Componenten:** `SnelInvoer.tsx` (veld en knoppen). `ItemVenster` krijgt een optioneel
  `voorstel` om het formulier vooraf in te vullen.
- **Tests:**
  - Vitest: een tabel met ten minste 60 zinnen en de verwachte uitkomst. Daarin ook de lastige
    gevallen: een lid dat Mei heet, `om 4`, 29 februari, de jaargrens, de zondag-maandaggrens van de
    ISO-week, twee namen bij een taak, `bij oma` midden in een zin, en een lege of alleen-spaties-zin.
  - Tegenproeven: elke regel uit 4.2 uitschakelen moet ten minste één test laten falen.
  - Playwright op 360 en 390 px: typen, knop aanpassen, toevoegen, ongedaan maken; privé-knop altijd
    in beeld bij een afspraak; geen netwerkverkeer tijdens het typen.

## 7. Hoe we weten of het werkt

Er zijn nog geen gebruikscijfers (meten met tellers volgt pas later). Daarom:

1. **Demo-proef:** 30 zinnen uit het echte gezinsleven opschrijven, op fictieve namen. Bij hoeveel klopt
   alles meteen, en hoeveel tikken kost corrigeren?
   - **Doel: ten minste 80% meteen goed, en nooit meer dan twee tikken correctie.**
2. **Eigen huishouden** (lokaal, met de telefoonopzet van 13 oktober): een week lang alles via de `+`
   toevoegen en een kort dagboek bijhouden. Wanneer greep je naar Alles invullen, en waarom?
3. Pas daarna: besluit V4 herzien, en bepalen of leren van correcties de volgende stap is.

## 8. Voorgestelde volgorde (elk een kleine PR)

1. **Deel A:** rustiger venster (Meer opties, tijdknoppen). Screenshots bijwerken.
2. **Herkenning:** `begrijp()` met de testtabel en tegenproeven, nog zonder scherm.
3. **Snelinvoer-scherm** in de demo, met de knoppen en Alles invullen.
4. **Lokale modus en telefoonproef** (§7, stap 2).
