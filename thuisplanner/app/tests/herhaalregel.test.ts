// @vitest-environment node
// Het gedeelde herhalingscontract (ontwerp fase A, §5): de gedeelde testvectoren, de geldigheid van regels, en het
// bewijs dat de bestaande herhalingen (dagelijks/wekelijks/maandelijks/jaarlijks met een einddatum) exact hetzelfde
// blijven, vergeleken met de huidige app (herhaling.ts) en met de huidige databaseregel (private.occurs_on).
import { readFileSync } from 'node:fs';
import { herhalingTekst, voorkomenDatums } from '../src/lib/herhaling';
import {
  controleerRegel, datumsTussen, komtVoorOp, MAX_KEREN, regelTekst, regelUitFrequentie, type Herhaalregel,
} from '../src/lib/herhaalregel';
import type { Datum, Frequentie } from '../src/lib/types';

interface DatumVector {
  naam: string; anker: Datum; regel: Herhaalregel; van: Datum; tot: Datum; datums: Datum[];
  uitzonderingen?: Datum[]; tekst?: string;
}
interface GeldigheidVector { naam: string; anker: Datum; regel: Herhaalregel; fouten: string[] }
const vectoren = JSON.parse(readFileSync(new URL('../../supabase/tests/herhaalregel/vectoren.json', import.meta.url), 'utf8')) as {
  datums: DatumVector[]; geldigheid: GeldigheidVector[];
};

// Eigen, losse datumrekening voor de tests (UTC, hele dagen), zodat de verwachting niet op de module leunt.
const dagNr = (d: Datum) => { const [j, m, t] = d.split('-').map(Number); return Date.UTC(j, m - 1, t) / 86400000; };
const datum = (n: number): Datum => new Date(n * 86400000).toISOString().slice(0, 10);
const dagenVan = (van: Datum, tot: Datum) => Array.from({ length: dagNr(tot) - dagNr(van) + 1 }, (_, i) => datum(dagNr(van) + i));

/** De huidige databaseregel private.occurs_on (kg5c_inhoud.sql:172), letterlijk nagebouwd. */
function oudeOccursOn(start: Datum, freq: string, until: Datum | null, dag: Datum): boolean {
  if (dag < start || (until !== null && dag > until)) return false;
  const [sj, sm, sd] = start.split('-').map(Number), [, dm, dd] = dag.split('-').map(Number);
  void sj;
  switch (freq) {
    case 'daily': return true;
    case 'weekly': return (dagNr(dag) - dagNr(start)) % 7 === 0;
    case 'monthly': return dd === sd;
    case 'yearly': return dm === sm && dd === sd;
    default: return false;
  }
}

describe('herhaalregel: gedeelde testvectoren', () => {
  it.each(vectoren.datums.map(v => [v.naam, v] as const))('%s', (_, v) => {
    expect(datumsTussen(v.anker, v.regel, v.van, v.tot, v.uitzonderingen)).toEqual(v.datums);
    // De dagtoets (zonder uitzonderingen) en de opsomming zijn het per dag eens.
    const zonder = new Set(datumsTussen(v.anker, v.regel, v.van, v.tot));
    for (const d of dagenVan(v.van, v.tot)) expect(komtVoorOp(v.anker, v.regel, d), d).toBe(zonder.has(d));
    if (v.tekst) expect(regelTekst(v.anker, v.regel)).toBe(v.tekst);
  });

  it.each(vectoren.geldigheid.map(v => [v.naam, v] as const))('%s', (_, v) => {
    expect(controleerRegel(v.anker, v.regel)).toEqual(v.fouten);
    if (v.fouten.length) {
      expect(datumsTussen(v.anker, v.regel, '2026-01-01', '2027-12-31')).toEqual([]);
      expect(komtVoorOp(v.anker, v.regel, v.anker)).toBe(false);
    }
  });
});

describe('herhaalregel: gelijk aan de bestaande herhalingen (10 jaar)', () => {
  const FREQ: [Frequentie, string][] = [['dagelijks', 'daily'], ['wekelijks', 'weekly'], ['maandelijks', 'monthly'], ['jaarlijks', 'yearly']];
  const VAN = '2024-01-01', TOT = '2033-12-31';
  // Maand- en jaarreeksen: elk anker van een schrikkeljaar (alle randen: 29–31, 29 februari).
  // Dag- en weekreeksen: twee weken ankers (elke weekdag twee keer).
  const ankers = (freq: string) => (freq === 'monthly' || freq === 'yearly' ? dagenVan('2024-01-01', '2024-12-31') : dagenVan('2024-01-01', '2024-01-14'));
  const eindes = (anker: Datum): (Datum | null)[] => [null, datum(dagNr(anker) + 400)];

  it('elke dag van 10 jaar gelijk aan private.occurs_on (via de opsomming per jaar)', () => {
    // Per reeks één opsomming per jaar, en dan per dag vergeleken met de oude databaseregel. Even volledig als de
    // dagtoets (ruim 5 miljoen vergelijkingen), maar licht genoeg voor de gewone testronde. Dat de dagtoets
    // komtVoorOp hetzelfde zegt als de opsomming, bewijzen de vectoren en de willekeurige regels hieronder.
    const dagen = dagenVan(VAN, TOT);
    let vergeleken = 0, verschil: string | null = null;
    for (const [nl, en] of FREQ) for (const a of ankers(en)) for (const tot of eindes(a)) {
      const r = regelUitFrequentie(nl, tot);
      const keren = new Set<Datum>();
      for (let j = 2024; j <= 2033; j++) for (const d of datumsTussen(a, r, `${j}-01-01`, `${j}-12-31`)) keren.add(d);
      for (const d of dagen) {
        vergeleken++;
        if (keren.has(d) !== oudeOccursOn(a, en, tot, d)) { verschil ??= `${en} ${a} tot ${tot} op ${d}`; }
      }
    }
    expect(verschil).toBeNull();
    expect(vergeleken).toBeGreaterThan(5_000_000);
  }, 60_000);

  // De volledige dagtoets (komtVoorOp per dag, ±50 s): alleen op verzoek, met HERHAAL_VOLLEDIG=1.
  it.runIf(process.env.HERHAAL_VOLLEDIG === '1')('dagtoets komtVoorOp gelijk aan private.occurs_on, elke dag van 10 jaar', () => {
    const dagen = dagenVan(VAN, TOT);
    let verschil: string | null = null;
    for (const [nl, en] of FREQ) for (const a of ankers(en)) for (const tot of eindes(a)) {
      const r = regelUitFrequentie(nl, tot);
      for (const d of dagen) if (komtVoorOp(a, r, d) !== oudeOccursOn(a, en, tot, d)) { verschil ??= `${en} ${a} tot ${tot} op ${d}`; }
    }
    expect(verschil).toBeNull();
  }, 300_000);

  it('opsomming gelijk aan voorkomenDatums (herhaling.ts), per jaar over 10 jaar', () => {
    let verschil: string | null = null;
    for (const [nl, en] of FREQ) for (const a of ankers(en)) for (const tot of eindes(a)) {
      for (let j = 2024; j <= 2033; j++) {
        const van = `${j}-01-01`, eind = `${j}-12-31`;
        const oud = voorkomenDatums(a, { freq: nl, tot }, van, eind);
        const nieuw = datumsTussen(a, regelUitFrequentie(nl, tot), van, eind);
        if (JSON.stringify(oud) !== JSON.stringify(nieuw)) { verschil ??= `${en} ${a} tot ${tot} in ${j}`; }
      }
    }
    expect(verschil).toBeNull();
  });

  it('uitzonderingen gelijk aan voorkomenDatums', () => {
    const weg = ['2026-10-10', '2026-10-24'];
    expect(datumsTussen('2026-10-03', regelUitFrequentie('wekelijks'), '2026-10-01', '2026-10-31', weg))
      .toEqual(voorkomenDatums('2026-10-03', { freq: 'wekelijks', uitzonderingen: weg }, '2026-10-01', '2026-10-31'));
  });

  it('tekst gelijk aan herhalingTekst', () => {
    let verschil: string | null = null;
    for (const [nl, en] of FREQ) for (const a of ankers(en)) for (const tot of eindes(a)) {
      if (herhalingTekst(a, { freq: nl, tot }) !== regelTekst(a, regelUitFrequentie(nl, tot))) verschil ??= `${en} ${a} tot ${tot}`;
    }
    expect(verschil).toBeNull();
  });
});

describe('herhaalregel: opsomming en dagtoets zijn het eens (willekeurige geldige regels)', () => {
  // Een vaste zaadwaarde, zodat een fout altijd terug te halen is.
  let zaad = 20261030;
  const kans = () => ((zaad = (zaad * 1103515245 + 12345) % 2147483648) / 2147483648);
  const kies = <T,>(xs: T[]) => xs[Math.floor(kans() * xs.length)];
  const WD = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

  it('300 regels, elk over twee jaar per dag', () => {
    let getoetst = 0;
    while (getoetst < 300) {
      const anker = datum(dagNr('2025-01-01') + Math.floor(kans() * 730));
      const freq = kies(['daily', 'weekly', 'monthly', 'yearly'] as const);
      const r: Herhaalregel = { freq, interval: kies([1, 1, 2, 3, 5]) };
      if (freq === 'weekly' && kans() < 0.6) {
        const eigen = WD[(new Date(dagNr(anker) * 86400000).getUTCDay() + 6) % 7];
        r.byday = [...new Set([eigen, kies(WD), kies(WD)])];
      }
      if ((freq === 'monthly' || freq === 'yearly') && kans() < 0.5) {
        const t = Number(anker.slice(8));
        const wd = WD[(new Date(dagNr(anker) * 86400000).getUTCDay() + 6) % 7];
        r.byday = [t + 7 > new Date(Date.UTC(Number(anker.slice(0, 4)), Number(anker.slice(5, 7)), 0)).getUTCDate() ? `-1${wd}` : `${Math.ceil(t / 7)}${wd}`];
        if (r.byday[0].startsWith('5')) continue;
      }
      const einde = kans();
      if (einde < 0.3) r.until = datum(dagNr(anker) + Math.floor(kans() * 500));
      else if (einde < 0.6) r.count = 1 + Math.floor(kans() * 40);
      if (controleerRegel(anker, r).length) continue;
      const van = datum(dagNr(anker) - 30), tot = datum(dagNr(anker) + 730);
      const lijst = new Set(datumsTussen(anker, r, van, tot));
      for (const d of dagenVan(van, tot)) {
        if (komtVoorOp(anker, r, d) !== lijst.has(d)) throw new Error(`oneens: ${anker} ${JSON.stringify(r)} op ${d}`);
      }
      if (r.count != null) expect(lijst.size).toBeLessThanOrEqual(r.count);
      getoetst++;
    }
  });
});

describe('herhaalregel: grenzen', () => {
  it(`hoogstens ${MAX_KEREN} datums per berekening`, () => {
    expect(datumsTussen('2026-01-01', { freq: 'daily' }, '2026-01-01', '2035-12-31')).toHaveLength(MAX_KEREN);
  });
  it('een ongeldige datum of regel geeft niets', () => {
    expect(datumsTussen('2026-02-30', { freq: 'daily' }, '2026-01-01', '2026-12-31')).toEqual([]);
    expect(controleerRegel('2026-02-30', { freq: 'daily' })).toEqual(['anker']);
    expect(controleerRegel('2026-10-30', { freq: 'hourly' as never })).toEqual(['freq']);
  });
});
