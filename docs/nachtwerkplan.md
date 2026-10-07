# Huisplan Nachtwerkplan v1.0

Uitvoerbare queue voor zelfstandig Claude-nachtwerk. Zie docs/claude-nachtwerk-protocol.md. Roadmap en technische contracten blijven leidend; open eigenaarbeslissingen worden niet stil ingevuld.

**Risico:** 🟢 zelfstandig; 🟠 bouwen/testen, niet activeren/migreren/productie wijzigen; 🔴 expliciet akkoord.

## Mijlpaal A — 1.4.2 veilig afronden

### NW-01 — P1-3 emulatorbewijs hervatten 🟢 — EERSTVOLGEND
Controleer eerst de onafgemaakte P1-3 proefbestanden. Hervat uitsluitend de Firebase Emulator-proef. Eerdere harness-correcties: leeg object is geen geldige persisted-control; A5.2 toetst aantoonbare weigering, niet specifiek HTTP 401. Test ETag/If-Match, lege locaties, regelevaluatie en PUT/PATCH/DELETE/subpad/parent/multipath/**POST** (historische sendBeacon-writer).
**Klaar:** reproduceerbaar rapport, emulator/productieverschillen benoemd, lokale tests groen.
**Verboden:** echte Firebase/plannerdata, rules publiceren, Supabase, migratie.
**Status (6 okt 2026):** afgerond. Onderzoek in `docs/p1-3-emulatorproef.md`; eerdere proefbestanden niet teruggevonden, proef opnieuw en reproduceerbaar opgezet (`tools/emulator/`). **Besluit P1-3: optie A** (producteigenaar, 6 okt 2026): emulator aanvaard als bewijsomgeving binnen de beschreven beperkingen; geen toestemming voor productieregels, productiedata, Supabase of slotactivering. Open data-veiligheidspunt P1-11 (lijst met gaten / `normalizeData`) blijft open en moet vóór 1.5 zijn opgelost of bewezen.

### NW-02 — E6 verhuisslot-proof 🟠
**Status (6 okt 2026): niet gestart, op aanwijzing van de producteigenaar.** P1-3 is besloten (optie A). P1-1 (werkelijke regels) en P1-2 (historische clients) zijn eerder onderzocht en worden niet opnieuw gedaan; NW-02 sluit bij de start aan op die uitkomsten. Aandachtspunten uit NW-01: door het cascaderen van regels moet het slot op of boven het hoogste schrijfbare pad staan; een historische POST/sendBeacon-schrijver moet net zo worden geweigerd als PUT. Start alleen na expliciete opdracht.
Na NW-01. Bewijs met fictieve data: bron immutable na lock; alle historische schrijfvormen geblokkeerd; parent/multipath kan niet omzeilen; control niet via gewone datawrites wijzigbaar; target veilig init; twee migrators divergeren niet; hervatten deterministisch; oude/onderweg writers veilig. Output = bewijs + voorstel regels/paden. Niets publiceren.

### NW-03 — Eén veilige write-coördinator 🟢
E2: push/flush/load/retry/poll via één coordinator. Geen bruikbare ETag = geen write; geen ongeconditioneerde fallback. Onzeker resultaat/412 → reread → merge met base → conditionele retry; begrensde retries; geen poll tijdens write. Tests T1–T5.
**Status (6 okt 2026):** gebouwd in de testversie (`test/index.html`), tests `tests/schrijven.test.js`. Niet live; livegang via een aparte PR na akkoord (ontwerp 1.4.2, sectie 9).
**Codex-review (6 okt 2026): FIX BEFORE MERGE** — beide blockers en de belangrijke bevindingen hersteld in PR #15; opnieuw ter review. Tweede Codex-herreview (7 okt 2026): FIX BEFORE MERGE — schrijfjournaal (reload-veilig), tijdslimiet over het hele antwoord, automatische acceptatie alleen bij aantoonbaar verliesvrij samenvoegen, duidelijkere vraag; hersteld in PR #15, opnieuw ter review. Een schrijfmarkering is een mogelijke latere UX-verbetering, geen veiligheidsvereiste.

### NW-04 — Cache/storage resilience 🟢
E3: cache-identiteit database+planner+storage generation zonder secrets leesbaar. Behandel quota/read/parse/delete/network+storage, oude cache, verkeerde planner/generatie. Kritieke fouten zichtbaar; nooit onterecht “opgeslagen”. Tests T6–T8.

### NW-05 — Recovery bundle v2 🟠
E1: raw serverdata+ETag/hash, local data/base, localGen/confirmedGen, member-backups, storage identity, appversie/checksum, ruimte UUID-mapping. Pas bevestigd na teruglezen/checksum. Alleen fixtures/emulator.

### NW-06 — Recovery exercises 🟠
Automatiseer R1/R2/R4; bereid R3-framework voor. 🔴 Voor R3-activering moet producteigenaar R3a/b/c kiezen; ontwerpvoorkeur R3a is geen automatische beslissing.

### NW-07 — Causal decision log 🟢
Pure motor voor membership(member/notMember) en identityPair(same/different). Unieke opId; basedOn lijst; expliciet subject/type; canonieke inhoud. Zelfde opId andere inhoud = harde fout. Geen klok als arbiter. Resolutie bouwt op alle heads. Geen impliciete membership-effecten. Tests T9–T11.

### NW-08 — UUIDv5 voorbereiding 🟠
Bouw integratiepunt/testharnas + standaardtestvectoren. Geen permanente Huisplan-namespace/inputencoding zelf kiezen of echte data gebruiken. 🔴 Voor gebruik: namespace, exacte inputencoding en version labels vaststellen. Test T12.

### NW-09 — Lokale data-classifier 🟢
E5: alleen anonieme vormen/aantallen, ID-aanwezigheid/uniciteit, mixed lists, mergegedrag, person refs, categorie/actie, blokkades, raw-vs-normalized. Eerst fixtures; eigen data later uitsluitend lokaal door producteigenaar.

### NW-10 — 1.4.2 integratie-RC 🟠
Integreer E1–E6; regressies groen. Geen datamigratie, Firebase lock/rules-activering of echte planner als migratietest.

### 🔴 Gate A — vóór 1.5
E1–E6 afgerond; recoverystrategie gekozen; UUID-contract definitief; E6-onzekerheden opgelost; oude writers server-side uitsluitbaar. Werkelijke Firebase-regels/lock alleen na apart akkoord. Selectieve onafhankelijke review aanbevolen.

## Mijlpaal B — stabiele persoonsidentiteit
- **NW-11 🟠 1.5 migrator:** member UUID refs; resolveMember geeft bestaand lid/null en creëert nooit; ambiguity null; actor≠member; non-member labels blijven; deterministisch/idempotent/hervatbaar.
- **NW-12 🟢 fixture suite:** single/two/multi adult, kids, duplicate names, guest/oppas, old labels, ambiguity, rename/archive, offline, conflicts, unknown fields, partial migration; tweede run geen mutatie.
- **NW-13 🟠 rehearsal:** emulator/kopie lock→selftest→read→migrate→conditional target write→reread→hash/semantic verify.
- **🔴 Gate B:** echte planner pas na expliciet akkoord + recovery/apparatencheck/lockbewijs/membercheck/UUID/rehearsal groen.

## Mijlpaal C — leden
- **NW-14 🟢:** centraal ledenbeheer voor 1/2/meer volwassenen en kinderen; add/correct/archive; activiteit creëert nooit lid.
- **NW-15 🟢:** account/member/actor/guest scheiden; byMember=null geldig; byLabel context.
- **NW-16 🟠:** veilige correctie/merge/redirect/archive; same household, acyclic, expliciet, refs behouden.

## Mijlpaal D — accounts/toegang
- **NW-17 🟠:** Supabase schema-contract: item identity onafhankelijk collection, UUID+kind/type; member status/legacy IDs/user link; ownership/delete herzien. 🔴 Productieschema pas akkoord.
- **NW-18 🟠:** Supabase Auth op staging; account≠member; koppel bestaand lid.
- **NW-19 🟢/🟠:** nieuw huishouden minimale onboarding, geen verplichte partnerinvite.
- **NW-20 🟠:** invite/access, link account→bestaand member, revoke, owner/last-owner.
- **NW-21 🟠:** privacy/RLS: household isolation, active/archive, owner/member, protected data, revoke/unlink. 🔴 Geen echte SupabaseStore-data vóór groen; review aanbevolen.

## Mijlpaal E — Supabase echte opslag
- **NW-22 🟠:** SupabaseStore: read/guarded write/realtime/offline/retry/conflicts/identity; geen UI-herbouw tegelijk.
- **NW-23 🟢:** multi-client tests concurrent/offline/reconnect/delete/stale/conflict/revoked/archived.
- **NW-24 🟠:** file/photo storage met context en security.
- **NW-25 🟠:** aparte Firebase→Supabase importer met herbruikbaar lock, selftest, deterministic conversion, verify/resume/recovery.
- **NW-26 🟠:** menselijke migration wizard zonder backendjargon.
- **NW-27 🟠:** late/offline writers zonder stil dataverlies.
- **🔴 Gate C:** echte verhuizing pas na RLS, recovery, importer, offline, lock, staging rehearsal en regressies groen + expliciet akkoord. Hiermee is “veilig van Firebase naar Supabase” bereikt.

## Mijlpaal F — nieuw huishoudmodel
- **NW-28 🟢:** stabiele item identity; kleine common core, type-specific properties.
- **NW-29 🟢:** relaties context/about/supports, same-household invariant.
- **NW-30 🟢:** één item in meerdere views zonder kopieën.

## Mijlpaal G — Vandaag
- **NW-31 🟢:** niet-muterende Today projection; tijd/actionability/consequence/context/personal relevance/change/confidence.
- **NW-32 🟢:** max één attention card; tonen alleen als nuttig; plan-invalidating changes zwaar.
- **NW-33 🟢:** personalized Today, gedeelde truth; privacy apart.
- **NW-34 🟢:** calm completion, **Vandaag is geregeld ✓**, morgen alleen als nu nuttig.

## Mijlpaal H — intelligente +
- **NW-35 🟢:** unified natural input shell; tekst en adapters spraak/foto/document; geen category-first.
- **NW-36 🟢:** intent model: direct/clarify/confirm/suggest/prepared external action; één gedachte→meerdere gekoppelde acties.
- **NW-37 🟢:** confidence×consequence matrix.
- **NW-38 🟢:** correction engine wijzigt alleen gecorrigeerde dimensie; tests persoon/tijd/datum/hoeveelheid/bestemming/relatie.
- **NW-39 🟢:** compact resultaat **Geregeld ✓** + Undo.

## Mijlpaal I — Agenda
- **NW-40 🟢:** household-aware events met brengen/halen/meenemen/prep/vertrek.
- **NW-41 🟢:** dependencies projecteren relevante acties naar Vandaag.
- **NW-42 🟢:** menselijke conflicts; geen stille responsibility reassignment.
- **NW-43 🟠:** external calendar adapter; integreren vóór nabouwen; minimale private exposure.

## Mijlpaal J — Taken/routines
- **NW-44 🟢:** household-first; “Ik pak 'm” tijdelijk; vast alleen expliciet.
- **NW-45 🟢:** calendar-bound + rhythm-bound recurrence.
- **NW-46 🟢:** contextual urgency zonder shame/scoreboard.

## Mijlpaal K — Boodschappen
- **NW-47 🟢:** shared realtime shopping.
- **NW-48 🟢:** patterns ≠ inventory; afwijzing verlaagt suggesties.
- **NW-49 🟢:** shop mode volgens geleerde route, geen verplichte aisle-config.
- **NW-50 🟢:** store-route learning met subtiele realtime late-add signalen.

## Mijlpaal L — Vakantie
- **NW-51 🟢:** trip context known→prepare→arrange→pack→departure→on-site→learn.
- **NW-52 🟢:** preparation planner spreidt alleen relevante acties.
- **NW-53 🟢:** smart packing op gezin/duur/transport/verblijf/seizoen/weer/history/al geregeld.
- **NW-54 🟢:** Kan nu vs Pas op het laatst.
- **NW-55 🟢:** trip learning; expliciet > afgeleid.
- **NW-56 🟢:** on-trip transformation; prep verdwijnt, actuele context blijft.

## Mijlpaal M — aandacht/meldingen
- **NW-57 🟢:** minst indringende voldoende kanaal.
- **NW-58 🟢:** suppression bij geen nieuwe info/gezien/uitgesteld/geregeld.
- **NW-59 🟢:** multi-user resolution annuleert overbodige reminders zonder extra ruis.
- **NW-60 🟢:** goede default; optioneel Rustig/Normaal/Extra hulp per user.

## Mijlpaal N — leren
- **NW-61 🟢:** facts/patterns/assumptions expliciet.
- **NW-62 🟢:** learning scopes household/user/member/user+store/context.
- **NW-63 🟢:** correction feedback verlaagt/verhoogt passende confidence; nooit permanente taakverantwoordelijkheid afleiden.

## Mijlpaal O — onboarding
- **NW-64 🟢:** two-minute onboarding, minimale info.
- **NW-65 🟢:** first real input; wow = resultaat.
- **NW-66 🟢/🟠:** permissions pas na concrete waarde.

## Mijlpaal P — commercieel
- **NW-67 🟢 ontwerp/🟠 implementatie:** Free bruikbaar; Premium automation/AI/integraties/gemak; geen data-hostage.
- **NW-68 🟠:** household subscription; trial→Free met data.
- **NW-69 🔴 activering:** payments alleen geïsoleerd voorbereiden/testen; productiecredentials/echte betaling/commerciële activering expliciet akkoord + security review.

## Eerste nacht
Start bij **NW-01**. Ga alleen automatisch verder als afhankelijkheden en risiconiveau het toestaan. Open P1-vragen uit docs/ontwerp-1.4.2.md worden nooit stil ingevuld om tempo te maken.
