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
