# Thuisplanner: controle op productiegeschiktheid (17 oktober 2026)

**Uitgangspunt van de producteigenaar (17 oktober 2026):** we bouwen geen tijdelijke testapp die later moet worden
omgebouwd. We bouwen vanaf nu de commerciële Thuisplanner, die voorlopig in een afgeschermde stagingomgeving wordt
getest.

**Status:** 📝 rapport ter beoordeling. Er is niets gewijzigd.

**Gecontroleerd op:**
- branch `thuisplanner-staging` (`da5ef52`);
- de 11 migraties in `thuisplanner/supabase/migrations`;
- de app in `thuisplanner/app/src`;
- de sync-module `thuisplanner/sync/thuisplanner-sync.js`;
- de tests (RLS-matrix 56, unittests 150, lokale e2e 18, staging-e2e 5);
- eerdere rapporten (`docs/thuisplanner-architectuurcontrole.md`, `-k3-archiveren.md`, `-onboarding.md`).

## Conclusie in het kort

De **databaselaag is productiewaardig van opzet**:
- scheiding tussen huishoudens;
- rollen en rechten;
- uitnodigingen;
- "Bezet";
- verwijderen met een bewaartermijn.

Die laag hoeft voor publieke registratie of abonnementen niet te worden herbouwd. Er komt alleen iets bij.

De **app (client) is dat nog niet**. Twee dingen veroorzaken herbouw als we er nu functies bovenop blijven bouwen:
- **F1:** twee datapaden en productiecode die nog "lokaal" heet;
- **F2:** een datacontract waarin het hele huishouden in het geheugen staat.

Daarnaast is er één productbesluit dat, genomen ná de bouw, herbouw van de sync zou betekenen: **F3, offline**.

Advies: **KG-5E nu doen**, vóór nieuwe functies, en daarin het datacontract goed neerzetten.

## 1. Fundamentele problemen (veroorzaken herbouw als ze blijven liggen)

### F1. Twee datapaden, met een demo-vorm als gedeelde staat

**Bewijs:**
- `src/App.tsx` kiest tussen `DemoApp` (reducer in `lib/store.ts`) en `LokaleApp` (`lib/lokaal/staat.ts`).
- Beide leveren dezelfde acties, maar zijn los van elkaar gebouwd. In de online modus doen `ongedaan`,
  `kiesScenario` en `vervangAlles` niets of alleen een melding (`staat.ts`).
- De gedeelde `Staat` bevat demovelden (`scenario`, `vorige`; `lib/store.ts:17-24`).
- 17 plekken lezen `staat.items`.
- De productiecode heet "lokaal": `lib/lokaal/`, `components/Lokaal.tsx`, `LokaleConfig`, `LokaleApp`,
  `useLokaleStaat`. Daarin zitten nu ook staging, inloggen en onboarding.

**Waarom fundamenteel:** elke nieuwe functie moet twee keer worden gebouwd, of werkt online anders dan in de demo. Hoe
meer schermen erbij komen (F3 en verder), hoe duurder het samenvoegen.

**Oplossing:** KG-5E (bouwplan stap 4):
- één `Opslag`-interface met `DemoOpslag` en `SupabaseOpslag`;
- één contracttest die op beide draait;
- de mappen herindelen en hernoemen (`lokaal` wordt `online` of `supabase`);
- `Staat` opschonen;
- een router.

De schermen gebruiken nu al één context (`useApp`), dus de schermen zelf blijven grotendeels staan.

### F2. Het datacontract gaat uit van "alles van het huishouden in het geheugen"

**Bewijs:**
- `haalOp` (`sync/thuisplanner-sync.js:318`) haalt alle boodschappen, taken, afspraken, uitzonderingen en leden van het
  huishouden op.
- Dat gebeurt bij elk seintje, elke 30 seconden (`vangnetMs`, regel 160 en 494) en bij elke nieuwe verbinding.
- `naarItems(toestand)` maakt er één lijst van, en Vandaag en Agenda rekenen op die hele lijst
  (`lib/vandaag.ts`, `lib/kalender.ts`).

**Waarom fundamenteel:** de interne werking van de sync is zonder ombouw te veranderen. Het probleem is het contract dat
de schermen verwachten: alles is er altijd. Bouwt KG-5E het `Opslag`-interface op die aanname, dan moet het later
opnieuw, met de schermen erbij, zodra huishoudens na jaren duizenden afgeronde taken en oude afspraken hebben. Bovendien
stijgen de kosten met het aantal toestellen keer de geschiedenis keer de 30-secondenpeiling.

**Oplossing:** het `Opslag`-interface vraagt **per periode en per soort**:
- afspraken in een datumbereik, plus de herhaalreeksen die erin vallen;
- open taken plus de recent afgeronde;
- de actieve boodschappen.

De eerste implementatie mag intern nog alles ophalen. Later wordt dat gericht ophalen, zonder dat de schermen
veranderen. Daarvoor is een productbesluit nodig: hoe ver terug Agenda en Taken moeten kunnen kijken (B-data hieronder).

### F3. Offline is een open productbesluit dat de sync bepaalt

**Bewijs:** "online eerst" (`docs/thuisplanner-bouwplan.md`, risico's; `docs/thuisplanner-sync.md` §6). Zonder verbinding
wordt er niets opgeslagen. Alleen onzekere toevoegingen worden bewaard.

**Waarom fundamenteel:** moet de commerciële v1 offline kunnen werken (boodschappen afvinken in een supermarkt zonder
bereik ligt voor de hand), dan is een echte offline-wachtrij met conflictafhandeling nodig. Dat is een andere opzet van
de sync-module en van de optimistische schrijfweg. Achteraf toevoegen kost veel meer dan het nu meenemen in het ontwerp
van KG-5E.

**Oplossing:** nu besluiten (B-offline). Kiezen we "online eerst voor v1", dan is dat een geldig, bewust besluit; de
huidige opzet past daarbij. Kiezen we "offline voor boodschappen", dan ontwerpen we die wachtrij in KG-5E mee.

## 2. Klein, maar beter nu (anders loopt het door in elk nieuw scherm)

| # | Wat | Bewijs | Waarom nu |
| --- | --- | --- | --- |
| N1 | Foutmeldingen komen als Nederlandse tekst uit de database en worden letterlijk getoond | 154 × `raise exception '…'` in de migraties; `foutTekst` in `sessie.ts` toont die tekst | Elke tekstwijziging of vertaling wordt een migratie. Beter: de app vertaalt SQLSTATE en context zelf naar tekst. De database blijft gelijk |
| N2 | Geen ErrorBoundary | Niet gevonden in `src` | Een fout in één scherm geeft een wit scherm; dat is onacceptabel voor betalende klanten |
| N3 | Besluit P2: onbevestigde opdrachten blijven na uitloggen op het toestel | `sync/thuisplanner-sync.js` (opslag), `docs/thuisplanner-sync.md` §9 | Op gedeelde toestellen een privacyprobleem; vóór publieke registratie besluiten |
| N4 | Een build zonder Supabase-gegevens start als demo | `appConfig` geeft `null`, en dan volgt `DemoApp` | Voor een productiebuild moet een ontbrekende configuratie een fout zijn, zoals bij staging al. Besluit nodig: blijft de demo in de productieapp (bijvoorbeeld als rondleiding), of wordt het een losse build? |
| N5 | Het omgevingsmodel kent alleen `staging` | `src/lib/omgeving.ts`, `scripts/staging-build.ts` | Een modus `productie` (zonder markering, met een eigen exact project) is een kleine uitbreiding van dezelfde bewaking; nu doen voorkomt een tweede manier |

## 3. Per vraag

**Publieke registratie: zijn onboarding en uitnodiging geschikt zonder herbouw?** Grotendeels ja.
- Welkom → huishouden aanmaken werkt voor elk nieuw account. Daarbij komen:
  - een aanmeldscherm, e-mailverificatie, wachtwoord vergeten of een e-mailcode (KG-5H deel 2, besluit B4: EU-SMTP);
  - bescherming tegen misbruik: een captcha of Cloudflare Turnstile in Supabase Auth, en limieten (K9: er is nu alleen
    een grens van 10 eigen huishoudens per account; geen grens op leden, uitnodigingen of inhoud).
- **Randvoorwaarde voor deel 2:** het uitnodigingstoken overleeft het inloggen omdat het in `sessionStorage` van
  hetzelfde tabblad staat. Bij inloggen met een **code die je in hetzelfde tabblad typt** blijft dat werken. Bij een
  **magic link** (een nieuw tabblad uit de mail) gaat het token verloren. Dan moet de opslag anders, of moet de link
  opnieuw geplakt worden. Advies: e-mailcode in hetzelfde tabblad. Apple en Google (later) zijn een doorverwijzing in
  hetzelfde tabblad. `sessionStorage` blijft dan bewaard, maar `detectSessionInUrl` moet daarvoor gericht aan (PKCE)
  op een eigen terugkeerroute. Dat is uitbreiden, geen herbouw.
- `profiles` bestaat (KG-1), maar wordt niet gebruikt en niet automatisch aangemaakt. Dat is geen probleem; het is de
  plek voor accountgegevens zoals taal en toestemmingen (uitbreiding).

**Accounts, scheiding, rollen en rechten: schaalbaar voor betalende huishoudens?** Ja.
- RLS op elke tabel. Het lidmaatschap wordt één keer per query bepaald (`my_household_ids()` in een subquery).
- Samengestelde foreign keys `(household_id, id)` maken verwijzingen naar een ander huishouden onmogelijk.
- Definer-functies staan in `private` met een leeg `search_path`, en alle rechten zijn getest (RLS-matrix 56 en 66
  tegenproeven; CI tegen een echte Supabase).
- Een account kan in meerdere huishoudens zitten (KG-T12; e2e "twee huishoudens").
- Rollen zijn per huishouden. Eigenaar en beheerder zijn gelijk in het dagelijks gebruik; de eigenaar heeft alleen
  uitzonderlijke handelingen.

Open punten, allemaal uitbreidingen:
- quota (K9);
- een auditlog (K10);
- de enige eigenaar bij het verwijderen van een account (K11);
- versiecontrole aan de serverkant voor taken en boodschappen;
- de policy op `event_details` per rij (prestaties, pas bij veel data).

**Abonnementen en betalen zonder ingrijpende datamodelwijziging?** Ja, als ze erbij komen in plaats van in bestaande
tabellen:
- een tabel `subscriptions`, gekoppeld aan `household_id` ("het huishouden is de klant"), met een eigen `payer_user_id`
  (los van `owner`, zoals besloten), aanbieder, status en periode;
- schrijven alleen via de server (een webhook van de betaaldienst in een Edge Function met de service-rol);
- leden lezen alleen de status;
- functies controleren rechten met `private.has_entitlement(huishouden, functie)`.

**Let op, ontwerpbesluit:**
- facturen en betaalgegevens moeten **niet** cascaderend verdwijnen bij het verwijderen van een huishouden of account.
  Er geldt een fiscale bewaarplicht van 7 jaar, terwijl de AVG zegt: verwijderen. Die gegevens horen in een eigen
  tabel buiten de cascade, met alleen het minimale.
- wat er gebeurt als de betaler vertrekt of zijn account verwijdert, moet bij F10 worden beschreven.

**Is Cloudflare Access alleen een stagingbeveiliging?** Ja.
- Er staat geen enkele verwijzing naar Cloudflare of Access in `app/src` (gecontroleerd, 0 treffers).
- De app beveiligt zichzelf met Supabase Auth en RLS.
- `_headers` is in het Cloudflare-formaat, maar elke host kan dezelfde headers zetten.
- Het plakken van de uitnodigingslink is ontstaan om Access op te vangen, maar blijft ook zonder Access nuttig (een
  link op een ander toestel).
- Access weghalen is alleen een instelling.

**Tijdelijke constructies, dubbele datapaden, technische schuld?** Ja: F1, F2, N1 tot en met N5. Verder:
- het hele datapad heet "lokaal" (zit in F1);
- de demo-staat wordt gebruikt als gedeelde staat (zit in F1);
- tests draaien lokaal alleen via hulpscripts buiten de repository, terwijl CI ze wel zelf draait. Dat is werkbaar, maar
  een `npm run`-commando voor Windows zou helpen (laag).

Geen tijdelijke code in KG-5H.

**Sluiten KG-5E en de volgende fases nog aan?** Ja, met een aanpassing van de volgorde en de inhoud:

| Fase | Stand |
| --- | --- |
| KG-5E | Moet nu, met het periodecontract (F2), router, hernoemen, ErrorBoundary en foutteksten (N1, N2). Het bouwplan noemt ook React Query; dat vraagt nog akkoord en is niet nodig voor het contract |
| KG-5F, 5G, 5I | Lezen, schrijven en realtime: gebouwd, maar buiten het `Opslag`-interface. Ze gaan op in `SupabaseOpslag` |
| KG-5H | Deel 1 gebouwd; deel 2 na B4 |
| KG-5J | Staging staat. De **gate 9-review vóór echte persoonsgegevens** moet nog |
| F3 en verder (Vandaag, centrale invoer, vakantie, aandachtspunten) | Pas na KG-5E. Anders ontstaat F1 opnieuw |
| F10 (abonnement en AVG-basis) | Als uitbreiding, zie hierboven |

## 4. De drie soorten

**1. Fundamenteel (nu):**
- F1: twee datapaden en de naam "lokaal";
- F2: het datacontract "alles in het geheugen";
- F3: het offlinebesluit.

**2. Geplande uitbreidingen, zonder herbouw:**
- KG-5H deel 2: e-mailcode, aanmelden, wachtwoord vergeten, captcha, EU-SMTP;
- Apple en Google;
- quota (K9), auditlog (K10), de enige eigenaar (K11);
- account verwijderen en export (B3);
- opruimen van verwijderde inhoud (K8);
- versiecontrole aan de serverkant;
- abonnementen (F10) met een eigen tabel;
- een productieproject (Supabase Pro met PITR en back-ups; besluit over de kosten);
- modus `productie` (N5);
- een eigen domein;
- een PWA-manifest;
- monitoring;
- een privé repository of licentie (K13).

**3. Tijdelijke staginginstellingen (later eenvoudig weg):**
- Cloudflare Access;
- `pages.dev` en de previews op None;
- aanmelden uit, met testaccounts via het dashboard;
- het gratis Supabase-plan (pauzeren, geen PITR);
- de markering "Testomgeving" (gebonden aan de modus);
- `noindex` (hoort bij de app; een marketingsite komt apart);
- `testers.sql`, `archief-proef.sql` en `archief-controle.sql` (blijven bruikbaar als beheergereedschap);
- de demo-accounts van de lokale modus (alleen voor ontwikkeling).

## 5. Advies en volgorde

1. **Besluiten (nu, geen code):**
   - offline in v1 (F3);
   - hoe ver terug de data in de app moet staan (F2);
   - taal en foutteksten (N1; advies: de app vertaalt codes);
   - P2 (advies: wissen bij expliciet uitloggen, na een waarschuwing);
   - de demo in de productiebuild ja of nee (N4);
   - de inlogmethode voor deel 2 (advies: e-mailcode in hetzelfde tabblad).
2. **KG-5E**, met de besluiten van stap 1:
   - één `Opslag`-interface met een periodecontract;
   - `DemoOpslag` en `SupabaseOpslag`, met een contracttest;
   - hernoemen en herindelen, `Staat` opschonen;
   - router, ErrorBoundary, foutteksten in de app;
   - modus `productie` in de bewaking;
   - geen databasewijziging. De bestaande tests moeten ongewijzigd groen blijven.
3. **Pas daarna** nieuwe functies (F3 en verder) en het testen op staging met jullie tweeën.
4. **Vóór publieke registratie:**
   - KG-5H deel 2 (met B4);
   - quota (K9);
   - P2;
   - account verwijderen en export (B3);
   - de **gate 9-review**.
5. **Vlak vóór de commerciële lancering:**
   - een productieproject (Pro, back-ups en een hersteloefening);
   - F10 (abonnementen);
   - K8, K10, K11;
   - monitoring;
   - privacyverklaring en voorwaarden;
   - een eigen domein, Access weghalen, aanmelden aan;
   - een privé repository of licentie.

**Productkompas:** geen botsing. Een periodecontract (F2) en een offlinebesluit (F3) dienen principe 1 (minder gedoe:
werkt ook in de supermarkt) en "fouten moeten goedkoop zijn". P2 dient "privacy volgt de situatie".
