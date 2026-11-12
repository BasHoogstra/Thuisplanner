# Plannen: bijlagen bij een plan en bij een taak (ontwerp)

**Status:** aanvulling van de producteigenaar van 4 november 2026 op `docs/thuisplanner-plannen.md` §4.7 en §6.3 (dat document
staat op `thuisplanner-deel2`). In stap B is alleen het koppelmodel gebouwd: `src/lib/plan-bijlagen.ts`, `PlanKoppeling` in
`types.ts` en het opruimen van koppelingen in `store.ts`. **Geen upload, geen scherm, geen migratie, geen bucket.**

## Wat er moet kunnen

- Plan "Zolder verbouwen": foto's, bouwtekeningen en offertes.
- Taak "Muren schilderen": inspiratiefoto's en foto's van het resultaat.
- Taak "Dakraam laten plaatsen": handleiding en offerte.

## Keuzes

| # | Eis | Ontwerp |
| --- | --- | --- |
| 1 | Meerdere foto's en documenten per plan en per taak | Eén rij per koppeling, zonder maximum in het model. |
| 2 | Foto's direct zichtbaar, met vergroten | Een rij miniaturen; een tik vergroot. Op de planpagina staan ook de bijlagen van de taken, met de naam van de taak erbij. |
| 3 | Toevoegen vanaf de telefoon, ook met de camera | Een bestandskeuze met `accept="image/*,application/pdf"`; iOS en Android bieden dan zelf de camera aan. Geen `capture`, want dat sluit de fotobibliotheek uit. |
| 4 | Veilige opslag per huishouden | Echt pad: de privé-bucket van besluit 17, kort geldige ondertekende links, gate 9 en de gate van besluit 17. |
| 5 | Documenten uit Mijn spullen hergebruiken, zonder dubbele opslag | Een bijlage is alleen een koppeling naar `documents.id`. Het model bevat geen bestand, naam of pad, dus een kopie kan niet ontstaan. |
| 6 | Eén onderliggende taak | De koppeling verwijst naar de taak-id. Taak, Agenda en Vandaag kennen geen eigen kopie. |

## Het model

```ts
type BijlageDoel = { planId: string } | { taakId: string };   // precies één doel
interface PlanKoppeling { id: string; documentId: string; doel: BijlageDoel }
```

- **Hetzelfde document bij meer doelen** kan: één document, meerdere koppelingen. Bij hetzelfde doel hoogstens één keer.
- **Koppeling weg:** het document blijft bestaan. Een document verwijderen is een eigen handeling in Mijn spullen & Documenten.
- **Taak verwijderd:** haar koppelingen vervallen.
- **Plan verwijderd:** de koppelingen met het plan vervallen. Kies je "Alleen het plan", dan houden de taken die blijven hun bijlagen.
- **Ongedaan maken** zet de koppelingen mee terug.

## Schets voor de echte versie (nog geen migratie)

```sql
create table public.plan_document_links (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  document_id uuid not null,      -- FK (household_id, document_id) naar documents
  plan_id uuid,                   -- FK (household_id, plan_id)
  task_id uuid,                   -- FK (household_id, task_id)
  check (num_nonnulls(plan_id, task_id) = 1)
);
-- Plus unieke indexen per doel voor actuele rijen, RLS zoals document_links en dezelfde tegenproeven.
```

Een eigen koppeltabel laat `document_links` van Spullen, met de bestaande tests, ongemoeid.

## Vragen voor de bouw van de echte versie

1. **Soort `foto`:** `documents.kind` kent die niet, en verbouwfoto's horen niet tussen de garanties. Besluit: standaard verborgen in Documenten (beslissing 7 in het ontwerp).
2. **Persoonlijke documenten:** alleen documenten die voor het huishouden zichtbaar zijn, zijn te koppelen. Zo ontstaat geen aanwijzing dat een persoonlijk document bestaat.
3. **HEIC van de iPhone:** de bucket staat alleen PDF, JPEG, PNG en WebP toe. Testen en waarschijnlijk op het toestel omzetten en verkleinen (±0,5 MB).
4. **Beveiligingsheaders:** de huidige CSP (`img-src 'self' data:`) staat `blob:` en ondertekende Supabase-links niet toe. Dat moet bewust worden aangepast, ook voor de nagespeelde bijlagen in stap D. `Permissions-Policy: camera=()` raakt de bestandskeuze niet, maar dat moet op een echte iPhone worden bevestigd.
5. **Kosten:** de raming in Spullen §6.8 gaat uit van 3 documenten per maand. Plannen met foto's zitten daar ruim boven; dat vraagt een nieuwe raming.
