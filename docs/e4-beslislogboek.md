# E4: causaal beslislogboek (NW-07)

**Status:** pure bouwstenen gebouwd in de testversie (`test/index.html`, blok `BESLISLOGBOEK`). Ze
zijn nog niet aangesloten op de app. Uitwerking van `docs/identiteit-en-items.md` (2.4, besluiten 2 en
9.2) en `docs/ontwerp-1.4.2.md` (5). Geen contract; bij tegenstrijdigheid gaan die documenten voor.

- **Niet gedaan** (bewust, ontwerp 5.3): het logboek wordt nergens naar echte data geschreven, en er is
  geen migratie. De live-versie (`index.html`), de Firebase-regels en Supabase zijn ongewijzigd.
- **Wel in de app (testversie):** het bijwerken en terugdraaien van het ledenregister laat onbekende
  sleutels in `meta.members` staan. Tot nu toe wist de app die (zie 4).
- **Tests:** `tests/beslislogboek.test.js` (T9–T11 en race-, conflict- en samenvoegtests). Tegen de
  oude code falen alle 15 tests.

## 1. Vorm van een beslissing

`meta.members.decisions[opId] = {type, label | pair, state, basedOn, byMember, at}`

| Veld | Betekenis |
| --- | --- |
| `type` | `membership` (één label) of `identityPair` (twee labels). Het type staat altijd expliciet in de beslissing (ontwerp 5.1). |
| `label` | bij `membership`: het genormaliseerde label (`memberKey`), zoals in het contract. |
| `pair` | bij `identityPair`: twee verschillende genormaliseerde labels, gesorteerd. (A, B) en (B, A) zijn hetzelfde onderwerp. |
| `state` | `member`/`notMember` of `same`/`different`. |
| `basedOn` | altijd een lijst: alle koppen van hetzelfde onderwerp die deze beslissing vervangt. Firebase bewaart een lege lijst niet; "ontbreekt" betekent `[]`. |
| `byMember` | wie besliste (informatief). |
| `at` | alleen voor weergave. Telt niet mee voor de uitkomst, en ook niet voor de identiteit van een beslissing. |

- **`opId`:** uniek per handeling en veilig als Firebase-sleutel (`[A-Za-z0-9_-]`, maximaal 128 tekens).
- **Identiteit (`decisionCanon`):** type, onderwerp, uitkomst, `basedOn` (als gesorteerde verzameling)
  en `byMember`. `at` hoort er niet bij. Dan zijn twee migratoren die dezelfde beslissing op een ander
  moment omzetten geen botsing, en beslist een klok nergens.

## 2. Functies (allemaal puur)

| Functie | Wat |
| --- | --- |
| `resolveDecisions(log, {collisions})` | Uitkomst per onderwerp. Een onderwerp is `decided` bij één kop, of bij meerdere koppen met dezelfde uitkomst. Bij koppen met verschillende uitkomst is het `conflict` (uitkomst `null`). Het is `error` (uitkomst `null`) bij een ongeldige beslissing, een botsing, een `basedOn` naar een ander onderwerp of type, of een kringloop. Een opvolger die eerder binnenkomt dan zijn voorganger telt gewoon. |
| `newDecision(log, type, labels, state, {opId, byMember, at})` | Een nieuwe beslissing met **alle** huidige koppen in `basedOn`, ook bij een conflict. Bestaat het `opId` al met dezelfde inhoud, dan is het een herhaald verzoek en komt de bestaande beslissing terug. Met een andere inhoud volgt een harde fout. |
| `decisionCollisions(a, b)` / `mergeDecisionLogs(a, b)` | Controle vóór het samenvoegen, en samenvoegen door alleen toe te voegen. Bij een botsing wordt niets opgelost en ontstaat er geen mengvorm; het betrokken onderwerp krijgt `null`. |
| `decisionLogErrors(log, collisions)` | Alle fouten in een logboek, ook van beslissingen zonder herkenbaar onderwerp. Een migratie die hier iets vindt, stopt. |
| `pairEffect(res, a, b)` | De effectregels uit contract 2.4: `same` met een eenduidig, gelijk lidmaatschap → dezelfde persoon. `same` met verschillend of onbekend lidmaatschap → `null` en één vraag. `different` → nooit samenvoegen. Een conflict tussen paarbeslissingen → `null` en één vraag. Een paarbeslissing verandert nooit een lidmaatschap, en andersom. |
| `resolveMember(ref, members, res)` | Van een member-ID (ook een legacy-ID) of een label naar een bestaand lid. Maakt nooit een lid aan. Geeft `null` bij `notMember`, een conflict, een fout, geen of meerdere treffers, of een alias waarvoor het paar `different` is. |
| `convertMemberAnswers141(mm, opIdFor)` | Zet de 1.4.1-antwoorden om naar één beslissing per label of paar, met `basedOn: []`. "Nee wint" en "twee personen wint" worden daarbij één keer toegepast. De omzetting is deterministisch, onafhankelijk van de sleutelvolgorde, en geeft dezelfde uitkomst als de 1.4.1-regels (getest op 300 willekeurige fixtures). |
| `withDecisionLog(mm, log)` | `meta.members` met het logboek erbij; alle bestaande sleutels, ook onbekende, blijven staan. Opnieuw omzetten verandert niets. |

## 3. Open punten: beslissing van de producteigenaar nodig

- **P1-6 (UUIDv5, besluit 9.9):** het definitieve deterministische `opId` van omgezette beslissingen
  hoort hetzelfde patroon te volgen als de member-UUID. Dat patroon is niet goedgekeurd. Daarom krijgt
  `convertMemberAnswers141` de functie `opIdFor` van buiten mee, en zonder die functie gooit hij. De
  tests gebruiken een duidelijk gemarkeerde testafleiding. Pas na goedkeuring van P1-6 (NW-08) kan de
  echte functie worden aangesloten.
- **P1-5:** de effectregels voor `same` bij tegenstrijdig lidmaatschap zijn gebouwd zoals contract 2.4
  ze beschrijft. P1-5 vraagt of die regels kloppen. Wijzigt het antwoord iets, dan zit dat alleen in
  `pairEffect` (en het `different`-deel van `resolveMember`).
- **Veldnamen voor paarbeslissingen** (`type: 'identityPair'`, `pair`) zijn volgens het contract een
  ontwerpkeuze. Ze zijn nog niet als contract vastgelegd.
- **Samenvoegen in de sync:** `mergeData`/`merge3` controleert nog niet op botsende `opId`'s. Dat is
  nu niet nodig, omdat 1.4.2 geen logboek naar echte data schrijft. Het moet worden aangesloten
  (met `decisionCollisions` vóór `merge3`) zodra een versie het logboek gaat schrijven (1.5).

## 4. Gevonden en hersteld: onbekende `meta.members`-sleutels werden gewist

`applyMemberPlan` bouwde `meta.members` bij elke registerupdate opnieuw op uit vijf bekende velden.
Elke andere sleutel, zoals een later `decisions`-logboek, ging daarbij verloren. `withoutMemberRegister`
(terugdraaien) wiste `meta.members` zelfs helemaal. Ontwerp 5.3 vraagt dat 1.4.2 onbekende sleutels
laat staan. Dat doet de testversie nu: alleen de 1.4.1-sleutels (`MEMBERS_META_KEYS`) worden bijgewerkt
of bij terugdraaien verwijderd. De live-versie heeft dit gedrag nog en moet het bij de livegang
overnemen.

## 5. Wat later naar productie moet

Pas met de livegang van 1.4.2 (aparte PR, na akkoord):

1. het behouden van onbekende `meta.members`-sleutels (4);
2. het blok `BESLISLOGBOEK` (zonder dat het al schrijft).

Het aansluiten van de omzetting en het schrijven van het logboek horen bij 1.5, onder het verhuisslot.
