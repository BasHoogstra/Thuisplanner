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
