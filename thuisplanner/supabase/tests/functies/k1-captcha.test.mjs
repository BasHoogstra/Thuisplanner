// Thuisplanner K1 (review stap 3a, L3): K1_CAPTCHA=uit mag alleen op een lokale stack. Online, of met een onbekend of
// ontbrekend adres, nooit: dan weigert controleer-code (storing) in plaats van de captcha over te slaan. Zonder netwerk.
//   node --experimental-strip-types --test thuisplanner/supabase/tests/functies/k1-captcha.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captchaUitToegestaan } from '../../functions/_gedeeld/k1.ts';

test('lokaal mag de captcha uit: de gateway van de lokale stack, of dit toestel', () => {
  for (const u of ['http://kong:8000', 'http://supabase_kong_thuisplanner:8000', 'http://supabase_kong_thuisplanner_k12:8000',
    'http://127.0.0.1:55321', 'http://localhost:54321', 'http://host.docker.internal:55321']) {
    assert.equal(captchaUitToegestaan(u), true, u);
  }
});

test('online, onbekend of ontbrekend: nooit', () => {
  for (const u of ['https://mcyjpnnjqxlqfwqhkqrl.supabase.co', 'https://abcdefghijklmnopqrst.supabase.co', 'http://kong.voorbeeld.nl',
    'http://127.0.0.1.voorbeeld.nl', 'https://staging.mijnthuisplanner.nl', 'http://10.0.0.5:8000', '', 'geen-url', undefined]) {
    assert.equal(captchaUitToegestaan(u), false, String(u));
  }
});
