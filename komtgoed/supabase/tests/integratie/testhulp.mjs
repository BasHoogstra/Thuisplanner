// Thuisplanner KG-5D: gedeelde testhulp voor herstel.test.mjs en herstel2.test.mjs (lokale Supabase-stack).
// Lopende verzoeken worden met "poorten" in een vaste volgorde vastgehouden, uitgevoerd of zonder
// antwoord afgebroken; een sessie kan "verlopen" (verlopen JWT op elk REST-verzoek) en opnieuw inloggen.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL, JWT_SECRET } = process.env;
for (const u of [API_URL, DB_URL]) {
  if (!u || !/\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/.test(u)) throw new Error('Weigering: alleen een lokale Supabase');
}

export const sql = q => execFileSync(process.env.PSQL || 'psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', DB_URL, '-c', q]).toString().trim();
export const wacht = ms => new Promise(r => setTimeout(r, ms));
export async function totdat(f, ms = 10000, wat = 'voorwaarde') {
  const eind = Date.now() + ms;
  while (Date.now() < eind) { if (await f()) return; await wacht(100); }
  throw new Error('Niet binnen ' + ms + ' ms: ' + wat);
}
export const isRest = (tabel, methode) => (u, m) => m === methode && new URL(u).pathname === `/rest/v1/${tabel}`;
export const isRpc = naam => (u, m) => m === 'POST' && new URL(u).pathname === `/rest/v1/rpc/${naam}`;
// De volledige ophaalronde van de sync voor een tabel (herkenbaar aan het filter op deleted_at), niet de
// gerichte controle na een dubbel id (select=id&id=eq...). Met een blijvende poort hierop kan de sync een
// onzekere opdracht niet zelf bevestigen voordat de test hem opnieuw probeert.
export const isOphalen = tabel => (u, m) => m === 'GET' && new URL(u).pathname === `/rest/v1/${tabel}`
  && new URL(u).searchParams.has('deleted_at');

// Een verlopen versie van een toegangstoken (zelfde account, exp in het verleden), lokaal getekend met de
// JWT-sleutel van de lokale stack. PostgREST weigert hem zoals een echt verlopen token (401, PGRST303).
function verlopen(token) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET ontbreekt (uit `supabase status -o env`)');
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
  claims.exp = Math.floor(Date.now() / 1000) - 60;
  const kop = b64({ alg: 'HS256', typ: 'JWT' }), lijf = b64(claims);
  return `${kop}.${lijf}.${createHmac('sha256', JWT_SECRET).update(`${kop}.${lijf}`).digest('base64url')}`;
}

// Opslag zoals localStorage (length, key, getItem, setItem, removeItem). Met weigert: elke setItem faalt
// (zoals een browser die opslag weigert of vol is).
export function nieuweOpslag(begin = {}, { weigert = false } = {}) {
  const m = new Map(Object.entries(begin));
  return {
    get length() { return m.size; },
    key: i => [...m.keys()][i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (weigert) throw Object.assign(new Error('opslag geweigerd'), { name: 'QuotaExceededError' }); m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    m,
  };
}

export function maakOmgeving({ maakSync, voorvoegsel }) {
  const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const run = randomUUID().slice(0, 8);
  const wachtwoord = `${voorvoegsel}-${randomUUID()}`;
  const personen = {};
  const opruimen = [];
  const o = { run, personen };

  // Een client met een eigen netwerk en poorten. Met eerstUitvoeren voert de server het verzoek eerst uit
  // (commit); met antwoordWeg komt er daarna geen antwoord. net.tokenVerlopen: elk REST-verzoek gaat met een
  // verlopen token (de sessie is verlopen).
  o.clientMetPoorten = () => {
    const net = { uit: false, tokenVerlopen: false };
    const poorten = [];
    const doorgeven = async (url, init = {}) => {
      const u = String(url?.url || url);
      const methode = String(init?.method || url?.method || 'GET').toUpperCase();
      if (net.tokenVerlopen && new URL(u).pathname.startsWith('/rest/')) {
        const h = new Headers(init.headers);
        const a = h.get('Authorization');
        if (a?.startsWith('Bearer ') && a.slice(7) !== ANON_KEY) h.set('Authorization', 'Bearer ' + verlopen(a.slice(7)));
        init = { ...init, headers: h };
      }
      const p = poorten.find(x => !x.gebruikt && !x.dicht && x.past(u, methode));
      if (!p) {
        if (net.uit) throw new TypeError('fetch failed (netwerk uit)');
        return fetch(url, init);
      }
      p.aantal++;
      if (!p.blijvend) p.gebruikt = true;   // blijvend: elke poging (ook automatische herhalingen) loopt erin
      const antwoord = p.eerstUitvoeren ? await fetch(url, init) : null;
      p.aangekomen();
      await p.vrij;
      if (p.antwoordWeg) throw new TypeError('fetch failed (antwoord verloren)');
      return antwoord ?? fetch(url, init);
    };
    class WsMetNet extends WebSocket {
      constructor(url, protocols) { super(net.uit ? 'ws://127.0.0.1:9/' : url, protocols); }
    }
    const c = createClient(API_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: doorgeven },
      realtime: { transport: WsMetNet },
    });
    function poort(past, opties = {}) {
      const p = { past, eerstUitvoeren: false, antwoordWeg: false, blijvend: false, gebruikt: false, dicht: false, aantal: 0, ...opties };
      let vrijgeven;
      p.vrij = new Promise(r => { vrijgeven = r; });
      p.binnen = new Promise(r => { p.aangekomen = r; });
      p.geefVrij = (meer = {}) => { Object.assign(p, meer); vrijgeven(); };
      poorten.push(p);
      return p;
    }
    return { c, net, poort };
  };

  o.maakPersoon = async (naam) => {
    const email = `${naam}-${run}@test.invalid`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: wachtwoord, email_confirm: true });
    assert.ifError(error);
    personen[naam] = { id: data.user.id, email };
    return personen[naam];
  };
  o.inloggen = async (s, naam) => {
    assert.ifError((await s.c.auth.signInWithPassword({ email: personen[naam].email, password: wachtwoord })).error);
  };
  // Een nieuwe sessie (zoals een nieuw tabblad of een herstart van de app).
  o.sessie = async (naam) => {
    const s = o.clientMetPoorten();
    await o.inloggen(s, naam);
    opruimen.push(s);
    return s;
  };
  // Een sync met een logboek van alle meldingen aan de app.
  o.maak = (s, h, extra = {}) => {
    const meldingen = [];
    const sync = maakSync({ supabase: s.c, huishoudenId: h, vangnetMs: 600000, opWijziging: t => meldingen.push(t), ...extra });
    sync.meldingen = meldingen;
    opruimen.push(sync);
    return sync;
  };
  o.heeftInhoud = t => t.boodschappen.length + t.taken.length + t.afspraken.length + t.leden.length > 0 || t.lid !== null;
  const ledenVan = h => JSON.parse(sql(`select coalesce(json_agg(json_build_object('id', id, 'naam', display_name)), '[]') from public.household_members where household_id = '${h}'`));
  o.lidId = (h, naam) => ledenVan(h).find(m => m.naam === naam).id;
  o.rpcAls = async (s, naam, args) => { const r = await s.c.rpc(naam, args); assert.ifError(r.error); return r.data; };
  o.huishouden = async (eigenaar, naam, leden = []) => {
    const h = await o.rpcAls(eigenaar, 'create_household', { p_name: `${naam} ${run}`, p_display_name: 'Anna' });
    for (const lid of leden) {
      const tok = await o.rpcAls(eigenaar, 'create_invite', { p_household: h, p_member: null, p_role: 'member' });
      const s = await o.sessie(lid);
      await o.rpcAls(s, 'accept_invite', { p_token: tok, p_display_name: lid[0].toUpperCase() + lid.slice(1) });
    }
    return h;
  };
  o.ruimOp = async () => {
    sql(`delete from public.households where name like '%${run}%'`);
    for (const p of Object.values(personen)) await admin.auth.admin.deleteUser(p.id);
    await Promise.race([Promise.allSettled(opruimen.filter(x => x.stop).map(x => x.stop())), wacht(5000)]);
    for (const s of opruimen.filter(x => x.c)) { s.net.uit = false; s.c.realtime.disconnect(); }
  };
  return o;
}
