# Productkompas: beslissingen over de roadmap en bestaande functies

Dit document legt vast hoe de bestaande roadmap en de bestaande functies zich verhouden tot het
Huisplan Productkompas v1.0 (`PRODUCT_PRINCIPLES.md`). Het Productkompas zelf blijft leidend en
wordt hier niet gewijzigd of aangevuld.

- Vastgesteld: 5 oktober 2026, door de producteigenaar, na een conflictanalyse van roadmap en documentatie.
- De roadmap zelf staat (nog) niet in deze repository. De beslissingen hieronder gelden voor
  iedere toekomstige versie ervan.

## Harde randvoorwaarden (gates)

Deze punten moeten aantoonbaar zijn opgelost of geborgd vóór het genoemde moment.

| Gate | Geldt vóór | Bron |
| --- | --- | --- |
| Activiteit of auteurschap maakt iemand niet automatisch huishoudlid. Fase 1.5 mag het bekende probleem met externe gebruikers niet verder verspreiden. | Persoonsmigratie (1.5) en centraal ledenbeheer | Beslissing 6 |
| Het ledenregister op de echte planner is gecontroleerd. | Start van fase 1.5 | Beslissing 8 |
| Privacy wordt niet uitsluitend door de UI afgedwongen (security/privacy-gate). | Supabase bedient daadwerkelijk huishouddata | Beslissing 9 |
| De navigatie is getoetst aan werkelijk gebruik. | Fase 3.1 | Beslissing 2 |

## Beslissingen

### 1. Altijd bevestiging vragen: aanpassen

- **Huidige roadmap:** fase 3 en stap 3.3 gaan uit van "altijd om bevestiging vragen" en "nooit iets
  stil ergens neerzetten".
- **Productkompas:** principes 5 en 6.
- **Beslissing:** de toekomstige roadmap gaat uit van het volgende.
  - Bij twijfel vragen.
  - Na voldoende zekerheid en toestemming mag Huisplan zelfstandig handelen.
  - Hoe groter het gevolg van een fout, hoe meer bevestiging nodig is.
  - Automatisering moet zichtbaar, voorspelbaar en eenvoudig terug te draaien zijn.

### 2. Navigatie: later herbeoordelen

- **Huidige roadmap:** stap 3.1 gaat uit van Vandaag | Boodschappen | + | Ons huis.
- **Huidige app:** Vandaag, Bakje, Boodschappen, Meer.
- **Productkompas:** principe 8.
- **Beslissing:** de navigatie in het Productkompas is een hypothese, geen definitief ontwerp.
  Vóór fase 3.1 toetsen we de navigatie aan werkelijk gebruik.

### 3. Proefperiode die daarna alleen-lezen wordt: aanpassen

- **Huidige roadmap:** stap 4.5 gaat uit van een proefperiode, waarna de app alleen-lezen wordt.
- **Productkompas:** principe 10.
- **Beslissing:** deze productrichting vervalt.
  - De gratis versie moet bruikbaar blijven voor organiseren.
  - Premium verkoopt extra gemak, automatisering, AI en koppelingen.
  - Bestaande huishouddata worden niet gegijzeld.

### 4. Pushmeldingen: later herbeoordelen

- **Huidige roadmap:** stap 4.1 voegt pushmeldingen toe.
- **Productkompas:** principe 6.
- **Beslissing:** push blijft mogelijk. Bij het ontwerp wordt het getoetst aan principe 6: alleen
  aandacht vragen wanneer de melding daadwerkelijk waarde heeft.

### 5. AI en foto's: herprioriteren bij de eerstvolgende roadmapreview

- **Huidige roadmap:** stap 3.8 (AI en foto's) staat als laatste.
- **Productkompas:** principe 1, met de schoolbrief-foto als voorbeeld.
- **Beslissing:** het omzetten van een foto of document in relevante huishoudinformatie is een
  belangrijk voorbeeld van de kernbelofte van Huisplan. Het houdt niet automatisch de laagste
  prioriteit omdat het historisch achteraan stond. Herprioriteren gebeurt bij de eerstvolgende
  roadmapreview. Nu niet implementeren.

### 6. Externe gebruiker, gast of oppas: niet meer oplossen in 1.4.1

- **Huidige situatie (1.4.1):** wie iets toevoegt (als auteur of toevoeger) geldt als betrouwbaar
  lid. Een externe gebruiker kan zo huishoudlid worden. Dit staat als open punt in
  `docs/fase1-notities.md`.
- **Productkompas:** principe 7 ("Een persoon, naam of label dat ergens in Huisplan voorkomt, is
  niet automatisch een huishoudlid.").
- **Beslissing:** PR #8 blijft hiervoor ongewijzigd en het bekende probleem blijft expliciet
  gedocumenteerd. Dit is een harde randvoorwaarde voor persoonsmigratie en centraal ledenbeheer:
  activiteit of auteurschap maakt iemand niet automatisch huishoudlid. Fase 1.5 mag dit probleem
  niet verder verspreiden.

### 7. Losse dialogen en rode bevestigingsknop: niet aanpassen in 1.4.1

- **Huidige situatie (1.4.1):** de ledenvragen komen één voor één in aparte dialogen, met een rode
  bevestigingsknop.
- **Productkompas:** principes 2 en 6.
- **Beslissing:** geaccepteerd als tijdelijke, eenmalige migratie-UX. Er komt geen extra UI-scope
  bij PR #8.

### 8. Een foutief "nee" herstellen: tijdelijk accepteren

- **Huidige situatie (1.4.1):** een gegeven "nee" kan pas met het centrale ledenbeheer worden
  hersteld.
- **Productkompas:** de regel "Fouten moeten goedkoop zijn".
- **Beslissing:**
  - Tijdelijk geaccepteerd.
  - Het register wordt gecontroleerd vóór 1.5.
  - Structureel herstel hoort in het centrale ledenbeheer.
  - Wordt dat sterk uitgesteld, dan beoordelen we dit opnieuw.

### 9. Supabase en privacy: verplicht vóór productiegebruik

- **Huidige situatie:** de Row Level Security geeft elk huishoudlid zicht op alle items. Claims op
  verlanglijstjes worden alleen client-side verborgen.
- **Productkompas:** de regel "Privacy volgt de situatie".
- **Beslissing:** privacy mag niet uitsluitend door de UI worden afgedwongen. Dit is een expliciete
  security/privacy-gate vóórdat Supabase daadwerkelijk huishouddata gaat bedienen. De oplossing
  wordt nu nog niet ontworpen of geïmplementeerd.

### 10. Bestaande functies: later herbeoordelen

- **Huidige app:**
  - Gezins-DNA met verdeling per persoon, weekscore en Koppelgesprek;
  - toasts over wijzigingen door anderen;
  - de vanzelf openende briefing;
  - seizoenstips.
- **Productkompas:** principes 2, 6 en 9.
- **Beslissing:** er wordt niets verwijderd op basis van alleen het Productkompas. Werkelijk gebruik
  bepaalt mede wat blijft, verandert of minder prominent wordt.
