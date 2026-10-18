// Thuisplanner: de Lettermint-adapter (functions/_gedeeld/aanbieder.ts) zonder netwerk naar buiten. Node leest de
// TypeScript-bron rechtstreeks (type stripping, Node 22.6+); Deno.env wordt nagebootst. Een nagebootste Lettermint
// op 127.0.0.1 beantwoordt de verzoeken. Zie de documentatie van Lettermint: POST /v1/send met x-lettermint-token en
// Idempotency-Key; webhooks met X-Lettermint-Signature "t=…,v1=…" over "t.body".
//   node --test tests/functies/
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

const ENV = new Map();
globalThis.Deno = { env: { get: k => ENV.get(k) } };
const { lettermint, kiesAanbieder, NietAangenomen } = await import('../../functions/_gedeeld/aanbieder.ts');

let server, basis;
const verzoeken = [];
let antwoord = () => ({ status: 202, body: { message_id: 'lm-1', status: 'pending' } });
before(async () => {
  server = createServer((req, res) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', async () => {
      verzoeken.push({ methode: req.method, pad: req.url, kop: req.headers, body: JSON.parse(data || '{}') });
      const a = await antwoord();
      setTimeout(() => res.writeHead(a.status, { 'Content-Type': 'application/json', ...(a.kop ?? {}) }).end(JSON.stringify(a.body ?? {})), a.wacht ?? 0);
    });
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  basis = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(ok => { server.closeAllConnections?.(); server.close(ok); }));
beforeEach(() => {
  ENV.clear();
  for (const [k, v] of Object.entries({ MAIL_ADAPTER: 'lettermint', LETTERMINT_API_URL: basis, LETTERMINT_TOKEN: 'lm-token-test',
    LETTERMINT_WEBHOOK_GEHEIM: 'whsec_testgeheim', MAIL_AFZENDER: 'Thuisplanner <noreply@mail.mijnthuisplanner.nl>' })) ENV.set(k, v);
  verzoeken.length = 0;
  antwoord = () => ({ status: 202, body: { message_id: 'lm-1', status: 'pending' } });
});

const MAIL = { aan: 'gast@test.invalid', onderwerp: 'Olaf nodigt je uit voor Thuisplanner', tekst: 'Tekst', html: '<p>Tekst</p>' };

test('versturen: het verzoek volgens de API van Lettermint, met de idempotentiesleutel; het bericht-id komt terug', async () => {
  const a = kiesAanbieder();
  assert.equal(a.naam, 'lettermint');
  assert.deepEqual(await a.verstuur(MAIL, 'rij-123'), { berichtId: 'lm-1' });
  const [v] = verzoeken;
  assert.equal(v.methode, 'POST');
  assert.equal(v.pad, '/v1/send');
  assert.equal(v.kop['x-lettermint-token'], 'lm-token-test');
  assert.equal(v.kop['idempotency-key'], 'rij-123');
  assert.deepEqual(v.body, { from: 'Thuisplanner <noreply@mail.mijnthuisplanner.nl>', to: ['gast@test.invalid'], subject: MAIL.onderwerp, text: MAIL.tekst, html: MAIL.html });
});

test('fouten: 409 is onzeker (nooit "niet aangenomen"); 429 en 5xx later opnieuw; andere 4xx definitief', async () => {
  const a = lettermint();
  antwoord = () => ({ status: 409, body: { message: 'concurrent_idempotent_requests' } });
  const e409 = await a.verstuur(MAIL, 'k').catch(e => e);
  assert.ok(e409 instanceof Error && !(e409 instanceof NietAangenomen), '409 hoort onzeker te zijn');
  antwoord = () => ({ status: 429, kop: { 'Retry-After': '120' } });
  const e429 = await a.verstuur(MAIL, 'k').catch(e => e);
  assert.ok(e429 instanceof NietAangenomen && e429.opnieuw && e429.wachtS === 120);
  antwoord = () => ({ status: 503 });
  assert.ok((await a.verstuur(MAIL, 'k').catch(e => e)).opnieuw);
  for (const s of [400, 401, 403, 413, 422]) {
    antwoord = () => ({ status: s });
    const e = await a.verstuur(MAIL, 'k').catch(e => e);
    assert.ok(e instanceof NietAangenomen && !e.opnieuw, `${s}`);
  }
  // Geen antwoord binnen de tijdslimiet (2,5 s): onzeker.
  antwoord = () => ({ status: 202, body: { message_id: 'laat' }, wacht: 4000 });
  const traag = await a.verstuur(MAIL, 'k').catch(e => e);
  assert.ok(traag instanceof Error && !(traag instanceof NietAangenomen));
});

test('idempotent alleen als dat online bewezen is (LETTERMINT_IDEMPOTENT_BEWEZEN=ja)', () => {
  assert.equal(lettermint().idempotent, false);
  ENV.set('LETTERMINT_IDEMPOTENT_BEWEZEN', 'true');
  assert.equal(lettermint().idempotent, false);
  ENV.set('LETTERMINT_IDEMPOTENT_BEWEZEN', 'ja');
  assert.equal(lettermint().idempotent, true);
});

test('alleen de echte API of een nagebootste op deze computer; zonder token of webhookgeheim: weigeren', async () => {
  ENV.set('LETTERMINT_API_URL', 'https://api.lettermint.co.aanvaller.nl');
  assert.throws(() => lettermint(), /LETTERMINT_API_URL ongeldig/);
  ENV.set('LETTERMINT_API_URL', 'http://10.0.0.5:8080');
  assert.throws(() => lettermint(), /ongeldig/);
  ENV.delete('LETTERMINT_API_URL');
  assert.doesNotThrow(() => lettermint());
  ENV.set('LETTERMINT_API_URL', basis);
  ENV.delete('LETTERMINT_TOKEN');
  await assert.rejects(lettermint().verstuur(MAIL, 'k'), /ontbrekende instelling LETTERMINT_TOKEN/);
  assert.equal(verzoeken.length, 0, 'zonder token gaat er niets weg');
});

const melding = (event, { t = Math.floor(Date.now() / 1000), geheim = 'whsec_testgeheim', levering, body } = {}) => {
  const tekst = body ?? JSON.stringify({ id: 'evt-1', event, timestamp: new Date().toISOString(), data: { message_id: 'lm-1', recipient: 'gast@test.invalid' } });
  const sig = createHmac('sha256', geheim).update(`${t}.${tekst}`).digest('hex');
  return [new Request('http://x/', { method: 'POST', headers: { 'x-lettermint-signature': `t=${t},v1=${sig}`, 'x-lettermint-delivery': String(levering ?? t), 'x-lettermint-event': event } }), tekst];
};

test('bezorgmeldingen: alleen met een geldige handtekening; bezorgd, niet bezorgd, of negeren', async () => {
  const a = lettermint();
  assert.deepEqual(await a.bezorging(...melding('message.delivered')), { berichtId: 'lm-1', uitkomst: 'bezorgd' });
  for (const e of ['message.hard_bounced', 'message.failed', 'message.suppressed', 'message.policy_rejected']) {
    assert.deepEqual(await a.bezorging(...melding(e)), { berichtId: 'lm-1', uitkomst: 'niet_bezorgd' }, e);
  }
  for (const e of ['message.soft_bounced', 'message.spam_complaint', 'webhook.test', 'message.opened']) assert.equal(await a.bezorging(...melding(e)), 'negeren', e);
});

test('bezorgmeldingen: vervalst, ander geheim, te oud, herhaald met een andere tijd of zonder handtekening: ongeldig', async () => {
  const a = lettermint();
  const [req, body] = melding('message.delivered');
  assert.equal(await a.bezorging(req, body.replace('lm-1', 'lm-2')), null, 'aangepaste inhoud');
  assert.equal(await a.bezorging(...melding('message.delivered', { geheim: 'whsec_ander' })), null, 'ander geheim');
  assert.equal(await a.bezorging(...melding('message.delivered', { t: Math.floor(Date.now() / 1000) - 600 })), null, 'te oud');
  assert.equal(await a.bezorging(...melding('message.delivered', { levering: 123 })), null, 'X-Lettermint-Delivery wijkt af');
  assert.equal(await a.bezorging(new Request('http://x/', { method: 'POST' }), body), null, 'geen handtekening');
  ENV.delete('LETTERMINT_WEBHOOK_GEHEIM');
  await assert.rejects(a.bezorging(...melding('message.delivered')), /ontbrekende instelling/);
});
