# Thuisplanner D6: betrouwbare automatische verzending van uitnodigingsmails (voorstel)

**Status:** 📝 voorstel ter beoordeling (17 oktober 2026). Niets gebouwd, niets online gewijzigd.

**Aanleiding:** in deel 2 verstuurt de app een wachtende mail pas als een beheerder het huishouden opent
(`docs/thuisplanner-deel2-bouwverslag.md` §2, afwijking 3). Dat is geen definitieve oplossing: een mail die door een
storing blijft wachten, kan dan uren of dagen blijven liggen.

**Wat blijft zoals het is** (gebouwd en getest in deel 2):
- de wachtrij `private.uitnodigingsmails`, in dezelfde transactie als `create_invite`;
- de toestanden `wacht`, `bezig`, `verstuurd`, `onzeker`, `mislukt`, `niet_bezorgd`, `vervallen` en `daglimiet`;
- de grenzen: hoogstens 3 per uitnodiging, één per 10 minuten, 20 per huishouden per dag;
- de status bij de uitnodiger;
- de mail zonder token.

Alleen het moment en de manier van versturen veranderen.

## 1. Doel en eisen

| # | Eis |
| --- | --- |
| E1 | Een nieuwe uitnodigingsmail gaat binnen ongeveer een minuut weg, zonder dat iemand de app open hoeft te hebben |
| E2 | Een tijdelijke storing (aanbieder, netwerk, Edge Function) wordt vanzelf opnieuw geprobeerd, met een oplopende wachttijd en een maximum |
| E3 | Nooit twee mails voor één rij. Een onzekere uitkomst wordt alleen opnieuw geprobeerd als de aanbieder een idempotentiesleutel ondersteunt (dezelfde sleutel = hoogstens één mail) |
| E4 | Alleen de database zelf kan de verzending in bulk starten. Geen gebruiker, geen anon-sleutel en geen geraden URL |
| E5 | Een storing blijft niet onopgemerkt: de nacontrole en een dagelijkse telling tonen wachtende, onzekere en mislukte mails (alleen aantallen, nooit adressen) |
| E6 | Alles staat in migraties en is per omgeving (lokaal, staging, bèta, productie) hetzelfde. Per omgeving verschillen alleen het geheim en de URL, en die staan nooit in de repository |
| E7 | Alleen gratis onderdelen die al in het Supabase-project zitten |

## 2. Afgewogen opties

| Optie | Hoe | Voor | Tegen |
| --- | --- | --- | --- |
| **A. pg_cron + pg_net + Vault (aanbevolen)** | Een trigger en een geplande taak in de database roepen de Edge Function aan via `pg_net`. Het geheim en de URL staan in Vault | Alles in het eigen project en in migraties; een verzoek gaat alleen weg als de transactie slaagt; gratis | Twee extensies erbij (`pg_net`, `supabase_vault`); het geheim moet per omgeving één keer met de hand in Vault |
| B. Database Webhooks van Supabase | Dezelfde techniek (`pg_net`), ingesteld in het dashboard | Weinig code | Instelling buiten de migraties, dus niet te reviewen of te testen per omgeving; geen herhaling bij een storing |
| C. Externe planner (een Cloudflare Worker met een cron-trigger, of GitHub Actions) | Elke minuut een aanroep van buiten | Geen extensie in de database | Een extra dienst met een eigen geheim, buiten het project; GitHub Actions is niet op de minuut betrouwbaar |
| D. Zoals nu (de app stuurt aan) | – | Al gebouwd | Voldoet niet aan E1 en E2 |

**Advies: optie A.** De wachtrij en de toestand blijven de bron van waarheid. `pg_net` is alleen het seintje "er is
werk"; gaat een seintje verloren, dan pakt de volgende ronde van de geplande taak het op.

## 3. Ontwerp (optie A)

### 3.1 Twee wegen naar dezelfde functie

1. **Direct:** een trigger `after insert` op `private.uitnodigingsmails` zet met `net.http_post` één verzoek klaar
   naar `stuur-uitnodiging`.
   - `pg_net` verstuurt pas na de commit. Een teruggedraaide uitnodiging geeft dus geen verzoek.
   - De gebruiker wacht er niet op: het verzoek loopt via een achtergrondproces.
2. **Vangnet:** een geplande taak `thuisplanner-uitnodigingsmails-versturen`, elke minuut.
   - In SQL wordt eerst gekeken of er werk is:
     - een rij `wacht` met `volgende <= now()`;
     - een rij `bezig` die over zijn termijn is.
   - Alleen dan volgt een aanroep. Zo kost het vangnet bijna geen Edge Function-aanroepen (gratis tegoed: 500.000 per
     maand; elke minuut aanroepen zou er 43.200 kosten).

### 3.2 De wachtrijmodus van de Edge Function

`stuur-uitnodiging` krijgt naast de bestaande gebruikersmodus een **wachtrijmodus**:
- Alleen met de kop `X-Thuisplanner-Wachtrij: <geheim>`, in constante tijd vergeleken met het functiegeheim
  `WACHTRIJ_GEHEIM`. Zonder of met een fout geheim: 401, en er gebeurt niets.
- Pakt rijen van alle huishoudens (`uitnodigingsmail_pak(null, 10)`), in porties van 10. Stopt na 20 seconden, ruim
  binnen de grens van de Edge Function. Wat overblijft, pakt de volgende ronde op.
- Het geheim en de URL staan in Vault (`thuisplanner_wachtrij_geheim`, `thuisplanner_wachtrij_url`). Een
  `security definer`-functie in `private` leest ze. Ontbreekt er een, dan doet de trigger niets en meldt de nacontrole
  "wachtrij niet ingesteld". Er verdwijnt geen mail: de rij blijft `wacht`.

De gebruikersmodus blijft voor "Mail nog eens sturen", maar de app hoeft niet meer zelf te versturen bij het openen. Die
aanroep vervalt.

### 3.3 Foutafhandeling

| Situatie | Toestand daarna | Wat er gebeurt |
| --- | --- | --- |
| Aanbieder neemt aan | `verstuurd` (met bericht-id) | Klaar; een bounce maakt er later `niet_bezorgd` van |
| Aanbieder weigert tijdelijk (5xx, 429) | `wacht`, `volgende` na 1, 4 en daarna 9 minuten | Bij 429 telt de wachttijd van de aanbieder (`Retry-After`) als die langer is. Na de 3e poging `mislukt` |
| Aanbieder weigert definitief (4xx, ongeldig adres) | `mislukt` | De uitnodiger ziet "controleer het adres"; de link delen blijft |
| Time-out, of de verbinding valt weg na het versturen | `onzeker` | **Met** een idempotente aanbieder: nog één poging met dezelfde sleutel (de aanbieder voorkomt een tweede mail). **Zonder**: niet opnieuw; de uitnodiger ziet "misschien niet aangekomen" en kan "Mail nog eens sturen" |
| De functie stopt halverwege (de rij blijft `bezig`) | na 2 minuten `onzeker` | Zoals hierboven |
| De Edge Function is niet bereikbaar, of `pg_net` faalt | blijft `wacht` | De volgende ronde (binnen een minuut) probeert opnieuw; de wachtrij verandert niet |
| De uitnodiging is intussen gesloten of verlopen | `vervallen` | Geen mail |
| Daglimiet bereikt | `daglimiet` | Geen mail; de uitnodiging blijft geldig |
| Vault niet ingesteld | blijft `wacht` | De nacontrole slaat alarm |

**Bij de keuze van de aanbieder (B6) telt daarom mee:**
- of hij een idempotentiesleutel ondersteunt;
- of hij een bounce-webhook met ondertekening heeft.

Zonder idempotentie blijft "onzeker" een handmatige stap voor de uitnodiger, en dat is veilig.

### 3.4 Bewaking (E5)

- **Een dagelijkse telling** (zonder adressen): hoeveel mails er wachten (ouder dan 10 minuten), onzeker zijn, mislukten
  en niet bezorgd werden.
- **De nacontrole** (`verbinding-controle.mjs na`) krijgt erbij:
  - de geplande taak;
  - de trigger;
  - of `pg_net` aan staat;
  - of Vault de twee namen kent (alleen het bestaan; de waarde wordt nooit gelezen);
  - of er rijen langer dan 10 minuten op `wacht` staan. Dan draait de verzending niet.
- **Later** (productie): een melding naar de beheerder van Thuisplanner als die telling oploopt. Dat is een eigen besluit.

### 3.5 Beveiliging

- Het wachtrijgeheim is iets anders dan de service-rolsleutel. Het geeft alleen het recht om de wachtrij te laten
  verwerken. De tekst van de mail ligt vast en het adres komt uit de database; een aanvaller met het geheim kan dus niets
  anders versturen dan wat al in de wachtrij stond.
- Alleen `postgres` (de geplande taak en de trigger) leest Vault. `authenticated` en `anon` hebben geen rechten op de
  nieuwe functies; KG-T71 en de nacontrole controleren dat.
- `pg_net` krijgt geen verzoeken van gebruikers: alleen de `security definer`-functie in `private` roept het aan, met een
  URL uit Vault.

## 4. Tests (lokaal, vóór enige online stap)

| # | Test | Verwacht |
| --- | --- | --- |
| V1 | Uitnodiging op adres, niemand opent de app | Binnen een minuut precies één mail in Mailpit |
| V2 | De Edge Function is tijdelijk uit (container gestopt), daarna weer aan | De rij blijft `wacht` en gaat bij de eerste ronde daarna; één mail |
| V3 | De aanbieder geeft 3 keer een 503 (een nep-aanbieder in de test) | Pogingen na 1 en 4 minuten (in de test versneld), daarna `mislukt`; geen mail |
| V4 | Time-out na het versturen | `onzeker`; zonder idempotentie geen tweede mail; met (nep-aanbieder) precies één mail |
| V5 | Fout of ontbrekend wachtrijgeheim | 401; niets verwerkt |
| V6 | Vault leeg | Geen verzoek, rij blijft `wacht`; de nacontrole meldt het |
| V7 | 50 uitnodigingen tegelijk in een huishouden (daglimiet) en verspreid over huishoudens | Hoogstens 20 per huishouden; alle andere binnen enkele rondes; nooit dubbel |
| V8 | Teruggedraaide transactie met `create_invite` | Geen verzoek en geen mail |
| V9 | Tegenproeven | Elke regel (geheim, termijn, wachttijd, idempotentie) gesaboteerd en gevangen |

`pg_net` (0.20.4) en Vault (0.3.1) zitten in de lokale stack; alles hierboven is dus lokaal te bewijzen.

**Alleen gehost te toetsen:**
- `pg_net` naar de eigen Edge Function-URL van het project;
- de opstarttijd;
- de echte aanbieder (idempotentie, 429, bounce).

## 5. Wat er nodig is (later, elk met een eigen akkoord)

1. **Akkoord op dit voorstel**, en de keuze van de aanbieder met de criteria uit §3.3.
2. **Bouwen en lokaal testen**, als een nieuwe migratie (de 16e) met de wijziging in `stuur-uitnodiging` en de app.
3. **Per omgeving (staging, bèta)**, door jou:
   - `WACHTRIJ_GEHEIM` als functiegeheim;
   - de twee Vault-waarden via de SQL-editor (nooit in de repository of de chat);
   - daarna de nacontrole.
