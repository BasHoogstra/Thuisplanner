// F8 Vakanties: de demo-store (lib/store.ts). Dezelfde regels als de server: geen dubbele pakitems per persoon (ook niet
// bij hernoemen of verplaatsen), overnemen vult aan, en hergebruik van een boodschap maakt een oude koppeling niet actueel.
import { describe, expect, it } from 'vitest';
import { beginStaat, reducer, type Staat } from '../src/lib/store';
import type { Boodschap, Pakitem, Taak } from '../src/lib/types';

const VANDAAG = '2026-10-21';
const begin = (): Staat => beginStaat(VANDAAG);
const pak = (s: Staat, vakantieId: string, lid: string | null) => s.pakitems.filter(p => p.vakantieId === vakantieId && (p.lid ?? null) === lid);
const item = (id: string, vakantieId: string, lid: string | null, naam: string): Pakitem => ({ id, vakantieId, lid, naam, ingepakt: false });

describe('paklijst', () => {
  it('toevoegen; dezelfde tekst bij dezelfde persoon geeft een melding en niets dubbel', () => {
    let s = reducer(begin(), { type: 'pakitemToevoegen', item: item('n1', 'v-texel', 'm-lotte', 'Sokken') });
    expect(pak(s, 'v-texel', 'm-lotte').map(p => p.naam)).toEqual(['Sokken']);
    s = reducer(s, { type: 'pakitemToevoegen', item: item('n2', 'v-texel', 'm-lotte', '  sokken ') });
    expect(pak(s, 'v-texel', 'm-lotte')).toHaveLength(1);
    expect(s.melding?.tekst).toBe('Staat al op de lijst van Lotte');
    expect(s.melding?.ongedaan).toBe(false);
    s = reducer(s, { type: 'pakitemToevoegen', item: item('n3', 'v-texel', 'm-daan', 'Sokken') });
    expect(pak(s, 'v-texel', 'm-daan')).toHaveLength(1);
  });
  it('hernoemen of verplaatsen naar een bestaand item verandert niets (U1)', () => {
    let s = reducer(begin(), { type: 'pakitemToevoegen', item: item('a', 'v-texel', 'm-eva', 'Sokken') });
    s = reducer(s, { type: 'pakitemToevoegen', item: item('b', 'v-texel', 'm-eva', 'Shirts') });
    s = reducer(s, { type: 'pakitemToevoegen', item: item('c', 'v-texel', 'm-thomas', 'Sokken') });
    s = reducer(s, { type: 'pakitemBijwerken', id: 'b', naam: 'SOKKEN' });
    expect(s.melding?.tekst).toBe('Staat al op de lijst van Eva');
    expect(s.pakitems.find(p => p.id === 'b')?.naam).toBe('Shirts');
    s = reducer(s, { type: 'pakitemBijwerken', id: 'c', doel: 'm-eva' });
    expect(s.pakitems.find(p => p.id === 'c')?.lid).toBe('m-thomas');
    s = reducer(s, { type: 'pakitemBijwerken', id: 'c', doel: null });
    expect(s.pakitems.find(p => p.id === 'c')?.lid).toBeNull();
    expect(s.melding?.tekst).toBe('Sokken staat nu bij Gezamenlijk');
  });
  it('afvinken door het lid, en verwijderen met ongedaan maken', () => {
    let s = reducer(begin(), { type: 'pakitemWissel', id: pak(begin(), 'v-frankrijk', 'm-daan')[0].id, door: 'm-eva' });
    const p = s.pakitems.find(x => x.ingepaktDoor === 'm-eva' && x.lid === 'm-daan')!;
    expect(p.ingepakt).toBe(true);
    s = reducer(s, { type: 'pakitemVerwijderen', id: p.id, melding: `${p.naam} verwijderd` });
    expect(s.pakitems.some(x => x.id === p.id)).toBe(false);
    s = reducer(s, { type: 'ongedaan' });
    expect(s.pakitems.find(x => x.id === p.id)?.ingepakt).toBe(true);
  });
  it('overnemen vult aan, slaat over wat er al staat, is niet afgevinkt en is ongedaan te maken', () => {
    let s = reducer(begin(), { type: 'pakitemToevoegen', item: item('eigen', 'v-texel', 'm-eva', 'Sokken') });
    const voor = s.pakitems.length;
    s = reducer(s, { type: 'overnemen', van: 'v-italie', naar: 'v-texel', groep: 'iedereen' });
    // Iedereen = leden en Gezamenlijk; extra lijsten alleen als ze gekozen zijn.
    const italie = begin().pakitems.filter(p => p.vakantieId === 'v-italie' && !p.lijst);
    expect(s.pakitems.length).toBe(voor + italie.length - 1);   // Eva's Sokken stonden er al
    expect(s.pakitems.find(p => p.id === 'eigen')).toBeDefined();
    expect(s.pakitems.filter(p => p.vakantieId === 'v-texel' && p.ingepakt)).toHaveLength(0);
    expect(s.melding).toMatchObject({ tekst: `${italie.length - 1} items overgenomen`, ongedaan: true });
    // Nog eens: niets nieuws.
    const na = reducer(s, { type: 'overnemen', van: 'v-italie', naar: 'v-texel', groep: 'iedereen' });
    expect(na.pakitems.length).toBe(s.pakitems.length);
    expect(na.melding?.tekst).toBe('Alles stond er al');
    // Ongedaan maken: alleen de overgenomen items weg, het eigen item blijft.
    s = reducer(s, { type: 'ongedaan' });
    expect(s.pakitems.filter(p => p.vakantieId === 'v-texel').map(p => p.id)).toEqual(['eigen']);
  });
  it('overnemen voor één persoon of alleen Gezamenlijk', () => {
    const s = reducer(begin(), { type: 'overnemen', van: 'v-italie', naar: 'v-texel', groep: 'm-daan' });
    expect(new Set(s.pakitems.filter(p => p.vakantieId === 'v-texel').map(p => p.lid))).toEqual(new Set(['m-daan']));
    const g = reducer(begin(), { type: 'overnemen', van: 'v-italie', naar: 'v-texel', groep: null });
    expect(new Set(g.pakitems.filter(p => p.vakantieId === 'v-texel').map(p => p.lid))).toEqual(new Set([null]));
  });
  it('afvinken opnieuw beginnen voor één persoon of iedereen, en ongedaan maken', () => {
    let s = reducer(begin(), { type: 'vinkjesOpnieuw', vakantieId: 'v-frankrijk', groep: 'm-eva' });
    expect(pak(s, 'v-frankrijk', 'm-eva').some(p => p.ingepakt)).toBe(false);
    expect(pak(s, 'v-frankrijk', 'm-lotte').some(p => p.ingepakt)).toBe(true);
    expect(s.melding).toMatchObject({ tekst: '4 vinkjes weggehaald', ongedaan: true });
    s = reducer(s, { type: 'ongedaan' });
    expect(pak(s, 'v-frankrijk', 'm-eva').filter(p => p.ingepakt)).toHaveLength(4);
    s = reducer(s, { type: 'vinkjesOpnieuw', vakantieId: 'v-frankrijk', groep: 'iedereen' });
    expect(s.pakitems.filter(p => p.vakantieId === 'v-frankrijk' && p.ingepakt)).toHaveLength(0);
  });
});

describe('boodschappen voor een vakantie', () => {
  const b = (s: Staat, naam: string) => s.items.find(i => i.soort === 'boodschap' && i.naam === naam) as Boodschap;
  it('één boodschap op de gewone lijst; dezelfde naam voor een tweede vakantie geeft twee koppelingen', () => {
    let s = reducer(begin(), { type: 'boodschappen', namen: ['Muggenspray'], vakantieId: 'v-frankrijk' });
    s = reducer(s, { type: 'boodschappen', namen: ['muggenspray'], vakantieId: 'v-texel' });
    expect(s.items.filter(i => i.soort === 'boodschap' && i.naam.toLowerCase() === 'muggenspray')).toHaveLength(1);
    expect(s.koppelingen.filter(k => k.boodschapId === b(s, 'Muggenspray').id && !k.afgehandeld).map(k => k.vakantieId).sort()).toEqual(['v-frankrijk', 'v-texel']);
  });
  it('hergebruik (afgevinkt en gewoon weer toegevoegd) sluit oude koppelingen af; een correctie van het vinkje niet', () => {
    let s = reducer(begin(), { type: 'boodschappen', namen: ['Muggenspray'], vakantieId: 'v-frankrijk' });
    const id = b(s, 'Muggenspray').id;
    s = reducer(s, { type: 'wissel', id, vandaag: VANDAAG });
    s = reducer(s, { type: 'wissel', id, vandaag: VANDAAG });   // per ongeluk afgevinkt: correctie
    expect(s.koppelingen.find(k => k.boodschapId === id)?.afgehandeld).toBe(false);
    s = reducer(s, { type: 'wissel', id, vandaag: VANDAAG });   // gekocht
    s = reducer(s, { type: 'boodschappen', namen: ['Muggenspray'] });   // later gewoon weer nodig
    expect(s.koppelingen.filter(k => k.boodschapId === id).every(k => k.afgehandeld)).toBe(true);
  });
  it('ontkoppelen laat de boodschap staan, en is ongedaan te maken', () => {
    let s = reducer(begin(), { type: 'boodschappen', namen: ['Zonnebrand factor 50'], vakantieId: 'v-frankrijk' });
    const k = s.koppelingen.find(x => x.boodschapId === b(s, 'Zonnebrand factor 50').id)!;
    s = reducer(s, { type: 'ontkoppelen', koppelingId: k.id, melding: 'weg' });
    expect(s.koppelingen.some(x => x.id === k.id)).toBe(false);
    expect(b(s, 'Zonnebrand factor 50')).toBeDefined();
    s = reducer(s, { type: 'ongedaan' });
    expect(s.koppelingen.some(x => x.id === k.id)).toBe(true);
  });
});

describe('vakanties en voorbereidingen', () => {
  it('verwijderen laat taken en boodschappen staan, en is ongedaan te maken', () => {
    let s = reducer(begin(), { type: 'vakantieVerwijderen', id: 'v-frankrijk', melding: 'Frankrijk verwijderd' });
    expect(s.vakanties.some(v => v.id === 'v-frankrijk')).toBe(false);
    expect(s.items.some(i => i.id === 't-vignet')).toBe(true);
    s = reducer(s, { type: 'ongedaan' });
    expect(s.vakanties.some(v => v.id === 'v-frankrijk')).toBe(true);
  });
  it('een taak uit het volledige formulier (zonder vakantieveld) houdt haar vakantie', () => {
    const t = begin().items.find(i => i.id === 't-vignet') as Taak;
    const { vakantieId: _weg, ...zonder } = t;
    const s = reducer(begin(), { type: 'bijwerken', item: { ...zonder, titel: 'Vignet kopen' } });
    expect((s.items.find(i => i.id === 't-vignet') as Taak).vakantieId).toBe('v-frankrijk');
    const los = reducer(begin(), { type: 'bijwerken', item: { ...t, vakantieId: null } });
    expect((los.items.find(i => i.id === 't-vignet') as Taak).vakantieId).toBeNull();
  });
});

describe('Later nodig (zelfde regels als add_shopping_items met p_later)', () => {
  const b = (s: Staat, naam: string) => s.items.find((i): i is Boodschap => i.soort === 'boodschap' && i.naam.toLowerCase() === naam.toLowerCase());
  it('vanuit een vakantie: nieuw en terug bij Later nodig; wat al te kopen is blijft te kopen (wel gekoppeld)', () => {
    let s = reducer(begin(), { type: 'boodschappen', namen: ['Adapterstekker'], vakantieId: 'v-frankrijk' });
    expect(b(s, 'Adapterstekker')?.later).toBe(true);
    s = reducer(s, { type: 'boodschappen', namen: ['Wc-papier'] });
    expect(b(s, 'Wc-papier')?.later).toBeUndefined();
    s = reducer(s, { type: 'boodschappen', namen: ['Wc-papier'], vakantieId: 'v-frankrijk' });
    expect(b(s, 'Wc-papier')?.later).toBeUndefined();
    expect(s.koppelingen.some(k => k.boodschapId === b(s, 'Wc-papier')!.id && k.vakantieId === 'v-frankrijk')).toBe(true);
    // Afgevinkt en vanuit een vakantie terug: weer bij Later nodig.
    s = reducer(s, { type: 'wissel', id: b(s, 'Wc-papier')!.id, vandaag: VANDAAG });
    s = reducer(s, { type: 'boodschappen', namen: ['Wc-papier'], vakantieId: 'v-texel' });
    expect(b(s, 'Wc-papier')).toMatchObject({ afgevinkt: false, later: true });
  });
  it('op de gewone lijst toegevoegd: een latere boodschap gaat naar Nu te kopen, zonder tweede item', () => {
    const voor = begin();
    const s = reducer(voor, { type: 'boodschappen', namen: ['muggenspray'] });
    expect(b(s, 'Muggenspray')?.later).toBeUndefined();
    expect(s.items.filter(i => i.soort === 'boodschap').length).toBe(voor.items.filter(i => i.soort === 'boodschap').length);
    expect(s.melding?.tekst).toBe('Muggenspray nu te kopen (stond bij Later nodig)');
  });
  it('heen en terug, aanpassen behoudt Later nodig, en ongedaan maken', () => {
    let s = reducer(begin(), { type: 'boodschapLater', id: 'b-muggenspray', later: false });
    expect(b(s, 'Muggenspray')?.later).toBeUndefined();
    s = reducer(s, { type: 'ongedaan' });
    expect(b(s, 'Muggenspray')?.later).toBe(true);
    s = reducer(s, { type: 'bijwerken', item: { id: 'b-muggenspray', soort: 'boodschap', naam: 'Muggenspray deet', afgevinkt: false } });
    expect(b(s, 'Muggenspray deet')?.later).toBe(true);
  });
});

describe('de slimme +: een eigen keuze voor Later nodig of Nu te kopen', () => {
  const b = (s: Staat, naam: string) => s.items.find((i): i is Boodschap => i.soort === 'boodschap' && i.naam === naam);
  it('met vakantie maar Nu gekozen: gekoppeld en bij Nu te kopen; zonder vakantie maar Later gekozen: bij Later nodig', () => {
    let s = reducer(begin(), { type: 'boodschappen', namen: ['Pleisters'], vakantieId: 'v-frankrijk', later: false });
    expect(b(s, 'Pleisters')?.later).toBeUndefined();
    expect(s.koppelingen.some(k => k.boodschapId === b(s, 'Pleisters')!.id && k.vakantieId === 'v-frankrijk')).toBe(true);
    s = reducer(s, { type: 'boodschappen', namen: ['Cadeaupapier'], later: true });
    expect(b(s, 'Cadeaupapier')?.later).toBe(true);
    expect(s.koppelingen.some(k => k.boodschapId === b(s, 'Cadeaupapier')!.id)).toBe(false);
  });
  it('een bestaande boodschap voor een tweede vakantie: één item, twee koppelingen', () => {
    const s = reducer(begin(), { type: 'boodschappen', namen: ['zonnebrand factor 50'], vakantieId: 'v-texel' });
    expect(s.items.filter(i => i.soort === 'boodschap' && i.naam.toLowerCase() === 'zonnebrand factor 50')).toHaveLength(1);
    expect(s.koppelingen.filter(k => k.boodschapId === 'b-zonnebrand-50').map(k => k.vakantieId).sort()).toEqual(['v-frankrijk', 'v-texel']);
  });
});

describe('extra inpaklijsten (§20, zelfde regels als de server)', () => {
  it('toevoegen: geen naam van een lid, geen Gezamenlijk, geen dubbele naam bij dezelfde vakantie (wel bij een andere)', () => {
    let s = reducer(begin(), { type: 'paklijstToevoegen', lijst: { id: 'l-a', vakantieId: 'v-texel', naam: 'Paard' } });
    expect(s.paklijsten.some(l => l.id === 'l-a')).toBe(true);
    for (const naam of ['eva', 'Gezamenlijk', ' paard ']) {
      const na = reducer(s, { type: 'paklijstToevoegen', lijst: { id: 'l-x', vakantieId: 'v-texel', naam } });
      expect(na.paklijsten.some(l => l.id === 'l-x')).toBe(false);
      expect(na.melding?.tekst).toMatch(/hoort al bij|Er is al een lijst/);
    }
    s = reducer(s, { type: 'paklijstToevoegen', lijst: { id: 'l-b', vakantieId: 'v-noorwegen', naam: 'Paard' } });
    expect(s.paklijsten.some(l => l.id === 'l-b')).toBe(true);
  });
  it('items in een lijst: dubbel per lijst, niet als Gezamenlijk; verwijderen neemt items mee en is ongedaan te maken', () => {
    let s = reducer(begin(), { type: 'paklijstToevoegen', lijst: { id: 'l-a', vakantieId: 'v-texel', naam: 'Paard' } });
    s = reducer(s, { type: 'pakitemToevoegen', item: { ...item('i1', 'v-texel', null, 'Zadel'), lijst: 'l-a' } });
    s = reducer(s, { type: 'pakitemToevoegen', item: item('i2', 'v-texel', null, 'Zadel') });   // Gezamenlijk: mag
    const dubbel = reducer(s, { type: 'pakitemToevoegen', item: { ...item('i3', 'v-texel', null, 'zadel'), lijst: 'l-a' } });
    expect(dubbel.melding?.tekst).toBe('Staat al op de lijst van Paard');
    s = reducer(s, { type: 'vinkjesOpnieuw', vakantieId: 'v-texel', groep: null });
    s = reducer(s, { type: 'paklijstVerwijderen', id: 'l-a', melding: 'Paard verwijderd' });
    expect(s.pakitems.some(p => p.id === 'i1')).toBe(false);
    expect(s.pakitems.some(p => p.id === 'i2')).toBe(true);
    s = reducer(s, { type: 'ongedaan' });
    expect(s.paklijsten.some(l => l.id === 'l-a')).toBe(true);
    expect(s.pakitems.find(p => p.id === 'i1')?.lijst).toBe('l-a');
  });
  it('overnemen met lijsten: bestaande naam aanvullen, anders een nieuwe lijst; zonder keuze geen lijst-items (ook niet als Gezamenlijk)', () => {
    let s = reducer(begin(), { type: 'paklijstToevoegen', lijst: { id: 'l-t', vakantieId: 'v-texel', naam: 'strandspullen' } });
    s = reducer(s, { type: 'pakitemToevoegen', item: { ...item('i1', 'v-texel', null, 'Parasol'), lijst: 'l-t' } });
    const zonder = reducer(s, { type: 'overnemen', van: 'v-italie', naar: 'v-texel', groep: 'iedereen' });
    expect(zonder.pakitems.filter(p => p.vakantieId === 'v-texel' && !p.lid && !p.lijst).map(p => p.naam)).not.toContain('Schepjes');
    const met = reducer(s, { type: 'overnemen', van: 'v-italie', naar: 'v-texel', groep: 'iedereen', lijsten: ['l-italie-strand'] });
    expect(met.paklijsten.filter(l => l.vakantieId === 'v-texel')).toHaveLength(1);
    expect(met.pakitems.filter(p => p.lijst === 'l-t').map(p => p.naam).sort()).toEqual(['Parasol', 'Schepjes', 'Strandstoel']);
  });
});
