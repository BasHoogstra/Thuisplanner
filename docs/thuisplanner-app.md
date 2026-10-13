# Thuisplanner: React-app met echte synchronisatie (lokaal, fictief)

Deze stap brengt het visuele React/Vite-prototype (PR #20, `komtgoed/app`) en de database met
synchronisatie (PR #22, `komtgoed/supabase` en `komtgoed/sync`) samen in één werkende app. Het doel:
op twee telefoons zien dat een afspraak, taak of boodschap die op het ene toestel wordt toegevoegd,
gewijzigd of afgevinkt, op het andere verschijnt.

Grenzen van deze stap: alleen een **lokale** Supabase-stack (dit toestel of het eigen netwerk), alleen
**fictieve** gegevens (`@test.invalid`, gezin De Boer), geen online project, geen deploy, geen betalingen.
De live Huisplan-app (`index.html`, `test/index.html`, `supabase/`) is niet gewijzigd. Dit is **geen**
productieversie; een onafhankelijke review volgt.

## 1. Twee modi, dezelfde schermen

| Modus | Wanneer | Gegevens |
| --- | --- | --- |
| **Demo** (zoals PR #20) | standaard (`npm run dev`, `npm run build`, het losse bestand) | in het geheugen van het tabblad; ongewijzigd gedrag, alle bestaande tests blijven gelijk |
| **Lokaal** (nieuw) | `npm run lokaal` of `npm run lokaal:lan` (Vite-modus `lokaal`) | lokale Supabase via de sync-module; inloggen met een fictief account |

De modus volgt uit de bouwomgeving (`VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY`). Wijst die naar
iets anders dan `127.x`, `localhost` of een privé-netwerkadres (`10.x`, `172.16–31.x`, `192.168.x`), dan
weigert de app op te starten (een melding, nooit stil terugvallen op de demo).

## 2. Uitproberen

Vereist: Docker en de Supabase-CLI, Node 20+.

**Windows:** de scripts werken ook in PowerShell. Staat de CLI niet op het PATH, gebruik dan
`npx supabase@2.120.0 start` en zet voor de app-scripts `$env:SUPABASE = 'npx supabase@2.120.0'`. Kies bij
`lokaal:lan` het wifi-adres zo nodig zelf met `node scripts/lokaal.mjs dev --host <ip>`; Hyper-V/WSL-adapters
(`vEthernet (...)`) slaat het script over.

```sh
cd komtgoed && supabase start          # lokale stack (eenmalig per sessie)
cd app && npm ci
npm run lokaal:seed                     # gezin De Boer opnieuw klaarzetten (mag vaker)
npm run lokaal                          # http://127.0.0.1:5180
```

- **Op één computer:** open de app in twee tabbladen (of twee browsers). Kies in het ene "Inloggen als
  Eva", in het andere "Inloggen als Thomas". De inlogsessie hoort bij het tabblad (`sessionStorage`).
- **Op twee telefoons (zelfde wifi):** zie §2a.
- Accounts: `eva.demo@test.invalid` en `thomas.demo@test.invalid`, lokaal wachtwoord
  `lokaal-alleen-fictief` (staat vooringevuld). Kinderen Lotte en Daan zijn leden zonder account.

### 2a. Twee telefoons op hetzelfde wifi

Nog **niet met echte telefoons uitgevoerd**. Wel aangetoond met browsers op een aparte netwerkhost (zie
§5, LAN-proef). Stappen:

1. Computer en beide telefoons op hetzelfde, vertrouwde thuisnetwerk (geen gastnetwerk met
   "client-isolatie", geen VPN op de telefoons).
2. `cd komtgoed && supabase start`, daarna `cd app && npm run lokaal:seed`.
3. `npm run lokaal:lan`. Het script kiest het wifi-adres van de computer (virtuele netwerken van Docker,
   VM's en VPN's slaat het over; bij twijfel noemt het de kandidaten) en controleert dat Auth en REST op
   dat adres antwoorden. Klopt het adres niet: `node scripts/lokaal.mjs dev --host 192.168.x.y`.
4. Firewall van de computer: sta inkomend alleen poort **5180** (app) en **55321** (Supabase API, ook
   Realtime) toe. De lokale stack luistert ook met de database (55322, standaardwachtwoord) op alle
   netwerken: laat die dicht, en gebruik dit alleen thuis.
5. Open op beide telefoons `http://<adres>:5180/` (het script toont het). Telefoon 1: "Inloggen als
   Eva", telefoon 2: "Inloggen als Thomas". Bovenin moet "Verbonden" staan.
6. Proef: voeg op de ene telefoon een afspraak, taak en boodschap toe; ze verschijnen binnen enkele
   seconden op de andere. Vink op de andere telefoon iets af; het verschijnt terug.

**Waarom HTTP en geen HTTPS op het netwerk:** `http://<lan-ip>` is in de browser geen "secure context".
`crypto.randomUUID()` ontbreekt dan; daardoor mislukte toevoegen (bevinding 2 van de review). De
sync-module maakt opdracht-ID's nu met `crypto.getRandomValues()` (UUID v4; die functie bestaat ook zonder
secure context en is even sterk; nooit `Math.random`). HTTPS op het netwerk zou op elke telefoon een
vertrouwd certificaat vragen, en ook Supabase (API en Realtime) achter TLS (anders blokkeert de browser
het als gemengde inhoud). Dat is voor een proef met fictieve gegevens veel meer opzet dan nodig. Andere
functies die een secure context eisen, gebruikt de app niet: `localStorage` en `sessionStorage` werken;
supabase-js valt zonder `navigator.locks` terug op een eigen vergrendeling.

`scripts/lokaal.mjs` leest de URL en sleutels uit `supabase status -o env`. De service-role-sleutel
gebruikt het alleen in Node om de fictieve accounts te maken; de browser krijgt alleen de anon-sleutel
(`.env.lokaal.local`, door git genegeerd; statisch gecontroleerd in `komtgoed/supabase/tests/statisch.js`).

## 3. Wat werkt er echt, en wat is nog demo?

| Onderdeel | Lokale modus |
| --- | --- |
| Inloggen met een fictief account, huishouden en leden van de server | **Echt** (wachtwoord, lokaal). Testpagina, niet het ontwerp van KG-5H (e-mailcode, huishouden aanmaken, uitnodigen) |
| **Vandaag** (agenda, taken, boodschappen, binnenkort) | **Echt**: uit de database, bijgewerkt via realtime-seintjes |
| **Agenda** dag/week/maand, gezinsfilter | **Echt** (lezen en schrijven) |
| **Afspraken** toevoegen, aanpassen, verwijderen | **Echt** (`save_event`, `delete_event`, met versie) |
| **Herhalende afspraken**: hele reeks, of "alleen deze" wijzigen/verwijderen | **Echt** (`edit_occurrence`, `delete_occurrence`; uitzonderingen worden nu mee opgehaald) |
| **Taken** toevoegen, aanpassen, afvinken, verwijderen | **Echt** (in Vandaag en Agenda; PR #20 heeft geen apart Taken-scherm) |
| **Boodschappen** toevoegen (ook meerdere tegelijk), hernoemen, afvinken, mandje leegmaken | **Echt**; dubbelingen herkent de server (`add_shopping_items`: nieuw / al op lijst / terug) |
| **Privé-afspraken** van een ander | **Echt** "Bezet": de server stuurt titel, plek en details niet mee (RLS, gate 9) |
| **Versieconflict** | **Echt**: het venster onthoudt de versie bij openen; is die intussen veranderd, dan weigert de server en verschijnt de melding van de sync-module; niets wordt stil overschreven |
| **Onbevestigde opdrachten** | **Echt**: label "niet bevestigd" op de rij, afvinken en bewerken staan stil, "Opnieuw proberen" (zelfde opdracht-ID, nooit dubbel) en "Vergeten op dit toestel" in het venster en onder Meer; keuze bij een mogelijk dubbele toevoeging; waarschuwing als de browser niets kan bewaren |
| **Onbevestigde privé-afspraak na herladen** | **Echt**: de inhoud is bewust niet op het toestel bewaard (blijft zo). Onder Meer: "Opnieuw invoeren" opent het venster ("Privé-afspraak opnieuw invoeren", privé vast). Opslaan gebruikt dezelfde opdracht-ID, dus nooit een tweede afspraak; bevestigt de server hem intussen toch, dan wisselt het venster naar de bewaarde afspraak |
| **Afspraakvelden die het venster niet toont** (notities, einddatum van een meerdaagse afspraak) | **Echt behouden** bij aanpassen, ook bij één voorkomen of de hele reeks; de duur schuift mee met de begindatum |
| Verbindingsstatus | **Echt**: bovenin (Verbonden, Bijwerken, Geen verbinding, Geen toegang) |
| Uitloggen | **Echt**: stopt de synchronisatie; onbevestigde opdrachten blijven bewaard (zie §6, P2) |
| Ongedaan maken | **Niet** in de lokale modus (alleen demo) |
| Meedenk-signaal wegklikken | Alleen voor dit tabblad (niet opgeslagen) |
| Demo-scenario's (rustige dag) | Alleen demo |
| Uitnodigen, accounts aanmaken in de app, meldingen, herhalende taken | **Niet gebouwd** |
| Gegevens | **Fictief**, lokaal; het gezin wordt door `lokaal:seed` gemaakt |

## 4. Architectuur

```
React-schermen (ongewijzigd)  ── useApp() ──  Schil (App.tsx)
                                                │
             demo: useDemoStaat (store.ts)      │  lokaal: useLokaleStaat (lib/lokaal/staat.ts)
                                                │           │  omzetten.ts (rij ↔ app-type, puur)
                                                │           ▼
                                     Sessie (lib/lokaal/sessie.ts) ── één per pagina, buiten React
                                                │
                                     maakSync (komtgoed/sync/thuisplanner-sync.js)  ── Supabase lokaal
```

- **Eén levenscyclus, centraal.** De `Sessie` bestaat één keer per pagina, buiten React. Ze beheert
  inloggen, het huishouden en precies één sync. React leest mee met `useSyncExternalStore`. Een
  onderdeel dat unmount (ander scherm, StrictMode die dubbel mount, inlogscherm na uitloggen) stopt de
  synchronisatie dus niet en wist geen opdrachten. Alleen `uitloggen()` (en opnieuw inloggen) stopt de
  sync. Getest in `tests/lokaal.test.tsx` en `e2e-lokaal/sync.spec.ts`.
- **Volgorde van herstellen, inloggen en uitloggen (herstelronde 1).** Elke actie begint een nieuwe
  generatie; een antwoord van een oudere generatie (een trage inlog na uitloggen, een herstel dat pas na
  uitloggen terugkomt) verandert niets meer en start geen sync. De aanroepen die de inlogsessie van de
  Supabase-client veranderen (getSession, inloggen, uitloggen) lopen na elkaar: zo ruimt een uitloggen ook
  een inlog op die pas daarna binnenkomt, en houdt de client bij snel wisselen de sessie van het laatst
  gekozen account. Uitloggen toont meteen "uitgelogd"; het wacht niet op het netwerk. Getest in
  `tests/sessie.test.tsx`.
- **Kanaalafmelding blokkeert niets (herstelronde 2).** Inloggen en uitloggen zetten hun auth-aanroep
  meteen in de rij, nog vóór de vorige sync stopt. De sync verstuurt vanaf `stop()` niets meer; alleen het
  afmelden van het Realtime-kanaal kan duren of mislukken, en daar wacht geen auth-handeling op. Zo kan een
  oude uitlog met een hangende afmelding nooit het token van een nieuwere inlog wissen, en blokkeert een
  fout bij het afmelden de rij niet. Getest met een bewust hangende en een mislukkende afmelding, in elke
  volgorde, en met snel uit- en weer inloggen; telkens op de schermstatus én het werkelijke token.
- **Zelfde schermen.** De demo-store en de lokale staat bieden dezelfde acties. De algemene
  `vervangAlles` is in het venster en op Boodschappen vervangen door expliciete handelingen
  (`voegBoodschappenToe`, `wijzigVoorkomen`, `verwijderVoorkomen`, `verwijderReeks`), zodat elke
  handeling één serveropdracht is. In de demo werken ze precies als voorheen.
- **Sync-module (kleine uitbreiding):** ophalen van `event_exceptions` (keyset over reeks + datum),
  `taakBijwerken` (met versie), `afspraakVoorkomenWijzigen` en `afspraakVoorkomenVerwijderen`. Typen in
  `thuisplanner-sync.d.ts`. Getest in `komtgoed/supabase/tests/integratie/react.test.mjs`.

### Bibliotheken

| Bibliotheek | Besluit | Waarom |
| --- | --- | --- |
| `@supabase/supabase-js` 2.117.2 | **Toegevoegd** | Nodig voor Auth, PostgREST en Realtime; dezelfde vastgepinde versie als de sync-module en de integratietests |
| `@tanstack/react-query` | **Niet toegevoegd** | De sync-module heeft al een cache, ophalen per generatie, realtime-seintjes, een vangnet, optimistische wijzigingen en onbevestigde opdrachten. React Query zou een tweede cache met eigen verversing ernaast zetten; twee bronnen van waarheid maken conflicten en herstel moeilijker te bewijzen |
| `react-router` | **Niet toegevoegd** | De vier schermen met hash-navigatie (`#/vandaag` …) uit PR #20 volstaan, en blijven werken in het losse bestand. Opnieuw bekijken bij KG-5E/KG-5H (diepe links, uitnodigingslinks) |

## 5. Tests

| Laag | Bestand | Wat |
| --- | --- | --- |
| Unit (Vitest) | `komtgoed/app/tests/lokaal.test.tsx` | omzetten (bezet zonder details, herhaling + uitzonderingen, versies, syncstaat), alleen-lokaal-adres, sessie: StrictMode/unmount stoppen niets, herstel één keer, uitloggen stopt |
| Unit (herstelronde 1) | `tests/afspraakbehoud.test.tsx` | bevinding 1: echte keten serverrij → venster → save_event; alleen de titel wijzigen behoudt notities, einddatum en alle andere velden (los, één voorkomen, hele reeks) |
| Unit (herstelronde 1) | `tests/sessie.test.tsx` | bevinding 3: uitgestelde antwoorden; uitloggen na elk van de stappen van inloggen en herstellen; snel wisselen van account in beide volgordes; uitloggen + opnieuw inloggen; StrictMode |
| Unit (herstelronde 1) | `tests/uuid.test.ts` | bevinding 2: zonder `randomUUID` geldige, unieke v4-UUID's uit `getRandomValues`, nooit `Math.random`; fout zonder cryptografische willekeur |
| Integratie (lokale stack) | `komtgoed/supabase/tests/integratie/react.test.mjs` | uitzonderingen over meerdere pagina's bij beide accounts, voorkomen wijzigen en verwijderen, taak bijwerken met conflict; bevinding 4: privé-afspraak niet aangekomen → herladen → herinvoer met dezelfde ID; aangekomen → laat bevestigd → herinvoer maakt geen tweede; herinvoer met weggevallen antwoord → opnieuw proberen |
| E2E, twee accounts | `komtgoed/app/e2e-lokaal/sync.spec.ts` (`npm run e2e:lokaal`) | privé "Bezet"; afspraak toevoegen/aanpassen/één voorkomen verwijderen; taak toevoegen en afvinken; boodschappen toevoegen, afvinken, geen dubbele; versieconflict; onbevestigd (aangekomen / niet aangekomen / na herladen / vergeten / keuze bij mogelijk dubbel); schermwissels en uitloggen |
| E2E (herstelronde 1) | `komtgoed/app/e2e-lokaal/herstel1.spec.ts` | bevinding 1 in de echte app, gecontroleerd in de database; bevinding 4: niet aangekomen + herladen + opnieuw invoeren (zelfde ID, Thomas ziet één keer "Bezet"), aangekomen + herladen (laat bevestigd), herinvoer-venster open tijdens de late bevestiging |
| LAN-proef | `komtgoed/app/e2e-lan/lan.spec.ts` via `scripts/lan-proef.sh` (`npm run lan-proef`) | bevinding 2: de app draait op het netwerkadres van de ontwikkelmachine; de browsers draaien in een container met een **eigen netwerkstack** (eigen IP) en bereiken app, Auth, REST en Realtime alleen via dat adres. Toetst: geen secure context, geen `randomUUID`, toch inloggen, toevoegen, afvinken en realtime-synchronisatie tussen twee accounts. **Geen echte telefoons** |
| Bestaand | demo-e2e (138), unit, sync- en herstelintegratie, RLS-matrix, Huisplan | ongewijzigd groen |

CI: de lokale e2e en de LAN-proef draaien in de job `supabase-lokaal` van `.github/workflows/komtgoed-db.yml`.

**Tegenproeven (herstelronde 1):** de nieuwe tests zijn tegen de code van 79cebd0 gedraaid en vangen de
oude fouten: `afspraakbehoud` 4/4 rood, `sessie` 8/14 rood (de races; de overige 6 zijn bewaking),
`herstel1.spec` 4/5 rood (de late bevestiging werkte al), en de LAN-proef rood met de oude
`crypto.randomUUID()`.

Screenshots: `komtgoed/app/screenshots/lokaal/` (`npm run screenshots:lokaal`).

## 6. Privacybeslissingen P1–P5: niet ingevoerd

De lokale modus gebruikt de sync-module zoals die nu is: situatie 1 uit `docs/thuisplanner-sync.md` §9
(veilige ontwikkelmodus, fictieve gegevens, alleen lokaal). Onbevestigde opdrachten van taken en
boodschappen staan met inhoud in `localStorage`; privé-afspraken zonder inhoud. Geen van P1–P5 is
stilzwijgend ingevoerd. Wat er per beslissing nodig is vóór echte gegevens:

| Beslissing | Huidige stand in de app | Nodig zodra besloten |
| --- | --- | --- |
| **P1** alleen identiteit duurzaam | inhoud bewaard (ontwikkelmodus) | sync-module: inhoud alleen in het paginageheugen; app toont "inhoud niet bewaard, voer opnieuw in" (bestaat al voor privé-afspraken: `OnbevestigdVenster`, staat `zonder-inhoud`); API-uitbreiding om een bestaande identiteit opnieuw in te voeren bij taken en boodschappen |
| **P2** uitloggen wist na waarschuwing | uitloggen wist niets; Meer zegt dat het een open besluit is | `Sessie.uitloggen()` is het enige punt: daar een waarschuwing met het aantal onbevestigde opdrachten, keuze "eerst laten nakijken" of "wissen", en daarna `vergeten` voor alle opdrachten van dat account |
| **P3** demo blijft | demo-modus ongewijzigd en gemarkeerd; lokale modus gemarkeerd "Lokaal" | niets |
| **P4** geen automatisch wissen | er wordt niets automatisch gewist; Meer toont ook oudere opdrachten op dit toestel | als het voorstel wordt aangenomen: zo laten |
| **P5** bewaartermijn serverregister | geen opruiming | een onderhoudstaak op de server (geen app-wijziging) |

## 7. Productkompas-toets

1. **Principes:** samen één beeld van het huishouden; rust (geen extra meldingen, één statusregel);
   privacy (bezet zonder details, door de server afgedwongen); betrouwbaarheid (niets stil overschreven
   of dubbel).
2. **Werk weg:** ja; wat de een invoert hoeft de ander niet te horen of over te typen.
3. **Organiseren, onthouden, uitvoeren:** alle drie (agenda, taken, boodschappen).
4. **Eenvoudiger:** geen extra bibliotheken behalve de Supabase-client; geen nieuwe schermen behalve een
   testinlogpagina; de schermen uit PR #20 zijn hergebruikt.
5. **Aandacht, controle, privacy:** waarschuwingen alleen bij conflict of onzekerheid; herstel is een
   keuze van de gebruiker; P1–P5 bewust open.
6. **Bewijs:** nog hypothese; alleen fictieve gegevens. Het echte bewijs volgt pas met echt gebruik.
7. **Ultieme toets:** ja; het gezin hoeft elkaar niet meer bij te praten over wat er is ingevoerd.

**Gates:** gate 9 (privacy in RLS) is gehaald voor deze domeinen in KG-5C en wordt hier niet
veranderd. Staging (KG-5J, besluit B2) en de echte inlogpagina's (KG-5H, na akkoord) zijn **niet**
gedaan. Afwijking van het bouwplan: KG-5E (mappen herindelen, opslag-interface, router) is niet als
aparte stap gedaan; de koppeling loopt via de bestaande `useApp()`-interface met een tweede
implementatie. Dat houdt deze stap klein; de herindeling kan later nog.

## 8. Bekende beperkingen (voor de review)

- Verwijderen gebruikt de versie op het moment van verwijderen, niet die bij het openen van het venster:
  een gelijktijdige wijziging door de ander wordt dan mee verwijderd (aanpassen is wel beschermd).
- Afvinken van een taak zet altijd `done_on` op de datum van het toestel (UTC-datum uit de sync-module).
- Kinderen kunnen geen account hebben; uitnodigen gebeurt alleen in het seed-script.
- Bij meerdere huishoudens per account kiest de app het eerste.
- Op een telefoon via `lokaal:lan` is het verkeer onversleuteld HTTP in het eigen netwerk; alleen
  fictieve gegevens. De database van de lokale stack luistert ook op het netwerk (firewall, §2a).
- De wifi-route is aangetoond met een aparte netwerkhost op dezelfde machine, niet met echte telefoons
  en echt wifi (client-isolatie, firewall en mobiele browsers zijn dus nog niet getoetst).
- Meerdaagse afspraken worden behouden, maar het venster toont de einddatum niet en kan hem niet wijzigen;
  de agenda toont zo'n afspraak alleen op de eerste dag (zoals in PR #20).
- Geen offline-wachtrij: zonder verbinding wordt niets verstuurd (de sync-module meldt dat).
- De demo-bundel (ook het losse bestand) bevat nu de Supabase-client, ongeveer een verdubbeling van de
  grootte. In de demo-modus wordt die niet gebruikt; de demo-e2e controleert dat er geen enkele externe
  aanvraag gebeurt. Een aparte bundel per modus (dynamisch laden) kan later.
