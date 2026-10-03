# Bevindingen tijdens fase 0 die gevolgen hebben voor fase 1

Hier staan dingen die tijdens fase 0 zijn ontdekt en die het ontwerp van fase 1 (accounts,
leden, Supabase) raken. Fase 1 zelf is nog niet aangepast.

## 1. Eerste keer laden op een nieuw toestel schrijft het hele document terug
Zonder lokale kopie ziet `hasLocalChanges()` het lege standaardobject als "lokale wijziging",
waardoor `loadFromServer` samenvoegt met een lege basis en daarna opslaat. De inhoud blijft
gelijk (getest), maar het is een volledige schrijfactie van elk nieuw toestel.
**Gevolg voor fase 1:** de Supabase-synchronisatie (1.10) mag bij de eerste keer laden niet
alle rijen terugschrijven; anders krijgt elk nieuw toestel `updated_at`/`rev` op alle rijen
en lijkt alles gewijzigd. De import (1.12) moet ook bestand zijn tegen zo'n schrijfactie
tijdens het verhuizen.

## 2. Schermstatus wordt in de gedeelde data bewaard
Vakanties bewaart het actieve tabblad als `vakanties[].\_tab` in de data, dus het gaat mee
naar de database en naar het andere toestel.
**Gevolg voor fase 1:** in de mapping naar `items` dit veld niet als echte data behandelen
(negeren of naar lokale opslag verplaatsen), anders veroorzaakt wisselen van tabblad
synchronisatieverkeer en conflicten.

## 3. Niet elke lijst heeft id's; sommige data is per datum of per persoon gegroepeerd
Bij het vastleggen van het dataformaat (0.13) bleek: `boodschappenHistory` heeft geen `id`,
`recurringDone`, `gewoontenDone`, `wieIsWaar`, `maaltijdplan` en `notes` zijn objecten per datum,
`verlanglijstjes` en `vakanties[].paklijst` per persoon, en `verjaardagen.datum` is `MM-DD`
zonder jaar. Vakantie-uitgaven hebben ook geen `id`.
**Gevolg voor fase 1:** de mapping naar `items` (1.x) heeft voor deze vormen een eigen sleutel
nodig (bv. datum + id, of persoon + id), en voor lijsten zonder id moet de import er een maken
zonder dubbele rijen te veroorzaken bij een herhaalde import.

## 4. Personen zijn namen, geen accounts
`assignedTo`, `author`, `addedBy`, `claimedBy`, de sleutels van `verlanglijstjes`, `paklijst` en
`wieIsWaar` zijn **namen** als tekst. Hernoemt iemand zichzelf in Instellingen, dan verwijzen
oude items nog naar de oude naam.
**Gevolg voor fase 1:** de koppeling naam → `household_members` moet bij de import expliciet
gebeuren (en ook kinderen zonder account kunnen bevatten, bv. in `vakantiePersonen`).

## 5. `meta.schemaVersion` staat er pas na een opslag
De testversie zet `meta.schemaVersion = 1` alleen mee bij een gewone opslag, en de live-versie
zet het niet. Een document zonder dit veld is dus gewoon versie 1.
**Gevolg voor fase 1:** de import moet "ontbreekt" behandelen als versie 1.

## 6. Stap 1.1: migraties toepassen loopt via de CLI, niet via de Claude-koppeling
Bij het opbouwen van staging bleek dat de Supabase-koppeling van Claude bij elk statement met
`drop` wacht op een bevestiging die in deze werkomgeving niet verschijnt (na 60 s afgebroken; er is
dan niets uitgevoerd). Migratie 2 bevat `drop policy` en `drop function`, en een volledige
herbouw van staging vraagt ook `drop`.
**Gevolg:** schemawijzigingen met `drop` voeren we uit met de Supabase CLI (`supabase db push`)
vanaf een eigen computer, zoals de roadmap ook voorschrijft. Dat is ook de juiste route voor 1.2.
Bij die route kwamen nog twee dingen boven, allebei opgelost in stap 1.1: extensiefuncties moeten
met `extensions.` (de CLI draait zonder `extensions` in het `search_path`), en SQL-bestanden moeten
LF-regeleinden hebben (`.gitattributes`), anders krijgen functies vanaf Windows CR-tekens. Zie
`supabase/README.md`.

## 7. Bevindingen in het huidige schema (niet aangepast; voor 1.2)
- De rollen `anon` en `authenticated` hebben alle tabelrechten (standaard bij Supabase). RLS laat
  `anon` niets zien omdat er geen regels voor `anon` zijn, maar het intrekken van die rechten is een
  extra slot op de deur.
- De Supabase-adviseur meldt dat `create_household` en `accept_invite` als SECURITY DEFINER
  aanroepbaar zijn voor ingelogde gebruikers. Dat is zo bedoeld (het zijn de RPC's van de app),
  maar de roadmap vraagt in 1.2 "adviseurs zonder waarschuwingen": dan bewust accepteren en
  documenteren, of de functies anders inrichten.
- Het productieproject heet nog "bashoogstrajax@hotmail.com's Project"; hernoemen naar
  bijvoorbeeld "huisplan-productie" (dashboard → Settings) voorkomt verwarring met staging.
- Staging staat op het gratis abonnement en wordt na een week zonder activiteit gepauzeerd.

## 8. Stap 1.2: afspraken die de volgende stappen raken
- **Verwijderen = grafsteen.** De app (1.10) zet `deleted_at` en verwijdert nooit echt; `delete` via
  de API doet niets meer (0 rijen, geen fout). Lezen moet grafstenen dus zelf wegfilteren.
- **`rev` is per item**, begint op 1 en telt op bij elke wijziging. Voor optimistisch opslaan:
  `update ... where rev = <bekende rev>`; 0 rijen betekent dat iemand anders het item al wijzigde.
- **Import (1.12)** koppelt namen uit Firebase aan leden via `display_name` en `legacy_names`, en
  bewaart eerst de ruwe planner in `legacy_imports` (status `received`); de importfunctie (server)
  zet daarna `imported`/`verified`.
- **Bestanden (1.11)** gaan naar `household-files/{household_id}/…`.
- **Uitnodigen (1.9)**: een uitnodiging per lid (`member_id`), standaard als beheerder. Een gewoon
  lid ziet geen uitnodigingen.
- **Lokale databasetest**: `supabase/tests/lokaal/run.sh` werkt met een gewone PostgreSQL 16+ en een
  nagebootste Supabase-omgeving; staging blijft de echte controle.

## 9. Stap 1.3: opslaglaag, en wat de nieuwe tests lieten zien
- **Interface.** De app praat alleen via `store` met de server: `store.load()`, `store.save(data)`,
  `store.subscribe(fn)`. Meldingen: `data` (nieuwe stand, met of zonder opnieuw tekenen), `incoming`
  (wijzigingen van een ander toestel, vóór het samenvoegen), `status` (code; de app kiest de tekst),
  `guard` (bewaking 0.2), `loaded` (na elke geslaagde load; daarna draaien de eenmalige migraties) en
  `connected`. Een Supabase-store (1.10) moet dezelfde meldingen geven; de app hoeft dan niet te
  veranderen. Extra functies die nu Firebase-specifiek zijn: `restore`/`connect` (koppeling via
  database-URL + sleutel), `shareLink`, `checkAccess` (beveiligingscheck), `flush`, `startPolling`.
- **Het `if-match`-pad werd tot nu toe niet getest.** De nagebootste database stuurde wel een ETag,
  maar zonder `Access-Control-Expose-Headers`; de app kon hem niet lezen en gebruikte steeds de
  terugval: vóór elke opslag eerst ophalen en samenvoegen, dan opslaan zonder voorwaarde. De nieuwe
  tests draaien beide varianten. Zonder leesbare ETag zouden twee toestellen die binnen een fractie van
  een seconde opslaan in theorie elkaars wijziging kunnen overschrijven (niet nagespeeld).
- **Handmatig bevestigd (3 okt 2026): de echte Firebase gebruikt het ETag/If-Match-pad.** Gecontroleerd
  door Bas in Chrome DevTools met de testversie (1.3.0) op de echte Firebase-planner:
  - de GET-respons van Firebase bevat `Access-Control-Expose-Headers: ETag`;
  - een echte opslagactie is een `PUT`;
  - die PUT bevat een `If-Match`-header met de ontvangen ETag;
  - de PUT gaf `200 OK`.
  In de praktijk draait de app dus voorwaardelijk opslaan (412 → ophalen, samenvoegen, opnieuw) en niet
  standaard de terugval zonder `If-Match`. De variant `exposeETag: true` in de tests is daarmee de
  variant die overeenkomt met productie; de variant zonder blijft getest als terugval (die de app
  gebruikt als een voorwaardelijke PUT op netwerkniveau mislukt).
- **Bestaand gedrag, bewust niet aangepast:** na een nieuwe installatie (installatiescherm) start de
  polling elke 15 s pas na opnieuw openen van de app; bij opstarten en herstellen start hij meteen.
- **Eerste keer laden schrijft terug** (punt 1) blijft zo; de store doet precies wat de oude code deed.

## 10. Stap 1.4: ledenregister — keuzes en hoe het op de echte planner moet
- **Member-ID = hash van de genormaliseerde naam** (`m_` + 16 hex). Waarom: de hele planner is één
  document dat per `id` wordt samengevoegd. Een vaste afleiding laat twee toestellen die tegelijk
  (of offline) migreren hetzelfde ID maken, zonder overleg; samenvoegen op naam achteraf zou een
  extra opruimstap en een moment met dubbele leden geven. Een hash i.p.v. de naam zelf houdt het ID
  neutraal als iemand later wordt hernoemd (1.6): het ID blijft, de naam verandert.
- **Twijfel**: hoofdletters en spaties gelden als dezelfde persoon (de app deed dat al met
  `sameName`). Twijfel = zelfde letters na weglaten van accenten en leestekens, bv. `Loïs`/`Lois`,
  `Anne-Marie`/`Anne Marie`. De app vraagt dit één keer per paar; zolang de vraag openstaat wordt er
  niets geschreven. Antwoord "dezelfde" bewaart de andere schrijfwijze in `aliases`.
  Antwoorden twee toestellen verschillend, dan wint "twee personen" (`meta.members.different`),
  ongeacht wie het laatst opslaat; een eerder samengevoegde schrijfwijze gaat dan uit `aliases` en
  wordt een eigen lid met het vaste ID van die naam. Liever later in 1.6 samenvoegen dan nu twee
  mensen ten onrechte één maken.
- **kind** = `unknown`: er is geen betrouwbare bron (ook de twee toestelnamen hoeven geen
  volwassenen te zijn). Vóór de import (1.12) moet dit in 1.6 ("Ons huishouden") worden ingesteld,
  want Supabase kent alleen `adult`/`child`.
- **Register wordt aangevuld**, niet alleen eenmalig gevuld: een naam die later opduikt (bv. via een
  toestel met 1.3) wordt bij de volgende load toegevoegd, met hetzelfde vaste ID. Zo is het register
  compleet als 1.5 begint.
- **Schakelaar**: `/test/` en live gebruiken dezelfde echte planner. Daarom maakt de app het register
  alleen aan op een toestel met `localStorage.plannerLedenregister = 'aan'`. Zonder schakelaar wordt
  niets geschreven (getest), ook niet als deze versie al live staat.
- **Vangnet en terugdraaien**: de migratie voegt alleen `members` en `meta.members` toe. Vóór de eerste
  keer bewaart het toestel `plannerLedenBackup` met een controlesom van de hele planner.
  `huisplanLeden.terugdraaien()` (ontwikkelhulpmiddelen) haalt precies die twee velden weg, zet de
  schakelaar en `plannerMemberId` op dit toestel uit en meldt of de planner weer gelijk is aan vóór
  de migratie (getest). Het werkt op de huidige planner: wijzigingen ná de migratie blijven staan
  (dan meldt de controlesom "niet gelijk", wat dan klopt). Het vangnet wordt nooit teruggezet. Oude app-versies negeren de velden, dus code terugzetten is ook veilig.
- **Op de echte planner (nog niet gedaan)**: (1) eerst een volledige back-up via Instellingen →
  Back-up; (2) 1.4 live zetten zonder schakelaar (verandert dan niets); (3) op één toestel in de
  ontwikkelhulpmiddelen `localStorage.setItem('plannerLedenregister','aan')` en de app herladen;
  (4) eventuele twijfelvragen beantwoorden; (5) `huisplanLeden.status()` en het register in de
  back-up/Firebase controleren (Bas, Sanne, Lynn, Loïs … elk één keer); (6) het tweede toestel openen
  en controleren dat het niets dubbel maakt en zich koppelt.

