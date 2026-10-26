# mijnthuisplanner.nl: DNS van TransIP naar Cloudflare (optie A)

**Status:** voorbereiding (18 oktober 2026). Akkoord op optie A. Er is nog niets gewijzigd: geen records, geen
nameservers, geen DNSSEC. De registratie van het domein blijft bij TransIP; alleen het DNS-beheer gaat naar Cloudflare
(Free-plan).

**Volgorde (vast):**
1. Inventaris (TransIP, aangevuld met een openbare kruiscontrole).
2. De Cloudflare-zone volledig klaarzetten, terwijl die nog niet actief is.
3. Vergelijken: de Cloudflare-nameservers rechtstreeks bevragen.
4. DNSSEC uit bij TransIP, en wachten tot de DS-gegevens weg zijn.
5. Nameservers wijzigen.
6. Controleren.
7. DNSSEC aan via Cloudflare.

Elke stap met een eigen akkoord.

## 1. Inventaris

### 1.1 Openbaar gemeten (18 oktober 2026, alleen lezen, via DNS-over-HTTPS)

Een zone is van buitenaf niet volledig op te vragen. Deze lijst bevat alleen de namen die bij een brede scan van
gangbare namen gevonden zijn. **De export uit het TransIP-paneel (§1.2) is leidend.**

| # | Naam | Type | TTL | Waarde | Herkomst |
| --- | --- | --- | --- | --- | --- |
| 1 | `@` | A | 3600 | `37.97.254.27` | TransIP-parkeerpagina (certificaat `*.vdx.nl`) |
| 2 | `@` | AAAA | 3600 | `2a01:7c8:3:1337::27` | Idem |
| 3 | `@` | MX | 3600 | `10 mijnthuisplanner.nl.` | Standaard van TransIP |
| 4 | `@` | TXT | 3600 | `"v=spf1 ~all"` | Standaard SPF (geen afzenders) |
| 5 | `www` | CNAME | 3600 | `mijnthuisplanner.nl.` | Standaard van TransIP |
| 6 | `_dmarc` | TXT | 3600 | `"v=DMARC1; p=none;"` | DMARC hoofddomein |
| 7 | `transip-a._domainkey` | CNAME | 3600 | `_dkim-A.transip.email.` | DKIM voor TransIP-mail (standaard) |
| 8 | `transip-b._domainkey` | CNAME | 3600 | `_dkim-B.transip.email.` | Idem |
| 9 | `transip-c._domainkey` | CNAME | 3600 | `_dkim-C.transip.email.` | Idem |
| 10 | `lm1._domainkey.mail` | CNAME | 3600 | `lm1.wazgkssjiojm2nkwwy2c3wrz7i.dkim.lmta.net.` | **Lettermint DKIM 1** |
| 11 | `lm2._domainkey.mail` | CNAME | 3600 | `lm2.wazgkssjiojm2nkwwy2c3wrz7i.dkim.lmta.net.` | **Lettermint DKIM 2** |
| 12 | `lm-bounces.mail` | CNAME | 3600 | `bounces.lmta.net.` | **Lettermint Return-Path** |
| 13 | `_dmarc.mail` | TXT | 3600 | `"v=DMARC1;p=none"` | **Lettermint DMARC** |
| – | `@` | NS | 86400 | `ns0.transip.net.`, `ns1.transip.nl.`, `ns2.transip.eu.` | Wordt Cloudflare (stap 5) |
| – | `@` | DS (bij .nl) | 3600 | `30555 13 2 0bfaad3b…bc8cf1` | DNSSEC actief (zie §3) |

- Geen wildcard: een niet-bestaande naam geeft NXDOMAIN.
- Geen CAA, geen SRV, geen MTA-STS gevonden.

### 1.2 Uit het TransIP-paneel (door jou aan te vullen)

- [ ] Alle records uit **Domein → mijnthuisplanner.nl → DNS**, met naam, type, TTL en waarde.
- [ ] Records die niet in §1.1 staan: toevoegen aan de controlelijst (§2).
- [ ] De stand van **DNSSEC** (aan of uit) op dezelfde pagina.
- [ ] Of er een **e-mailpakket of mailbox** bij dit domein hoort (tabblad E-mail of Mailboxen), en of er mailadressen of
  doorsturingen bestaan.

## 2. Controlelijst voor de Cloudflare-zone

In Cloudflare moet elke regel exact zo staan.
- "DNS only" betekent de grijze wolk (`proxied: false`).
- Namen worden in Cloudflare zonder het domein ingevuld (bijvoorbeeld `lm1._domainkey.mail`).
- De punt aan het eind van een waarde laat Cloudflare zelf weg.

| # | Naam | Type | Waarde (exact) | Proxy | Wat ermee gebeurt |
| --- | --- | --- | --- | --- | --- |
| L1 | `lm1._domainkey.mail` | CNAME | `lm1.wazgkssjiojm2nkwwy2c3wrz7i.dkim.lmta.net` | **DNS only** | Behouden, niets aan veranderen |
| L2 | `lm2._domainkey.mail` | CNAME | `lm2.wazgkssjiojm2nkwwy2c3wrz7i.dkim.lmta.net` | **DNS only** | Behouden |
| L3 | `lm-bounces.mail` | CNAME | `bounces.lmta.net` | **DNS only** | Behouden |
| L4 | `_dmarc.mail` | TXT | `v=DMARC1;p=none` | – | Behouden |
| T1 | `transip-a._domainkey` | CNAME | `_dkim-A.transip.email` | **DNS only** | Behouden zolang er TransIP-mail is of kan komen; weg als je zeker geen TransIP-mail gebruikt (besluit, §4) |
| T2 | `transip-b._domainkey` | CNAME | `_dkim-B.transip.email` | **DNS only** | Idem |
| T3 | `transip-c._domainkey` | CNAME | `_dkim-C.transip.email` | **DNS only** | Idem |
| R1 | `@` | MX | `mijnthuisplanner.nl`, prioriteit 10 | – | Voorlopig **exact overnemen** (zie §4). Later bewust vervangen |
| R2 | `@` | TXT | `v=spf1 ~all` | – | Voorlopig overnemen; later aanpassen samen met R1 |
| R3 | `_dmarc` | TXT | `v=DMARC1; p=none;` | – | Overnemen |
| R4 | `@` | A | `37.97.254.27` | **DNS only** | Voorlopig overnemen (de parkeerpagina blijft wat hij is). Vervangen door Pages bij het koppelen van de site, met een apart akkoord |
| R5 | `@` | AAAA | `2a01:7c8:3:1337::27` | **DNS only** | Idem |
| R6 | `www` | CNAME | `mijnthuisplanner.nl` | **DNS only** | Idem |
| – | Records uit §1.2 die hier niet staan | – | – | – | Toevoegen voordat we vergelijken |

**Belangrijk bij de import:**
- Cloudflare zet bij het automatisch inlezen A-, AAAA- en CNAME-records vaak op **Proxied** (oranje). Zet ze allemaal
  op **DNS only**.
  - Voor L1 tot en met L3 en T1 tot en met T3 is dat noodzakelijk. Via de proxy verdwijnt de CNAME naar Lettermint of
    TransIP en faalt DKIM of de bounce-afhandeling.
  - Voor R4 tot en met R6 voorkomt het dat Cloudflare nu al verkeer voor de parkeerpagina gaat verwerken. Er verandert
    dus niets tot de site gekoppeld wordt.
- Records die Cloudflare zelf bedenkt en die niet in de inventaris staan: verwijderen.
- De nameservers (NS) en DNSSEC (DS) zet je niet zelf als record; die komen in stap 5 en 7.

**De vergelijking (stap 3, door mij, alleen lezen):**
- Ik bevraag de twee toegewezen Cloudflare-nameservers rechtstreeks, voor elke naam uit deze lijst.
- Ik vergelijk het antwoord met de TransIP-nameservers.
- Pas bij een volledige overeenkomst (behalve de nameservers zelf) stellen we stap 4 voor.

## 3. DNSSEC: actief, dus omschakelen in vaste volgorde

DNSSEC staat aan: er staat een DS-record bij het `.nl`-register (sleutel 30555, algoritme 13, TTL 3600 s), en de
antwoorden worden gevalideerd. Na een wissel van nameservers horen de handtekeningen niet meer bij die DS. Valideert een
resolver dan nog met de oude DS, dan is **het hele domein onbereikbaar**, ook de DKIM van Lettermint. Daarom:

1. **DNSSEC uit bij TransIP** (stap 4). TransIP vraagt het `.nl`-register de DS te verwijderen.
2. **Wachten** tot de DS weg is: hij mag nergens meer in caches staan.
   - De TTL is 1 uur; het verwerken bij het register kan langer duren.
   - Ik controleer alleen-lezend dat er geen DS meer is.
   - Daarna wacht je nog minstens 2 uur (2 × de TTL). Een veilige vuistregel: een dag ertussen.
3. **Pas dan de nameservers wijzigen** (stap 5).
4. **Na de overstap** (stap 7):
   - DNSSEC aanzetten in Cloudflare;
   - de DS-gegevens die Cloudflare toont, invullen bij TransIP;
   - ik controleer de validatie.
5. **Terugdraaien:** de zone bij TransIP blijft bestaan. Nameservers terug naar TransIP; DNSSEC pas weer aan als alles
   werkt.

## 4. Bestaande e-mailvoorzieningen

Wat ik openbaar zie, zijn de **standaardinstellingen van TransIP**: een MX naar het domein zelf (de TransIP-server
`37.97.254.27`), een SPF zonder afzenders en drie DKIM-records voor TransIP-mail. Of daar echt een mailbox achter zit,
is van buitenaf niet te zien.

- **Er is een mailbox of doorsturing bij TransIP:** R1, R2 en T1 tot en met T3 exact behouden. De mail blijft dan
  gewoon bij TransIP binnenkomen, ook na de overstap.
- **Er is niets:** bij de overstap toch alles overnemen (geen wijziging tegelijk met de nameservers). Daarna, als aparte
  stap, kies je:
  - doorsturen (bijvoorbeeld Cloudflare Email Routing, gratis);
  - of uitsluiten met een null MX (`0 .`) en `v=spf1 -all`.
- **Lettermint** staat los hiervan (`mail.`) en blijft in beide gevallen ongewijzigd.

## 5. Het domein toevoegen aan Cloudflare (Free-plan), stap voor stap

Dit maakt een zone aan die **nog niet actief** is. Tot je bij TransIP de nameservers wijzigt (stap 5), verandert er
voor de buitenwereld niets.

1. Log in bij Cloudflare met het account van staging. Een apart account kan ook, maar dan moet het website-project
   daar ook komen.
2. Ga naar **Account home → Add a domain** (ook "Add a site" of "Onboard a domain").
3. Vul `mijnthuisplanner.nl` in. Kies **"Quick scan for DNS records"** (inlezen). Zet "block AI bots" naar keuze; dat
   heeft geen invloed op DNS.
4. Kies het **Free**-plan (€0). Sla betaalde opties over.
5. Cloudflare toont de ingelezen records. **Nog niet op "Continue to activation" klikken** voordat je deze stappen hebt
   gedaan:
   - Vergelijk met de lijst in §2. Voeg ontbrekende regels toe; ontbrekende Lettermint- of TransIP-records zijn
     waarschijnlijk.
   - Zet **elk** A-, AAAA- en CNAME-record op **DNS only** (grijze wolk).
   - Verwijder records die niet in de inventaris staan.
6. Cloudflare toont daarna **twee nameservers** (namen als `xxx.ns.cloudflare.com`). **Wijzig ze nog niet bij TransIP.**
   Noteer ze en geef ze aan mij door; daarmee doe ik de vergelijking (stap 3).
7. De zone staat nu op "Pending". Dat is de bedoeling. Cloudflare stuurt mogelijk mails dat de activatie wacht; die
   kun je negeren tot stap 5.
8. **DNSSEC in Cloudflare nog niet aanzetten.** Dat gebeurt pas na de overstap (§3, punt 4).

**Kosten:** het Free-plan van Cloudflare kost €0. De registratie bij TransIP blijft ongewijzigd. Nameservers wijzigen
kost bij TransIP normaal niets (⚠️ even nakijken in je pakket).

## 6. Wat niet geraakt wordt

- **Huisplan:** GitHub Pages zonder eigen domein; eigen Supabase-projecten.
- **Staging:** een eigen `pages.dev`-adres, achter Cloudflare Access. Een nieuwe zone verandert niets aan bestaande
  projecten of Access-instellingen.
- **De Supabase-projecten van Thuisplanner:** geen koppeling met dit domein.
- **Lettermint:** de vier records blijven bestaan, eerst bij TransIP en daarna identiek bij Cloudflare.

## 7. Vergelijking van de Cloudflare-zone (18 oktober 2026, alleen lezen)

De zone is bij de toegewezen nameservers `seth.ns.cloudflare.com` en `wanda.ns.cloudflare.com` rechtstreeks
bevraagd. Elke naam is ook opgevraagd bij `ns0.transip.net` en per type vergeleken.

| Record | Uitkomst |
| --- | --- |
| L1 tot en met L4 (Lettermint) | **Gelijk** bij beide nameservers; de CNAME's komen terug als CNAME, dus **DNS only** |
| T1 tot en met T3 (DKIM van TransIP) | **Gelijk** (de CNAME's); DNS only |
| R2 SPF, R3 DMARC | **Gelijk** |
| R4 en R5 (`@` A en AAAA) | **Gelijk** (het oorspronkelijke adres, geen Cloudflare-adres), dus **DNS only** |
| R6 (`www` CNAME) | **Gelijk**; DNS only |
| R1 (`@` MX) | **In vorm anders, in werking gelijk.** Cloudflare geeft `10 _dc-mx.5191348ca677.mijnthuisplanner.nl`, een hulpnaam die Cloudflare zelf beheert en die naar **hetzelfde** adres wijst (`37.97.254.27` en `2a01:7c8:3:1337::27`). Mail gaat dus naar dezelfde server |
| TXT op `transip-a._domainkey` | Geen echte afwijking: TransIP volgt de CNAME zelf, Cloudflare geeft (terecht) alleen de CNAME. Een openbare resolver krijgt langs beide wegen dezelfde DKIM-sleutel |

**Niet van buitenaf te controleren:**
- of de Cloudflare-zone records bevat die niet in de inventaris staan. Een zone laat zich niet volledig opvragen;
  controleer in het dashboard dat er precies 13 records staan;
- de proxy-instelling als dashboardwaarde. Wel bewezen: geen enkel gevonden record geeft een Cloudflare-adres terug.

**De stand bij TransIP** (openbaar) is ongewijzigd: de nameservers van TransIP, en DNSSEC aan (DS 30555, TTL 3600).
