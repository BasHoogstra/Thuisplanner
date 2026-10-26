// Agenda (docs/thuisplanner-agenda.md), stap 1: de pure hulpjes voor de rustige weergave.
import { lidKleur } from '../src/components/Rijen';
import { drukte } from '../src/lib/kalender';

describe('drukte: één neutraal streepje in drie stappen (A5)', () => {
  it('niets, 1–2, 3–4 en 5 of meer', () => {
    expect([0, 1, 2, 3, 4, 5, 12].map(drukte)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });
  it('een negatief aantal telt als niets', () => {
    expect(drukte(-1)).toBe(0);
  });
});

describe('lidKleur: het streepje bij een afspraak (A6)', () => {
  const leden: Record<string, { kleur: string }> = { eva: { kleur: 'var(--lid-1)' }, daan: { kleur: 'var(--lid-4)' } };
  const lid = (id: string) => leden[id];
  it('één lid: diens kleur', () => {
    expect(lidKleur(['daan'], lid)).toBe('var(--lid-4)');
  });
  it('meer leden: neutraal', () => {
    expect(lidKleur(['eva', 'daan'], lid)).toBe('var(--lijn-sterk)');
  });
  it('het hele huishouden (geen leden): geen streepje', () => {
    expect(lidKleur([], lid)).toBeUndefined();
  });
  it('een onbekend lid: geen kleur, geen fout', () => {
    expect(lidKleur(['onbekend'], lid)).toBeUndefined();
  });
});
