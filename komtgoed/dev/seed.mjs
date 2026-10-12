#!/usr/bin/env node
// Thuisplanner dev: zet de fictieve demo klaar op de LOKALE Supabase-stack.
//   cd komtgoed/dev && npm run seed
// Maakt (opnieuw) twee demo-accounts, het huishouden "Familie Demo", een paar boodschappen, een gedeelde
// afspraak en een privé-afspraak van Anna. De service-role-sleutel wordt alleen hier, in node, gebruikt
// om accounts aan te maken en op te ruimen; de browser krijgt hem nooit.
import { createClient } from '@supabase/supabase-js';
import { DEMO, lokaleSupabase } from './omgeving.mjs';

export async function zetDemoKlaar({ stil = false } = {}) {
  const { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = lokaleSupabase();
  const opties = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(API_URL, SERVICE_ROLE_KEY, opties);

  // Oude demo-accounts weg (hun huishouden gaat mee: zie before_account_delete).
  const { data: lijst, error: e0 } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (e0) throw e0;
  // Bram eerst: Anna is de enige eigenaar en kan pas weg als er geen andere accounts meer zijn.
  for (const p of [DEMO.accounts.bram, DEMO.accounts.anna]) {
    const oud = lijst.users.find(u => u.email === p.email);
    if (oud) { const { error } = await admin.auth.admin.deleteUser(oud.id); if (error) throw error; }
  }
  const sessies = {};
  for (const [als, p] of Object.entries(DEMO.accounts)) {
    const { data, error } = await admin.auth.admin.createUser({ email: p.email, password: DEMO.wachtwoord, email_confirm: true });
    if (error) throw error;
    const c = createClient(API_URL, ANON_KEY, opties);
    const r = await c.auth.signInWithPassword({ email: p.email, password: DEMO.wachtwoord });
    if (r.error) throw r.error;
    sessies[als] = { c, id: data.user.id };
  }
  const anna = sessies.anna.c, bram = sessies.bram.c;
  const stap = async (p) => { const r = await p; if (r.error) throw r.error; return r.data; };
  const h = await stap(anna.rpc('create_household', { p_name: DEMO.huishouden, p_display_name: DEMO.accounts.anna.naam }));
  const tok = await stap(anna.rpc('create_invite', { p_household: h, p_member: null, p_role: 'member' }));
  await stap(bram.rpc('accept_invite', { p_token: tok, p_display_name: DEMO.accounts.bram.naam }));
  const namen = ['Melk', 'Brood', 'Appels', 'Pindakaas'];
  await stap(anna.rpc('add_shopping_items', { p_household: h, p_ids: namen.map(() => crypto.randomUUID()), p_names: namen }));
  const afspraak = (titel, zicht, dag, van, tot, extra = {}) => stap(anna.rpc('save_event', {
    p_household: h, p_id: crypto.randomUUID(), p_version: null, p_start_date: dag, p_start_time: van, p_end_date: null,
    p_end_time: tot, p_visibility: zicht, p_title: titel, p_location: extra.plek ?? null, p_notes: extra.notitie ?? null,
    p_preparation: null, p_participants: null, p_recurrence_freq: null, p_recurrence_until: null }));
  const vandaag = new Date().toISOString().slice(0, 10);
  await afspraak('Ouderavond school', 'household', vandaag, '19:30', '21:00', { plek: 'Basisschool' });
  await afspraak('Tandarts (privé van Anna)', 'private', vandaag, '10:00', '11:00', { plek: 'Tandartspraktijk Zuid', notitie: 'Privénotitie van Anna' });
  if (!stil) console.log(`Demo klaar: huishouden "${DEMO.huishouden}" met ${DEMO.accounts.anna.email} en ${DEMO.accounts.bram.email}.`);
  return { huishouden: h, accounts: { anna: sessies.anna.id, bram: sessies.bram.id } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  zetDemoKlaar().then(() => process.exit(0), e => { console.error('Demo klaarzetten mislukt:', e.message); process.exit(1); });
}
