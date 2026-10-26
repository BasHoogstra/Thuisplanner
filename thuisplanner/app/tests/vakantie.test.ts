// F8 Vakanties: de rekenregels (lib/vakantie.ts) en de omzetting van serverrijen (lib/lokaal/omzetten.ts).
import { describe, expect, it } from 'vitest';
import {
  aftelling, alOpPaklijst, fase, groepen, kiesbareVakanties, laatsteDag, periode, vakantieVoorVandaag, vakantiesOp,
  vakantiesVoorBoodschap, wanneerKort,
} from '../src/lib/vakantie';
import { laatsteDag as syncLaatsteDag, vakantieVoorbij as syncVoorbij } from '../../sync/thuisplanner-sync.js';
import { naarKoppeling, naarPakitem, naarTaak, naarTaakVelden, naarVakantie, naarVakantieGegevens } from '../src/lib/lokaal/omzetten';
import type { Pakitem, Vakantie } from '../src/lib/types';

const V = (id: string, vertrek: string | null, terug: string | null = null, naam = id): Vakantie => ({ id, naam, vertrek, terug });
const VANDAAG = '2026-10-21';

describe('fase en laatste dag (R6: geen datum, alleen vertrek, of beide)', () => {
  it('zonder datum is komend en nooit voorbij', () => {
    expect(laatsteDag(V('a', null))).toBeNull();
    expect(fase(V('a', null), VANDAAG)).toBe('komend');
  });
  it('alleen een vertrekdatum: nu vanaf de vertrekdag, eerder na 14 dagen', () => {
    const v = V('a', '2026-10-10');
    expect(laatsteDag(v)).toBe('2026-10-23');
    expect(fase(v, '2026-10-09')).toBe('komend');
    expect(fase(v, '2026-10-10')).toBe('nu');
    expect(fase(v, '2026-10-23')).toBe('nu');
    expect(fase(v, '2026-10-24')).toBe('eerder');
  });
  it('met een terugdatum: nu tot en met de terugdag', () => {
    const v = V('a', '2026-10-20', '2026-10-21');
    expect(fase(v, '2026-10-21')).toBe('nu');
    expect(fase(v, '2026-10-22')).toBe('eerder');
  });
  it('is het altijd eens met de sync-module (welke paklijsten worden opgehaald)', () => {
    for (const [vertrek, terug] of [[null, null], ['2026-10-10', null], ['2026-10-01', '2026-10-05'], ['2026-10-21', '2026-10-30']] as const) {
      const v = V('a', vertrek, terug);
      expect(laatsteDag(v)).toBe(syncLaatsteDag({ start_date: vertrek, end_date: terug }));
      for (const dag of ['2026-10-04', '2026-10-06', '2026-10-21', '2026-10-24', '2026-10-31']) {
        expect(fase(v, dag) === 'eerder').toBe(syncVoorbij({ start_date: vertrek, end_date: terug }, dag));
      }
    }
  });
});

describe('aftelling en periode', () => {
  it('nog N dagen, morgen, vandaag vertrek, dag X van Y, dag X, afgelopen', () => {
    expect(aftelling(V('a', '2026-10-30', '2026-11-13'), VANDAAG)).toBe('Nog 9 dagen');
    expect(aftelling(V('a', '2026-10-22'), VANDAAG)).toBe('Morgen');
    expect(aftelling(V('a', '2026-10-21'), VANDAAG)).toBe('Vandaag vertrek');
    expect(aftelling(V('a', '2026-10-19', '2026-11-02'), VANDAAG)).toBe('Dag 3 van 15');
    expect(aftelling(V('a', '2026-10-19'), VANDAAG)).toBe('Dag 3');
    expect(aftelling(V('a', '2026-09-01', '2026-09-10'), VANDAAG)).toBe('Afgelopen');
    expect(aftelling(V('a', null), VANDAAG)).toBeNull();
    expect(wanneerKort(V('a', '2026-10-30'), VANDAAG)).toBe('over 9 dagen');
    expect(wanneerKort(V('a', '2026-10-19', '2026-11-02'), VANDAAG)).toBe('dag 3 van 15');
  });
  it('periode kort en zonder jaar in hetzelfde jaar', () => {
    expect(periode(V('a', '2026-07-12', '2026-07-26'), VANDAAG)).toBe('12–26 jul');
    expect(periode(V('a', '2026-07-28', '2026-08-03'), VANDAAG)).toBe('28 jul – 3 aug');
    expect(periode(V('a', '2026-12-27'), VANDAAG)).toBe('vertrek 27 dec');
    expect(periode(V('a', '2026-12-28', '2027-01-04'), VANDAAG)).toBe('28 dec 2026 – 4 jan 2027');
    expect(periode(V('a', null), VANDAAG)).toBe('nog geen datum');
  });
});

describe('groepen, Vandaag en Agenda', () => {
  const lijst = [V('geen', null), V('later', '2026-12-20'), V('nu', '2026-10-15', '2026-10-25'), V('oud', '2026-05-01', '2026-05-08'),
    V('ouder', '2025-05-01', '2025-05-08'), V('straks', '2026-11-02')];
  it('nu, komend (zonder datum achteraan) en eerder (nieuwste eerst)', () => {
    const g = groepen(lijst, VANDAAG);
    expect(g.nu.map(v => v.id)).toEqual(['nu']);
    expect(g.komend.map(v => v.id)).toEqual(['straks', 'later', 'geen']);
    expect(g.eerder.map(v => v.id)).toEqual(['oud', 'ouder']);
  });
  it('de kaart: lopend gaat voor; anders hoogstens 14 dagen vooraf', () => {
    expect(vakantieVoorVandaag(lijst, VANDAAG)?.id).toBe('nu');
    const zonder = lijst.filter(v => v.id !== 'nu');
    expect(vakantieVoorVandaag(zonder, VANDAAG)?.id).toBe('straks');
    expect(vakantieVoorVandaag(zonder, '2026-10-18')).toBeUndefined();   // straks is dan 15 dagen weg
  });
  it('Agenda: elke dag van de periode; zonder terugdatum alleen de vertrekdag', () => {
    expect(vakantiesOp(lijst, '2026-10-20').map(x => x.v.id)).toEqual(['nu']);
    expect(vakantiesOp(lijst, '2026-11-02')).toEqual([{ v: lijst[5], vertrek: true }]);
    expect(vakantiesOp(lijst, '2026-11-03')).toEqual([]);
  });
  it('bij een taak te kiezen: komend en lopend, plus de huidige', () => {
    expect(kiesbareVakanties(lijst, VANDAAG).map(v => v.id)).toEqual(['nu', 'straks', 'later', 'geen']);
    expect(kiesbareVakanties(lijst, VANDAAG, 'oud').map(v => v.id)).toContain('oud');
  });
});

describe('paklijst en boodschappen', () => {
  const p = (id: string, lid: string | null, naam: string): Pakitem => ({ id, vakantieId: 'v', lid, naam, ingepakt: false });
  it('dezelfde tekst per persoon (zonder hoofdletters en spaties) telt als dubbel; bij een ander niet', () => {
    const lijst = [p('1', 'm-a', 'Sokken'), p('2', null, 'Tent')];
    expect(alOpPaklijst(lijst, 'v', 'm-a', '  sokken ')).toBe(true);
    expect(alOpPaklijst(lijst, 'v', 'm-b', 'Sokken')).toBe(false);
    expect(alOpPaklijst(lijst, 'v', null, 'TENT')).toBe(true);
    expect(alOpPaklijst(lijst, 'ander', 'm-a', 'Sokken')).toBe(false);
    expect(alOpPaklijst(lijst, 'v', 'm-a', 'Sokken', '1')).toBe(false);   // hetzelfde item zelf telt niet
  });
  it('label alleen voor actuele koppelingen van niet-voorbije vakanties (geen oude koppelingen)', () => {
    const vak = [V('frankrijk', '2026-10-30'), V('oud', '2026-05-01', '2026-05-08')];
    const k = [
      { id: 'k1', vakantieId: 'frankrijk', boodschapId: 'b', afgehandeld: false },
      { id: 'k2', vakantieId: 'oud', boodschapId: 'b', afgehandeld: false },
      { id: 'k3', vakantieId: 'frankrijk', boodschapId: 'c', afgehandeld: true },
    ];
    expect(vakantiesVoorBoodschap('b', k, vak, VANDAAG).map(v => v.id)).toEqual(['frankrijk']);
    expect(vakantiesVoorBoodschap('c', k, vak, VANDAAG)).toEqual([]);
  });
});

describe('omzetten van serverrijen (lokale modus)', () => {
  it('vakantie, pakitem en koppeling', () => {
    expect(naarVakantie({ id: 'v', name: 'Frankrijk', start_date: '2026-10-30', end_date: null, destination: 'Ardèche', notes: null, version: 3 }))
      .toEqual({ id: 'v', naam: 'Frankrijk', vertrek: '2026-10-30', terug: null, bestemming: 'Ardèche', versie: 3, sync: undefined });
    expect(naarPakitem({ id: 'p', trip_id: 'v', member_id: null, name: 'Tent', packed_at: '2026-10-20T10:00:00Z', packed_by_member_id: 'm', version: 2 }))
      .toMatchObject({ vakantieId: 'v', lid: null, ingepakt: true, ingepaktDoor: 'm' });
    expect(naarKoppeling({ id: 'k', household_id: 'h', trip_id: 'v', shopping_item_id: 'b', settled_at: '2026-10-20T10:00:00Z', version: 1, created_at: '', updated_at: '' }))
      .toMatchObject({ afgehandeld: true });
  });
  it('een pakitem van een extra lijst (§20) hoort bij die lijst, nooit bij Gezamenlijk; zonder bekende lijst verschijnt het niet', () => {
    expect(naarPakitem({ id: 'p', trip_id: 'v', member_id: null, list_id: 'l', name: 'Zadel', packed_at: null, version: 1 })).toMatchObject({ lid: null, lijst: 'l' });
    const g = naarVakantieGegevens({ vakanties: [], vakantieKoppelingen: [], paklijsten: [],
      pakitems: [{ id: 'p', trip_id: 'v', member_id: null, list_id: 'onbekend', name: 'Zadel', packed_at: null, version: 1 }] });
    expect(g.pakitems).toHaveLength(0);
    expect(naarPakitem({ id: 'q', trip_id: 'v', member_id: null, list_id: null, name: 'Tent', packed_at: null, version: 1 })?.lid).toBeNull();
  });
  it('een pakitem zonder inhoud op dit toestel (P1) hoort bij geen paklijst', () => {
    expect(naarPakitem({ id: 'p', trip_id: null, member_id: null, name: null, packed_at: null, version: 0, inhoudNietBewaard: true })).toBeNull();
    const g = naarVakantieGegevens({ vakanties: [{ id: 'x', name: null, start_date: null, end_date: null, destination: null, notes: null, version: 0, inhoudNietBewaard: true }], pakitems: [], vakantieKoppelingen: [] });
    expect(g.vakanties).toEqual([]);
  });
  it('trip_id van een taak alleen meesturen als het veld bestaat (een formulier zonder vakantie wist niets)', () => {
    const t = naarTaak({ id: 't', title: 'Vignet', due_date: null, assignee_member_id: null, done_on: null, version: 1, trip_id: 'v' });
    expect(t.vakantieId).toBe('v');
    expect(naarTaakVelden(t)).toMatchObject({ trip_id: 'v' });
    const { vakantieId: _weg, ...zonder } = t;
    expect('trip_id' in naarTaakVelden(zonder)).toBe(false);
    expect(naarTaakVelden({ ...zonder, vakantieId: null })).toMatchObject({ trip_id: null });
  });
});
