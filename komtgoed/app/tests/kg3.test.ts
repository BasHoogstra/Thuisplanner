import { boodschappenMelding, splitsBoodschappen, voegBoodschappenToe } from '../src/lib/boodschappen';
import { maandagVan, weekBereik, weekNummer, isGeldigeDatum } from '../src/lib/datum';
import { isBezetVanAnder, magBewerken, magZichtbaarheidKiezen } from '../src/lib/rechten';
import { beginStaat, reducer } from '../src/lib/store';
import type { Afspraak, Item } from '../src/lib/types';
import { afgerondVandaag, takenOp, takenVandaag, takenZonderDatum } from '../src/lib/vandaag';

const V = '2026-10-10';

describe('week', () => {
  it('maandag van de week, ook op zondag en over een maandgrens', () => {
    expect(maandagVan(V)).toBe('2026-10-05');
    expect(maandagVan('2026-10-11')).toBe('2026-10-05'); // zondag hoort bij de week ervoor
    expect(maandagVan('2026-10-05')).toBe('2026-10-05');
    expect(maandagVan('2026-10-01')).toBe('2026-09-28');
  });
  it('ISO-weeknummers', () => {
    expect(weekNummer(V)).toBe(41);
    expect(weekNummer('2026-01-01')).toBe(1);
    expect(weekNummer('2027-01-01')).toBe(53); // 2026 heeft 53 weken
    expect(weekNummer('2027-01-04')).toBe(1);
  });
  it('weekbereik in gewone woorden', () => {
    expect(weekBereik('2026-10-05')).toBe('5 – 11 oktober');
    expect(weekBereik('2026-09-28')).toBe('28 september – 4 oktober');
  });
  it('alleen echte datums', () => {
    expect(isGeldigeDatum('2026-02-29')).toBe(false);
    expect(isGeldigeDatum('2028-02-29')).toBe(true);
    expect(isGeldigeDatum('')).toBe(false);
  });
});

describe('boodschappen zonder dubbelingen', () => {
  const basis: Item[] = [
    { id: 'm', soort: 'boodschap', naam: 'Melk', afgevinkt: false },
    { id: 'w', soort: 'boodschap', naam: 'Wc-papier', afgevinkt: true },
  ];
  let n = 0;
  const id = () => `x${++n}`;

  it('nieuw, al op de lijst, en terug van het mandje; hoofdletters maken niet uit', () => {
    const r = voegBoodschappenToe(basis, ['melk', 'Kaas', 'kaas', 'WC-papier'], id);
    expect(r.nieuw).toEqual(['Kaas']);
    expect(r.alOpLijst).toEqual(['Melk']);
    expect(r.terug).toEqual(['Wc-papier']);
    expect(r.items.filter(i => i.soort === 'boodschap' && !i.afgevinkt)).toHaveLength(3);
    expect(boodschappenMelding(r)).toBe('Kaas op de lijst · Wc-papier weer nodig · Melk stond er al op');
  });
  it('verandert de invoer niet', () => {
    voegBoodschappenToe(basis, ['wc-papier'], id);
    expect((basis[1] as { afgevinkt: boolean }).afgevinkt).toBe(true);
  });
  it('splitsen: puntkomma, dubbele spaties', () => {
    expect(splitsBoodschappen('pindakaas;  verse   basilicum')).toEqual(['Pindakaas', 'Verse basilicum']);
  });
});

describe('rechten in de demo', () => {
  const prive: Afspraak = { id: 'p', soort: 'afspraak', datum: V, wie: [], eigenaar: 'm-thomas', zichtbaarheid: 'prive' };
  const gedeeld: Afspraak = { ...prive, id: 'g', titel: 'Eten', zichtbaarheid: 'huishouden' };
  it('privé van een ander: bezet, niet te bewerken', () => {
    expect(isBezetVanAnder(prive, 'm-eva')).toBe(true);
    expect(magBewerken(prive, 'm-eva')).toBe(false);
    expect(magBewerken(prive, 'm-thomas')).toBe(true);
  });
  it('gedeeld: iedereen mag aanpassen, alleen de eigenaar kiest privé', () => {
    expect(magBewerken(gedeeld, 'm-eva')).toBe(true);
    expect(magZichtbaarheidKiezen(gedeeld, 'm-eva')).toBe(false);
    expect(magZichtbaarheidKiezen(gedeeld, 'm-thomas')).toBe(true);
    expect(magZichtbaarheidKiezen(null, 'm-eva')).toBe(true);
  });
});

describe('demo-staat', () => {
  it('afvinken legt de dag vast; weer openzetten wist die', () => {
    let s = beginStaat(V);
    s = reducer(s, { type: 'wissel', id: 't-plant', vandaag: V, melding: 'Afgerond' });
    expect(afgerondVandaag(s.items, V).map(t => t.id)).toContain('t-plant');
    expect(takenVandaag(s.items, V).map(t => t.id)).not.toContain('t-plant');
    s = reducer(s, { type: 'wissel', id: 't-plant', vandaag: V });
    expect(afgerondVandaag(s.items, V).map(t => t.id)).not.toContain('t-plant');
    expect(takenVandaag(s.items, V).map(t => t.id)).toContain('t-plant');
  });

  it('ongedaan maken draait precies de laatste wijziging terug; een wijziging zonder melding wist de knop', () => {
    let s = beginStaat(V);
    s = reducer(s, { type: 'verwijder', ids: ['a-zwem'], melding: 'Zwemles verwijderd' });
    expect(s.melding?.ongedaan).toBe(true);
    s = reducer(s, { type: 'ongedaan' });
    expect(s.items.some(i => i.id === 'a-zwem')).toBe(true);
    expect(s.melding?.ongedaan).toBe(false);
    s = reducer(s, { type: 'verwijder', ids: ['a-zwem'], melding: 'Zwemles verwijderd' });
    s = reducer(s, { type: 'wissel', id: 'b-melk', vandaag: V }); // zonder melding
    expect(s.melding).toBeNull();
  });

  it('bijwerken houdt het id, dus de koppeling aan dag en persoon blijft kloppen', () => {
    let s = beginStaat(V);
    const t = s.items.find(i => i.id === 't-cadeau')!;
    s = reducer(s, { type: 'bijwerken', item: { ...t, datum: '2026-10-11', voor: 'm-daan' } as Item, melding: 'aangepast' });
    expect(takenOp(s.items, '2026-10-11').find(x => x.id === 't-cadeau')?.voor).toBe('m-daan');
    expect(takenOp(s.items, V).some(x => x.id === 't-cadeau')).toBe(false);
  });

  it('een melding verdwijnt alleen als het dezelfde melding is', () => {
    let s = reducer(beginStaat(V), { type: 'meld', tekst: 'a' });
    const id = s.melding!.id;
    s = reducer(s, { type: 'meld', tekst: 'b' });
    expect(reducer(s, { type: 'meldingWeg', id }).melding?.tekst).toBe('b');
  });

  it('taken zonder datum en afgeronde taken', () => {
    const s = beginStaat(V);
    expect(takenZonderDatum(s.items).map(t => t.titel)).toEqual(['Aanslag gemeentebelasting nakijken']);
    expect(afgerondVandaag(s.items, V).map(t => t.titel)).toEqual(['Groene container buiten zetten']);
  });
});
