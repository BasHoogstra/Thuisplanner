// Besluit 20: de pure regels van de persoonlijke voorkeuren (lib/voorkeuren.ts).
import {
  isNieuweStart, neemStartBeurt, vergeetStartBeurt,
  bewaarCache, isGeldig, isStandaard, leesCache, magUit, metWaarde, naarOpslag, SLEUTELS, STANDAARD, startDoel, uitOpslag,
  vergeetCaches,
} from '../src/lib/voorkeuren';

beforeEach(() => localStorage.clear());

describe('lezen', () => {
  it('niets of rommel is de standaard', () => {
    for (const ruw of [undefined, null, 42, 'tekst', [], {}]) expect(uitOpslag(ruw)).toEqual(STANDAARD);
  });

  it('een onbekende sleutel of waarde telt niet; de rest wel', () => {
    const v = uitOpslag({ startscherm: 'agenda', 'agenda.weergave': 'jaar', geheim: 'x', 'overzicht.taken': 'nee', 'agenda.wie': 'ik' });
    expect(v.startscherm).toBe('agenda');
    expect(v.agendaWeergave).toBe('week');
    expect(v.overzicht.taken).toBe(true);
    expect(v.agendaWie).toBe('ik');
  });

  it('het Overzicht is nooit leeg: alle vier uit wordt weer alles aan', () => {
    const v = uitOpslag({ 'overzicht.afspraken': false, 'overzicht.taken': false, 'overzicht.boodschappen': false, 'overzicht.verder': false });
    expect(v.overzicht).toEqual(STANDAARD.overzicht);
  });

  it('heen en terug geeft hetzelfde, en alleen bekende sleutels', () => {
    const v = metWaarde(metWaarde(STANDAARD, 'startscherm', 'boodschappen'), 'overzicht.verder', false);
    expect(uitOpslag(naarOpslag(v))).toEqual(v);
    expect(Object.keys(naarOpslag(v)).sort()).toEqual(Object.keys(SLEUTELS).sort());
  });
});

describe('wijzigen', () => {
  it('een geldige waarde wijzigt alleen die sleutel', () => {
    const v = metWaarde(STANDAARD, 'agenda.weergave', 'maand');
    expect(v).toEqual({ ...STANDAARD, agendaWeergave: 'maand' });
    expect(isStandaard(v)).toBe(false);
    expect(isStandaard(metWaarde(v, 'agenda.weergave', 'week'))).toBe(true);
  });

  it('een ongeldige waarde of sleutel verandert niets', () => {
    expect(metWaarde(STANDAARD, 'agenda.weergave', 'jaar')).toBe(STANDAARD);
    expect(isGeldig('agenda.weergave', 'jaar')).toBe(false);
    expect(isGeldig('kleur', 'rood')).toBe(false);
    expect(isGeldig('overzicht.taken', 'true')).toBe(false);
  });

  it('het laatste onderdeel dat aan staat, mag niet uit', () => {
    let v = STANDAARD;
    v = metWaarde(v, 'overzicht.afspraken', false);
    v = metWaarde(v, 'overzicht.boodschappen', false);
    expect(magUit(v, 'taken')).toBe(true);
    v = metWaarde(v, 'overzicht.verder', false);
    expect(magUit(v, 'taken')).toBe(false);
    expect(magUit(v, 'afspraken')).toBe(true);   // staat al uit; aanzetten mag altijd
  });
});

describe('startscherm', () => {
  const agenda = metWaarde(STANDAARD, 'startscherm', 'agenda');
  it('alleen zonder eigen adres', () => {
    expect(startDoel('', agenda)).toBe('agenda');
    expect(startDoel('#', agenda)).toBe('agenda');
    expect(startDoel('#/', agenda)).toBe('agenda');
    expect(startDoel('#/boodschappen', agenda)).toBeNull();
    expect(startDoel('#/vandaag', agenda)).toBeNull();
    expect(startDoel('#/vakanties/v1', agenda)).toBeNull();
  });
  it('zonder bekende voorkeuren of met het Overzicht: niets doen', () => {
    expect(startDoel('', null)).toBeNull();
    expect(startDoel('', STANDAARD)).toBeNull();
  });
  it('nieuwe start (25 november, optie a): ook een gewoon hoofdscherm gaat naar het startscherm', () => {
    for (const h of ['#/vandaag', '#/boodschappen', '#/meer', '#/vandaag/']) expect(startDoel(h, agenda, true)).toBe('agenda');
    expect(startDoel('#/agenda', agenda, true)).toBeNull();   // staat er al
    expect(startDoel('#/agenda', metWaarde(STANDAARD, 'startscherm', 'taken'), true)).toBe('taken');
  });
  it('herladen (geen nieuwe start) houdt een hoofdscherm; een link naar iets bijzonders wint altijd', () => {
    expect(startDoel('#/vandaag', agenda, false)).toBeNull();
    for (const h of ['#/vakanties/v1', '#/plannen/p1', '#/spullen/documenten', '#/instellingen/overzicht', '#/onbekend']) {
      expect(startDoel(h, agenda, true)).toBeNull();
    }
    expect(startDoel('#/vandaag', null, true)).toBeNull();
    expect(startDoel('#/agenda', STANDAARD, true)).toBeNull();
  });
  it('taken en boodschappen', () => {
    expect(startDoel('', metWaarde(STANDAARD, 'startscherm', 'taken'))).toBe('taken');
    expect(startDoel('', metWaarde(STANDAARD, 'startscherm', 'boodschappen'))).toBe('boodschappen');
  });
});

describe('kopie op dit toestel', () => {
  it('per account, en uitloggen wist alle kopieën (maar niets anders)', () => {
    const a = metWaarde(STANDAARD, 'startscherm', 'agenda');
    const b = metWaarde(STANDAARD, 'agenda.wie', 'ik');
    bewaarCache('account-a', a);
    bewaarCache('account-b', b);
    localStorage.setItem('thuisplanner-huishouden:account-a', 'h1');
    expect(leesCache('account-a')).toEqual(a);
    expect(leesCache('account-b')).toEqual(b);
    expect(leesCache('account-c')).toBeNull();
    vergeetCaches();
    expect(leesCache('account-a')).toBeNull();
    expect(leesCache('account-b')).toBeNull();
    expect(localStorage.getItem('thuisplanner-huishouden:account-a')).toBe('h1');
  });

  it('een beschadigde kopie is de standaard, geen fout', () => {
    localStorage.setItem('thuisplanner-voorkeuren:x', '{kapot');
    expect(leesCache('x')).toBeNull();
    localStorage.setItem('thuisplanner-voorkeuren:x', '{"startscherm":"spullen"}');
    expect(leesCache('x')).toEqual(STANDAARD);
  });
});

describe('één startbeurt per paginalading', () => {
  it('alleen de eerste keer; daarna niet meer, tot een nieuwe paginalading', () => {
    vergeetStartBeurt();
    expect(neemStartBeurt()).toBe(true);
    expect(neemStartBeurt()).toBe(false);
    vergeetStartBeurt();
    expect(neemStartBeurt()).toBe(true);
  });
  it('nieuwe start volgt het soort navigatie; zonder gegevens de veilige kant', () => {
    const echt = performance.getEntriesByType;
    try {
      performance.getEntriesByType = (() => [{ type: 'navigate' }]) as unknown as typeof performance.getEntriesByType;
      expect(isNieuweStart()).toBe(true);
      performance.getEntriesByType = (() => [{ type: 'reload' }]) as unknown as typeof performance.getEntriesByType;
      expect(isNieuweStart()).toBe(false);
      performance.getEntriesByType = (() => [{ type: 'back_forward' }]) as unknown as typeof performance.getEntriesByType;
      expect(isNieuweStart()).toBe(false);
      performance.getEntriesByType = (() => []) as unknown as typeof performance.getEntriesByType;
      expect(isNieuweStart()).toBe(false);
    } finally { performance.getEntriesByType = echt; }
  });
});
