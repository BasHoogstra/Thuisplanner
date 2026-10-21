// Thuisplanner-staging, stap 3: de proefmail (staging/proefmail.mjs) tegen een nagebootste Lettermint op 127.0.0.1.
// Zonder netwerk naar buiten; er wordt geen echte mail verstuurd. Toetst: de adapter van de Edge Functions doet het
// verzoek; het tweede verzoek gebruikt dezelfde sleutel; de uitkomst klopt voor idempotent, niet-idempotent, 409 en een
// weigering; en de uitvoer van het script bevat nooit het token of het volledige adres.
//   node --experimental-strip-types --test thuisplanner/supabase/tests/functies/proefmail.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ENV = new Map();
globalThis.Deno = { env: { get: k => ENV.get(k) } };
const { lettermint } = await import('../../functions/_gedeeld/aanbieder.ts');
const { proef, proefbericht, verkort, UITLEG } = await import('../../staging/proefmail.mjs');
const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../staging/proefmail.mjs');

// Nagebootste Lettermint: 'idempotent' (dezelfde sleutel geeft hetzelfde message_id en geen nieuwe mail), 'gewoon'
// (elke keer een nieuwe mail), 'conflict' (tweede keer 409) of 'weiger' (401).
let gedrag = 'idempotent', server, basis;
const verzoeken = [], mails = [], perSleutel = new Map();
before(async () => {
  server = createServer((req, res) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => {
      const sleutel = req.headers['idempotency-key'];
      verzoeken.push({ pad: req.url, token: req.headers['x-lettermint-token'], sleutel, body: JSON.parse(data || '{}') });
      const stuur = (s, b) => res.writeHead(s, { 'Content-Type': 'application/json' }).end(JSON.stringify(b));
      if (gedrag === 'weiger') return stuur(401, { message: 'unauthorized' });
      if (perSleutel.has(sleutel) && gedrag === 'idempotent') return stuur(202, { message_id: perSleutel.get(sleutel), status: 'pending' });
      if (perSleutel.has(sleutel) && gedrag === 'conflict') return stuur(409, { message: 'concurrent_idempotent_requests' });
      const id = 'lm-' + (mails.length + 1);
      mails.push(id);
      perSleutel.set(sleutel, id);
      stuur(202, { message_id: id, status: 'pending' });
    });
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  basis = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(ok => { server.closeAllConnections?.(); server.close(ok); }));
beforeEach(() => {
  ENV.clear();
  for (const [k, v] of Object.entries({ LETTERMINT_API_URL: basis, LETTERMINT_TOKEN: 'lm-token-test', MAIL_AFZENDER: 'Thuisplanner (staging) <noreply@mail.mijnthuisplanner.nl>' })) ENV.set(k, v);
  verzoeken.length = 0; mails.length = 0; perSleutel.clear(); gedrag = 'idempotent';
});
const snel = { wacht: async () => {}, pauzeMs: 0 };

test('idempotent: twee verzoeken met dezelfde sleutel, hetzelfde message_id, één mail', async () => {
  const r = await proef(lettermint(), proefbericht('bas@test.invalid'), snel);
  assert.equal(r.uitkomst, 'bewezen');
  assert.equal(verzoeken.length, 2);
  assert.equal(mails.length, 1);
  assert.match(verzoeken[0].sleutel, /^proefmail-[0-9a-f-]{36}$/);
  assert.equal(verzoeken[1].sleutel, verzoeken[0].sleutel, 'het tweede verzoek gebruikt een andere sleutel');
  assert.deepEqual(verzoeken[1].body, verzoeken[0].body, 'het tweede verzoek is niet hetzelfde');
  assert.equal(verzoeken[0].pad, '/v1/send');
  assert.equal(verzoeken[0].token, 'lm-token-test');
  assert.equal(verzoeken[0].body.from, 'Thuisplanner (staging) <noreply@mail.mijnthuisplanner.nl>');
  assert.deepEqual(verzoeken[0].body.to, ['bas@test.invalid']);
});

test('niet idempotent, 409 en een weigering: nooit "bewezen"; bij een weigering geen tweede verzoek', async () => {
  gedrag = 'gewoon';
  assert.equal((await proef(lettermint(), proefbericht('bas@test.invalid'), snel)).uitkomst, 'niet-idempotent');
  assert.equal(mails.length, 2);
  verzoeken.length = 0; mails.length = 0; perSleutel.clear(); gedrag = 'conflict';
  const c = await proef(lettermint(), proefbericht('bas@test.invalid'), snel);
  assert.equal(c.uitkomst, 'onzeker');
  assert.equal(c.tweede.ok, false);
  verzoeken.length = 0; gedrag = 'weiger';
  const w = await proef(lettermint(), proefbericht('bas@test.invalid'), snel);
  assert.equal(w.uitkomst, 'niet-verstuurd');
  assert.equal(w.eerste.status, 401);
  assert.equal(verzoeken.length, 1, 'na een weigering toch een tweede verzoek');
});

test('het bericht: geen geheimen of links, wel een herkenbaar onderwerp en tijdstip; het adres verkort', () => {
  const b = proefbericht('bas@test.invalid', new Date('2026-10-21T12:34:00Z'));
  assert.equal(b.onderwerp, 'Thuisplanner (staging): proefmail');
  assert.match(b.tekst, /2026-10-21 12:34 UTC/);
  assert.doesNotMatch(b.tekst + b.html, /https?:|token|code/i);
  assert.equal(verkort('bas.hoogstra@voorbeeld.nl'), 'b…@voorbeeld.nl');
  for (const u of ['bewezen', 'niet-idempotent', 'onzeker', 'niet-verstuurd']) assert.ok(UITLEG[u]);
});

// Asynchroon: de nagebootste Lettermint draait in dit proces en moet kunnen antwoorden terwijl het script loopt.
function script(env) {
  return new Promise(klaar => {
    const p = spawn(process.execPath, ['--experimental-strip-types', SCRIPT], {
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PROEF_PAUZE_MS: '10', LETTERMINT_API_URL: basis, ...env } });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => { stdout += d; });
    p.stderr.on('data', d => { stderr += d; });
    p.on('close', status => klaar({ status, stdout, stderr }));
  });
}

test('het script: uitkomst en exitcode; de uitvoer bevat nooit het token of het volledige adres', async () => {
  const TOKEN = 'lm-token-geheim-' + 'x'.repeat(20), AAN = 'bas.proef@voorbeeld.invalid';
  const r = await script({ LETTERMINT_TOKEN: TOKEN, PROEF_AAN: AAN });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /IDEMPOTENT BEWEZEN/);
  assert.match(r.stdout, /b…@voorbeeld\.invalid/);
  assert.match(r.stdout, /afzender: Thuisplanner \(staging\) <noreply@mail\.mijnthuisplanner\.nl>/);
  for (const geheim of [TOKEN, AAN, 'bas.proef']) assert.ok(!(r.stdout + r.stderr).includes(geheim), `uitvoer bevat ${geheim}`);
  assert.equal(mails.length, 1);
  gedrag = 'gewoon';
  const n = await script({ LETTERMINT_TOKEN: TOKEN, PROEF_AAN: AAN });
  assert.equal(n.status, 3);
  assert.match(n.stdout, /NIET IDEMPOTENT/);
  gedrag = 'weiger';
  const w = await script({ LETTERMINT_TOKEN: TOKEN, PROEF_AAN: AAN });
  assert.equal(w.status, 1);
  assert.match(w.stdout, /status 401/);
});

test('het script weigert zonder token, zonder geldig adres, of met een API-adres buiten deze computer', async () => {
  assert.equal((await script({ PROEF_AAN: 'bas@test.invalid' })).status, 2);
  assert.equal((await script({ LETTERMINT_TOKEN: 't', PROEF_AAN: 'geen-adres' })).status, 2);
  const buiten = await script({ LETTERMINT_TOKEN: 't', PROEF_AAN: 'bas@test.invalid', LETTERMINT_API_URL: 'https://api.voorbeeld.nl' });
  assert.equal(buiten.status, 1);
  assert.match(buiten.stdout, /LETTERMINT_API_URL ongeldig/);
  assert.equal(verzoeken.length, 0);
});
