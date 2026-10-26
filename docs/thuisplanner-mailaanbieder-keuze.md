# Thuisplanner: keuze van de mailaanbieder en het domein (B6, D1, D2), en de kosten van Supabase

**Status:** 📝 ter bespreking (18 oktober 2026). Nagegaan in de documentatie en op de prijspagina's van de aanbieders en
van Supabase. Niets besteld, gebouwd of online gewijzigd.

**Legenda:**
- ✅ = bevestigd in de officiële documentatie van de aanbieder;
- ⚠️ = alleen in andere bronnen, tegenstrijdig, of nog te meten;
- ❌ = ontbreekt of voldoet niet.

## 1. Eisen (uit het ontwerp)

1. Snelle en betrouwbare aflevering van inlogcodes. Het acceptatiecriterium van deel 2 is het hele pad binnen ongeveer
   2 minuten.
2. Een HTTP-API met goede documentatie. Supabase blokkeert uitgaande SMTP via de poorten 25 en 587.
3. Een aantoonbare idempotentiesleutel. Zonder die sleutel blijft een verloren antwoord "onzeker" (zie W3).
4. Ondertekende webhooks voor bezorging en bounces: alleen een ondertekende melding mag "bezorgd" of "niet bezorgd"
   zetten.
5. Gegevensverwerking in de EU, een verwerkersovereenkomst (art. 28 AVG) en een Europese onderneming.
6. Gratis beginnen, en betaalbaar groeien.
7. Geschikt voor inlogcodes én uitnodigingsmails.

## 2. Vergelijking

| Eis | **Lettermint** (Nederland) | **Scaleway Transactional Email** (Frankrijk) | **Brevo** (Frankrijk) |
| --- | --- | --- | --- |
| HTTP-API | ✅ `POST /v1/send`, SDK's; volwassen documentatie | ✅ REST-API, maar met versie **v1alpha1** (⚠️ alfa) | ✅ `POST /v3/smtp/email`, uitgebreide documentatie |
| Idempotentie | ✅ `Idempotency-Key`, 24 uur per project. Dezelfde sleutel en dezelfde inhoud geven het oorspronkelijke antwoord met **hetzelfde `message_id`**, zonder tweede mail. Een andere inhoud geeft 409. Een eerste poging met onbekende uitkomst (5xx) geeft 409 tot het verloopt | ❌ niet gevonden in de API, de CLI of de SDK (⚠️ te bevestigen bij Scaleway). Zonder sleutel: een verloren antwoord blijft "onzeker" | ⚠️ `idempotencyKey` (UUID) in de body, 30 minuten. Een dubbel verzoek geeft een **fout** (`duplicate_parameter`) in plaats van het oorspronkelijke bericht-id. De documentatie gaat over batch-verzending; of het ook voor één mail geldt, staat er niet eenduidig |
| Ondertekende webhooks | ✅ HMAC-SHA256 over `tijd.body` (zoals Stripe en Svix), geheim `whsec_…`, 5 minuten tegen herhaling, herhaalpogingen met een vaste envelop-id | ✅ via Topics and Events (op de manier van SNS): een ondertekend bericht met certificaat (`Signature`, `SigningCertURL`). Het controleren is ingewikkelder. Op Essential één webhook per domein. Gebeurtenissen: delivered, dropped, deferred, spam, blocklisted | ❌ **geen handtekening**: alleen een wachtwoord in de URL, een bearer-token, eigen headers of een IP-lijst |
| Gebeurtenissen voor bezorging en bounce | ✅ delivered, hard en soft bounce, failed, spamklacht, suppressed, policy_rejected | ✅ (zie boven) | ✅ (maar niet ondertekend) |
| EU en AVG | ✅ verwerkersovereenkomst onder art. 28 AVG, automatisch van toepassing. ✅ Infrastructuur in de EU (OVH in Frankrijk en Duitsland; ⚠️ de lijsten van subverwerkers verschillen per versie: ook UpCloud, Stripe, PostHog, Mistral). Lettermint B.V., Nederland | ✅ Europese onderneming en datacenters in Frankrijk (⚠️ de verwerkersovereenkomst zelf niet gelezen) | ✅ volgens hun verwerkersovereenkomst hosting op Google Cloud in België (en OVH in Frankrijk), met DPF en SCC als waarborg voor een Amerikaanse subverwerker |
| Gratis begin | 300 mails per maand | 300 mails per maand (⚠️ nieuwe accounts hebben een quotum: 500 per maand met een betaalmiddel, 5.000 na identiteitscontrole) | 300 mails per **dag** |
| Bij groei | €10 per maand voor 10.000 (Starter), daarna €1,10 tot €1,50 per 1.000. €40 per maand voor 50.000 | €0,25 per 1.000, zonder maandbedrag (Essential). €80 per maand voor 100.000 met een eigen IP-adres (Scale) | Betaalde plannen per volume (⚠️ de bronnen spreken elkaar tegen; officieel bevestigen) |
| Aflevering van codes | ⚠️ te meten (S1). Jong bedrijf, sinds mei 2025 live (volgens een casestudy) | ⚠️ te meten; reputatiescore per domein, een domein wordt geblokkeerd onder 50 | ⚠️ te meten; groot en gevestigd, maar vooral een marketingplatform |
| Codes en uitnodigingen | ✅ beide transactioneel | ✅ | ✅ (transactioneel en marketing apart) |
| Risico | Een jonge, kleine aanbieder | Een alfa-API; geen idempotentie | Geen ondertekende webhooks; een idempotentie die niet past bij "aangenomen of onzeker" |

## 3. Voorkeur: Lettermint

Lettermint is de enige van de drie die alle harde eisen in de **eigen, officiële documentatie** bevestigt.

1. **Idempotentie zoals ons ontwerp die nodig heeft.** De sleutel geldt 24 uur, ruim langer dan ons schema van 1, 4 en
   9 minuten. Een herhaling geeft hetzelfde `message_id`, zodat de bezorgmelding later aan de goede mail hangt. Dit is
   precies de eigenschap die nodig is om een verloren antwoord veilig opnieuw te proberen (W3).
2. **Ondertekende webhooks** volgens een bekend schema, met bescherming tegen herhaling. Dat past op de adapter
   (`bezorging(req, body)`).
3. **Een Nederlandse onderneming, verwerking in de EU, en een verwerkersovereenkomst die automatisch geldt.**
4. **Gratis beginnen** (300 per maand is genoeg voor staging en een kleine bèta: een code is alleen nodig bij het
   inloggen, en sessies blijven lang). Daarna €10 per maand voor 10.000 mails.

**Wat bij Lettermint nog gecontroleerd moet worden (vóór een definitieve keuze):**
- de **aflevering**: de aankomsttijd van codes bij Gmail, Outlook, iCloud en KPN/Ziggo, en de spamscore (meting S1 met
  een eigen domein);
- of de **idempotentie** echt doet wat er staat. Lokaal is dat na te spelen tegen de echte API met een testdomein en
  een eigen adres, maar dat is een online stap en vraagt een apart akkoord. Pas daarna mag de adapter zich
  "idempotent" noemen;
- de **actuele lijst van subverwerkers** en het juiste bedrijf (B.V. of V.O.F.);
- de **continuïteit**: een jonge aanbieder. Onze koppeling is verwisselbaar (W4), dus overstappen is een nieuwe adapter.

**Reserve: Scaleway TEM.** Europees, goedkoop, met ondertekende meldingen. Zonder idempotentie blijft een verloren
antwoord "onzeker", wat veilig is maar minder prettig. Brevo valt af, omdat de webhooks niet ondertekend zijn.

## 4. Domein (D1)

- Een eigen domein is nodig voor SPF, DKIM en DMARC; zonder dat geen betrouwbare aflevering.
- Advies: verstuur vanaf een subdomein (bijvoorbeeld `mail.<domein>`), zodat de reputatie van het hoofddomein los blijft.
- Een afzender als `noreply@mail.<domein>`, en een DMARC-beleid dat oploopt van `p=none` (meten) naar `quarantine`.
- Keuze en kosten van het domein: nog niet onderzocht (een `.nl`-domein kost meestal een paar euro per jaar; ⚠️ te
  controleren bij de registrar).
- Staging en bèta krijgen elk een eigen afzender of subdomein, zodat een fout in staging de reputatie van de bèta niet
  raakt.

## 5. Supabase: actuele kosten voor staging, bèta en productie

Bron: supabase.com/pricing en de factureringsdocumentatie (18 oktober 2026).

| | Gratis | Pro |
| --- | --- | --- |
| Prijs | $0 | $25 per maand per organisatie, met $10 rekentegoed (genoeg voor één Micro-project) |
| Projecten | **2 actieve gratis projecten per persoon** (over alle organisaties waar je eigenaar of beheerder bent; gepauzeerde tellen niet mee) | Elk project betaalt zijn eigen rekenkracht: Micro $10 per maand, Small $15 per maand |
| Pauzeren | Na 1 week inactiviteit | Nooit |
| Database | 500 MB | 8 GB per project |
| Egress | 5 GB | 250 GB, daarna $0,09 per GB |
| Gebruikers (MAU) | 50.000 | 100.000 |
| Edge Functions | 500.000 aanroepen | 2 miljoen, daarna $2 per miljoen |
| Back-ups | Geen | Dagelijks, 7 dagen bewaard |
| Logboeken | 1 dag | 7 dagen |
| Bestedingslimiet | – | Standaard aan |

**Belangrijke regels:**
- Gratis en betaalde projecten kunnen **niet in één organisatie**.
- Het gratis maximum van twee is **per persoon**: ook de Huisplan-projecten waarvan je eigenaar of beheerder bent, tellen
  mee. ⚠️ Te controleren: hoeveel actieve gratis projecten je nu hebt.

**Opties:**

| Opzet | Kosten per maand | Voor | Tegen |
| --- | --- | --- | --- |
| A. Staging en bèta gratis (organisatie 1); productie later op Pro (organisatie 2) | $0 nu; **$25** met productie | Goedkoopst | Staging en bèta pauzeren na een week rust (bèta: H19). Geen back-ups op gratis. Kan alleen als er geen Huisplan-project een gratis plek bezet |
| B. Alles in één Pro-organisatie (staging, bèta, productie, elk Micro) | **$45** ($25 + 3 × $10 − $10) | Niets pauzeert; dagelijkse back-ups overal; één organisatie | Ook staging kost geld |
| C. Staging gratis; bèta en productie samen op Pro | $0 nu; **$35** zodra de bèta op Pro gaat (en blijft na productie) | De bèta pauzeert niet en heeft back-ups (echte gegevens van testers) | Twee organisaties |

**Advies:** begin met **A** voor staging, en zet de bèta op Pro zodra er echte testers met echte gegevens komen
(**C**, $35 per maand). Een bèta met echte gezinsgegevens hoort dagelijkse back-ups te hebben en mag niet stilvallen.
Controleer eerst of je met de Huisplan-projecten al aan de twee gratis plaatsen zit.

## 6. Bronnen

- **Lettermint:**
  - [idempotentie](https://lettermint.co/docs/platform/emails/idempotency);
  - [ondertekening van webhooks](https://lettermint.co/docs/platform/webhooks/signing);
  - [gebeurtenissen](https://lettermint.co/docs/platform/webhooks/events);
  - [prijzen](https://lettermint.co/pricing);
  - [verwerkersovereenkomst](https://lettermint.co/dpa);
  - [subverwerkers](https://lettermint.co/subprocessors);
  - [trust](https://trust.lettermint.co);
  - [casestudy Postmastery](https://www.postmastery.com/lettermint-builds-scalable-european-email-infrastructure-with-kumomta-and-postmastery-console/).
- **Scaleway:**
  - [TEM](https://www.scaleway.com/en/transactional-email-tem/);
  - [prijzen](https://www.scaleway.com/en/pricing/managed-services/);
  - [webhooks (API)](https://www.scaleway.com/en/developers/api/transactional-email/webhooks);
  - [Topics and Events](https://www.scaleway.com/en/docs/topics-and-events/api-cli/python-node-topics-events/);
  - [grenzen](https://www.scaleway.com/en/docs/transactional-email/reference-content/tem-capabilities-and-limits/);
  - [quota](https://www.scaleway.com/en/docs/organizations-and-projects/additional-content/organization-quotas/).
- **Brevo:**
  - [idempotentie](https://developers.brevo.com/docs/heterogenous-versions-batch-emails);
  - [beveiliging van webhooks](https://developers.brevo.com/docs/username-and-password-authentication);
  - [plaats van de gegevens](https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location);
  - [voorwaarden en verwerkersovereenkomst](https://www.brevo.com/legal/termsofuse/).
- **Supabase:**
  - [prijzen](https://supabase.com/pricing);
  - [facturering](https://supabase.com/docs/guides/platform/billing-on-supabase).
