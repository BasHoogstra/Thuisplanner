// Plannen (besluit 18): fictieve voorbeelden voor de demo. "Schuur opruimen" is klein en heeft geen onderdelen; "Zolder
// verbouwen" is groot en heeft ze wel. In de gewone dag staat één taak op vandaag, zodat je ziet dat afvinken overal
// doorwerkt; de rustige dag blijft rustig.
import { plusDagen } from '../lib/datum';
import type { Datum, Item, LidId, Plan, PlanOnderdeel, Taak } from '../lib/types';
import type { Scenario } from './demo';

export interface DemoPlannen {
  plannen: Plan[];
  onderdelen: PlanOnderdeel[];
  items: Item[];
}

export function demoPlannen(vandaag: Datum, scenario: Scenario): DemoPlannen {
  const d = (n: number) => plusDagen(vandaag, n);
  const SCHUUR = 'plan-schuur', ZOLDER = 'plan-zolder';
  const taak = (id: string, planId: string, titel: string, voor: LidId | null, velden: Partial<Taak> = {}): Taak =>
    ({ id, soort: 'taak', titel, datum: null, voor, klaar: false, klaarOp: null, planId, ...velden });
  const VOOR = 'ond-voorbereiding', BOUW = 'ond-verbouwing', AF = 'ond-afwerking';
  return {
    // De volgorde van aanmaken: eerst de schuur, daarna de zolder.
    plannen: [
      { id: SCHUUR, titel: 'Schuur opruimen', omschrijving: 'Eindelijk weer ruimte voor de fietsen.', einddatum: null, wie: [] },
      { id: ZOLDER, titel: 'Zolder verbouwen', omschrijving: 'Een eigen kamer voor Lotte.', einddatum: d(75), wie: ['m-eva', 'm-thomas'] },
    ],
    onderdelen: [
      { id: VOOR, planId: ZOLDER, naam: 'Voorbereiding', volgorde: 1 },
      { id: BOUW, planId: ZOLDER, naam: 'Verbouwing', volgorde: 2 },
      { id: AF, planId: ZOLDER, naam: 'Afwerking', volgorde: 3 },
    ],
    items: [
      taak('t-schuur-fietsen', SCHUUR, 'Fietsen eruit halen', 'm-thomas', { klaar: true, klaarOp: d(-2) }),
      taak('t-schuur-gereedschap', SCHUUR, 'Oud gereedschap uitzoeken', 'm-thomas', { bezig: true }),
      taak('t-schuur-kringloop', SCHUUR, 'Spullen naar de kringloop', 'm-eva', { datum: scenario === 'gewoon' ? d(0) : d(2) }),
      taak('t-schuur-planken', SCHUUR, 'Planken ophangen', null),
      taak('t-schuur-vegen', SCHUUR, 'Vegen', 'm-lotte'),

      taak('t-zolder-leeg', ZOLDER, 'Zolder leegruimen', 'm-thomas', { onderdeelId: VOOR, klaar: true, klaarOp: d(-9) }),
      taak('t-zolder-offertes', ZOLDER, 'Offertes dakraam vergelijken', 'm-thomas', { onderdeelId: VOOR, klaar: true, klaarOp: d(-4) }),
      taak('t-zolder-vergunning', ZOLDER, 'Vergunning nakijken', 'm-eva', { onderdeelId: VOOR, datum: d(4), bezig: true }),
      taak('t-zolder-budget', ZOLDER, 'Budget afspreken', null, { onderdeelId: VOOR }),
      taak('t-zolder-dakraam', ZOLDER, 'Dakraam laten plaatsen', 'm-thomas', { onderdeelId: BOUW, datum: d(30) }),
      taak('t-zolder-isolatie', ZOLDER, 'Isolatie aanbrengen', 'm-thomas', { onderdeelId: BOUW }),
      taak('t-zolder-elektra', ZOLDER, 'Elektra leggen', null, { onderdeelId: BOUW }),
      taak('t-zolder-muren', ZOLDER, 'Muren schilderen', 'm-eva', { onderdeelId: AF }),
      taak('t-zolder-vloer', ZOLDER, 'Vloer leggen', null, { onderdeelId: AF }),
      taak('t-zolder-bureau', ZOLDER, 'Bureau terugzetten', 'm-thomas', { onderdeelId: AF }),
    ],
  };
}
