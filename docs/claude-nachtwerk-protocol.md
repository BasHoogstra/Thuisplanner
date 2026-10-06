# Claude nachtwerkprotocol

## Leesvolgorde
1. PRODUCT_PRINCIPLES.md
2. docs/productkompas-beslissingen.md
3. docs/roadmap.md
4. docs/huisplan-ux-contract.md
5. relevante technische contracten
6. docs/nachtwerkplan.md

Lager document wijzigt hoger contract nooit stil.

## Uitvoering
Per vrijgegeven pakket: **analyseren → implementeren → testen → herstellen → opnieuw testen → documenteren → committen → PR voorbereiden**.

Tests zijn primaire kwaliteitsgate. Codex is geen standaard blokkerende gate; selectieve onafhankelijke review is vooral nuttig bij identity/migratie, auth/RLS, sync/conflicts, payments en productietransities.

## Autonomie
Maak normale technische keuzes zelf als Productkompas/datacontract/security niet verandert, productie niet wordt geraakt en geen eigenaarbeslissing nodig is.

Risico: 🟢 volledig zelfstandig; 🟠 bouwen/testen maar niet activeren/migreren/productie wijzigen; 🔴 stop vóór handeling en vraag expliciet akkoord.

## Blokkade
Noteer **BLOCKED — NW-xx** met reden, benodigd besluit/bewijs, reeds geprobeerd en veilige vervolgmogelijkheid. Ga daarna naar het eerstvolgende onafhankelijke vrijgegeven groene pakket. Stop alleen als geen veilig onafhankelijk werk resteert of een expliciete stopconditie is geraakt.

## Zonder expliciet akkoord verboden
Geen productiegegevens migreren/verwijderen; Firebase-productieregels publiceren of productieslot activeren; Supabase-productieschema/RLS wijzigen; productie-auth of betalingen activeren; echte gebruikers/toegang verwijderen; credentials/geheimen wijzigen; rode gate passeren.

## Git en klaar-definitie
Werk per logisch pakket op passende branch, met controleerbare commits, tests, docs/changelog waar passend en PR. Merge niet zelfstandig naar main zonder opdracht. Klaar = acceptatiecriteria gehaald + nieuwe en relevante regressietests groen + edge-cases gecontroleerd + docs kloppen + geen gate omzeild.

## Ochtendrapport
- Afgerond: NW-xx
- Tests: x/x groen
- Commits
- PR
- Geparkeerd + reden
- Beslissing nodig: exact welke
- Productie gewijzigd: normaal nee
- Onafhankelijke review aanbevolen: ja/nee + waarom
- Aanbevolen volgende pakket

## Herbruikbare startprompt
> Lees PRODUCT_PRINCIPLES.md, docs/productkompas-beslissingen.md, docs/roadmap.md, docs/huisplan-ux-contract.md, docs/claude-nachtwerk-protocol.md, docs/nachtwerkplan.md en de relevante technische contracten. Voer het eerstvolgende vrijgegeven werkpakket uit. Werk autonoom volgens het protocol. Als een niet-kritisch pakket blokkeert, documenteer het en ga naar het volgende onafhankelijke groene pakket. Stop vóór iedere rode gate en iedere niet-goedgekeurde productie-, security-, data-, auth-, payment- of credentialwijziging. Productie mag nooit stil worden gewijzigd. Codex-review is geen standaard gate. Sluit af met het Nachtwerkrapport.
