# Agendakoppelingen: technisch onderzoek naar de routes per aanbieder en hoe de termijn korter kan

- **Status:** 📝 onderzoek ter beoordeling, 25 november 2026. Alleen onderzoek en documentatie. Er is geen code,
  migratie, commit, push, registratie, account of kostenpost gemaakt. De roadmap en het bètaplan zijn niet gewijzigd.
- **Opdracht:** zes routes onderzoeken (EventKit, Capacitor, CalDAV, commerciële aanbieders, Google-verificatie,
  Microsoft Graph) en concreet uitzoeken hoe de termijn tot ±april 2027 voor betrouwbare tweerichting korter kan.
- **Gelezen (in de verplichte volgorde):** `PRODUCT_PRINCIPLES.md`; `docs/productkompas-beslissingen.md` en
  `docs/roadmap.md` (stand `origin/thuisplanner-staging`, besluiten 1–19); daarna
  `thuisplanner-agenda-tweerichting-advies.md`, `thuisplanner-agenda-ontwerp-fase-a.md` (v3),
  `thuisplanner-agenda-integratie-advies.md` (vervallen ICS-route, als achtergrond) en
  `thuisplanner-personalisatie-beta-plan.md` (§2, §4–§7).
- **Uitgangspunt van de eigenaar:** de besloten bèta start op 14 december 2026 zonder agendakoppelingen. Betrouwbare
  tweerichting met Google, Outlook en Apple Agenda blijft het doel richting de publieke lancering. Een alleen-lezen
  ICS-koppeling is **geen** definitieve oplossing voor Apple Agenda.

Leeswijzer: §0 eerst gemeld · §1 in het kort · §2 vergelijkingstabel · §3–§8 de zes routes · §9 kosten bij 5, 100 en
1.000 huishoudens · §10 Productkompas-toets · §11 de aanbevolen route per aanbieder · §12 de termijn verkorten ·
§13 tijdlijn en werkpakketten · §14 risico's · §15 beslissingen · §16 samenvatting · bronnen.

Begrippen: **Apple Agenda** is de agenda-app op iPhone en Mac; **iCloud** is de aanbieder waar de afspraken van veel
iPhone-gebruikers staan. Een Google- of Exchange-agenda die in Apple Agenda staat, loopt via Google of Microsoft.

---

## 0. Eerst gemeld: botsingen met principes, besluiten en plannen

| # | Botsing | Waar | Voorstel |
| --- | --- | --- | --- |
| **K1** | Een native app (route 1 en 2) wijzigt het open beslispunt **"Eerst als web-app; app-winkels pas als pushmeldingen op iPhone een probleem blijken"** | roadmap, Beslispunten (4.10) | Een eigen besluit (**D3**). Het argument verandert: niet push, maar Apple Agenda is de reden voor een app |
| **K2** | Pushmeldingen op Android via Capacitor vragen **Firebase Cloud Messaging** (een Firebase-project en `google-services.json`). Voor Huisplan geldt "Firebase-configuratie alleen na apart, expliciet akkoord" (architectuurbesluit 7, bevestigd in besluit 11) | besluit 11 | Ook voor Thuisplanner als apart akkoord behandelen (**D6**). Voor iOS is Firebase **niet** nodig: Capacitor geeft het APNs-token rechtstreeks |
| **K3** | Het bètaplan noemt voor Apple "alleen ICS-uit" als enige verantwoorde route (§5.1, §5.2, D12). Dat botst met jouw keuze. Dit onderzoek vindt twee tweerichtingsroutes voor Apple zonder iCloud-wachtwoord (EventKit in een app, en Thuisplanner als CalDAV-server) | `thuisplanner-personalisatie-beta-plan.md` §5 | §5 van het bètaplan bijwerken na jouw besluit (**D2**). Niets wijzigen zonder akkoord |
| **K4** | Het bètaplan ontwerpt `push_devices` alleen voor webpush (`endpoint`, `p256dh`, `auth`). Een app gebruikt APNs- en FCM-tokens | bètaplan §2.2, §2.7 | Nu al een kolom `kanaal` (`webpush`, `apns`, `fcm`) en een generiek `token` meenemen in migratie M-a, zodat een app later geen herbouw vraagt (**D7**). Klein, geen extra externe partij |
| **K5** | **Bas werkt op Windows.** Een iOS-app bouwen en ondertekenen kan alleen met Xcode op macOS. Dat betekent een Mac, of een cloudbouwdienst (Xcode Cloud, Codemagic, GitHub Actions met macOS): een nieuwe externe partij | – | Eigen akkoord (**D5**). Xcode Cloud zit bij het Apple-lidmaatschap (25 rekenuren per maand) en voegt dus geen nieuwe partij toe |
| **K6** | Een app in de App Store en Google Play vraagt **echte, openbare uitgeversgegevens**. In de EU moet een handelaar (DSA) adres, telefoon en e-mail in de winkel tonen. Als particulier staat je eigen naam (en als handelaar je adres) openbaar | "nooit verzonnen bedrijfsgegevens" | Eerst beslissen onder welke naam Thuisplanner uitgeeft (eenmanszaak of rechtspersoon), vóór een inschrijving (**D4**). ⚠️ De precieze tonen-regels per winkel nakijken bij de inschrijving |
| **K7** | **Schrijven in externe agenda's** is een handeling met een groot gevolg (principe 5). Op het toestel geeft EventKit "volledige toegang" tot **alle** agenda's, ook werkagenda's | Productkompas, principe 5 en "Privacy volgt de situatie" | De gebruiker kiest per agenda wat meedoet; alleen gekozen agenda's gaan naar de server; verwijderen vraagt één bevestiging met de naam van de agenda (zoals X3 in het tweerichtingsadvies) |
| **K8** | Een **commerciële aanbieder** wordt een extra verwerker van afspraaktitels, ook van kinderen. Het tweerichtingsadvies (§8.5) koos daar al tegen | principe 10; AVG | Alleen als tussenstap na een AVG-beoordeling, een verwerkersovereenkomst en een kostenplafond (**D9**). Advies: niet doen (§7) |
| **K9** | Het ontwerp van fase A (v3) **wacht nog op goedkeuring**. Iedere route met tweerichting hangt ervan af | `thuisplanner-agenda-ontwerp-fase-a.md` | De goedkeuring vóór 5 januari is de goedkoopste versnelling die er is (**D1**) |

---

## 1. In het kort

1. **Google blijft de eerste koppeling**, maar de verificatie kan **los van de motor** worden aangevraagd. Met een
   klein, werkend OAuth-prototype op staging (de agenda "Thuisplanner" aanmaken, afspraken lezen en schrijven) kan de
   aanvraag half januari de deur uit in plaats van half maart. Dat haalt de verificatie van het kritieke pad. Winst:
   ±3–5 weken. Gezinnen met Google: **op zijn vroegst half tot eind maart 2027**.
2. **Voor Apple is er wel een verantwoorde tweerichtingsroute: een eigen app met EventKit.** Een app op het toestel kan
   afspraken lezen en schrijven in **alle** agenda's die in Apple Agenda staan (iCloud, Google, Exchange), zonder
   iCloud-wachtwoord, zonder Google-verificatie en zonder Microsoft-uitgeververificatie. De beperking: iOS laat een app
   niet betrouwbaar op de achtergrond draaien. Wijzigingen in Apple Agenda komen pas binnen als de app open gaat of iOS
   haar kort wekt. "Betrouwbaar" (niets dubbel, niets kwijt) is haalbaar; "binnen minuten" niet altijd.
3. **Capacitor is de verstandige verpakking**: de bestaande React-app blijft, met een native schil voor iOS en
   Android. De officiële agenda-plug-in is te beperkt voor tweerichting (geen herhalingen teruglezen, geen losse keren,
   geen wijzigingsseintje). Advies: een **eigen kleine native plug-in** (Swift en Kotlin), of na een prijscheck de
   betaalde Capawesome-plug-in. Bijkomend voordeel: pushmeldingen via APNs zijn op de iPhone betrouwbaarder dan webpush.
4. **CalDAV met een iCloud-app-wachtwoord: niet doen.** Dat wachtwoord geeft toegang tot mail, contacten en agenda
   van iCloud. **Thuisplanner als CalDAV-server** is wel interessant: Apple Agenda kan de agenda "Thuisplanner" dan
   zelf in beide richtingen synchroniseren, zonder app. Maar iCloud-afspraken komen zo niet in Thuisplanner. Dat maakt
   het een aanvulling of terugvaloptie, geen vervanging van EventKit.
5. **Commerciële aanbieders versnellen weinig en kosten veel.** Nylas is goedkoop bij weinig huishoudens, maar vraagt
   voor productie je eigen Google- en Microsoft-registratie (dus dezelfde verificatie). Cronofy gebruikt een eigen
   geverifieerde app (geen eigen Google-verificatie), maar begint bij $819 per maand (jaarcontract). Beide worden extra
   verwerker. Advies: niet als tussenstap.
6. **Outlook:** persoonlijke accounts (outlook.com, hotmail) kunnen koppelen **zonder** uitgeververificatie (met de
   melding "niet-geverifieerd"), werkaccounts vaak niet. Een Entra-tenant is nodig (gratis). Uitgeververificatie vraagt
   een lidmaatschap van het Microsoft-partnerprogramma met echte bedrijfsgegevens. Persoonlijke Outlook-gezinnen:
   **op zijn vroegst april 2027**.

---

## 2. Vergelijkingstabel

| Route | Wat het oplost | Tweerichting | Externe goedkeuring | Doorlooptijd (bouw, Claude) | Kosten eenmalig | Kosten per maand (5 / 100 / 1.000 huishoudens) | Privacyrisico | Belangrijkste beperking |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Google direct (Calendar API)** | Google Agenda (ook als die in Apple Agenda of op Android staat) | Ja, volledig, op de server | Gevoelige-scopeverificatie (gratis; officieel ≤10 dagen, in de praktijk 2–12 weken) | A+B+C+D ±32–45 d (incl. A v3) | €0 | €0 / €0 / €0 (Supabase-rekentijd valt binnen Pro) | Laag: smalste scopes, tokens versleuteld | De verificatie |
| **Microsoft Graph direct** | Outlook.com, Microsoft 365 | Ja, volledig, op de server | Entra-app; uitgeververificatie voor werkaccounts | E: 6–9 d (na B) | €0 (⚠️ mogelijk creditcard voor een Azure-account) | €0 / €0 / €0 | Middel: `Calendars.ReadWrite` is breder | Werkaccounts geblokkeerd zonder verificatie |
| **Native app met EventKit (iOS)** | **iCloud** en alles wat in Apple Agenda staat | Ja, via het toestel | App Store-review (of TestFlight-bètareview) | N1 + N2: ±19–28 d (na B) | Apple €99 per jaar; ⚠️ evt. een Mac | ±€8 / ±€8 / ±€8 (+ evt. bouwdienst) | Middel: volledige toegang tot alle agenda's op het toestel; alleen gekozen agenda's naar de server | Geen betrouwbare achtergrond; sync bij openen of als iOS de app wekt |
| **Native app met CalendarContract (Android)** | Alles wat in de Android-agenda staat (Google, Exchange) | Ja, via het toestel | Google Play-review; persoonlijk account: gesloten test met ≥12 testers, 14 dagen | +3–5 d bovenop N2 | Google Play $25 eenmalig | €0 | Middel | Overlapt met Google direct; dubbelingsrisico als beide aan staan |
| **Thuisplanner als CalDAV-server** | De agenda "Thuisplanner" in Apple Agenda (en Thunderbird, DAVx⁵) | Ja, voor de agenda "Thuisplanner" | Geen | K: 10–14 d (na B) | €0 | €0 / €0 / ±€10–30 | Laag tot middel: een eigen app-wachtwoord per toestel bij ons | iCloud-afspraken komen niet in Thuisplanner; Outlook en Google kennen geen CalDAV-account |
| **CalDAV naar iCloud met app-wachtwoord** | iCloud | Ja, op de server | Geen | 6–9 d | €0 | €0 | **Hoog**: wachtwoord geeft toegang tot mail, contacten en agenda | Botst met dataminimalisatie en "geen opgeslagen toegang" |
| **Nylas** | Google, Microsoft, iCloud (app-wachtwoord) | Ja | **Eigen** Google- en Microsoft-registratie nodig voor productie (⚠️ bevestigen) | adapter 5–8 d (na B) | €0 | $15 / ±$266 / ±$2.700 | Middel tot hoog: extra verwerker (VS-bedrijf), EU-regio in Londen | Versnelt de verificatie niet |
| **Cronofy** | Google, Microsoft, iCloud (app-wachtwoord) | Ja | Een korte controle door Cronofy; **geen eigen Google-verificatie** | adapter 5–8 d (na B) | €0 | $819 / $819 / ±$2.400 (jaarcontract) | Middel tot hoog: extra verwerker (VK), datacentrum in Duitsland mogelijk | Prijs en afhankelijkheid |
| **Unified.to / OneCal-API** | Meerdere aanbieders | Ja | Wisselend | adapter 5–8 d | €0 | Unified.to vanaf $750 / OneCal-API op aanvraag | Middel tot hoog | Prijs; OneCal-API heeft geen openbare prijs |

Werkdagen zijn ontwikkeldagen van Claude met tests, zonder wachttijd. Bedragen in dollars zijn de lijstprijzen van
november 2026 zonder btw.

---

## 3. Route 1: native iOS-integratie met EventKit

### 3.1 Wat een app kan lezen en schrijven
- **EventKit** geeft een app op het toestel toegang tot de agendadatabase van iOS. Daarin staan **alle accounts** die
  de gebruiker in Instellingen heeft toegevoegd: iCloud, Google (via CalDAV), Exchange en Microsoft 365 (via
  Exchange ActiveSync), CalDAV-accounts en abonnementsagenda's (alleen-lezen).
- Een app kan afspraken **lezen, maken, wijzigen en verwijderen** in iedere agenda die schrijfbaar is, inclusief
  herhalingsregels (`EKRecurrenceRule`: dagelijks, wekelijks met weekdagen, maandelijks, jaarlijks, interval, aantal
  of einddatum), losse keren ("alleen deze" of "deze en volgende"), hele dag, tijdzone per afspraak en de
  beschikbaarheid. iOS synchroniseert de wijziging daarna **zelf** met iCloud, Google of Exchange.
- Een app kan een **eigen agenda** aanmaken (bijvoorbeeld "Thuisplanner") in iCloud of lokaal.
- **Toestemmingen (sinds iOS 17):**
  - `NSCalendarsFullAccessUsageDescription`: volledige toegang, nodig om bestaande afspraken te lezen;
  - `NSCalendarsWriteOnlyAccessUsageDescription`: alleen toevoegen, zonder te kunnen lezen (niet genoeg voor
    tweerichting);
  - Apple raadt volledige toegang alleen aan als bestaande afspraken essentieel zijn voor de kern van de app. Voor
    tweerichting is dat zo.
  - Volledige toegang geldt voor **alle** agenda's op het toestel; iOS kent geen toestemming per agenda. De beperking
    tot gekozen agenda's moet Thuisplanner zelf afdwingen (K7).

### 3.2 Wat niet kan, of moeilijk is
- **Geen wijzigingslog.** EventKit kent geen "geef me wat er sinds token X veranderde". Er is alleen het seintje
  `EKEventStoreChanged` als de app draait. De app moet dus zelf vergelijken met de laatst bekende stand (een momentopname
  per afspraak met een hash), net als de driewegsvergelijking van de motor (fase B).
- **Identificatie.** `eventIdentifier` kan veranderen na een synchronisatie; `calendarItemExternalIdentifier` is
  stabieler maar is bij herhalende afspraken en bij sommige Exchange-accounts niet uniek. Afspraken die Thuisplanner zelf
  maakt, krijgen een markering (bijvoorbeeld in het veld `url`), zodat ze nooit als nieuwe afspraak worden ingelezen.
- **Achtergrond.** iOS laat een app niet op een vast ritme draaien:
  - `BGAppRefreshTask` wordt naar inzicht van iOS uitgevoerd, op basis van het gebruik van de app, en duurt kort;
  - een stille pushmelding (`content-available`) kan de app wekken, maar wordt beperkt in aantal en werkt niet als de
    gebruiker de app heeft weggeveegd;
  - de "Achtergrondvernieuwing" kan door de gebruiker of de energiebesparingsmodus uit staan.
  Gevolg: een wijziging in Apple Agenda komt binnen als de app open gaat of als iOS haar wekt; een wijziging uit
  Thuisplanner komt in Apple Agenda zodra het toestel de app opnieuw laat draaien. Bij een gezin dat de app dagelijks
  opent, is dat ruim voldoende. Voor "binnen minuten" is het niet te garanderen.
- **iOS zelf loopt achter** op Google en Exchange: Apple Agenda haalt die accounts op met een eigen interval. Een
  afspraak die op de computer in Google wordt gemaakt, staat dus niet direct in EventKit.
- **Meerdere toestellen per account** (iPhone en iPad) zien dezelfde iCloud-afspraken. De server moet één afspraak
  herkennen als die van twee toestellen komt (sleutel: account + externe identificatie + begin).

### 3.3 App Store-review
- Richtlijnen die ertoe doen: 5.1.1 (gegevensverzameling en de toelichting bij de toestemming), 5.1.1(v) (een account
  moet in de app te verwijderen zijn), 4.2 (minimale functionaliteit: een "verpakte website" wordt geweigerd; een app
  met agenda-integratie en native push is meer dan dat), het privacymanifest (`PrivacyInfo.xcprivacy`) en het
  privacylabel in App Store Connect.
- Inloggen met een e-mailcode is toegestaan; "Inloggen met Apple" is alleen verplicht als je andere inlogdiensten van
  derden aanbiedt (richtlijn 4.8).
- **TestFlight**: tot 100 interne testers zonder review; tot 10.000 externe testers na een korte bètareview. Een build
  is 90 dagen geldig. **Voor een besloten bèta is TestFlight genoeg**: geen volledige App Store-publicatie nodig.
- Doorlooptijd van een review: meestal 1–3 dagen; een afwijzing kost een ronde.

### 3.4 Apple Developer Program
- **$99 per jaar** (in de EU in euro's: ±€99, het precieze bedrag staat bij de inschrijving). Particulier of
  organisatie. Een organisatie vraagt een **D-U-N-S-nummer** (gratis, 5–30 dagen) en de bevoegdheid om te tekenen.
- De naam van het lidmaatschap staat als verkoper in de App Store (K6).
- Inbegrepen: 25 rekenuren Xcode Cloud per maand (om zonder eigen Mac te bouwen), TestFlight, APNs.

---

## 4. Route 2: Capacitor (de bestaande React-app verpakken)

### 4.1 Wat het is
Capacitor zet de bestaande webapp (Vite, React) in een native iOS- en Android-schil (WKWebView en Android WebView),
met plug-ins voor native functies. De code van Thuisplanner blijft één codebase; de PWA blijft bestaan naast de app.

### 4.2 Agenda-plug-ins

| Plug-in | Status | Herhaling | Losse keren | Wijzigingsseintje | Oordeel |
| --- | --- | --- | --- | --- | --- |
| `@capacitor/calendar` (officieel, v8) | Gratis, onderhouden door Ionic | Alleen schrijven (frequentie, interval, einde, aantal; **geen weekdagen**); de regel komt niet terug bij lezen | Nee; verwijderen met `id` verwijdert de hele reeks | Nee | Te beperkt voor tweerichting |
| Capawesome Calendar | Betaald (Insiders, prijs ⚠️ niet op de pagina); Capacitor ≥ 8 | Lezen én schrijven, met weekdagen | Ja (`THIS_EVENT`, `THIS_AND_FUTURE_EVENTS`) | Ja (`calendarChange`, zonder inhoud) | Bruikbaar; afhankelijkheid van één leverancier |
| `@ebarooni/capacitor-calendar` | Gemeenschap, open source | Gedeeltelijk | Beperkt | Nee | Niet voor tweerichting |
| **Eigen plug-in** (Swift + Kotlin) | Zelf onderhouden | Volledig, op maat van het herhalingscontract (fase A) | Ja | Ja | **Advies**: past precies op het neutrale formaat "AfspraakKern", geen leverancier, ±4–6 d extra |

### 4.3 Hoe het in de architectuur past
Het toestel wordt een **adapter** van de motor uit fase B, met één verschil: de adapter draait in de app in plaats van
in een Edge Function.

1. De app leest de gekozen agenda's via EventKit of CalendarContract, vergelijkt met de laatste momentopname en stuurt
   alleen de verschillen (in het neutrale formaat) via een RPC naar de server.
2. De server doet de driewegsvergelijking, net als bij Google, en zet uitgaande opdrachten voor dit toestel in de
   outbox.
3. De app haalt haar opdrachten op, voert ze uit in EventKit en bevestigt met de nieuwe identificatie.
4. Op een wijziging in Thuisplanner stuurt de server een stille push om de app te wekken (best effort).

Zo blijven grenzen, lusdetectie, conflicten, het logboek en de noodschakelaar op één plek.

### 4.4 Pushmeldingen: APNs en FCM in plaats van webpush
- **iOS:** `@capacitor/push-notifications` geeft het **APNs-token** rechtstreeks, zonder Firebase. De Edge Function
  `stuur-meldingen` kan APNs aanroepen met een ondertekende JWT (ES256, de `.p8`-sleutel van Apple). Dat lijkt op de
  VAPID-code die er al is. Native push op de iPhone werkt ook zonder "eerst op het beginscherm zetten" en is minder
  gevoelig voor ingetrokken abonnementen (risico R1 in het bètaplan).
- **Android:** vereist **FCM** met een Firebase-project (`google-services.json`). FCM is gratis, maar het is een nieuw
  project bij Google en botst met het Firebase-akkoord (K2).
- **Gevolgen voor het bètaplan:** `push_devices` krijgt `kanaal` en `token` (K4); `stuur-meldingen` krijgt per kanaal
  een verzender; de privacyregels (geen privé-inhoud in meldingen) blijven gelijk. Webpush blijft voor de PWA en de
  computer.

### 4.5 Gevolgen voor de PWA, de winkels en het onderhoud
- **PWA blijft**: de computer en Android zonder app blijven de webversie gebruiken. De app laadt dezelfde build
  (lokaal in de app, niet van de website, anders weigert Apple hem eerder onder 4.2).
- **Updates:** iedere nieuwe webversie vraagt een nieuwe app-build (of een "live update"-dienst; niet aanbevolen,
  dat is weer een externe partij). De **minimale app-versie** uit fase A (§8 van het ontwerp) wordt daardoor
  belangrijker: oude app-versies moeten veilig worden geweigerd.
- **Winkels:** Apple $99 per jaar; Google Play $25 eenmalig. Een **persoonlijk** Google Play-account (aangemaakt na
  13 november 2023) moet eerst een gesloten test met ten minste 12 testers gedurende 14 dagen draaien; een
  organisatie-account niet, maar vraagt een D-U-N-S-nummer.
- **Onderhoud:** jaarlijks een nieuwe iOS- en Android-versie (nieuwe toestemmingen, nieuwe SDK-eisen van Google Play
  ieder jaar in augustus), Capacitor-upgrades (±1 grote versie per jaar), certificaten en het privacylabel. Schatting:
  **±1–2 werkdagen per maand** plus de reviewrondes.
- **Bouwen zonder Mac** (K5): Xcode Cloud (inbegrepen), of Codemagic of GitHub Actions met macOS (nieuwe partij), of een
  Mac kopen.

---

## 5. Route 3: CalDAV

### 5.1 CalDAV naar iCloud met een app-specifiek wachtwoord
- Technisch werkt het (RFC 4791: ETags, `sync-collection`, `If-Match`), en Nylas en Cronofy doen het zo.
- Een app-specifiek wachtwoord vraagt twee-factor-authenticatie en geeft toegang tot **mail, contacten en agenda** van
  iCloud. Er is geen beperking tot alleen de agenda.
- Het wachtwoord moet bij ons (versleuteld) worden bewaard. Een lek is ernstig, ook al lezen we alleen de agenda.
- Botst met dataminimalisatie (AVG art. 5), met "geen opgeslagen toegang" en met "Privacy volgt de situatie".
- **Advies: niet doen.** Ook niet via een commerciële aanbieder: dan bewaart die het wachtwoord.

### 5.2 Thuisplanner als CalDAV-server
- De gebruiker voegt in iOS een account toe (Instellingen → Agenda → Accounts → Andere → CalDAV-account), of installeert
  een **configuratieprofiel** (`.mobileconfig`) dat Thuisplanner aanbiedt: één tik, geen handwerk.
- Apple Agenda synchroniseert dan zelf, in beide richtingen, met de agenda "Thuisplanner": toevoegen, wijzigen en
  verwijderen in Apple Agenda komt in Thuisplanner, en andersom. Ook op de Mac, in Thunderbird en op Android met
  DAVx⁵ (betaalde app).
- **Wat het niet doet:** de eigen iCloud-afspraken van de gebruiker komen niet in Thuisplanner. Het is dus de Apple-versie
  van de agenda "Thuisplanner" uit het Google-ontwerp (§4.2 van het tweerichtingsadvies), niet meer.
- **Beveiliging:** inloggen gebeurt met Basic-authenticatie. Dat vraagt een **eigen app-wachtwoord per toestel**
  (≥128 bit, alleen als hash bewaard, direct in te trekken, met de rechten van dat account), via HTTPS. Een uitzondering
  op de toegangspoort (geen e-mailcode, wel een geheim) en, op staging, op Cloudflare Access. Privé-afspraken van anderen
  gaan er nooit in; "Bezet" alleen als blok zonder titel.
- **Techniek:** WebDAV-verzoeken (`PROPFIND`, `REPORT calendar-multiget`, `sync-collection`, `PUT`, `DELETE`) met
  ETags, als Edge Function of als kleine Cloudflare Worker. iOS haalt standaard elke 15 minuten op (instelbaar), zonder
  push. Bouwtijd ±10–14 dagen na fase B, plus gate 9 voor het nieuwe pad.
- **Oordeel:** een verantwoorde tweerichtingsroute voor de agenda "Thuisplanner" in Apple Agenda, **zonder app en zonder
  externe goedkeuring**. Geschikt als terugvaloptie als de app niet doorgaat, of als aanvulling voor de Mac.

---

## 6. Route 4: commerciële agendakoppelingen

### 6.1 Prijzen (lijstprijzen november 2026, zonder btw)

Aanname, zoals in het bètaplan: 2 gekoppelde accounts per huishouden (dus 10, 200 en 2.000 accounts).

| Aanbieder | Prijsmodel | 5 huishoudens (10 accounts) | 100 huishoudens (200) | 1.000 huishoudens (2.000) |
| --- | --- | --- | --- | --- |
| **Nylas** | Essentials $15 per maand met 10 accounts (alleen agenda), +$1,70 per account; Pro jaarlijks $43 per maand met 35 accounts, +$1,35 per account (12 maanden vast) | **$15** | **±$266** (Pro jaarlijks: 43 + 165 × 1,35) | **±$2.700** (Pro jaarlijks), of Enterprise op aanvraag |
| **Cronofy** | Emerging $819 per maand (jaarlijks) tot 500 accounts, +$1,39; Growth $2.399 per maand tot 3.000 accounts, +$0,69 | **$819** | **$819** | **$2.399** (Growth) |
| **Unified.to** | Op gebruik: Grow vanaf $750 per maand voor 750.000 aanroepen, +$1 per 1.000 | **$750** | **$750** | ⚠️ ±$1.250–3.000 (hogere bundel; afhankelijk van het aantal aanroepen) |
| **OneCal (Unified Calendar API)** | Geen openbare prijs; de gewone OneCal-abonnementen ($5–10 per gebruiker) zijn voor eindgebruikers | op aanvraag | op aanvraag | op aanvraag |

### 6.2 Verwerkingslocatie, verwerkersovereenkomst en AVG

| | Nylas | Cronofy | Unified.to | OneCal |
| --- | --- | --- | --- | --- |
| Bedrijf | VS | Verenigd Koninkrijk | Canada | ⚠️ onbekend |
| Datalocatie | Regio VS (Iowa) of **Europa (Londen)**, te kiezen bij het aanmaken | Zes datacentra, waaronder **Duitsland**, op alle abonnementen | ⚠️ nakijken | ⚠️ nakijken |
| Verwerkersovereenkomst | ⚠️ niet op de prijspagina; noemt zich "sub-processor"; opvragen | ⚠️ niet op de prijspagina; opvragen | ⚠️ opvragen | ⚠️ opvragen |
| Eigen Google-verificatie nodig | ⚠️ ja voor productie (eigen Google- en Azure-app) | **nee**: de gebruiker koppelt via de geverifieerde app van Cronofy | ⚠️ nakijken | ⚠️ nakijken |
| iCloud | via app-wachtwoord | via app-wachtwoord | ⚠️ | ⚠️ |

- **AVG:** de aanbieder wordt **verwerker** van Thuisplanner (anders dan Google en Microsoft in de directe route, waar de
  gebruiker zijn eigen account koppelt). Nodig: een verwerkersovereenkomst, de lijst subverwerkers, een
  doorgiftebeoordeling (VK: adequaatheidsbesluit; VS: Data Privacy Framework of standaardcontractbepalingen), een
  vermelding in de privacyverklaring en een DPIA-achtige beoordeling (afspraken van kinderen).
- **Oordeel:**
  - Nylas versnelt de Google-route niet (zelfde verificatie) en voegt een VS-verwerker toe.
  - Cronofy versnelt Google en Microsoft wél, maar kost minstens ±$9.800 per jaar, ook bij 5 huishoudens, en de
    afspraken lopen via een derde. De winst ten opzichte van de directe route met een vroege verificatie (§12) is
    ±2–4 weken.
  - **Advies: geen commerciële aanbieder als tussenstap.** Hoogstens een verkennend gesprek met Cronofy over de
    verwerkersovereenkomst, als Outlook voor werkaccounts later knelt.

---

## 7. Route 5: Google OAuth-verificatie

### 7.1 Classificatie van de scopes
- `calendar.app.created`: "secundaire agenda's maken en daarin afspraken zien, maken, wijzigen en verwijderen".
- `calendar.events.owned`: "afspraken zien, maken, wijzigen en verwijderen in Google-agenda's die van jou zijn".
- De officiële Calendar-pagina **toont geen classificatie per scope**. Google noemt "afspraken in Google Agenda lezen"
  als voorbeeld van een **gevoelige** scope. Ontwikkelaars behandelen beide als gevoelig. Geen enkele bron noemt een
  agenda-scope *restricted*: restricted zijn Gmail, Drive en dergelijke.
- **Conclusie:** verwacht **gevoelig**, dus **geen CASA** (de betaalde, jaarlijkse beveiligingstoets is alleen voor
  restricted scopes die op een server worden bewaard). ⚠️ Definitief vast te stellen op de Data Access-pagina in de Cloud
  Console zodra het project bestaat (U1).

### 7.2 Doorlooptijden in 2026
- Officieel: "tot 10 dagen" (een andere Google-pagina noemt 3–5 werkdagen).
- Meldingen van ontwikkelaars in 2026: agenda-aanvragen die **5 weken tot 3 maanden** bleven hangen, meestal door
  heen-en-weer over de privacyverklaring of de demovideo. Een aanvraag uit begin september 2026 stond half november nog
  open.
- **Planningswaarde:** 2 weken bij een schone aanvraag, **4–12 weken** realistisch.
- Vooraf nodig: **merkverificatie** (domein in Search Console, openbare startpagina, privacyverklaring op hetzelfde domein,
  gelinkt vanaf het toestemmingsscherm), een uitleg per scope (waarom niet smaller) en een **demovideo** (YouTube,
  niet-openbaar) met het toestemmingsscherm, de client-id in de adresbalk en het gebruik van iedere scope.

### 7.3 Testmodus en langer werken zonder verificatie

| Modus | Wie | Beperking | Bruikbaar voor de bèta? |
| --- | --- | --- | --- |
| **Testing** | ≤100 testers met naam, voor de hele levensduur van het project | Waarschuwing; de toestemming en het refresh-token **verlopen na 7 dagen** | Alleen voor de interne proef (jullie eigen gezin, Sanne) |
| **In production, niet geverifieerd** | Iedereen, tot **100 nieuwe gebruikers** (levenslang, niet terug te zetten) | Scherm "Google heeft deze app niet geverifieerd" vóór de toestemming. ⚠️ Of de 7-dagengrens dan vervalt, is niet officieel bevestigd (meldingen spreken elkaar tegen): testen | Technisch mogelijk, maar Google staat dit alleen toe voor "persoonlijk gebruik" (jij en mensen die je persoonlijk kent). Voor gezinnen die je niet kent: niet verantwoord |
| **Internal** | Alleen accounts in je eigen Google Workspace-organisatie | Geen waarschuwing, geen limiet | **Nee**: gezinnen met een gewoon Gmail-account vallen erbuiten |
| **Geverifieerd** | Iedereen | – | Ja |

- Daarnaast: hoogstens 100 refresh-tokens per Google-account per client-id (bij opnieuw koppelen vervalt de oudste).
- **Advies:** de verificatie blijft de voorwaarde voor gezinnen (zoals B-F5). De testmodus alleen intern.

---

## 8. Route 6: Outlook en Microsoft Graph

- **Registratie:** een app-registratie moet in een **Entra-tenant** staan; met alleen een persoonlijk Microsoft-account
  kan dat niet meer. Een tenant krijg je met een gratis Azure-account (⚠️ vraagt doorgaans een creditcard ter
  verificatie) of een Microsoft 365-abonnement. Entra ID Free kost niets; Graph-aanroepen voor agenda's zijn gratis.
- **Accounttypen:** kies "accounts in elke organisatie en persoonlijke Microsoft-accounts".
  - **Persoonlijke accounts** (outlook.com, hotmail, live): de gebruiker kan zelf toestemming geven. Zonder
    uitgeververificatie staat er "niet-geverifieerd" in het toestemmingsscherm.
  - **Werk- en schoolaccounts:** veel organisaties staan toestemming alleen toe voor apps van een **geverifieerde
    uitgever**, of vragen een beheerder. Zonder verificatie lukt koppelen daar vaak niet.
- **Uitgeververificatie:** een geverifieerd domein (`mijnthuisplanner.nl`), een lidmaatschap van het Microsoft AI Cloud
  Partner Program (gratis, met een **werkaccount**, niet outlook.com, en met de **echte gegevens van een rechtspersoon of
  onderneming**), en MFA. Doorlooptijd: dagen tot weken, vooral de bedrijfscontrole.
- **Scopes:** `Calendars.ReadWrite`, `offline_access`, `User.Read` (gedelegeerd, geen beheerder nodig). Breder dan bij
  Google: alle agenda's van de gebruiker.
- **Kosten:** €0, behalve een mogelijke creditcardverificatie.
- **Advies:** fase E direct na de Google-adapter, eerst **alleen persoonlijke accounts**. Werkaccounts na de
  uitgeververificatie, en alleen met echte bedrijfsgegevens (K6, D8).

---

## 9. Kosten bij 5, 100 en 1.000 huishoudens

Aannames: 2 accounts en 2,6 toestellen per huishouden; Supabase Pro ($25) is al nodig voor de bèta (bètaplan §6.4) en is
hier niet meegeteld. Dollarbedragen ongeveer gelijk aan euro's.

| Route | Eenmalig | 5 huishoudens | 100 | 1.000 |
| --- | --- | --- | --- | --- |
| Google direct | €0 (CASA niet verwacht) | €0 | €0 | €0–10 (meer Edge-aanroepen door polling; later push via `watch`) |
| Microsoft direct | €0 (⚠️ creditcardverificatie) | €0 | €0 | €0–10 |
| Native app (iOS + Android) | Google Play $25; evt. een Mac ±€700 | ±€8 (Apple $99 per jaar) | ±€8 | ±€8, plus evt. een bouwdienst (±€0–50) |
| Capawesome-plug-in (in plaats van een eigen plug-in) | – | ⚠️ prijs onbekend | ⚠️ | ⚠️ |
| Thuisplanner als CalDAV-server | €0 | €0 | €0 | ±€10–30 (±7,5 miljoen aanroepen per maand bij elke 15 minuten per toestel) |
| Nylas | €0 | $15 | ±$266 | ±$2.700 |
| Cronofy | €0 | $819 | $819 | $2.399 |
| Unified.to | €0 | $750 | $750 | ⚠️ $1.250–3.000 |

**Advies-combinatie (Google + Microsoft direct, native app voor Apple):** ±€8 per maand plus €25 eenmalig, ongeacht het
aantal huishoudens, en wat extra rekentijd bij 1.000 huishoudens.

---

## 10. Productkompas-toets

| Vraag | Antwoord |
| --- | --- |
| Principes | 1, 3 (één keer vertellen: geen dubbele invoer), 5, 6, 10, "Integreren vóór nabouwen", "Privacy volgt de situatie", "Fouten moeten goedkoop zijn" |
| Neemt het werk weg? | Ja: afspraken niet twee keer invoeren is de belangrijkste reden waarom gezinnen een gezinsagenda laten liggen |
| Hoort het bij het huishouden? | Ja |
| Kan het eenvoudiger? | Ja, door per aanbieder de route te kiezen die het minste externe gedoe geeft (Google en Microsoft op de server, Apple op het toestel), en één motor |
| **Principe 5** | Schrijven en verwijderen in een externe agenda heeft een groot gevolg. Daarom: de bron wint bij een conflict, één bevestiging met de naam van de agenda bij verwijderen, 30 dagen herstel, grenzen voor massaverwijdering, lusdetectie en een noodschakelaar. Dat geldt ook voor de toestel-adapter |
| **Principe 10** | Directe koppelingen voegen geen verwerker toe en verdienen niets aan gegevens. Een commerciële aanbieder is verdedigbaar als Thuisplanner betaalt en niets deelt, maar is een extra verwerker van kindgegevens. Koppelingen zijn een kandidaat voor Premium (besluit 3), niet voor de bèta |
| **Integreren vóór nabouwen** | Pleit voor koppelen met de agenda's die gezinnen al gebruiken, niet voor een eigen agenda die ze moeten overnemen. EventKit integreert met Apple Agenda zoals het is. Thuisplanner als CalDAV-server is integreren via een open standaard, geen nabouwen. Een commerciële aanbieder is "integreren via een tussenpersoon": niet nodig zolang de directe API's volstaan |
| **Privacy volgt de situatie** | Privé gaat nooit naar de agenda van een ander (ook niet als "Bezet"); op het toestel alleen gekozen agenda's naar de server; minimale velden (geen beschrijving, deelnemers of vergaderlinks). Het iCloud-app-wachtwoord valt hier af |
| Aandacht, controle, privacy | Geen extra meldingen; de koppelstatus rustig in het dagoverzicht; ontkoppelen ruimt alles op en trekt tokens in |
| Bewijs | Hypothese: de K0-uitvraag bij de bètagezinnen (welke agenda's) bepaalt de volgorde na Google |
| **Ultieme toets** | Ja: het gezin hoeft afspraken niet meer op twee plekken bij te houden |
| Gates | Gate 9 voor het afsprakenmodel (fase A), de agendakoppelingen (B), de toestel-adapter (nieuw pad) en eventueel de CalDAV-server; de gate "meldingen" voor APNs/FCM |

---

## 11. Aanbevolen route per aanbieder

| Aanbieder | Route | Waarom | Niet gekozen |
| --- | --- | --- | --- |
| **Google** | **Direct via de Calendar API, op de server** (fase A–D), met de verificatie **vroeg aangevraagd** op basis van een prototype | Beste API, gratis, smalste scopes, werkt ook voor Google-agenda's in Apple Agenda en op Android | Nylas (zelfde verificatie), Cronofy (duur, verwerker), Android-toestel als route (dubbel met de server-route) |
| **Apple (iCloud en Apple Agenda)** | **Een eigen app (Capacitor) met EventKit**, via TestFlight voor de bèta; met een eigen plug-in | De enige route die iCloud-afspraken in beide richtingen koppelt zonder een iCloud-wachtwoord, en zonder externe verificatie behalve de App Store | CalDAV met app-wachtwoord (privacy), commerciële aanbieders (zelfde wachtwoord), ICS (jouw besluit) |
| Apple, terugvaloptie | **Thuisplanner als CalDAV-server** voor de agenda "Thuisplanner" | Als de app niet doorgaat, of voor de Mac: tweerichting voor wat in Thuisplanner wordt gemaakt, zonder app | – |
| **Outlook (persoonlijk)** | **Direct via Graph** (fase E) direct na Google, zonder uitgeververificatie | Gratis, persoonlijke accounts lukken zonder verificatie | Commerciële aanbieders |
| **Outlook (werk/school)** | Graph **na uitgeververificatie** (echte bedrijfsgegevens); tot die tijd via de app als het Exchange-account op de iPhone staat (EventKit) | Werkaccounts blokkeren vaak niet-geverifieerde apps | – |
| **Android-agenda** | Geen eigen route nodig: Google direct dekt Android | – | CalendarContract: alleen later, voor Exchange-agenda's op Android, na meting |

---

## 12. De termijn verkorten: maatregelen en hun risico's

| # | Maatregel | Winst | Risico | Advies |
| --- | --- | --- | --- | --- |
| V1 | **Fase A (v3) goedkeuren vóór 5 januari** | Start A zonder wachttijd | Geen | **Ja** |
| V2 | **Merkverificatie in december** (Google-project, domein in Search Console, toestemmingsscherm met de privacyverklaring) | 1–2 weken van het kritieke pad | De privacyverklaring moet dan al openbaar zijn met Limited Use (die is toch nodig voor de bèta, W4); een project en DNS-wijziging vragen elk een akkoord | **Ja**, met losse akkoorden |
| V3 | **Verificatie los van de motor aanvragen**: een klein OAuth-prototype (G0, 3–4 d) op staging: koppelen, agenda "Thuisplanner" maken, een afspraak lezen en schrijven; demovideo; aanvraag ±half januari | **3–5 weken**: de goedkeuring valt dan samen met of vóór het einde van fase C | Google beoordeelt wat de video laat zien; wijkt de echte koppeling later af (andere scopes), dan is een nieuwe beoordeling nodig. Daarom de scopes nu vastleggen en niet meer veranderen | **Ja** |
| V4 | **Twee sessies parallel**: een tweede sessie bouwt de Google-adapter (C) tegen het vastgelegde adapter-contract terwijl B nog loopt; of N1 (app-schil en APNs) naast A | ±1,5–2 weken voor Google; de app-route 4–6 weken eerder | Integratiefouten; meer reviewwerk voor jou (de echte bottleneck) | Ja, hoogstens 2 schrijvende sessies, met gescheiden bestanden |
| V5 | **De interne proef korter dan 14 dagen** | 1 week | Botst met de koppelingspoort (§8.3 tweerichtingsadvies); lussen en zeldzame gevallen worden gemist | **Nee** |
| V6 | **Gezinnen in de Google-testmodus** (B9) of **"in production, niet geverifieerd"** | 3–8 weken | Wekelijks opnieuw koppelen, of een waarschuwingsscherm; past niet bij "pas starten als het betrouwbaar werkt" en (bij niet geverifieerd) niet bij de voorwaarden van Google voor mensen die je niet kent | Alleen voor jullie eigen gezin en Sanne |
| V7 | **EventKit via een native app als Apple-route** | Apple niet "nooit", maar ±half april–mei 2027 | Achtergrondbeperking iOS; App Store-gegevens openbaar (K6); onderhoud; Mac of bouwdienst | **Ja**, na D3–D5 |
| V8 | **TestFlight in plaats van een App Store-publicatie** voor de bèta | 1–3 weken | Een build verloopt na 90 dagen; externe testers vragen een korte bètareview | **Ja** |
| V9 | **Een commerciële aanbieder (Cronofy) als tussenstap** | ±2–4 weken voor Google en Outlook samen | ±$9.800 per jaar, extra verwerker, afhankelijkheid, later toch overstappen | **Nee** |
| V10 | **Outlook persoonlijk vóór de uitgeververificatie** | 2–6 weken | Melding "niet-geverifieerd"; werkaccounts blijven geblokkeerd | **Ja**, voor persoonlijke accounts |

---

## 13. Tijdlijn, werkpakketten, capaciteit en afhankelijkheden

### 13.1 Werkpakketten

| WP | Inhoud | Werkdagen (Claude) | Afhankelijk van | Akkoord |
| --- | --- | --- | --- | --- |
| **WP0** | Besluiten D1–D10; K0-uitvraag bij de bètagezinnen; teksten voor de privacyverklaring (Limited Use, push, app) | 1–2 | – | publicatie |
| **G-M** | Google-project, domeinverificatie (TXT), toestemmingsscherm, merkverificatie | 0,5 (teksten, stappenlijst) | privacyverklaring openbaar | project, DNS |
| **G0** | OAuth-prototype op staging in testmodus + demovideo + aanvraag | 3–4 (telt mee voor C: netto +1) | G-M; de scopes vastgelegd | Edge Functions op staging, indienen |
| **A** | Afsprakenmodel (ontwerp v3) | 12–15 | D1 | migraties, commits, uitrol |
| **B** | Synchronisatiemotor, met de toestel-adapter in het contract | 9–13 | A | migratie, commits |
| **C** | Google-adapter en de app (min wat G0 al deed) | 6–10 | B, G0 | commits, uitrol |
| **D** | Interne proef ≥14 dagen, koppelingspoort | 3–5 + proeftijd | C; verificatie goedgekeurd | start voor gezinnen |
| **E** | Microsoft Graph, persoonlijke accounts | 6–9 | B; Entra-tenant | registratie, mogelijk creditcard |
| **E2** | Uitgeververificatie (werkaccounts) | 0,5 | bedrijfsgegevens, werkaccount | partnerprogramma |
| **N1** | Capacitor-schil iOS (en Android), bouwstraat, APNs-verzender, `push_devices.kanaal`, privacymanifest, account verwijderen in de app, minimale app-versie, TestFlight | 7–10 | D3–D5; Apple-lidmaatschap | inschrijving, kosten, commits |
| **N2** | Eigen agenda-plug-in (EventKit, later CalendarContract), toestel-adapter, momentopnames, keuze van agenda's, stille push als seintje, gate 9 voor het toestelpad | 12–18 | B, N1 | commits |
| **N3** | Proef ≥14 dagen op echte iPhones; TestFlight voor gezinnen; (App Store-review vóór de publieke lancering) | 2–3 + proeftijd | N2 | externe testers, review |
| **K** (optioneel) | Thuisplanner als CalDAV-server | 10–14 | B | eigen besluit |

**Totaal:** Google-pad ±32–47 d; Microsoft +6–9; Apple-pad +21–31; samen ±60–85 werkdagen. Met 2 schrijvende sessies
±7–10 kalenderweken extra bouwtijd na de bètastart, naast het meldingenwerk B2/B3 uit het bètaplan.

### 13.2 Tijdlijn (passend in de centrale bètaroadmap; geen uitrol 23 december – 3 januari)

| Periode | Agenda (sessie 1) | Agenda / app (sessie 2) | Extern (jij) |
| --- | --- | --- | --- |
| 26 nov – 11 dec | – (bètavoorbereiding gaat voor) | – | D1–D10; K0-uitvraag |
| 7 – 18 dec | – | – | Privacyverklaring openbaar (W4); Google-project, DNS en merkverificatie (G-M) |
| 23 dec – 3 jan | – | – | (geen uitrol) |
| 5 – 15 jan | **A** | **G0** (prototype, testmodus, staging) | Apple-inschrijving (D4) |
| ±15 jan | A | demovideo | **Google-verificatie aanvragen** |
| 18 – 29 jan | A (klaar ±29 jan) | **N1** app-schil, APNs | – |
| 1 – 19 feb | **B** | N1 af; adapter-contract C | Google-vragen beantwoorden |
| 22 feb – 5 mrt | **C** (Google-adapter) | **E** (Graph, persoonlijk) | Entra-tenant (D8) |
| 8 – 19 mrt | **D**: proef ≥14 dagen (eigen gezin, Sanne) | **N2** toestel-adapter | Verwachte goedkeuring Google (bij 4–8 weken: half feb – half mrt) |
| **±22 mrt – begin apr** | **Koppelingspoort Google → eerste gezinnen** | N2; proef Outlook-persoonlijk | – |
| apr | Herstel, Outlook-poort | **N3**: proef op iPhones, TestFlight | – |
| **±half apr** | **Outlook persoonlijk → gezinnen** | – | Uitgeververificatie (E2), als D8 = ja |
| **±eind apr – half mei** | – | **Apple (EventKit, TestFlight) → gezinnen** | – |
| mei – jun | Outlook werkaccounts (na E2) | Android-app (alleen als K0 dat vraagt); App Store-publicatie vóór de publieke lancering | Play-account (D4) |

**Kritiek pad voor Google:** goedkeuring A → A → B → C → D (≥14 dagen) en, parallel, merkverificatie → G0 → Google-review.
Het later van de twee bepaalt de start. Met V3 is dat waarschijnlijk de motor, niet meer Google.

**Kritiek pad voor Apple:** B (motor) → N2 → N3. N1 loopt parallel met A en B.

---

## 14. Risico's

| # | Risico | Kans | Gevolg | Maatregel |
| --- | --- | --- | --- | --- |
| R1 | Google-review loopt ver uit (>8 weken) of vraagt herhaaldelijk om aanpassingen | middel | Google-gezinnen later (april–mei) | V2+V3: vroeg en volledig indienen; de video exact volgens de checklist |
| R2 | Een agenda-scope blijkt toch *restricted* (CASA) | laag | Kosten ±$500–4.500 per jaar en weken extra | U1 meteen vaststellen in de console bij G-M |
| R3 | De scopes moeten na de goedkeuring veranderen | laag-middel | Nieuwe review | Scopes vastleggen vóór G0 |
| R4 | iOS-achtergrond te beperkt voor de verwachting van gezinnen | middel | "Mijn afspraak staat er nog niet" | Uitleg in de app; sync bij openen; stille push als seintje; de status "laatst bijgewerkt" in het dagoverzicht |
| R5 | EventKit-identificatie verandert of verdubbelt (herhalingen, Exchange) | middel | Dubbelingen | Eigen markering; sleutel met begin; testvectoren op echte accounts; grenzen in de motor |
| R6 | App Store-afwijzing (4.2, 5.1.1) | laag-middel | 1–2 weken | Native functies (agenda, push) zichtbaar; account verwijderen in de app; privacymanifest |
| R7 | Uitgeversgegevens openbaar (K6) | zeker als je publiceert | Privacy van jezelf | D4 vóór de inschrijving |
| R8 | Twee routes voor dezelfde Google-agenda (server en EventKit) | middel | Dubbele afspraken | Per account één route per agenda: een Google-agenda die al via de server gekoppeld is, wordt op het toestel overgeslagen (herkennen via de bron en `iCalUID`) |
| R9 | Capaciteit: meldingen B2/B3, Maaltijden en agenda tegelijk | hoog | Uitloop | Volgorde in de centrale bètaroadmap; jouw reviewtijd als grens |
| R10 | Firebase-akkoord niet gegeven | – | Geen native push op Android | Android-gebruikers houden webpush; de app eerst alleen voor iOS |
| R11 | Microsoft vraagt een creditcard of verandert de tenantregels | middel | Fase E later | D8 vooraf; persoonlijke accounts eerst |

**Onzekerheden die nog vastgesteld moeten worden:** U1 (classificatie van de scopes; console), de 7-dagengrens bij
"in production, niet geverifieerd" (test), of Nylas voor productie een eigen Google-app eist (navraag), de
verwerkersovereenkomsten van de aanbieders (navraag), de prijs van Capawesome Insiders, de creditcardeis voor een gratis
Azure-account, en de exacte euro-prijs van het Apple-lidmaatschap (bij de inschrijving).

---

## 15. Beslissingen voor Bas

| # | Beslissing | Advies |
| --- | --- | --- |
| **D1** | Het ontwerp van fase A (v3) definitief goedkeuren, zodat A op 5 januari start | **Ja** |
| **D2** | Apple-route: (a) een eigen app met EventKit; (b) Thuisplanner als CalDAV-server; (c) beide; (d) geen Apple-tweerichting vóór de publieke lancering. In alle gevallen geen iCloud-app-wachtwoord | **(a)**, met (b) als terugvaloptie |
| **D3** | Het beslispunt "alleen web-app of ook in de app-winkels" herzien: een app voor iOS (TestFlight in de bèta, App Store vóór de publieke lancering), de PWA blijft | **Ja**, voor iOS; Android later na de K0-uitvraag |
| **D4** | Onder welke naam Thuisplanner uitgeeft (particulier, eenmanszaak of rechtspersoon), met echte gegevens; daarna het Apple-lidmaatschap ($99 per jaar) en later Google Play ($25) | Eerst de naam kiezen; inschrijven in januari |
| **D5** | Hoe iOS wordt gebouwd: Xcode Cloud (inbegrepen), een externe bouwdienst, of een Mac | Xcode Cloud |
| **D6** | Firebase (FCM) voor native push op Android | Nu niet; Android houdt webpush |
| **D7** | `push_devices` nu al met `kanaal` en `token` ontwerpen (migratie M-a van het bètaplan) | **Ja** |
| **D8** | Microsoft: een Entra-tenant (mogelijk met creditcardverificatie); persoonlijke accounts eerst; uitgeververificatie pas met echte bedrijfsgegevens | Ja, tenant in februari; verificatie na D4 |
| **D9** | Een commerciële aanbieder als tussenstap | **Nee** |
| **D10** | Google: in december het project, de DNS-verificatie en de merkverificatie; in januari G0 en de verificatieaanvraag (elk met een eigen akkoord) | **Ja** |
| **D11** | Google-testmodus of "niet geverifieerd in productie" alleen voor jullie eigen gezin en Sanne | **Ja** |
| **D12** | §5 van het bètaplan bijwerken op basis van dit onderzoek (Apple niet meer "alleen ICS-uit") | Ja, na D2 |

---

## 16. Samenvatting van het advies

- **Google eerst, en de verificatie eerder.** Merkverificatie in december, een klein OAuth-prototype en de aanvraag
  half januari, los van de motor. De verificatie is dan niet meer het knelpunt; de bouw van fase A–C en de proef van
  14 dagen zijn het wel.
- **Apple via een eigen app met EventKit**, verpakt met Capacitor en verspreid via TestFlight. Dat is de enige route
  die iCloud-afspraken in beide richtingen koppelt zonder een iCloud-wachtwoord en zonder ICS. De prijs: $99 per jaar,
  een iOS-bouwstraat, openbare uitgeversgegevens, en een sync die afhangt van wanneer iOS de app laat draaien. Als
  terugvaloptie: Thuisplanner als CalDAV-server voor de agenda "Thuisplanner".
- **Outlook direct via Graph**, eerst persoonlijke accounts zonder uitgeververificatie; werkaccounts na de verificatie
  met echte bedrijfsgegevens.
- **Geen commerciële aanbieder**: Nylas versnelt de Google-verificatie niet, Cronofy kost ±$9.800 per jaar vanaf het
  eerste gezin, en beide worden verwerker van gezinsafspraken.
- **Kosten van het advies:** ±€8 per maand (Apple) en €25 eenmalig (Google Play, alleen als Android-app), los van het
  aantal huishoudens.

**Kortst verantwoorde termijn per aanbieder** (voor gezinnen in de besloten bèta; alles onder voorbehoud van de
akkoorden D1–D10 en twee sessies):

| Aanbieder | Op zijn vroegst | Realistisch | Grootste onzekerheid |
| --- | --- | --- | --- |
| **Google** | **±22 maart 2027** | eind maart – half april 2027 | Google-review; omvang fase A |
| **Outlook (persoonlijk)** | **±half april 2027** | eind april 2027 | Entra-tenant en creditcard |
| **Outlook (werk/school)** | ±mei 2027 | juni 2027 | Uitgeververificatie met bedrijfsgegevens |
| **Apple (iCloud, Apple Agenda) via de app** | **±eind april 2027** | half mei – begin juni 2027 | iOS-achtergrond; inschrijving en bouwstraat |
| Apple-terugval (CalDAV-server, alleen agenda "Thuisplanner") | ±half april 2027 | mei 2027 | Eigen besluit; gate 9 voor het nieuwe pad |

Zonder deze versnellingen blijft het: Google half april – mei, Outlook mei – juni, Apple geen tweerichting.

---

## Bronnen

- **Google-scopes en verificatie:** [Calendar API: scopes](https://developers.google.com/workspace/calendar/api/auth) ·
  [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) ·
  [Production readiness](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview) ·
  [Manage App Audience (testmodus, 7 dagen, 100 gebruikers)](https://support.google.com/cloud/answer/15549945) ·
  [Unverified apps](https://support.google.com/cloud/answer/7454865) ·
  [Verification requirements](https://support.google.com/cloud/answer/13464321) ·
  [Forum: verificatie sinds september 2026 open](https://discuss.google.dev/t/oauth-verification-gmail-send-under-review-since-early-september-2026-no-trust-safety-email-received-and-a-question-about-adding-a-scope/409025) ·
  [Pyas: doorlooptijd agenda-review](https://www.pyas.io/guides/google-oauth-verification-calendar) ·
  [GitHub: agenda-scopes als gevoelig](https://github.com/rhysdunne/screenshot-to-calendar/issues/43) ·
  [Agentic Fabriq: CASA](https://www.agenticfabriq.com/blog/google-oauth-verification-casa)
- **Apple:** [TN3152: calendar access levels](https://developer.apple.com/documentation/technotes/tn3152-migrating-to-the-latest-calendar-access-levels) ·
  [Choosing background strategies](https://developer.apple.com/documentation/backgroundtasks/choosing-background-strategies-for-your-app) ·
  [Forum: BGAppRefreshTask](https://developer.apple.com/forums/thread/729824) ·
  [Forum: EventKit en Google-vertraging](https://developer.apple.com/forums/thread/766375) ·
  [Apple Developer Program: inschrijving](https://developer.apple.com/programs/enroll/) ·
  [Account Help: enrollment](https://developer.apple.com/support/enrollment/) ·
  [support.apple.com/121539](https://support.apple.com/en-us/121539)
- **Capacitor:** [@capacitor/calendar](https://capacitorjs.com/docs/apis/calendar) ·
  [Capawesome Calendar](https://capawesome.io/docs/sdks/capacitor/calendar/) ·
  [@ebarooni/capacitor-calendar](https://github.com/ebarooni/capacitor-calendar) ·
  [@capacitor/push-notifications](https://capacitorjs.com/docs/apis/push-notifications)
- **Google Play:** [App testing requirements (12 testers, 14 dagen)](https://support.google.com/googleplay/android-developer/answer/14151465)
- **Microsoft:** [Supported account types](https://learn.microsoft.com/entra/identity-platform/howto-modify-supported-accounts) ·
  [Publisher domain](https://learn.microsoft.com/en-us/entra/identity-platform/howto-configure-publisher-domain) ·
  [Troubleshoot publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/troubleshoot-publisher-verification) ·
  [Breaking changes (persoonlijke accounts en app-registraties)](https://learn.microsoft.com/nb-no/entra/identity-platform/reference-breaking-changes) ·
  [Establish applications](https://learn.microsoft.com/en-us/entra/architecture/establish-applications) ·
  [Q&A: partnerprogramma met werkaccount](https://learn.microsoft.com/en-us/answers/questions/5829167/cannot-enroll-in-mcpp-(microsoft-ai-cloud-partner)
- **Commerciële aanbieders:** [Nylas pricing](https://www.nylas.com/pricing/) ·
  [Nylas data residency](https://developer.nylas.com/docs/dev-guide/platform/data-residency/) ·
  [Cronofy API pricing](https://www.cronofy.com/api-pricing) ·
  [Cronofy plans](https://docs.cronofy.com/developers/plans-pricing/) ·
  [Cronofy FAQ (datacentra)](https://cronofy.com/faqs) ·
  [Cronofy: verify application](https://docs.cronofy.com/developers/faqs/application-management/verify-application/) ·
  [Unified.to pricing](https://www.unified.to/pricing) ·
  [OneCal Unified Calendar API](https://www.onecal.io/unified-calendar-api) ·
  [Cronofy: app-specifieke wachtwoorden](https://cronofy.com/blog/apple-icloud-app-specific-passwords)
- **Eerdere adviezen in deze map:** `thuisplanner-agenda-tweerichting-advies.md`, `thuisplanner-agenda-ontwerp-fase-a.md`,
  `thuisplanner-agenda-integratie-advies.md`, `thuisplanner-personalisatie-beta-plan.md` §5.
