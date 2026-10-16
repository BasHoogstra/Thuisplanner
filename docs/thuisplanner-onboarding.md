# Thuisplanner KG-5H, deel 1: onboarding met huishouden en uitnodigen (implementatieplan)

**Status:** besloten op 16 oktober 2026 (de vier besluiten volgens het advies, plus twee voorwaarden, zie §9) en **lokaal
gebouwd** op branch `thuisplanner-staging` (niet gepusht). Hoort bij bouwstap KG-5H uit
`docs/komtgoed-bouwplan.md` ("de eerste nieuwe pagina's: pas na jouw akkoord").

**Aanleiding:** wie op staging inlogt zonder huishouden, ziet nu alleen "Dit account hoort nog bij geen huishouden". De
database kan een huishouden al veilig aanmaken en mensen koppelen; alleen de schermen ontbreken.

**Uitgangspunten van de opdracht:**
- de bestaande functies en RLS;
- geen andere datastructuur;
- geen databasewijziging;
- meerdere, volledig gescheiden huishoudens;
- goed te gebruiken op een telefoon;
- Huisplan blijft ongemoeid.

## 1. Ondersteunen de bestaande functies dit veilig? Ja (BEWEZEN in de migraties en tests)

| Nodig | Bestaande functie (public, dunne wrapper; logica in `private`) | Regels die de database al afdwingt | Getest |
| --- | --- | --- | --- |
| Eerste huishouden aanmaken | `create_household(naam, eigen naam)` | Alleen ingelogd. De maker wordt **eigenaar** (`owner`, volwassene, met account). Hoogstens 10 eigen huishoudens. Naam 1–80 tekens. Vergrendeling per account | KG-T01, T02, T24, T30, T31 |
| Huishoudleden zonder account (partner nog zonder account, kinderen) | `add_member(huishouden, naam, adult/child)` | Alleen eigenaar of beheerder | KG-T03, T05 |
| Iemand uitnodigen | `create_invite(huishouden, lid?, rol, dagen)` | Alleen eigenaar of beheerder; **beheerder uitnodigen alleen door de eigenaar**. Rol `admin` of `member`, nooit `owner`. Geldig 1–30 dagen. Optioneel voor een bestaand profiel (geen dubbele persoon). Geen kind. Het token (32 willekeurige bytes) komt één keer terug; de database bewaart alleen de SHA-256 | KG-T04, T10, T28 |
| Uitnodiging accepteren | `accept_invite(token, eigen naam)` | Eén keer bruikbaar, verloopt, intrekbaar. Ongeldig als de maker het niet meer mag geven. Koppelt aan het bedoelde profiel of maakt een nieuw lid, met de rol uit de uitnodiging. Foutmeldingen zonder rijgegevens | KG-T07, T08, T09, T11, T28 |
| Uitnodiging intrekken | `revoke_invite(uitnodiging)` | Alleen eigenaar of beheerder | KG-T09 |
| Mijn huishoudens en rol | `my_memberships()` | Alleen eigen, actieve lidmaatschappen | KG-T12, T23 |
| Lezen | RLS `households_select`, `members_select`, `invites_select` | Alleen eigen huishoudens. Uitnodigingen alleen voor eigenaar en beheerder, nooit de tokenhash. Account-ID's niet leesbaar | KG-T05, T13, T21, T23, T29 |

**Gescheiden huishoudens:**
- elk lidmaatschap is per huishouden;
- verwijzingen over de grens zijn onmogelijk (samengestelde foreign keys);
- iemand kan lid zijn van meerdere huishoudens (KG-T12, Mira).

**Beheerdersrechten:**
- de maker van het huishouden is direct **eigenaar**;
- de partner wordt via de uitnodiging **beheerder** of **lid**;
- er is geen aparte "superbeheerder" en dat is ook niet nodig: elk huishouden beheert zichzelf.

**Wat er in de database ontbreekt, maar niet voor deel 1:**
- een uitnodiging kan haar huishoudnaam niet tonen vóór het accepteren, omdat iemand buiten het huishouden niets mag
  lezen. Dat is bewust zo; de app toont na het accepteren waar je in zit;
- er is geen limiet op het aantal uitnodigingen (K9 uit de architectuurcontrole, vóór de commerciële lancering).

**Conclusie:** er is geen databasewijziging nodig. Deel 1 is alleen app-code.

## 2. Wat er in de app ontbreekt

| Plek | Nu | Na deel 1 |
| --- | --- | --- |
| `sessie.ts` | Neemt het **eerste** lidmaatschap (K6); geen aanmaken, accepteren of wisselen | `maakHuishouden(naam, eigen naam)`, `accepteerUitnodiging(token, eigen naam)` en `kiesHuishouden(id)`. De laatste keuze wordt per account onthouden (`localStorage`, alleen het id). Na aanmaken of accepteren direct naar dat huishouden |
| Scherm zonder huishouden | Alleen een melding | **Welkomstscherm** (S1) |
| Uitnodigingslink | Bestaat niet | **Uitnodiging accepteren** (S2) |
| Meer | Account en onbevestigde opdrachten | Blok **Huishouden** (S3): leden, lid toevoegen, uitnodigen, open uitnodigingen intrekken. **Wisselen** (S4) als je in meerdere huishoudens zit |

## 3. De schermen (mobiel eerst, in de bestaande stijl)

**S1 — Welkom (ingelogd, nog geen huishouden).** Twee keuzes, rustig onder elkaar:
- **"Nieuw huishouden"**: twee velden, *Naam van het huishouden* (bijvoorbeeld "Familie Jansen") en *Jouw naam*, plus één
  knop **Aanmaken**. Daarna sta je direct op Vandaag, als eigenaar. Een kleine tip wijst naar Meer → Huishouden om je
  partner uit te nodigen.
- **"Ik heb een uitnodiging"**: een veld om de link te plakken. Dat gaat naar S2.

**S2 — Uitnodiging accepteren.**
- Bereikbaar via de link `…/#/uitnodiging/<token>`, of door de link te plakken in S1.
- De app haalt het token direct uit de adresbalk (`history.replaceState`) en houdt het alleen in het geheugen en
  `sessionStorage`, tot het gebruikt is. Het blijft niet in de geschiedenis, een bladwijzer of een screenshot staan. Het
  token zit in het fragment (`#`), dus het gaat niet naar de server, en `Referrer-Policy: no-referrer` deelt het niet.
- Niet ingelogd? Dan eerst inloggen; daarna komt de vraag terug.
- Het scherm vraagt *Jouw naam*. Die is niet nodig bij een uitnodiging voor een bestaand profiel; dan neemt de database
  dat profiel over.
- Na **Accepteren** sta je direct in dat huishouden.
- Foutmeldingen zijn duidelijk: verlopen, al gebruikt, ingetrokken, niet meer geldig, of al lid.
- Op staging staat Cloudflare Access voor de app. Een link die bij Access binnenkomt, kan na het inloggen bij Access zijn
  fragment kwijt zijn. Daarom kan de link ook altijd in S1 geplakt worden. Dit controleren we op staging.

**S3 — Meer → Huishouden** (alleen eigenaar en beheerder zien de knoppen; leden zien de lijst):
- *Leden*: naam, volwassene of kind, "heeft een account", en rol (eigenaar, beheerder, lid).
- *Lid toevoegen*: naam en volwassene of kind (`add_member`). Zo kun je kinderen en een partner zonder account vastleggen.
- *Uitnodigen*: kies het profiel (een volwassene zonder account) of "iemand nieuw", en de rol (zie besluit 1). Je krijgt een
  link met **Delen** (de deelfunctie van de telefoon) of **Kopiëren**, en de tekst "Geldig tot …, één keer te gebruiken".
- *Open uitnodigingen*: voor wie, rol, geldig tot, en **Intrekken**, met één bevestiging (principe 5).

**S4 — Wisselen van huishouden** (alleen bij meer dan één): in Meer staat bovenaan de huishoudnaam met **Wisselen**. Een
lijst van je huishoudens; de keuze wordt onthouden. Wisselen stopt de sync van het oude huishouden (bestaand gedrag:
cache leeg, nieuw kanaal).

**Bewust niet in deel 1:**
- inloggen met een e-mailcode en zelf een account aanmaken (deel 2, zie besluit 4);
- leden archiveren of terughalen in het scherm (de database kan het, K3), rollen wijzigen, eigendom overdragen, het
  huishouden of je account verwijderen;
- schermen voor kinderaccounts.

## 4. Implementatie

| # | Stap | Bestanden |
| --- | --- | --- |
| 1 | Sessie: `maakHuishouden`, `accepteerUitnodiging`, `kiesHuishouden`, lijst van huishoudens met rol in de momentopname, laatste keuze per account. Altijd via de `public`-RPC's; foutcodes vertaald naar gewone taal | `src/lib/lokaal/sessie.ts` |
| 2 | Uitnodigingstoken: uit de URL halen, opruimen en bewaren tot het gebruikt is; link maken (de eigen site plus `#/uitnodiging/<token>`) | nieuw `src/lib/uitnodiging.ts` |
| 3 | S1 en S2 | `src/components/Lokaal.tsx` (of een nieuw `Onboarding.tsx`) |
| 4 | S3 en S4 in Meer; de rol komt uit `my_memberships`, de leden uit de sync (`toestand.leden`) | `src/screens/Meer.tsx` |
| 5 | Teksten volgens het bestaande toonregister. Geen nieuwe bibliotheken | — |

Alles werkt zowel in de lokale modus als in staging (dezelfde sessiecode). De demo verandert niet. Dit valt nog vóór
KG-5E (één datapad); dat blijft een aparte stap.

## 5. Tests

| Soort | Wat |
| --- | --- |
| Unit en component (Vitest) | Token uit de URL halen en wissen; foutcodes vertalen; S1, S2 en S3 met een nepclient (de juiste RPC met de juiste parameters, knoppen alleen voor eigenaar en beheerder); laatste keuze per account onthouden |
| Lokale e2e tegen de echte stack (`e2e-lokaal`) | Een nieuw fictief account zonder huishouden maakt er een → eigenaar → nodigt uit als beheerder → het tweede account accepteert in een tweede browsercontext → beide zien dezelfde boodschap, realtime. Plus: een verlopen of al gebruikte link geeft een nette melding; een account in twee huishoudens kan wisselen, en de huishoudens zien elkaars gegevens niet |
| Tegenproeven | De bestaande RLS-matrix blijft 56/56 (geen schemawijziging). Elke nieuwe e2e-test moet falen als de onderliggende RPC-aanroep wordt weggelaten |
| Staging, met de hand | Twee telefoons: aanmaken, uitnodigen via de deelfunctie, accepteren (ook via Access), samen een boodschap |

De lokale seed (`npm run lokaal:seed`) krijgt één extra fictief account **zonder** huishouden, voor de e2e. Daarvoor
verandert de database niet; het is alleen een testaccount op de lokale stack.

## 6. Productkompas-toets

1. **Principes:**
   - 1, minder gedoe: twee velden en klaar;
   - 3, één keer vertellen: een uitnodiging voor een bestaand profiel maakt geen tweede persoon;
   - 7, het huishouden staat centraal: leden zonder account, kinderen;
   - 5, bevestiging bij gevolgen: intrekken;
   - 2, rust: één welkomstscherm, geen wizard van vijf stappen.
2. **Neemt het werk weg?** Ja: zonder dit kan niemand zelf beginnen of zijn partner toevoegen.
3. **Hoort het bij organiseren?** Ja: het is de toegang tot het gezamenlijke huishouden.
4. **Kan het eenvoudiger?** Rollen en leden blijven verborgen tot je ze nodig hebt (Meer → Huishouden).
5. **Aandacht, controle, privacy:**
   - tokens zijn eenmalig, verlopen, worden gehasht bewaard en nooit gelogd;
   - alleen eigenaar of beheerder kan uitnodigen;
   - geen gegevens van een huishouden vóór het accepteren.
6. **Bewijs:** de proef op staging met twee telefoons.
7. **Ultieme toets:** het gezin hoeft niets dubbel in te voeren en niemand hoeft een beheerder te vragen.

**Gates:**
- beslissing 6 blijft gehaald: lidmaatschap ontstaat alleen door aanmaken of accepteren, nooit door activiteit;
- gate 9 verandert niet: geen nieuwe inhoudstabel.

## 7. Besluiten vóór de bouw

| # | Besluit | Advies |
| --- | --- | --- |
| 1 | Met welke rol nodig je een partner standaard uit? | **Beheerder**: gelijkwaardig in de dagelijkse dingen, zonder eigendom. In het scherm te veranderen naar "lid" |
| 2 | Hoe lang is een uitnodiging geldig? | **7 dagen** (de standaard van de database) |
| 3 | Hoe deel je de uitnodiging? | **Een link**, via de deelfunctie of kopiëren. Geen QR-code in deel 1 |
| 4 | Inloggen met een e-mailcode en zelf een account aanmaken | **Deel 2**, na de keuze voor een EU-SMTP-dienst (B4). Tot dan maakt de beheerder de testaccounts aan in het Supabase-dashboard. Staging blijft dus gesloten |

## 8. Omvang en wat er niet verandert

- Ongeveer 5 bestanden in `komtgoed/app`, plus tests. Geen migratie, geen nieuwe bibliotheek, geen wijziging aan de
  sync-module.
- Huisplan, `main`, GitHub Pages en de Huisplan-projecten blijven ongemoeid.
- Online gebeurt niets tot een apart akkoord voor pushen. Een push naar `thuisplanner-staging` is meteen een nieuwe
  deployment op Cloudflare (achter Access).

## 9. Uitgevoerd (16 oktober 2026, alleen lokaal)

**Voorwaarden van de producteigenaar:**
1. Eigenaar en beheerder zijn gelijkwaardig voor alle dagelijkse huishoudelijke functies. Exclusieve eigenaarsrechten
   blijven beperkt tot uitzonderlijke beheerhandelingen. De technische eigenaar staat los van een toekomstige
   abonnementsbetaler.
2. De uitnodigingsflow wordt zorgvuldig gecontroleerd op tokenveiligheid, eenmalig gebruik, intrekken, vervallen,
   scheiding tussen huishoudens en het behouden van de uitnodiging tijdens het inloggen. Een URL-fragment geldt op
   zichzelf niet als beveiliging.

**Gebouwd (alleen app-code, geen databasewijziging):**

| Onderdeel | Bestand |
| --- | --- |
| Uitnodigingstoken: uit de adresbalk, bewaren, link maken, plakken | `komtgoed/app/src/lib/uitnodiging.ts`, aangeroepen in `src/main.tsx` vóór de app laadt |
| Sessie: `maakHuishouden`, `accepteerUitnodiging`, `kiesHuishouden`, `verlaatHuishouden`; huishoudens met rol in de momentopname; laatste keuze per account | `src/lib/lokaal/sessie.ts` |
| Beheer: lid toevoegen, uitnodigen (7 dagen), open uitnodigingen, intrekken | `src/lib/lokaal/beheer.ts` |
| S1 Welkom, S2 Uitnodiging (met "Toch niet: verlaten") | `src/components/Onboarding.tsx` |
| S3 en S4 in Meer | `src/components/HuishoudenBeheer.tsx`, `src/screens/Meer.tsx` |
| Routering: niet ingelogd → inloggen; uitnodiging → S2; geen huishouden → S1 | `src/App.tsx` |
| `<meta name="referrer" content="no-referrer">` als extra naast de header | `index.html` |
| Twee fictieve accounts zonder huishouden (Sanne, Joris) in de lokale seed | `scripts/lokaal.mjs` |

**Voorwaarde 1: rollen.** In het scherm heten eigenaar en beheerder allebei "beheerder" (de eigenaar als "Beheerder ·
eigenaar"), en ze zien dezelfde knoppen: lid toevoegen, uitnodigen, intrekken. Alle dagelijkse inhoud (afspraken,
taken, boodschappen) mag ieder actief lid wijzigen, ook een gewoon lid; dat dwingt de database al af. Alleen de eigenaar
mag (database, ongewijzigd):
- iemand als beheerder uitnodigen;
- een beheerder archiveren;
- rollen wijzigen;
- het eigendom overdragen;
- het huishouden verwijderen.

Dat zijn uitzonderlijke handelingen. "Eigenaar" is alleen de technische rol in het huishouden. Er is nergens een
koppeling met betalen; een latere abonnementsbetaler wordt een eigen gegeven (F10) en niet afgeleid uit `owner`.

**Voorwaarde 2: de uitnodigingsflow gecontroleerd.**

| Eis | Hoe geborgd | Bewijs |
| --- | --- | --- |
| Het token is onraadbaar en wordt niet opgeslagen | 32 willekeurige bytes uit `gen_random_bytes`; de database bewaart alleen de SHA-256 en geeft het token één keer terug | Migratie `create_invite`, KG-T04 (hash niet leesbaar) |
| Niet uit de URL te lekken | Het token staat in het fragment (niet in verzoeken naar de server). De app haalt het weg vóór de app laadt en zet `#/vandaag` terug (geschiedenis, bladwijzer, screenshot). `Referrer-Policy: no-referrer` (header en meta). De CSP staat geen verbinding met andere sites toe | Unittest; e2e: na openen en na inloggen geen token in `page.url()`; tegenproef (zonder wegnemen faalt de test) |
| Niet langer bewaard dan nodig | Alleen in `sessionStorage` van dat tabblad (niet in `localStorage`, niet in een cookie); weg na gebruik, na "Niet accepteren" en na 24 uur; ongeldige of geknoeide waarden worden gewist | Unittests; e2e: na accepteren staat het token nergens meer in de opslag |
| Behouden tijdens het inloggen | Het token blijft in `sessionStorage` tijdens het inloggen; daarna verschijnt S2 | e2e: Joris opent de link uitgelogd, logt in en accepteert |
| Nooit ongemerkt accepteren | Alleen na een klik op Accepteren, met het account in beeld en de waarschuwing "accepteer alleen van iemand die je kent"; daarna kun je direct weer weg ("Toch niet") | Unittest met tegenproef (automatisch accepteren faalt de test) |
| Eenmalig | `accept_invite` controleert `accepted_at` onder een vergrendeling | KG-T08; e2e: dezelfde link door een tweede account geeft "Uitnodiging is al gebruikt" |
| Intrekken | `revoke_invite`; daarna weigert `accept_invite` | KG-T09; e2e: ingetrokken link geeft "Uitnodiging is ingetrokken" |
| Verlopen | Na de termijn weigert `accept_invite`; de database staat 1–30 dagen toe (de app vraagt 7) | KG-T09 (in de database). **Niet in de e2e:** daarvoor zou de vervaldatum in de database moeten worden teruggezet |
| De maker is nog bevoegd | `accept_invite` controleert dat de maker de uitnodiging nu nog mag geven | KG-T28 |
| Gescheiden huishoudens | Accepteren voegt alleen toe aan het huishouden van de uitnodiging; leden, huishoudens en uitnodigingen alleen via RLS van je eigen huishoudens; vóór het accepteren is niets van het huishouden te lezen | KG-T05, T12, T13; e2e: Sanne ziet alleen haar eigen huishouden, en een boodschap van het ene huishouden staat niet in het andere |
| Rol uit de uitnodiging, niet uit de app | De app stuurt bij accepteren alleen het token en de naam; de database kent de rol toe. Beheerder uitnodigen kan alleen de eigenaar | KG-T10, T11; e2e: in de database is Joris `admin`; unittest: een beheerder krijgt de keuze "Beheerder" niet |

**Wat de app niet kan afdwingen:** wie een geldige link vóór gebruik doorstuurt, geeft die toegang door. Dat kan bij
elke uitnodigingslink; de maatregelen zijn eenmalig gebruik, 7 dagen, intrekken, en dat de eigenaar en beheerders in
Meer zien wie er is binnengekomen. Op staging staat Cloudflare Access er nog voor.
