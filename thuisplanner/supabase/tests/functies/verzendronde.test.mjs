// Herstelronde na de review van PR #54 (stuur-uitnodiging): onbekende uitkomsten van 'pak' en de claimtermijn.
// Zonder netwerk, database of Deno: een nagebootste RPC en een nepklok (functions/_gedeeld/verzendronde.ts).
//   node --experimental-strip-types --test tests/functies/
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { BATCH, CLAIM_MS, HERHAAL_MS, MARGE_MS, RpcFout, VASTLEG_MS, VERSTUUR_MS, rpcHerhaal, verzendronde, zekerNietUitgevoerd } =
  await import('../../functions/_gedeeld/verzendronde.ts');

const rij = id => ({ id, aan: id + '@test.invalid', huishouden: 'Thuis', uitnodiger: 'Olaf', geldig_tot: '2026-12-01T00:00:00Z' });

/**
 * Een nagebootste omgeving. `pak` en `klaar` zijn lijsten met antwoorden per aanroep: een array (rijen), een RpcFout, of
 * een functie (krijgt de klok). Tijd loopt alleen via `wacht` en via `kost` (ms per aanroep).
 */
function omgeving({ pak = [], klaar = [], kost = {}, verstuurKost = 0 } = {}) {
  const t = { nu: 0, aanroepen: [], verstuurd: [], logs: [] };
  const volgende = (lijst, naam) => {
    const a = lijst.length ? lijst.shift() : (naam === 'uitnodigingsmail_pak' ? [] : null);
    return typeof a === 'function' ? a(t) : a;
  };
  const o = {
    idempotent: false,
    nu: () => t.nu,
    wacht: async ms => { t.nu += ms; },
    log: g => t.logs.push(g),
    rpc: async (naam, args) => {
      t.aanroepen.push({ naam, args, op: t.nu });
      t.nu += kost[naam] ?? 0;
      const a = volgende(naam === 'uitnodigingsmail_pak' ? pak : klaar, naam);
      if (a instanceof Error) throw a;
      return a;
    },
    verstuur: async r => { t.nu += verstuurKost; t.verstuurd.push({ id: r.id, op: t.nu }); return { uitkomst: 'aangenomen', bericht: 'b-' + r.id, wachtS: null }; },
  };
  return { o, t, tel: naam => t.aanroepen.filter(a => a.naam === naam).length };
}

test('alleen PostgREST zonder databaseverbinding (503 + PGRST000/001/002) bewijst "niet uitgevoerd"', () => {
  for (const code of ['PGRST000', 'PGRST001', 'PGRST002']) assert.equal(zekerNietUitgevoerd(new RpcFout('x', 503, code)), true, code);
  for (const [status, code] of [[502, null], [503, null], [504, null], [500, 'PGRST001'], [503, 'PGRST116'], [500, '57P01'], [null, null]]) {
    assert.equal(zekerNietUitgevoerd(new RpcFout('x', status, code)), false, `${status} ${code}`);
  }
  assert.equal(zekerNietUitgevoerd(new Error('rpc x: 503 PGRST001')), false, 'alleen een echte RpcFout telt');
});

test('pak: een kale 502/503/504 of een netwerkfout (onbekende uitkomst) wordt NIET herhaald; de ronde stopt zonder te versturen', async () => {
  for (const fout of [new RpcFout('uitnodigingsmail_pak', 502, null), new RpcFout('uitnodigingsmail_pak', 503, null),
    new RpcFout('uitnodigingsmail_pak', 504, null), new RpcFout('uitnodigingsmail_pak', null, null), new RpcFout('uitnodigingsmail_pak', 500, '57P01')]) {
    const { o, t, tel } = omgeving({ pak: [fout, [rij('a')]] });
    await assert.rejects(verzendronde(o), e => e === fout, fout.message);
    assert.equal(tel('uitnodigingsmail_pak'), 1, `${fout.message}: pak herhaald`);
    assert.deepEqual(t.verstuurd, [], `${fout.message}: toch verstuurd`);
  }
});

test('pak: 503 met PGRST001 (zeker niet uitgevoerd) wordt herhaald; daarna één mail, één keer vastgelegd', async () => {
  const { o, t, tel } = omgeving({ pak: [new RpcFout('uitnodigingsmail_pak', 503, 'PGRST001'), new RpcFout('uitnodigingsmail_pak', 503, 'PGRST000'), [rij('a')]] });
  const telling = await verzendronde(o);
  assert.equal(tel('uitnodigingsmail_pak'), 4, 'twee keer herhaald, en daarna de lege controle');
  assert.deepEqual(t.verstuurd.map(v => v.id), ['a']);
  assert.equal(tel('uitnodigingsmail_klaar'), 1);
  assert.equal(telling.aangenomen, 1);
});

test('pak vraagt een kleine portie (BATCH): die past in het slechtste geval binnen de claim', async () => {
  const { o, t } = omgeving({ pak: [[rij('a')], [rij('b')]] });
  await verzendronde(o);
  for (const a of t.aanroepen.filter(a => a.naam === 'uitnodigingsmail_pak')) assert.equal(a.args.p_max, BATCH);
  assert.ok(BATCH >= 2, 'een ingetrokken uitnodiging in de portie mag de ronde niet laten stoppen');
  assert.ok(BATCH * (VERSTUUR_MS + HERHAAL_MS.reduce((a, b) => a + b, 0)) <= CLAIM_MS - MARGE_MS, 'portie te groot voor de claim');
  assert.deepEqual(t.verstuurd.map(v => v.id), ['a', 'b']);
});

test('claim, slechtste geval: een volle portie waarin elke mail de volle tijdslimiet kost en elk klaar alle herhalingen nodig heeft', async () => {
  const geenDb = () => new RpcFout('uitnodigingsmail_klaar', 503, 'PGRST001');
  const portie = Array.from({ length: BATCH }, (_, i) => rij('m' + i));
  // Per mail: vijf keer geen databaseverbinding, de zesde poging lukt (alle herhalingen opgebruikt).
  const klaar = portie.flatMap(() => [geenDb(), geenDb(), geenDb(), geenDb(), geenDb(), null]);
  const { o, t } = omgeving({ pak: [portie], klaar, verstuurKost: VERSTUUR_MS });
  await verzendronde(o);
  const claimTot = CLAIM_MS;                                   // pak op t = 0
  assert.equal(t.verstuurd.length, BATCH, 'niet de hele portie verstuurd');
  for (const v of t.verstuurd) assert.ok(v.op < claimTot, `mail ${v.id} na het einde van de claim`);
  for (const a of t.aanroepen.filter(a => a.naam === 'uitnodigingsmail_klaar')) assert.ok(a.op < claimTot, 'klaar na het einde van de claim');
});

test('klaar is idempotent: ook na een kale 502 of een netwerkfout herhaald, tot het vastligt', async () => {
  const { o, t, tel } = omgeving({ pak: [[rij('a')]], klaar: [new RpcFout('uitnodigingsmail_klaar', 502, null), new RpcFout('uitnodigingsmail_klaar', null, null), null] });
  await verzendronde(o);
  assert.equal(tel('uitnodigingsmail_klaar'), 3);
  assert.deepEqual(t.verstuurd.map(v => v.id), ['a'], 'precies één mail');
});

test('claim: geen mail als versturen en vastleggen niet meer binnen de claim passen (pak antwoordde laat)', async () => {
  // Het antwoord op pak kwam pas na bijna de hele claimtermijn binnen: de rij niet meer versturen.
  const laat = CLAIM_MS - MARGE_MS - VERSTUUR_MS - VASTLEG_MS + 1;
  const { o, t, tel } = omgeving({ pak: [[rij('a')], [rij('b')]], kost: { uitnodigingsmail_pak: laat } });
  await verzendronde(o);
  assert.deepEqual(t.verstuurd, [], 'verstuurd op een claim die (bijna) verlopen is');
  assert.equal(tel('uitnodigingsmail_klaar'), 0);
  assert.equal(tel('uitnodigingsmail_pak'), 1, 'na een te korte claim geen nieuwe rij meer pakken');
  assert.ok(t.logs.some(l => l.uitkomst === 'claim te kort'));
  // Tegenproef: net op tijd wel.
  const ok = omgeving({ pak: [[rij('a')]], kost: { uitnodigingsmail_pak: laat - 2 } });
  await verzendronde(ok.o);
  assert.deepEqual(ok.t.verstuurd.map(v => v.id), ['a']);
});

test('claim: elke mail gaat weg, en ligt vast, binnen de claim van zijn eigen rij; ook als vastleggen herhaald moet worden', async () => {
  const geenDb = () => new RpcFout('uitnodigingsmail_klaar', 503, 'PGRST001');
  const { o, t } = omgeving({
    pak: [[rij('a')], [rij('b')], [rij('c')]],
    klaar: [geenDb(), geenDb(), null, geenDb(), null, null],
    kost: { uitnodigingsmail_pak: 300, uitnodigingsmail_klaar: 200 }, verstuurKost: VERSTUUR_MS,
  });
  await verzendronde(o);
  const paks = t.aanroepen.filter(a => a.naam === 'uitnodigingsmail_pak');
  assert.ok(t.verstuurd.length >= 1);
  for (const [i, v] of t.verstuurd.entries()) {
    const claimTot = paks[i].op + CLAIM_MS;
    assert.ok(v.op < claimTot, `mail ${v.id} verstuurd na het einde van zijn claim`);
    const vastgelegd = t.aanroepen.filter(a => a.naam === 'uitnodigingsmail_klaar' && a.args.p_id === v.id);
    for (const k of vastgelegd) assert.ok(k.op < claimTot, `klaar voor ${v.id} na het einde van de claim`);
  }
});

test('claim: herhalen van klaar stopt vóór het einde van de claim (geen vastlegging op een claim die een andere ronde kan hebben)', async () => {
  const klaarTot = 10_000;
  const { o, t } = omgeving({ klaar: Array.from({ length: 10 }, () => new RpcFout('uitnodigingsmail_klaar', 503, 'PGRST001')) });
  await assert.rejects(rpcHerhaal(o, 'uitnodigingsmail_klaar', { p_id: 'a' }, 'idempotent', klaarTot));
  for (const a of t.aanroepen) assert.ok(a.op < klaarTot, `aanroep op ${a.op} ms, na de claim`);
  assert.ok(t.aanroepen.length >= 2, 'wel herhaald binnen de claim');
});

test('lezen (mail_testaanbieder): onbekende uitkomsten worden herhaald, een 4xx niet', async () => {
  const een = omgeving({ klaar: [new RpcFout('mail_testaanbieder', 502, null), 'gewoon'] });
  assert.equal(await rpcHerhaal(een.o, 'mail_testaanbieder', {}, 'idempotent'), 'gewoon');
  const twee = omgeving({ klaar: [new RpcFout('mail_testaanbieder', 401, 'PGRST301'), 'gewoon'] });
  await assert.rejects(rpcHerhaal(twee.o, 'mail_testaanbieder', {}, 'idempotent'));
  assert.equal(twee.t.aanroepen.length, 1);
});
