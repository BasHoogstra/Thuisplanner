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

