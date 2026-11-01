// Herstelronde (review): de tijdslimiet van een mailverzoek geldt tot de antwoordbody helemaal binnen is. Een aanbieder
// die de kop snel stuurt en de body laat hangen, mag de verwerking niet blokkeren. Een time-out tijdens de body is
// ONZEKER (de mail kan al aangenomen zijn), nooit NietAangenomen. Een foutstatus wacht niet op zijn body.
//   node --test tests/functies/
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

const ENV = new Map();
globalThis.Deno = { env: { get: k => ENV.get(k) } };
const { kiesAanbieder, NietAangenomen } = await import('../../functions/_gedeeld/aanbieder.ts');

const TIJDSLIMIET_MS = 2500;
let server, basis, gedrag;
const open = new Set();
before(async () => {
  server = createServer((req, res) => {
    req.resume();
    req.on('end', () => gedrag(res));
  });
  server.on('connection', s => { open.add(s); s.on('close', () => open.delete(s)); });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  basis = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(ok => { for (const s of open) s.destroy(); server.close(ok); }));
beforeEach(() => {
  ENV.clear();
  for (const [k, v] of Object.entries({ MAIL_ADAPTER: 'lettermint', LETTERMINT_API_URL: basis, LETTERMINT_TOKEN: 'lm-token-test',
    LETTERMINT_WEBHOOK_GEHEIM: 'whsec_testgeheim', MAIL_AFZENDER: 'Thuisplanner <noreply@mail.mijnthuisplanner.nl>', TESTAANBIEDER_URL: basis })) ENV.set(k, v);
});

const MAIL = { aan: 'gast@test.invalid', onderwerp: 'Onderwerp', tekst: 'Tekst', html: '<p>Tekst</p>' };
/** Kop meteen (202), een stukje body, en de rest pas na `naMs` (of nooit). */
const snelleKopTrageBody = (status, naMs) => res => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.flushHeaders();
  res.write('{"message_id":"lm-traag"');
  if (naMs != null) setTimeout(() => res.end(',"status":"pending"}'), naMs);
};
async function duur(f) { const t = Date.now(); try { return { fout: null, waarde: await f(), ms: Date.now() - t }; } catch (e) { return { fout: e, ms: Date.now() - t }; } }

for (const adapter of ['lettermint', 'test']) {
  const kies = () => adapter === 'test' ? kiesAanbieder('gewoon') : kiesAanbieder();

  test(`${adapter}: snelle kop, body blijft hangen: na de tijdslimiet een onzekere fout (geen NietAangenomen)`, async () => {
    gedrag = snelleKopTrageBody(202, null);
    const r = await duur(() => kies().verstuur(MAIL, 'rij-1'));
    assert.ok(r.fout, 'verstuur moet falen');
    assert.ok(!(r.fout instanceof NietAangenomen), 'een hangende body is onzeker, geen weigering');
    assert.ok(r.ms >= TIJDSLIMIET_MS - 100 && r.ms < TIJDSLIMIET_MS + 1500, `binnen de tijdslimiet afgebroken (${r.ms} ms)`);
  });

  test(`${adapter}: snelle kop, body pas na 4 s: ook dan stopt het na de tijdslimiet`, async () => {
    gedrag = snelleKopTrageBody(202, 4000);
    const r = await duur(() => kies().verstuur(MAIL, 'rij-2'));
    assert.ok(r.fout && !(r.fout instanceof NietAangenomen));
    assert.ok(r.ms < TIJDSLIMIET_MS + 1500, `niet op de body gewacht (${r.ms} ms)`);
  });

  test(`${adapter}: snelle kop, body na 300 ms (binnen de limiet): gewoon aangenomen met het bericht-id`, async () => {
    gedrag = res => {
      res.writeHead(202, { 'Content-Type': 'application/json' }); res.flushHeaders();
      const id = adapter === 'test' ? 'id' : 'message_id';
      res.write(`{"${id}":"lm-ok"`); setTimeout(() => res.end('}'), 300);
    };
    const r = await duur(() => kies().verstuur(MAIL, 'rij-3'));
    assert.equal(r.fout, null, String(r.fout));
    assert.deepEqual(r.waarde, { berichtId: 'lm-ok' });
  });

  test(`${adapter}: een foutstatus (503) met een hangende body: meteen NietAangenomen, met Retry-After`, async () => {
    gedrag = res => { res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '30' }); res.flushHeaders(); res.write('{"err'); };
    const r = await duur(() => kies().verstuur(MAIL, 'rij-4'));
    assert.ok(r.fout instanceof NietAangenomen, String(r.fout));
    assert.equal(r.fout.status, 503);
    assert.equal(r.fout.wachtS, 30);
    assert.ok(r.ms < 1000, `niet op de body gewacht (${r.ms} ms)`);
  });
}
