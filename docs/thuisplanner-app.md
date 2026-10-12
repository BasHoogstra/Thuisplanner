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

```sh
cd komtgoed && supabase start          # lokale stack (eenmalig per sessie)
cd app && npm ci
npm run lokaal:seed                     # gezin De Boer opnieuw klaarzetten (mag vaker)
npm run lokaal                          # http://127.0.0.1:5180
```

- **Op één computer:** open de app in twee tabbladen (of twee browsers). Kies in het ene "Inloggen als
  Eva", in het andere "Inloggen als Thomas". De inlogsessie hoort bij het tabblad (`sessionStorage`).
- **Op twee telefoons (zelfde wifi):** `npm run lokaal:lan`. Het script toont het adres
  (`http://<lan-ip>:5180/`); de app praat dan met Supabase op `http://<lan-ip>:<api-poort>`. Eva op de
  ene telefoon, Thomas op de andere. Sta in de firewall van de computer de poorten 5180 en de API-poort
  van de stack toe (zie `supabase status`). Alleen op een vertrouwd thuisnetwerk.
- Accounts: `eva.demo@test.invalid` en `thomas.demo@test.invalid`, lokaal wachtwoord
  `lokaal-alleen-fictief` (staat vooringevuld). Kinderen Lotte en Daan zijn leden zonder account.

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
| Integratie (lokale stack) | `komtgoed/supabase/tests/integratie/react.test.mjs` | uitzonderingen over meerdere pagina's bij beide accounts, voorkomen wijzigen en verwijderen, taak bijwerken met conflict |
| E2E, twee accounts | `komtgoed/app/e2e-lokaal/sync.spec.ts` (`npm run e2e:lokaal`) | privé "Bezet"; afspraak toevoegen/aanpassen/één voorkomen verwijderen; taak toevoegen en afvinken; boodschappen toevoegen, afvinken, geen dubbele; versieconflict; onbevestigd (aangekomen / niet aangekomen / na herladen / vergeten / keuze bij mogelijk dubbel); schermwissels en uitloggen |
| Bestaand | demo-e2e (138), unit, sync- en herstelintegratie, RLS-matrix, Huisplan | ongewijzigd groen |

CI: de lokale e2e draait in de job `supabase-lokaal` van `.github/workflows/komtgoed-db.yml`.

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
  fictieve gegevens.
- Geen offline-wachtrij: zonder verbinding wordt niets verstuurd (de sync-module meldt dat).
- De demo-bundel (ook het losse bestand) bevat nu de Supabase-client, ongeveer een verdubbeling van de
  grootte. In de demo-modus wordt die niet gebruikt; de demo-e2e controleert dat er geen enkele externe
  aanvraag gebeurt. Een aparte bundel per modus (dynamisch laden) kan later.
