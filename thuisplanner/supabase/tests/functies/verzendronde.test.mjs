// Herstelronde na de reviews van PR #54 (stuur-uitnodiging, migratie 20261116120000): onbekende uitkomsten, het
// claimtoken, teruggeven en de claimtermijn. Zonder netwerk, database of Deno: een klein model van de wachtrij met
// dezelfde regels als de SQL (pak met termijn en token, los, klaar per ronde), een nepklok en vertraging per aanroep.
// Zo toetsen de tests ook de eindtoestand van de rijen, niet alleen wat er verstuurd is.
//   node --experimental-strip-types --test tests/functies/
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { BATCH, CLAIM_MS, MARGE_MS, RPC_MS, RpcFout, VERSTUUR_MS, VASTLEG_MS, rpcHerhaal, tijdelijk, verzendronde } =
  await import('../../functions/_gedeeld/verzendronde.ts');

/**
 * Het model. `fouten[naam]` is een lijst per aanroep: 'voor' (fout, niet uitgevoerd), 'na' (uitgevoerd, antwoord kwijt),
 * een RpcFout (niet uitgevoerd, die fout), of null (gewoon). `kost[naam]`: vertraging per aanroep (ms). Een aanroep die
 * langer duurt dan zijn tijdslimiet is uitgevoerd en zijn antwoord is kwijt (het slechtste geval).
 */
function model({ mails = 0, idempotent = false, fouten = {}, kost = {}, verstuurKost = 0 } = {}) {
  const t = { nu: 0, rijen: new Map(), verstuurd: [], aanroepen: [], logs: [], ronden: 0 };
  for (let i = 0; i < mails; i++) t.rijen.set('m' + i, { status: 'wacht', pogingen: 0, ronde: null, bezig_tot: null, volgorde: i });
  const termijn = () => {
    for (const r of t.rijen.values()) if (r.status === 'bezig' && r.bezig_tot < t.nu) {
      r.status = idempotent && r.pogingen < 4 ? 'wacht' : 'onzeker'; r.bezig_tot = null;
    }
  };
  const db = {
    uitnodigingsmail_pak_ronde: a => {
      termijn();
      const eigen = [...t.rijen.entries()].filter(([, r]) => r.ronde === a.p_ronde && r.status === 'bezig' && r.bezig_tot > t.nu);
      if (eigen.length) return eigen.map(([id]) => ({ id }));
      const vrij = [...t.rijen.entries()].filter(([, r]) => r.status === 'wacht').sort((x, y) => x[1].volgorde - y[1].volgorde).slice(0, a.p_max);
      for (const [, r] of vrij) Object.assign(r, { status: 'bezig', bezig_tot: t.nu + CLAIM_MS, pogingen: r.pogingen + 1, ronde: a.p_ronde });
      return vrij.map(([id]) => ({ id }));
    },
    uitnodigingsmail_los: a => {
      let n = 0;
      for (const [id, r] of t.rijen) if (r.ronde === a.p_ronde && r.status === 'bezig' && r.bezig_tot > t.nu && (!a.p_ids || a.p_ids.includes(id))) {
        Object.assign(r, { status: 'wacht', pogingen: Math.max(r.pogingen - 1, 0), bezig_tot: null, ronde: null }); n++;
      }
      return n;
    },
    uitnodigingsmail_klaar_ronde: a => {
      const r = t.rijen.get(a.p_id);
      if (!r || r.ronde !== a.p_ronde || r.status !== 'bezig') return false;
      Object.assign(r, { status: a.p_uitkomst === 'aangenomen' ? 'aangenomen' : a.p_uitkomst, bezig_tot: null });
      return true;
    },
    mail_testaanbieder: () => null,
  };
  const o = {
    idempotent, nu: () => t.nu, wacht: async ms => { t.nu += ms; }, log: g => t.logs.push(g),
    nieuweId: () => 'ronde-' + (++t.ronden),
    rpc: async (naam, args, opties = {}) => {
      const limiet = opties.tijdslimietMs ?? Infinity;
      const a = { naam, args, start: t.nu, limiet };
      t.aanroepen.push(a);
      const f = (fouten[naam] ?? []).shift() ?? null;
      if (f instanceof Error || f === 'voor') { a.eind = t.nu; throw f instanceof Error ? f : new RpcFout(naam, 502, null); }
      const k = kost[naam] ?? 0;
      if (k > limiet) { t.nu += limiet; db[naam](args); a.eind = t.nu; throw new RpcFout(naam, null, null); }
      t.nu += k;
      const uit = db[naam](args);
      a.eind = t.nu;
      if (f === 'na') throw new RpcFout(naam, 503, null);
      return uit;
    },
    verstuur: async r => {
      const rij = t.rijen.get(r.id);
      const begin = t.nu;
      t.nu += verstuurKost;
      t.verstuurd.push({ id: r.id, begin, eind: t.nu, geldigTot: rij.bezig_tot, ronde: rij.ronde, status: rij.status });
      return { uitkomst: 'aangenomen', bericht: 'b-' + r.id, wachtS: null };
    },
  };
  const standen = () => Object.fromEntries([...t.rijen].map(([id, r]) => [id, r.status]));
  // Na afloop: de termijn van alle claims laten verstrijken en de lease-regel van pak toepassen (de volgende ronde).
  const naDeTermijn = () => { t.nu += CLAIM_MS + 1; termijn(); return standen(); };
  return { o, t, standen, naDeTermijn };
}
const nooitNaClaim = (t) => {
  for (const v of t.verstuurd) {
    assert.equal(v.status, 'bezig', `${v.id}: verstuurd zonder geldige claim`);
    assert.ok(v.eind <= v.geldigTot, `${v.id}: versturen eindigde na de claim (${v.eind} > ${v.geldigTot})`);
  }
};

test('tijdelijk: geen antwoord of 5xx; een 4xx niet', () => {
  for (const [s, c] of [[null, null], [502, null], [503, 'PGRST001'], [500, '57P01'], [504, null]]) assert.equal(tijdelijk(new RpcFout('x', s, c)), true);
  for (const [s, c] of [[400, null], [401, 'PGRST301'], [404, 'PGRST202']]) assert.equal(tijdelijk(new RpcFout('x', s, c)), false);
});

test('pak: het antwoord gaat verloren nadat de claim is gezet; herhalen met hetzelfde token geeft dezelfde claim, niets blijft achter', async () => {
  const m = model({ mails: 3, fouten: { uitnodigingsmail_pak_ronde: ['na', 'na'] } });
  await verzendronde(m.o);
  assert.deepEqual(m.t.verstuurd.map(v => v.id).sort(), ['m0', 'm1', 'm2']);
  assert.deepEqual(m.naDeTermijn(), { m0: 'aangenomen', m1: 'aangenomen', m2: 'aangenomen' });
  for (const r of m.t.rijen.values()) assert.equal(r.pogingen, 1, 'een herhaling telde als nieuwe poging');
  nooitNaClaim(m.t);
});

test('pak blijft onbekend (alle pogingen kwijt): de ronde geeft de mogelijke claim terug; niets wordt "onzeker" zonder verstuurd te zijn', async () => {
  const m = model({ mails: 3, fouten: { uitnodigingsmail_pak_ronde: ['na', 'na', 'na', 'na', 'na', 'na'] } });
  await assert.rejects(verzendronde(m.o));
  assert.deepEqual(m.t.verstuurd, []);
  assert.deepEqual(m.naDeTermijn(), { m0: 'wacht', m1: 'wacht', m2: 'wacht' });
  for (const r of m.t.rijen.values()) assert.equal(r.pogingen, 0);
  // Tegenproef van het model: zonder teruggeven was dit "onzeker" geworden.
  const zonder = model({ mails: 1 });
  await zonder.o.rpc('uitnodigingsmail_pak_ronde', { p_max: 5, p_idempotent: false, p_ronde: 'x' });
  assert.deepEqual(zonder.naDeTermijn(), { m0: 'onzeker' });
});

test('claim te kort (pak antwoordde laat): niets versturen, en de portie terug op "wacht" zonder dat de poging telt', async () => {
  const laat = CLAIM_MS - MARGE_MS - VERSTUUR_MS - VASTLEG_MS + 1;
  const m = model({ mails: 2, kost: { uitnodigingsmail_pak_ronde: Math.min(laat, RPC_MS) } });
  // De vertraging van pak zelf is begrensd door zijn tijdslimiet; daarom de klok vóór het pakken al ver zetten.
  m.t.nu = 0;
  const pak = m.o.rpc;
  m.o.rpc = async (naam, args, op) => { if (naam === 'uitnodigingsmail_pak_ronde') { const r = await pak(naam, args, op); m.t.nu += laat; return r; } return pak(naam, args, op); };
  await verzendronde(m.o);
  assert.deepEqual(m.t.verstuurd, []);
  assert.deepEqual(m.naDeTermijn(), { m0: 'wacht', m1: 'wacht' });
  assert.ok(m.t.logs.some(l => l.uitkomst === 'claim te kort'));
});

test('vastleggen lukt niet (alle pogingen tot het einde van de claim): de rest van de portie gaat terug; de verstuurde mail blijft "bezig"', async () => {
  const geenDb = () => new RpcFout('uitnodigingsmail_klaar_ronde', 503, 'PGRST001');
  const m = model({ mails: 3, fouten: { uitnodigingsmail_klaar_ronde: Array.from({ length: 20 }, geenDb) }, verstuurKost: VERSTUUR_MS });
  await assert.rejects(verzendronde(m.o));
  assert.deepEqual(m.t.verstuurd.map(v => v.id), ['m0']);
  assert.deepEqual(m.standen(), { m0: 'bezig', m1: 'wacht', m2: 'wacht' });
  nooitNaClaim(m.t);
});

test('slechtste geval: trage aanroepen en aanbieder, veel herhalingen; nooit verstuurd of vastgelegd na de claim, niets "onzeker"', async () => {
  const geenDb = () => new RpcFout('uitnodigingsmail_klaar_ronde', 503, 'PGRST001');
  const m = model({
    mails: 12, verstuurKost: VERSTUUR_MS,
    kost: { uitnodigingsmail_pak_ronde: 1_000, uitnodigingsmail_klaar_ronde: 1_000, uitnodigingsmail_los: 1_000 },
    fouten: { uitnodigingsmail_klaar_ronde: Array.from({ length: 40 }, (_, i) => (i % 5 === 4 ? null : geenDb())) },
  });
  await verzendronde(m.o);
  nooitNaClaim(m.t);
  // Elke aanroep (ook de laatste herhaling) eindigt binnen de echte claim van de portie: begin van pak + 2 minuten.
  const paks = m.t.aanroepen.filter(a => a.naam === 'uitnodigingsmail_pak_ronde');
  for (const a of m.t.aanroepen.filter(a => a.naam === 'uitnodigingsmail_klaar_ronde')) {
    const portie = paks.filter(p => p.start <= a.start).at(-1);
    assert.ok(a.eind <= portie.start + CLAIM_MS, `klaar eindigde na de claim (${a.eind} > ${portie.start + CLAIM_MS})`);
    assert.ok(a.limiet <= RPC_MS);
  }
  const eind = m.naDeTermijn();
  assert.ok(!Object.values(eind).includes('onzeker'), JSON.stringify(eind));
  assert.ok(!Object.values(eind).includes('bezig'));
  assert.ok(m.t.verstuurd.length >= 1);
});

test('de tijdslimiet van een aanroep reikt nooit voorbij de claim, en na de claim begint geen nieuwe poging', async () => {
  const m = model({ fouten: { uitnodigingsmail_klaar_ronde: Array.from({ length: 10 }, () => new RpcFout('uitnodigingsmail_klaar_ronde', null, null)) } });
  const tot = 7_000;
  await assert.rejects(rpcHerhaal(m.o, 'uitnodigingsmail_klaar_ronde', { p_id: 'x', p_ronde: 'r' }, tot));
  for (const a of m.t.aanroepen) {
    assert.ok(a.start < tot, `poging begon op ${a.start}, na de claim`);
    assert.ok(a.start + a.limiet <= tot, `tijdslimiet reikt tot ${a.start + a.limiet}, voorbij ${tot}`);
  }
  assert.ok(m.t.aanroepen.length >= 2, 'wel herhaald binnen de claim');
});

test('een 4xx wordt niet herhaald; lezen na een kale 502 wel', async () => {
  const een = model({ fouten: { mail_testaanbieder: [new RpcFout('mail_testaanbieder', 401, 'PGRST301')] } });
  await assert.rejects(rpcHerhaal(een.o, 'mail_testaanbieder', {}));
  assert.equal(een.t.aanroepen.length, 1);
  const twee = model({ fouten: { mail_testaanbieder: [new RpcFout('mail_testaanbieder', 502, null)] } });
  assert.equal(await rpcHerhaal(twee.o, 'mail_testaanbieder', {}), null);
  assert.equal(twee.t.aanroepen.length, 2);
});

test('een volle wachtrij: porties van BATCH, alles één keer verstuurd binnen de claim, met een nieuw token per portie', async () => {
  const m = model({ mails: 12 });
  await verzendronde(m.o);
  assert.equal(m.t.verstuurd.length, 12);
  assert.equal(new Set(m.t.verstuurd.map(v => v.id)).size, 12, 'een mail twee keer verstuurd');
  for (const a of m.t.aanroepen.filter(a => a.naam === 'uitnodigingsmail_pak_ronde')) assert.equal(a.args.p_max, BATCH);
  assert.ok(new Set(m.t.verstuurd.map(v => v.ronde)).size >= Math.ceil(12 / BATCH));
  nooitNaClaim(m.t);
});
