# Thuisplanner D6: betrouwbare automatische verzending van uitnodigingsmails (voorstel)

**Status:** akkoord op 18 oktober 2026 (architectuur, limieten en wachttijden), en lokaal gebouwd en getest (§7 en het bouwverslag §8). Niets online gewijzigd.

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

## 6. Beschikbaarheid in de gehoste omgevingen: afhankelijkheden en kosten (nagegaan op 18 oktober 2026)

Bronnen: de documentatie van Supabase over pg_net, Cron, Vault, het plannen van Edge Functions, de grenzen van Edge
Functions, het pauzeren van gratis projecten en de facturering. De voorwaarden kunnen veranderen; controleer ze bij elke
nieuwe omgeving opnieuw (H-test H19 in het bouwverslag).

| Onderdeel | Beschikbaar | Wat het voor Thuisplanner betekent |
| --- | --- | --- |
| **pg_cron** (Supabase Cron) | Op het gehoste platform; dit is het patroon dat Supabase zelf aanraadt voor geplande Edge Functions. De documentatie noemt geen planbeperking | Hoogstens 8 taken tegelijk en elk hoogstens 10 minuten. Wij hebben vijf taken: één elke minuut (kort) en vier dagelijks |
| **pg_net** | Op het gehoste platform, als extensie in te schakelen; Database Webhooks van Supabase leunen er ook op | De API heet bij Supabase nog **bèta** (handtekeningen kunnen veranderen). Verzoeken gaan pas na de commit weg, betrouwbaar tot ongeveer 200 per seconde. De wachtrij en de antwoorden staan in niet-gelogde tabellen: weg bij een crash. Ons ontwerp vangt dat op met het vangnet; getest met een herstart van de database |
| **Vault** (supabase_vault) | Op het gehoste platform | Elk project heeft een eigen hoofdsleutel. Na een herstel met `pg_dump` in een **nieuw** project (zoals de H0-hersteltest) zijn de waarden niet meer te ontsleutelen. Zet de twee waarden dan opnieuw (aan het herstelprotocol toegevoegd) |
| **Edge Functions** | Alle plannen | **Gratis:** 500.000 aanroepen per maand, en 150 s wandkloktijd per aanroep (betaald 400 s). Per verzoek 2 s CPU. **Uitgaande SMTP (poorten 25 en 587) is geblokkeerd**: een mailaanbieder moet een HTTP-API hebben (de adapter is daarop gebouwd). Wij verwerken hoogstens 20 s per aanroep, op de achtergrond (`EdgeRuntime.waitUntil`) |

**Afhankelijkheden en risico's per omgeving**

1. **Gratis projecten worden gepauzeerd** na een week met weinig activiteit (Supabase stuurt eerst een waarschuwing).
   - Een gepauzeerd project verstuurt niets; ook de geplande taken staan dan stil.
   - Volgens een niet-officiële bron draaien de taken na het hervatten niet vanzelf weer. Dat moet bij de eerste
     hervatting gecontroleerd worden (H19); de nacontrole ziet een taak die niet actief is.
   - Het vangnet zelf telt waarschijnlijk niet als "activiteit": dat zijn gebruikersverzoeken.
   - **Staging** (intern): pauzeren is acceptabel.
   - **Bèta**: met actieve testers waarschijnlijk geen probleem, maar het blijft een risico.
   - **Productie**: een betaald abonnement is nodig; betaalde projecten worden niet gepauzeerd.
2. **Hoogstens twee actieve gratis projecten** per organisatie (gepauzeerde tellen niet mee). Met staging en de bèta
   is dat vol; **productie vraagt een betaald abonnement** (of het pauzeren van staging).
3. **De mailaanbieder** moet een HTTP-API hebben (geen SMTP), en voor veilig opnieuw proberen na een verloren antwoord:
   een **gedocumenteerde en bewezen** idempotentiesleutel. Voor "bezorgd" en "niet bezorgd" is een **ondertekende**
   webhook nodig.
4. **pg_net is bèta bij Supabase.** Bij een wijziging van de API faalt het seintje: de uitnodiging blijft geldig, de
   mail blijft wachten en de nacontrole slaat alarm ("wachten langer dan 10 minuten"). Er gaat niets verloren en niets
   dubbel, maar mails blijven liggen tot het hersteld is.

**Kosten**

| | Staging en bèta (gratis) | Productie (later) |
| --- | --- | --- |
| pg_cron, pg_net, Vault | Geen extra kosten | Geen extra kosten |
| Edge Function-aanroepen | Het vangnet roept alleen aan als er werk ligt; ongeveer één aanroep per uitnodiging plus enkele herhalingen. Ruim binnen 500.000 per maand | Inbegrepen in het betaalde plan tot de daar geldende grens, daarna per miljoen |
| Supabase-abonnement | Gratis (met pauzeren) | Een betaald abonnement (prijs op supabase.com/pricing, controleren bij het besluit) |
| Mailaanbieder | Gratis instap (keuze B6) | Afhankelijk van de aanbieder en het volume |

## 7. Gebouwd en lokaal bewezen (18 oktober 2026)

Gebouwd volgens §3, met deze uitwerkingen:

| # | Uitwerking | Waarom |
| --- | --- | --- |
| W1 | **Toestanden.** Wat eerst "verstuurd" heette, is nu **"aangenomen"**: de aanbieder nam de mail aan. Daarnaast **"bezorgd"** (met tijdstip) en **"niet bezorgd"**, alleen via een ondertekende melding van de aanbieder (`mail-bezorging`). Een latere bounce gaat voor; "bezorgd" maakt een bounce niet ongedaan. De uitnodiger ziet "Mail verstuurd om 14:02. Nog geen bevestiging dat hij is aangekomen.", "Mail bezorgd om 14:03." of "Mail niet bezorgd: controleer het adres." | Eis 3 van het akkoord |
| W2 | **Pogingen:** de eerste, en daarna hoogstens 3 nieuwe na 1, 4 en 9 minuten (4 in totaal), daarna "mislukt". Bij 429 telt de wachttijd van de aanbieder als die langer is (hoogstens een uur). Een 4xx is meteen "mislukt" | De akkoorde limieten |
| W3 | **Nooit dubbel zonder bewezen idempotentie.** In de database: een onzekere poging (verloren antwoord, of vastgelopen) gaat alleen terug naar "wacht" als de adapter zich als idempotent meldt. Mailpit en elke nieuwe aanbieder melden zich als **niet** idempotent, tot het bewezen is | Eis 4 |
| W4 | **De koppeling is verwisselbaar.** `functions/_gedeeld/aanbieder.ts` heeft één interface (versturen, idempotent ja of nee, bezorgmelding lezen). Er zijn twee adapters: `mailpit` (lokaal) en `test` (alleen voor de lokale tests, in twee soorten). Een echte aanbieder wordt een derde adapter, zonder wijziging aan de wachtrij | Eis 2 |
| W5 | **Geen gebruikersroute meer.** De app verstuurt niets meer; ze toont de stand en ververst elke 3 seconden zolang er een mail onderweg is (hoogstens 2 minuten). `uitnodigingsmail_verzoek` is weg. `stuur-uitnodiging` accepteert alleen het wachtrijgeheim uit Vault | Minder aanvalsoppervlak |
| W6 | **De functie antwoordt meteen (202)** en werkt op de achtergrond. Ze werkt hoogstens 20 seconden per aanroep, in porties van 10 | Een time-out van pg_net breekt de verwerking niet af |
| W7 | **Lokaal:** `k1-lokaal.mjs` maakt het wachtrijgeheim en `seed-lokaal.sql` (de twee Vault-waarden, gitignored). Binnen het Docker-netwerk is de functie bereikbaar via Kong. De testaanbieder draait op de API-poort + 7 en staat alleen aan met `private.instellingen.mail_testaanbieder`, en alleen met een lokale `TESTAANBIEDER_URL`. Online eist de nacontrole dat die instelling leeg is | Geen tijdelijke testroute online |
| W8 | **Bewaking.** De nacontrole kent de vijfde geplande taak, pg_net, de twee namen in Vault (nooit de waarden) en de stand van de wachtrij (alleen aantallen). Ze slaat alarm bij mails die langer dan 10 minuten wachten of vastzitten | Eis 5 |

De testresultaten staan in het bouwverslag, §8.

## 8. De Lettermint-koppeling (lokaal gebouwd, 18 oktober 2026)

Lettermint is de gekozen aanbieder (`docs/thuisplanner-mailaanbieder-keuze.md`). Het afzenderdomein
`mail.mijnthuisplanner.nl` is bij Lettermint geverifieerd: de vier DNS-records staan, en ook in de Cloudflare-zone, die
nog niet actief is. De koppeling is een adapter in `functions/_gedeeld/aanbieder.ts`, naast `mailpit` en `test`. Ze
geldt voor de codes (K1) en de uitnodigingsmails.

| Onderwerp | Hoe |
| --- | --- |
| Versturen | `POST https://api.lettermint.co/v1/send`, met `x-lettermint-token`. De body bevat `from`, `to[]`, `subject`, `text`, `html` en eventueel `route`. Antwoord `202 {message_id}`; dat `message_id` is het bericht-id voor de bezorgmeldingen |
| Idempotentiesleutel | Altijd de rij-id als `Idempotency-Key`. Lettermint bewaart die 24 uur; ons schema met nieuwe pogingen duurt hoogstens een kwartier |
| Idempotent? | **Nee, tot het bewezen is.** De adapter meldt zich pas als idempotent met `LETTERMINT_IDEMPOTENT_BEWEZEN=ja`. Tot dan blijft een verloren antwoord "onzeker" en volgt er geen nieuwe poging (W3) |
| 409 | **Onzeker, nooit opnieuw.** Lettermint geeft 409 als dezelfde sleutel al gebruikt is, nog loopt, of een onbekende uitkomst had. Dat is geen weigering |
| 429 en 5xx | Niet aangenomen, later opnieuw (met de wachttijd van Lettermint als die langer is) |
| Andere 4xx | Definitief niet aangenomen (mislukt) |
| Bezorgmeldingen | `POST …/functions/v1/mail-bezorging?aanbieder=lettermint`. De handtekening `X-Lettermint-Signature: t=…,v1=<hmac-sha256-hex>` gaat over `t.body`, met het webhookgeheim (`whsec_…`) letterlijk als sleutel. `X-Lettermint-Delivery` moet gelijk zijn aan `t`, en de melding mag hoogstens 5 minuten oud zijn. `message.delivered` geeft bezorgd. `message.hard_bounced`, `failed`, `suppressed` en `policy_rejected` geven niet bezorgd. Een tijdelijke bounce, een spamklacht, open- en klikmeldingen en testmeldingen worden bevestigd (200) maar veranderen niets |
| Alleen de echte API | `LETTERMINT_API_URL` mag alleen `https://api.lettermint.co` zijn, of in de lokale tests een adres op deze computer |
| Tests | `tests/functies/lettermint.test.mjs` (6 tests, tegen een nagebootste Lettermint op 127.0.0.1). Ze toetsen het verzoek, de fouten (409, 429, 5xx, 4xx, time-out), de regel "idempotent alleen na bewijs", en de handtekening (geldig, vervalst, ander geheim, te oud, afwijkende levertijd, ontbrekend). Een echte mail via Lettermint is **niet** verstuurd |

**Wat jij later per omgeving zet** (als functiegeheim in Supabase; nooit in de repository of de chat):
- `MAIL_ADAPTER=lettermint`;
- `LETTERMINT_TOKEN` (het API-token van het Lettermint-project);
- `LETTERMINT_WEBHOOK_GEHEIM` (het `whsec_…`-geheim van de webhook);
- `MAIL_AFZENDER` (zie `komtgoed/omgevingen.json`);
- eventueel `LETTERMINT_ROUTE`;
- `LETTERMINT_IDEMPOTENT_BEWEZEN=ja` pas na de online proef (H-test: twee keer hetzelfde verzoek met dezelfde sleutel
  geeft één mail en hetzelfde `message_id`).

In Lettermint stel je de webhook in op het adres van `mail-bezorging`, met de gebeurtenissen voor bezorging en bounces.
