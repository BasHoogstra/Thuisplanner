# Thuisplanner: architectuurcontrole vóór staging en de demoroute

**Status:** 📝 rapport ter beoordeling (15 oktober 2026). Er is alleen gelezen. Er is niets gewijzigd,
gecommit, gepusht, gedeployd of in een database aangeraakt.

- **Branch:** `thuisplanner-toevoegen-rustiger` (`f57ba51`), met `thuisplanner/` (app, sync, supabase) en de
  bijbehorende documentatie.
- **Gelezen:** `PRODUCT_PRINCIPLES.md`, `docs/productkompas-beslissingen.md`, `docs/roadmap.md`,
  `docs/thuisplanner-bouwplan.md`, `docs/thuisplanner-fundament.md`, `docs/thuisplanner-inhoud.md`,
  `docs/thuisplanner-sync.md`, `docs/thuisplanner-app.md`, `docs/thuisplanner-staging-hosting.md`.
- **Gecontroleerd:**
  - de negen migraties in `thuisplanner/supabase/migrations`, de RLS-tests en `config.toml`;
  - `thuisplanner/sync/thuisplanner-sync.js`;
  - `thuisplanner/app/src`;
  - de twee CI-workflows en de `.gitignore`-bestanden;
  - de bundel in `dist/`;
  - de Huisplan-site.
- **Werkwijze:** drie deelcontroles, alleen lezend: database en beveiliging, sync en app, en build en
  omgevingen. De bevindingen met **✔** heb ik daarna zelf in de code nagekeken. De andere bevindingen
  staan met bestand en regel vermeld, maar zijn niet allemaal opnieuw gecontroleerd.
- Unittests van de app: 125 van de 125 slagen (lokaal gedraaid).

**Bewijs:**

| Soort | Betekenis |
| --- | --- |
| **BEWEZEN** | Gezien in code, tests of output, met bestand en regel |
| **AANNAME** | Aannemelijk, niet aangetoond |
| **TOEKOMSTIG** | Bewust nog niet gebouwd; staat zo in de documentatie |

**Ernst:**

| Soort | Betekenis |
| --- | --- |
| **BLOKKEREND** | Moet opgelost zijn vóór staging met echte accounts of echte gegevens |
| **BELANGRIJK** | Moet opgelost zijn vóór de commerciële lancering. Waar dat eerder moet, staat het erbij. |
| **UITSTELBAAR** | Kan later, zonder herbouw |

> Geen van de bevindingen blokkeert de interfacedemo zonder backend (§5).

## 1. BLOKKEREND (vóór staging met echte accounts of gegevens)

| # | Bevinding | Bewijs | Waar | Gevolg | Richting |
| --- | --- | --- | --- | --- | --- |
| B1 | Er is nog geen online modus. De app weigert alles behalve een lokaal adres, en de modus wordt afgeleid uit de URL. | BEWEZEN ✔ en TOEKOMSTIG | `app/src/lib/lokaal/sessie.ts` (`isLokaalAdres`, `lokaleConfig`) | Staging kan niet starten. Wie de bewaking alleen versoepelt, brengt het demowachtwoord en de lijst met fictieve accounts naar staging. | Een expliciete `VITE_OMGEVING` (demo, lokaal, staging, productie), een allowlist met het exacte adres per omgeving, en een build die faalt bij `VITE_DEMO_*` buiten de lokale modus. |
| B2 | Na het uitloggen blijven onbevestigde wijzigingen van het vorige account in `localStorage` staan: namen van boodschappen, taaktitels, gedeelde afspraken. | BEWEZEN; besluit P2 staat nog open | `sync/thuisplanner-sync.js:201-245`, `sessie.ts` (uitloggen) | Op een gedeeld toestel kan de volgende gebruiker die gegevens lezen. Privé-inhoud wordt al correct weggelaten. | Besluit P2. Advies: wissen bij expliciet uitloggen, na een waarschuwing ("N wijzigingen niet bevestigd"). |
| B3 | Zelf je account verwijderen en een AVG-export bestaan nog niet. Alleen het databasedeel is klaar. | TOEKOMSTIG | `docs/thuisplanner-bouwplan.md` ("Nu nodig versus later") | Een verzoek om inzage of verwijdering kan niet worden uitgevoerd. | Een Edge Function die na opnieuw inloggen het account verwijdert, en een RPC `export_my_data()`. |
| B4 | Er zijn geen back-ups en er is geen hersteloefening. Een gratis project heeft geen PITR. | TOEKOMSTIG en AANNAME | — | Gezinsagenda's kunnen onherstelbaar verloren gaan. | Een nachtelijke `pg_dump` naar opslag in de EU met een hersteloefening, of later een betaald plan. Dat laatste is een eigen besluit. |
| B5 | De veiligheid hangt mede af van instellingen van het gehoste project die niet in de repository staan. | AANNAME; lokaal BEWEZEN ✔ | `thuisplanner/supabase/config.toml:10` (`graphql_public` blootgesteld), `:52` (`enable_signup = true`) | Eén verkeerde dashboardinstelling stelt functies in `private` bloot, of laat iedereen een account maken. | Een checklist voor staging en een smoketest, bijvoorbeeld dat `rpc/lock_household` 404 geeft. Aanmelden uit, GraphQL uit, Realtime alleen op privékanalen. |
| B6 | De gate 9-review op een online project is nog niet gedaan. | TOEKOMSTIG | `docs/thuisplanner-bouwplan.md`, stap 9 | Privé-gegevens zouden kunnen lekken. | De review vóór echte persoonsgegevens; tot dan alleen fictieve gegevens. |

## 2. BELANGRIJK

### 2.1 Vóór staging oplossen (klein werk)

| # | Bevinding | Bewijs | Waar | Gevolg | Richting |
| --- | --- | --- | --- | --- | --- |
| K1 | Bij het afvinken van een taak wordt de datum in UTC vastgelegd. | BEWEZEN ✔ | `sync/thuisplanner-sync.js:726`, `new Date().toISOString().slice(0, 10)` | Een taak die tussen 00:00 en 02:00 (Nederlandse tijd) wordt afgevinkt, krijgt de datum van gisteren en valt verkeerd van Vandaag. | De lokale datum uit de app doorgeven. |
| K2 | `event_exceptions` heeft geen index op `household_id`; de primaire sleutel begint met `series_id`. | BEWEZEN ✔ | `supabase/migrations/20261012120000_kg5c_inhoud.sql:109-117` | De sync filtert bij elke volledige ophaalronde op `household_id`. Dat wordt een scan over de uitzonderingen van alle huishoudens, en groeit dus mee met het aantal klanten. | Een nieuwe migratie met `(household_id, series_id, occurrence_date)`. |
| K3 | Archiveren laat de koppeling met het account staan. De privé-afspraken van dat lid blijven bestaan, maar niemand kan ze nog lezen, ook de betrokkene zelf niet. | BEWEZEN ✔ | `20261011120000_kg5b_herstel1.sql:332`; `is_my_event` vereist een actief lid | Er worden persoonsgegevens bewaard waar de betrokkene niet meer bij kan. Dat botst met het inzagerecht. | Bij het archiveren de privé-details verwijderen of het account loskoppelen (de bestaande trigger ruimt dan op), met een tegenproef. |

### 2.2 Architectuur: vóór de stagingkoppeling oplossen

| # | Bevinding | Bewijs | Waar | Gevolg | Richting |
| --- | --- | --- | --- | --- | --- |
| K4 | Er zijn twee parallelle datapaden en er is geen opslaginterface. `DemoApp` werkt met een reducer, `LokaleApp` met `useLokaleStaat`. Ze lopen al uiteen: ongedaan maken en scenario's doen in de lokale modus niets, en `rechten.zichtbaarVoor` geldt alleen in de demo. | BEWEZEN; KG-5E is nog niet uitgevoerd | `app/src/App.tsx:53-76`, `lib/store.ts`, `lib/lokaal/staat.ts` | Elke nieuwe functie moet twee keer worden gebouwd en kan per modus anders werken. | KG-5E zoals gepland: één `Opslag`-interface, `DemoOpslag` en `SupabaseOpslag`, en één contracttest voor beide. |
| K5 | De inlogsessie staat in `sessionStorage`. | BEWEZEN ✔ | `sessie.ts:64-67, 98` | Na elke keer sluiten van het tabblad of de app moet je opnieuw inloggen. Met een e-mailcode is dat veel gedoe, en dat botst met principe 1. | `localStorage` buiten de testmodus. |
| K6 | De app kiest het eerste huishouden waarvan je lid bent. Er is geen keuze en de volgorde ligt niet vast. | BEWEZEN ✔; TOEKOMSTIG in KG-5H | `sessie.ts:167` | Wie in twee huishoudens zit, komt in een willekeurig huishouden terecht. | Een huishoudkeuze die de laatste keuze onthoudt, in KG-5H. |

### 2.3 Vóór de commerciële lancering

| # | Bevinding | Bewijs | Waar | Gevolg | Richting |
| --- | --- | --- | --- | --- | --- |
| K7 | De sync haalt bij elk seintje, elke 30 seconden en bij elke nieuwe verbinding alles van het huishouden opnieuw op. | BEWEZEN ✔ | `sync/thuisplanner-sync.js:153, 311-334, 487` | De belasting groeit met de geschiedenis maal het aantal toestellen. Goed voor een proef, duur bij veel klanten. Het bouwplan noemt al "lezen per periode". | Per periode ophalen, één rij opnieuw ophalen op een seintje, en het vangnet minder vaak laten draaien. |
| K8 | Verwijderen zet alleen `deleted_at`. Er is geen opruimtaak, en details van verwijderde privé-afspraken blijven bestaan. Het register voor boodschappen groeit onbeperkt (P5). | BEWEZEN ✔ (geen `pg_cron` gevonden) | `kg5c_inhoud.sql:293-321`; `docs/thuisplanner-sync.md` (P5) | Dat botst met dataminimalisatie: "verwijderd" is niet echt weg. | Een bewaartermijn en een opruimtaak, met tests. |
| K9 | Er zijn geen limieten per huishouden voor leden, uitnodigingen, afspraken en taken, en de Data API heeft geen rate limiting. | BEWEZEN | `kg1_fundament.sql:310-361`, `kg5c_inhoud.sql:317-428` | Eén account kan opslag en realtime volstoppen. | Telcontroles aan de serverkant, aanmelden uit of afgeschermd, en rate limiting aan de rand. |
| K10 | Er is geen auditlog voor lidmaatschap, rollen, eigendom en uitnodigingen. | BEWEZEN (ontbreekt) | — | Bij support of een geschil ("wie heeft mij verwijderd?") is niets na te gaan. | Een append-only log in `private`, zonder inhoud, met een bewaartermijn. |
| K11 | De enige eigenaar kan zijn account niet verwijderen zolang er andere accounts in het huishouden zijn. | BEWEZEN | `kg5c_inhoud.sql:656-668` | Een AVG-verwijderverzoek kan vastlopen. | Automatisch overdragen aan een andere volwassene, of een vaste supportprocedure. |
| K12 | Geen router, geen manifest of service worker, geen ErrorBoundary. | BEWEZEN ✔ (ErrorBoundary: niet gevonden) | `App.tsx` | Een renderfout geeft een wit scherm. De app is niet als app te installeren. Uitnodigingslinks en routes per huishouden worden lastig. | Bij KG-5E en KG-5H. Een ErrorBoundary kan los en is klein. |
| K13 | De repository is openbaar en heeft geen `LICENSE`. De map `docs/` van `main` staat al op de Huisplan-site (`/docs/roadmap.html` geeft 200). Bij een merge komen de Thuisplanner-documenten en screenshots daar ook te staan, want `_config.yml` sluit alleen `thuisplanner/` uit. | BEWEZEN ✔ | `_config.yml` op `main` | De merkscheiding verdwijnt, en concurrenten kunnen de roadmap en de broncode lezen. Er lekt niets geheims. | Vóór een merge: de Thuisplanner-documenten uitsluiten of naar `thuisplanner/docs/` verplaatsen. Vóór betalende klanten: een eigen, privé repository, of in ieder geval een licentie. Dat is een eigen besluit. |
| K14 | De geplande CSP is onvolledig. `img-src 'self' data:` ontbreekt, en zonder die regel wordt de favicon geblokkeerd. Ook `default-src`, `object-src 'none'`, `base-uri 'none'`, `X-Content-Type-Options` en `immutable` voor `assets/*` ontbreken. | BEWEZEN (`index.html`: favicon als `data:`-URI) | `docs/thuisplanner-staging-hosting.md` §10.3 | Een te strenge CSP geeft een kapotte demo, een te losse beschermt te weinig. | De volledige set in §5 hieronder. |

## 3. Veilig uit te stellen

| Bevinding | Bewijs | Waarom het kan wachten |
| --- | --- | --- |
| De tijdzone van het huishouden wordt niet gebruikt; alleen de klok van het toestel telt. | BEWEZEN | Voor een Nederlandse v1 maakt het niet uit. |
| Herhaling staat twee keer in de code (`herhaling.ts` en `private.occurs_on`), met aparte tests. | BEWEZEN | De regels zijn gelijk. Later één gedeelde tabel met testgevallen. |
| De demobundel bevat `@supabase/supabase-js` (504 kB, 146 kB gzip). | BEWEZEN ✔ | Alleen grootte, geen risico. Later dynamisch laden. |
| De versiecontrole voor taken en boodschappen zit alleen in de client. | BEWEZEN | Binnen één huishouden geldt dan "laatste schrijver wint". De afspraken hebben al een controle aan de serverkant. |
| De policy op `event_details` roept per rij een definer-functie aan. | BEWEZEN | Snel genoeg voor de omvang van een gezin. |
| Geen standaardrechten-revoke voor schema `private`. | BEWEZEN | Alle rechten zijn nu met de hand ingetrokken; dit is een extra vangnet. |
| Bestaansorakel voor willekeurige UUID's van andere huishoudens. | BEWEZEN | Verwaarloosbaar met willekeurige UUID's. |
| Een huishouden verwijderen wist ook de privé-afspraken van andere volwassenen. | BEWEZEN | Dat is een productbeslissing, geen fout. |
| GitHub Actions zijn niet op een SHA vastgezet; `npm audit` draait niet online. | BEWEZEN | Er zijn geen secrets en de rechten zijn `contents: read`. Dependabot later. |
| Geen automatische toegankelijkheidstest (axe). | BEWEZEN | De basis is goed: focusval, Escape, `aria-live`, `lang="nl"`. |

## 4. Geschikt voor een commerciële Thuisplanner met meerdere gezinnen?

**Als basis: ja. Zoals het nu is: nog niet.**

| Laag | Oordeel | Onderbouwing |
| --- | --- | --- |
| **Database en autorisatie** | **Geschikt.** | Er is geen blokkerend defect gevonden in de isolatie tussen huishoudens of in de "Bezet"-privacy. Waarom: <br>• RLS op elke tabel; <br>• definer-functies in `private` met een leeg `search_path`; <br>• samengestelde FK's `(household_id, id)` maken verwijzingen naar een ander huishouden onmogelijk; <br>• privé-details in een eigen tabel, gebonden aan het account; <br>• foutmeldingen zonder rijgegevens; <br>• privé realtimekanalen met seintjes zonder inhoud. <br>Dat alles is getest met 50 scenario's en tegenproeven, in CI tegen een echte lokale Supabase. Gate 9 is technisch goed voorbereid. |
| **Sync-module** | **Geschikt, met één kleine fout (K1) en werk aan de schaal (K7).** | Generaties, UUID's van de app, versiecontrole, idempotente boodschappen, eerlijke meldingen "niet bevestigd", en opnieuw verbinden met backoff. Bij de controle is daar geen fout in gevonden. |
| **App (client)** | **Prototype-niveau.** | Twee datapaden (K4), sessie en huishoudkeuze op proefniveau (K5, K6), en geen online modus (B1). Dat volgt het plan, want KG-5E en KG-5H zijn nog niet gedaan. Het vraagt geen herbouw: de schermen gebruiken al één `ctx`. |
| **Beheer en AVG** | **Ontbreekt nog.** | Back-ups, export, account verwijderen, bewaartermijnen, quota en audit (B3, B4, K8–K11). Dat staat grotendeels bewust op "later". K3 en K8 zijn echte gaten in de huidige code. |

## 5. Is stap 1 van de demoroute herbruikbaar voor v1?

**Ja, op één punt na.**

- **De demo zelf:** dat is de bestaande `DemoApp`, geen nieuwe code. Na KG-5E wordt dit `DemoOpslag`, die
  blijft bestaan voor de demo en voor de tests.
- **`public/_headers`:** dit bestand blijft voor v1 bestaan.
  - Ongewijzigd herbruikbaar: `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`,
    `X-Content-Type-Options: nosniff`, `no-cache` voor `index.html` en `immutable` voor `assets/*`.
  - Het ene punt: `connect-src` verschilt per omgeving. De demo heeft `'self'` nodig, staging en
    productie hun eigen exacte `https://` en `wss://` Supabase-adres. Dat vraagt later een kleine
    stap in de build die het bestand per omgeving maakt (samen met B1). Het bestand zelf hoeft niet
    weggegooid te worden.
  - `X-Robots-Tag: noindex` is goed voor de app. Een latere marketingpagina hoort op een eigen adres.
- **Voorgestelde inhoud** (nog niet aangemaakt):

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
  X-Robots-Tag: noindex
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/index.html
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

`style-src 'self'` zonder `'unsafe-inline'` is een **AANNAME**: React zet stijlen via het DOM en niet via
inline `<style>`. De e2e-tests moeten dat bevestigen (geen CSP-meldingen in de console).

## 6. Advies

**Ga door met de bestaande basis. Een fundamentele aanpassing is niet nodig.** De moeilijkste en meest
risicovolle laag, autorisatie en privacy in de database, is degelijk en bewezen. De zwakke plekken zitten
in de client, en die waren al gepland: KG-5E en KG-5H. Verder ontbreekt de beheer- en AVG-laag.

**Wel een andere volgorde dan in het bouwplan.** Het bouwplan heeft KG-5E (herindeling en
opslaginterface) overgeslagen, en de lokale modus is ernaast gegroeid. Als staging daar bovenop komt,
lopen de paden verder uiteen. Daarom:

1. **Nu, los van al het andere:** de demoroute (stap 1: `_headers` met de CSP uit §5). Die raakt geen
   van de bevindingen.
2. **Kleine herstelronde:** K1 (UTC-datum), K2 (index), K3 (archiveren) en een ErrorBoundary. Klein,
   met tests en tegenproeven.
3. **KG-5E:** één opslaginterface met een contracttest, en het omgevingsmodel uit B1. Daarbij K5.
4. **KG-5H:** inloggen met een e-mailcode, huishoudkeuze (K6), besluit P2 (B2).
5. **Staging (KG-5J):** de checklist en smoketest uit B5, en de gate 9-review (B6). B3 en B4 vóór echte
   persoonsgegevens.
6. **Vóór de commerciële lancering:** K7–K11, K13 (privé repository of licentie) en wat uit §3 dan nog
   nodig is.

## 7. K3 opnieuw ontworpen: archiveren is niet verwijderen (voorstel, nog niet gebouwd)

**Opdracht (15 oktober 2026):**
- Archiveren en definitief verwijderen blijven gescheiden.
- Privégegevens zijn na het archiveren niet toegankelijk voor anderen, maar gaan ook niet onherroepelijk
  verloren.
- Ze blijven niet onbeperkt bewaard zonder doel.
- Geen uitgebreid archief- of herstelsysteem.

### 7.1 Zo werkt het nu (BEWEZEN in de migraties)

| Wat | Gedrag |
| --- | --- |
| `archive_member` | Zet `status = 'archived'`, de rol op `member`, en trekt de uitnodigingen in. De koppeling met het account (`user_id`) blijft staan. |
| Details van een privé-afspraak (titel, plek, notitie) | **Voor niemand leesbaar**, ook niet voor de betrokkene: `is_my_event` vraagt een actief lidmaatschap. Dat deel van de opdracht is dus al geregeld. |
| De afspraak zelf (tijd, voor wie) | Blijft voor alle leden zichtbaar als **"Bezet"**. De policy `events_select` kijkt alleen naar het huishouden, en `event_overview` toont `is_busy`. Een gearchiveerd lid laat dus "Bezet"-blokken achter in de agenda. |
| Terughalen | **Kan niet.** Er is geen functie om een lid weer actief te maken. Een nieuwe uitnodiging voor een gearchiveerd lid wordt geweigerd ("Dit lid is gearchiveerd"). Wie opnieuw lid wordt, krijgt een nieuw profiel, en de oude privé-afspraken blijven aan het oude profiel hangen. |
| Termijn | **Geen.** De gegevens blijven voor altijd staan, onleesbaar. |
| Echt verwijderen | Alleen als de betrokkene het huishouden zelf verlaat (`leave_household` koppelt het account los, de trigger verwijdert de privé-afspraken), of als het account of het hele huishouden wordt verwijderd. |

Het werkelijke probleem is dus niet dat de gegevens toegankelijk zijn, maar dat ze **zonder doel en zonder
einde** blijven staan. Daarnaast laten ze "Bezet"-blokken achter.

### 7.2 Alternatieven

| | Wat | Omvang | Oordeel |
| --- | --- | --- | --- |
| **A (advies)** | **Bewaartermijn plus herstel binnen de termijn.** (1) Privé-afspraken van een gearchiveerd lid verdwijnen voor de anderen ook als "Bezet". (2) Een beheerder kan het lid binnen de termijn terughalen (`restore_member`); de privé-afspraken zijn dan direct weer van de betrokkene, want het account is nooit losgekoppeld. (3) Na de termijn verwijdert een dagelijkse taak (`pg_cron`) de privé-afspraken van leden die langer dan de termijn gearchiveerd zijn. | Eén migratie: een policy-aanpassing, twee kleine functies en één geplande taak. Vier nieuwe scenario's met tegenproeven. | Dekt alle eisen. Raakt de RLS van afspraken (gate 9) en voegt `pg_cron` toe; beide zijn standaard op Supabase. Geen nieuwe tabellen. |
| B | Alleen de termijn en de opruimtaak; geen herstel, wel de "Bezet"-blokken weg. | Iets kleiner dan A. | Gegevens zijn binnen de termijn niet terug te halen. Dan heeft bewaren eigenlijk geen doel, en verschilt dit weinig van direct verwijderen. |
| C | Bij archiveren het account loskoppelen en de privé-afspraken naar een aparte "bewaartabel" verplaatsen, met export en herstel. | Groot: een nieuwe tabel, nieuwe RLS, en het uitnodigen moet worden aangepast. | Een archiefsysteem; valt buiten de opdracht. |
| D | Niets veranderen tot de AVG-laag (B3) er is. | Geen werk. | Gegevens blijven intussen onbeperkt staan, met "Bezet"-blokken. Botst met de opdracht. |

### 7.3 Advies A, uitgewerkt

1. **Zichtbaarheid.** De policy `events_select` toont een privé-afspraak alleen als het lid dat eigenaar
   is actief is. Gedeelde afspraken van een gearchiveerd lid blijven gewoon zichtbaar; die horen bij het
   huishouden. Details waren al afgeschermd. Realtime gebruikt al dezelfde RLS en hoeft niet te veranderen.
2. **Herstel.** `restore_member(huishouden, lid)`, alleen voor een eigenaar of beheerder, en alleen binnen
   de termijn. De rol komt terug als `member`. Het herstel wordt geweigerd als hetzelfde account intussen
   onder een ander profiel actief is (de bestaande unieke index bewaakt dat). Er komt nog geen scherm
   voor: in de app is archiveren er nu ook nog niet.
3. **Termijn en opruimen.** Een vaste termijn (voorstel: **30 dagen**; dat is een productkeuze).
   Een dagelijkse `pg_cron`-taak verwijdert de privé-afspraken van leden die langer dan de termijn
   gearchiveerd zijn. Gedeelde inhoud en het profiel zelf (naam, voor de geschiedenis) blijven staan.
4. **Expliciet verwijderen.** Er komt nog geen aparte functie. De betrokkene kan het nu al zelf: het
   account verwijderen of het huishouden verlaten. Een knop "nu definitief verwijderen" voor de beheerder
   hoort bij de AVG-laag (B3), samen met de export. Die export moet dan ook de privé-afspraken van een
   gearchiveerd profiel bevatten.

**Beslissingen die nodig zijn vóór het bouwen:**
- (a) Akkoord op alternatief A.
- (b) De termijn: 30 dagen of iets anders.
- (c) Mogen de "Bezet"-blokken van een gearchiveerd lid direct verdwijnen? Advies: ja.
- (d) `pg_cron` als nieuwe afhankelijkheid. Lokaal en op Supabase is die gratis beschikbaar. Er is geen
  nieuwe betaalde dienst nodig.

**Productkompas:** "Fouten moeten goedkoop zijn" (per ongeluk archiveren is binnen de termijn te herstellen),
"Privacy volgt de situatie" (alleen de eigenaar, en na de termijn niemand meer), en principe 5 (een
onherroepelijke verwijdering pas na een termijn, of na een eigen keuze van de betrokkene).

**Productkompas:** geen botsing. Het advies houdt gate 9 vast (privacy aan de serverkant, alleen
fictieve gegevens tot de review). K5 en K7 dienen principe 1 (minder gedoe) en "Fouten moeten goedkoop
zijn". K3, K8 en B2 dienen "Privacy volgt de situatie".
