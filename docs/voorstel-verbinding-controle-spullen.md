# Voorstel, lokaal toegepast in stap 1: `staging/verbinding-controle.mjs` en Storage

**Status:** op 28 oktober 2026 in stap 1 lokaal toegepast (niet gecommit; zie §16.2 van het ontwerpdocument). Oorspronkelijk: een voorstel. De stagingscripts waren in de vorige stap bewust **niet** gewijzigd
(akkoord van 28 oktober 2026: "geen CI- of stagingscripts wijzigen"). Daarom faalt de lokale `nacontrole.test.mjs` nu op
de nieuwe migratie. Dat is verwacht; het gedrag van de app en de database verandert er niet door.

## Waarom het nodig is

`verbinding-controle.mjs` (en `tests/integratie/nacontrole.test.mjs`, dat hem gebruikt) weigert nu twee dingen:

1. **Een migratiestand zonder referentie:** `20261029120000` staat niet in `SCHEMA_PER_STAND`.
2. **Storage in gebruik:** elke bucket of policy op `storage.objects` geeft "Storage is in gebruik". Besluit 17 vraagt hier
   een **vaste lijst** in plaats van "geen opslag".

## Voorgestelde wijziging

```js
// in SCHEMA_PER_STAND, een nieuwe regel (de bestaande blijven ongewijzigd):
  // Plus Mijn spullen & Documenten (migratie 29, nog niet online; na de geplande migratie 28 voor Vakanties): +3 relaties (possessions, documents,
  // document_links), +9 policies (drie per tabel), +15 functies in private en +3 in public (documenten_klaar,
  // documenten_mislukt, documenten_op_te_ruimen). Gemeten op de lokale stack thuisplanner_spullen (28 oktober 2026).
  '20261029120000': Object.freeze([
    Object.freeze({ schema: 'private', relaties: 9, functies: 118, policies: 0 }),
    Object.freeze({ schema: 'public', relaties: 18, functies: 41, policies: 39 }),
  ]),

// de opslag: niet meer tellen, maar vergelijken met een vaste lijst
export const VERWACHTE_OPSLAG = Object.freeze({
  buckets: [{ id: 'documenten', public: false, file_size_limit: 10485760,
    allowed_mime_types: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] }],
  policies: [{ naam: 'documenten_lezen', cmd: 'SELECT' }, { naam: 'documenten_uploaden', cmd: 'INSERT' }],
});
// ...en in de fouten: elke bucket of policy die niet precies op deze lijst staat, en elke ontbrekende, is een fout.
```

Daarnaast staat de opruimronde (`opruimen-documenten`) nog niet in pg_cron. Bij het inplannen komt er één regel bij
`VERWACHTE_TAKEN` (bijvoorbeeld `thuisplanner-documenten-opruimen`, dagelijks). Ook dat gebeurt pas met een eigen akkoord.

## Ook nog open (buiten deze stap)

- `staging/verbinding.ps1`: verwacht 20 migraties in plaats van 19 (pas bij een uitrol).
- `staging/generale.sh`, `staging/hersteltoets.sh`, `.github/workflows/thuisplanner-db.yml` en `README.md`: daar staat
  nog `-x storage-api`. Zonder Storage bestaat `storage.buckets` niet en faalt de migratie.
- `staging/export.mjs`: de bestanden meenemen (download met de service-rol, SHA-256 in het manifest).
- Het verwijderscript uit de bèta-voorbereiding: de bestanden erbij. Dat document is van een andere sessie.
