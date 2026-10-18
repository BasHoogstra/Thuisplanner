// Contracttest (KG-5H deel 1b): elke stabiele uitnodigingscode die een migratie kan geven, heeft een tekst in de app, en
// de app kent geen codes die de database niet geeft. De app toont nooit de technische melding van de database.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ALGEMEEN, foutTekst, UITNODIGING_TEKSTEN } from '../src/lib/foutcodes';

const MIGRATIES = path.resolve(__dirname, '../../supabase/migrations');
const codesInMigraties = new Set(readdirSync(MIGRATIES).filter(f => f.endsWith('.sql'))
  .flatMap(f => [...readFileSync(path.join(MIGRATIES, f), 'utf8').matchAll(/errcode = '(TPU\d\d)'/g)].map(m => m[1])));

describe('stabiele foutcodes van uitnodigingen', () => {
  it('migraties en app kennen precies dezelfde TPU-codes (TPU01 tot en met TPU10)', () => {
    expect([...codesInMigraties].sort()).toEqual(Object.keys(UITNODIGING_TEKSTEN).sort());
    expect(Object.keys(UITNODIGING_TEKSTEN).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `TPU${String(i + 1).padStart(2, '0')}`));
  });

  it('de app vertaalt alleen de code; de melding van de database komt nooit op het scherm', () => {
    expect(foutTekst({ code: 'TPU06', message: 'Deze uitnodiging is voor jan@example.com' })).toBe(UITNODIGING_TEKSTEN.TPU06);
    expect(foutTekst({ code: 'TPU06' })).toMatch(/ander e-mailadres/);
    for (const tekst of Object.values(UITNODIGING_TEKSTEN)) expect(tekst).not.toMatch(/@|TPU|SQL|token|error/i);
    // Overige domeinen: tot KG-5E de bestaande, al nette meldingen; onbekend of netwerk: algemeen.
    expect(foutTekst({ code: '23514', message: 'Einde ligt voor het begin' })).toBe('Einde ligt voor het begin');
    expect(foutTekst({ code: 'XX000', message: 'interne fout met details' })).toBe(ALGEMEEN);
    expect(foutTekst({ code: 'TPU99', message: 'onbekend' })).toBe(ALGEMEEN);
    expect(foutTekst(null)).toBe(ALGEMEEN);
  });
});
