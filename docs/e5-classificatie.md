# E5: lokale, geanonimiseerde classificatie (NW-09)

**Status:** gereedschap gebouwd en getest op fictieve fixtures: `tools/classificeer.js`. Het is nog
niet op echte data gedraaid; dat doet de producteigenaar zelf, lokaal (besluit 9.7). Uitwerking van
`docs/identiteit-en-items.md` (3.4) en `docs/ontwerp-1.4.2.md` (6). Geen contract.

- **Niet aangeraakt:** de app (`index.html`, `test/index.html`), de Firebase-regels, Supabase en echte
  huishouddata. Het script maakt geen netwerkverbinding; het leest bestanden en schrijft alleen het
  rapport.
- **Tests:** `tests/classificeer.test.js`.

## 1. Gebruik (op een eigen toestel van de producteigenaar)

```
node tools/classificeer.js --raw server.json --export backup.json --cache toestel1-cache.json --out rapport
```

- Het type van elk bestand geef je **altijd zelf** op. Er wordt niet geraden: een export die als
  `--raw` wordt aangeboden, of een cache met een onleesbare basis, geeft een fout (exitcode 2).
  - `--raw`: het planner-object zoals Firebase het teruggeeft (niet genormaliseerd);
  - `--export`: een export via Instellingen;
  - `--cache`: de inhoud van `plannerCache_…` van één toestel. Dat zijn twee bronnen: `data` en de
    basis (`base`).
- `--app` kiest de app-versie waarvan `normalizeData` wordt gebruikt; standaard is dat de live-versie.
  Zo is het verschil tussen ruw en genormaliseerd precies dat van de app.
- Exitcode 0 = geen blokkades, 1 = blokkades, 2 = invoerfout.
- Alleen het rapport (`rapport.md` / `rapport.json`) wordt gedeeld, nooit de invoerbestanden.

## 2. Wat het rapport bevat, en wat nooit

**Per plek** (een padpatroon zonder gegevens, bv. `tasks.<datum>[]` of `vakanties[].paklijst.<label>[]`)
en per bron:
- de vorm en het aantal elementen;
- hoeveel elementen een `id` hebben, of de `id`'s uniek zijn, en of de lijst gemengd is;
- het samenvoeggedrag, zoals `mergeArrays` in de app: per element (id), als verzameling, of
  "lokaal wint" (hele lijst);
- het aantal persoonsverwijzingen per veld, ook waar sleutels namen zijn;
- labels (paklijstkolommen, `vakantiePersonen`) en namen die geen lid zijn (`verjaardagen.naam`);
- de categorie uit de eerste indeling (contract 3.4);
- het verschil tussen ruw en genormaliseerd, inclusief elementen die bij normaliseren verloren gaan.

**Nooit:** waarden, vrije teksten, namen, datums, sleutels die namen of datums zijn, en
bestandsnamen. Een bron heet `raw:<hash>`. Onbekende veldnamen staan er standaard als hash in.
`--toon-onbekende-namen` toont ze, maar dat is alleen voor lokaal gebruik; het rapport meldt dan dat
het niet gedeeld mag worden. Een test controleert op alle fixtures dat geen enkele tekst, naam of
datum in het rapport terechtkomt, en een tegenproef laat zien dat die controle een lek ook echt vindt.

**Herhaalbaar:** dezelfde invoer, ook met een andere sleutelvolgorde, geeft exact hetzelfde rapport.
De invoer wordt niet gewijzigd.

## 3. Blokkades (contract 3.4: "een onbekend veld blokkeert 1.5")

Onbekend of dubbelzinnig wordt nooit stil ingedeeld. Een blokkade ontstaat bij:
- een onbekend veld, op het hoogste niveau of in elementen;
- een gemengde lijst (sommige elementen met, sommige zonder `id`), of dubbele `id`'s;
- een andere vorm dan het dataformaat verwacht, of een sleutel die geen datum is waar een datum hoort;
- persoonsverwijzingen in een lijst die "lokaal wint" samenvoegt. Dat blijft een blokkade tot is
  beschreven waarom de omzetting veilig is (contract 3.4);
- een lijst die als object terugkomt (een lijst met gaten), en elementen die bij `normalizeData`
  verloren gaan. Daarmee is P1-11 in echte data aantoonbaar of uit te sluiten; opgelost wordt het hier
  niet.

## 4. Open punten: beslissing van de producteigenaar nodig

- **Actie per categorie** (contract 3.4, punt 4: `id` toevoegen, ongemoeid laten of apart behandelen).
  De documentatie legt alleen voor het archief "ongemoeid laten" vast. Voor de andere categorieën
  meldt het rapport "te beslissen"; de tool kiest niets zelf.
- **`meta` en `members`** zijn bekende velden (dataformaat-v1), maar staan niet in de eerste indeling.
  Het rapport meldt ze als "indeling open", niet als blokkade en niet met een geraden categorie.
- **P1-7:** hoe de producteigenaar de ruwe data, caches en bases van alle toestellen verzamelt, zonder
  dat er data naar buiten gaat. De tool verwacht losse JSON-bestanden. Hoe je die per toestel
  veilig uit de browser haalt, is nog niet beschreven. Een herstelkopie (E1) wordt een betere bron
  zodra die er is.
- **Persoonsverwijzingen tellen niet hetzelfde als `collectMemberNames`.** De tool telt elke
  niet-lege waarde in een persoonsveld, ook plaatsvervangers als `me`/`partner`. De ledenmigratie
  slaat die over. Het rapport is een inventarisatie, geen ledenlijst.

## 5. Bekende beperkingen

- Het samenvoeggedrag wordt afgeleid uit één momentopname per bron. In de app kijkt `mergeArrays`
  naar basis, lokaal en remote samen; een lijst kan in de praktijk dus anders samenvoegen als een
  andere bron andere elementen heeft. Daarom wordt elke bron apart gerapporteerd.
- Velden in elementen worden alleen tegen de bekende veldnamen gecontroleerd waar het dataformaat ze
  noemt. Bij lijsten zonder vaste elementvorm (bv. `vakanties[].todos`, `briefjes`, `winkels`) worden
  alleen vorm, `id`'s en samenvoeggedrag gerapporteerd.
- Het cacheformaat van E3 (PR #16, `huisplanCache_…`) heeft ook `data` en `base` en wordt als
  `--cache` gelezen; de extra velden (`format`, `gen`, `id`, `app`) worden genegeerd. Een herstelkopie
  (E1) bestaat nog niet en wordt niet herkend; een bestand in een andere vorm geeft een fout, geen
  gok.
