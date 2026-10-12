// Thuisplanner KG-5D herstelronde 1 (bevinding 2): meting van het EIGEN gedrag van Supabase Realtime
// (lokale stack, supabase/realtime v2.130) bij intrekking van toegang. Geen onderdeel van CI; de
// uitkomst staat in docs/thuisplanner-sync.md. Alleen lokaal, alleen fictieve accounts.
//   SUPABASE="npx supabase@2.117.0" node realtime-meting.mjs   (API_URL, ANON_KEY, SERVICE_ROLE_KEY,
//   DB_URL en JWT_SECRET uit `supabase status -o env`)
// Om Realtime zelf te meten, zet de meting de kanaalwissel (household_members_rotate_channel) tijdelijk
// uit; daarna weer aan. Drie situaties, steeds met een client die na intrekking op het kanaal blijft:
//   basis       de client doet niets (niet-meewerkend)
//   nieuwtoken  de client stuurt een vernieuwd toegangstoken (zoals supabase-js bij verversen doet)
//   kortetoken  de client gebruikt een token dat na 15 s verloopt (lokaal getekend met de JWT-sleutel)
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL, JWT_SECRET } = process.env;
for (const u of [API_URL, DB_URL]) {
  if (!u || !/\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/.test(u)) throw new Error('Weigering: alleen een lokale Supabase');
}
const sql = q => execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', DB_URL, '-c', q]).toString().trim();
const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = randomUUID().slice(0, 8), pw = 'Meting-' + randomUUID();
const wacht = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const gebruikers = [];

async function persoon(n) {
  const email = `meting-${n}-${run}@test.invalid`;
  const u = (await admin.auth.admin.createUser({ email, password: pw, email_confirm: true })).data.user;
  gebruikers.push(u.id);
  const c = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await c.auth.signInWithPassword({ email, password: pw });
  return c;
}

async function meet(modus) {
  const anna = await persoon('anna-' + modus), bram = await persoon('bram-' + modus);
  const h = (await anna.rpc('create_household', { p_name: `Meting ${modus} ${run}`, p_display_name: 'Anna' })).data;
  const tok = (await anna.rpc('create_invite', { p_household: h, p_member: null, p_role: 'member' })).data;
  await bram.rpc('accept_invite', { p_token: tok, p_display_name: 'Bram' });
  const topic = (await bram.rpc('household_channel', { p_household: h })).data;
  let token;
  if (modus === 'kortetoken') {
    const sessie = (await bram.auth.getSession()).data.session;
    const claims = JSON.parse(Buffer.from(sessie.access_token.split('.')[1], 'base64url'));
    claims.exp = Math.floor(Date.now() / 1000) + 15;
    const kop = b64({ alg: 'HS256', typ: 'JWT' }), lijf = b64(claims);
    token = `${kop}.${lijf}.${createHmac('sha256', JWT_SECRET).update(`${kop}.${lijf}`).digest('base64url')}`;
  }
  const ontvangen = [], statussen = [];
  await bram.realtime.setAuth(token);
  const k = bram.channel(topic, { config: { private: true } }).on('broadcast', { event: '*' }, m => ontvangen.push([Date.now(), m.payload.t]));
  await new Promise(r => k.subscribe(s => { statussen.push([Date.now(), s]); if (s === 'SUBSCRIBED') r(); }));
  const mBram = (await anna.from('household_members').select('id,display_name').eq('household_id', h)).data.find(m => m.display_name === 'Bram').id;
  await anna.rpc('archive_member', { p_household: h, p_member: mBram });
  const tIntrekking = Date.now();
  if (modus === 'nieuwtoken') { await wacht(500); const s = await bram.auth.refreshSession(); await bram.realtime.setAuth(s.data.session.access_token); }
  const duur = modus === 'kortetoken' ? 30000 : 8000;
  let n = 0;
  for (const eind = Date.now() + duur; Date.now() < eind; n++) {
    await anna.rpc('add_shopping_items', { p_household: h, p_ids: [randomUUID()], p_names: ['meting-' + n] });
    await wacht(1000);
  }
  const na = ontvangen.filter(([t, soort]) => t > tIntrekking + 200 && soort === 'shopping_items');
  bram.realtime.disconnect(); anna.realtime.disconnect();
  return { modus, wijzigingenNaIntrekking: n, ontvangenNaIntrekking: na.length,
    laatsteOntvangenNa_s: na.length ? (na.at(-1)[0] - tIntrekking) / 1000 : null,
    kanaalstatus: statussen.map(([t, s]) => `${s}@${((t - tIntrekking) / 1000).toFixed(1)}s`).join(' '), eindstand: k.state };
}

sql('drop trigger household_members_rotate_channel on public.household_members');
try {
  for (const modus of ['basis', 'nieuwtoken', 'kortetoken']) console.log(JSON.stringify(await meet(modus)));
} finally {
  sql(`create trigger household_members_rotate_channel after update or delete on public.household_members
       for each row execute function private.rotate_channel_on_revoke()`);
  sql(`delete from public.households where name like 'Meting % ${run}'`);
  for (const id of gebruikers) await admin.auth.admin.deleteUser(id);
}
process.exit(0);
