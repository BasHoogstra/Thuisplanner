// Staging, bèta en productie (docs/thuisplanner-staging.md, docs/thuisplanner-beta-voorbereiding.md §2.2): de app en de build gebruiken uitsluitend het bedoelde Supabase-project,
// zonder demo-gegevens of geheimen; de sessie blijft op een telefoon bewaard; elke build krijgt beveiligingsheaders.
// De Huisplan-projectkenmerken staan nergens in thuisplanner/ (statisch.js); de test leest ze uit de Huisplan-README.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { onlineFouten, projectRef } from '../src/lib/omgeving';
import { appConfig, authOpties } from '../src/lib/lokaal/sessie';
import { controleerOmgeving, headersBestand, isGeheimeSleutel, isHuisplanRef, NEP_REF, onlineBuildFouten, verbodenInhoud } from '../scripts/staging-build';

const REF = 'abcdefghijklmnopqrst';
const URL_OK = `https://${REF}.supabase.co`;
const jwt = (payload: object) => ['{"alg":"HS256","typ":"JWT"}', JSON.stringify(payload)]
  .map(d => Buffer.from(d).toString('base64url')).join('.') + '.handtekening-fictief';
const ANON = jwt({ iss: 'supabase', role: 'anon', ref: REF });
const SERVICE = jwt({ iss: 'supabase', role: 'service_role' });
// Sleutelvormen in delen, zodat de geheimencontrole (supabase/tests/statisch.js) ze niet als echte sleutel ziet.
const SECRET_VORM = ['sb', 'secret', 'abcdefghijkl'].join('_');
const PUBLISHABLE_VORM = ['sb', 'publishable', 'abcdefghijkl'].join('_');
const huisplanRefs = [...readFileSync(path.resolve(__dirname, '../../../supabase/README.md'), 'utf8')
  .matchAll(/`([a-z]{20})`/g)].map(m => m[1]).filter((r, i, a) => a.indexOf(r) === i);
const STAGING = { VITE_OMGEVING: 'staging', VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: ANON };
const OMGEVINGEN = JSON.parse(readFileSync(path.resolve(__dirname, '../../omgevingen.json'), 'utf8'));
const VAST = { staging: OMGEVINGEN.staging.supabaseRef as string };

describe('staging: alleen precies het bedoelde project', () => {
  it('alleen https://<20 letters>.supabase.co, zonder poort, pad, gebruiker, query of andere schrijfwijze', () => {
    expect(projectRef(URL_OK)).toBe(REF);
    expect(projectRef(URL_OK + '/')).toBe(REF);
    for (const u of [`http://${REF}.supabase.co`, `https://${REF}.supabase.co:8443`, `https://${REF}.supabase.co/rest`,
      `https://${REF}.supabase.co.evil.nl`, `https://x.${REF}.supabase.co`, `https://${REF}.supabase.com`, `https://a@${REF}.supabase.co`,
      `https://${REF}.supabase.co?x=1`, 'https://abc.supabase.co', `https://${REF.toUpperCase()}.supabase.co`, 'http://127.0.0.1:55321', '', undefined]) {
      expect(projectRef(u)).toBeNull();
    }
  });

  it('de build weigert de Huisplan-projecten (zonder dat hun kenmerk in thuisplanner/ staat)', () => {
    expect(huisplanRefs).toHaveLength(2);
    for (const r of huisplanRefs) {
      expect(isHuisplanRef(r)).toBe(true);
      expect(onlineBuildFouten({ ...STAGING, VITE_SUPABASE_URL: `https://${r}.supabase.co` }, 'staging').join()).toMatch(/Huisplan-project/);
      expect(verbodenInhoud(`const x = "${r}";`, REF).join()).toMatch(/Huisplan-project/);
    }
    expect(isHuisplanRef(REF)).toBe(false);
  });

  it('geen demo-gegevens en geen geheime sleutels in een stagingconfiguratie', () => {
    expect(onlineBuildFouten(STAGING, 'staging')).toEqual([]);
    expect(onlineFouten({ ...STAGING, VITE_DEMO_WACHTWOORD: 'x' }, 'staging').join()).toMatch(/VITE_DEMO_WACHTWOORD/);
    expect(onlineFouten({ ...STAGING, VITE_DEMO_ACCOUNTS: '[]' }, 'staging').join()).toMatch(/VITE_DEMO_ACCOUNTS/);
    expect(onlineBuildFouten({ ...STAGING, VITE_SUPABASE_ANON_KEY: SERVICE }, 'staging').join()).toMatch(/geheime sleutel/);
    expect(onlineBuildFouten({ ...STAGING, VITE_SUPABASE_ANON_KEY: SECRET_VORM }, 'staging').join()).toMatch(/geheime sleutel/);
    expect(onlineBuildFouten({ ...STAGING, VITE_SUPABASE_SERVICE_ROLE_KEY: 'x' }, 'staging').join()).toMatch(/geheime sleutel/);
    expect(onlineFouten({ VITE_OMGEVING: 'staging', VITE_SUPABASE_URL: URL_OK }, 'staging').join()).toMatch(/ANON_KEY ontbreekt/);
    expect(isGeheimeSleutel(ANON)).toBe(false);
    expect(isGeheimeSleutel(PUBLISHABLE_VORM)).toBe(false);
  });

  it('de app start alleen met een geldige stagingconfiguratie, en nooit stil als demo', () => {
    expect(appConfig(STAGING)).toMatchObject({ omgeving: 'staging', url: URL_OK, accounts: [] });
    expect(appConfig(STAGING)?.wachtwoord).toBeUndefined();
    expect(() => appConfig({ ...STAGING, VITE_SUPABASE_URL: 'http://127.0.0.1:55321' })).toThrow(/Weigering \(testomgeving\)/);
    expect(() => appConfig({ ...STAGING, VITE_DEMO_WACHTWOORD: 'x' })).toThrow(/Weigering \(testomgeving\)/);
    expect(() => appConfig({ VITE_OMGEVING: 'acceptatie', VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: ANON })).toThrow(/onbekende omgeving/);
    // Zonder de stagingmarkering blijft een online adres geweigerd (zoals voorheen).
    expect(() => appConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: ANON })).toThrow(/lokale Supabase/);
    expect(appConfig({})).toBeNull();
  });

  it('een gewone build kan geen stagingbuild worden; staging alleen met --mode staging', () => {
    expect(() => controleerOmgeving('production', { VITE_OMGEVING: 'staging' })).toThrow(/build:staging/);
    expect(() => controleerOmgeving('staging', {})).toThrow(/Stagingbuild geweigerd/);
    // L8: ook een losse `vite build --mode staging` bouwt alleen tegen het vastgelegde stagingproject.
    expect(controleerOmgeving('staging', { VITE_SUPABASE_URL: `https://${VAST.staging}.supabase.co`, VITE_SUPABASE_ANON_KEY: ANON }))
      .toEqual({ omgeving: 'staging', ref: VAST.staging });
    expect(() => controleerOmgeving('staging', { VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: ANON })).toThrow(/Stagingbuild geweigerd[\s\S]*vastgelegde project van staging/);
    // De offline e2e: alleen met de uitzondering, en dan alleen het verzonnen project.
    expect(controleerOmgeving('staging', { VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: ANON }, { nepproject: true })).toEqual({ omgeving: 'staging', ref: REF });
    expect(controleerOmgeving('production', {})).toEqual({ omgeving: null, ref: null });
  });

  it('de gebouwde bestanden: geen geheimen en geen ander project', () => {
    expect(verbodenInhoud(`fetch("${URL_OK}/rest/v1")`, REF)).toEqual([]);
    expect(verbodenInhoud(`fetch("https://zyxwvutsrqponmlkjihg.supabase.co")`, REF).join()).toMatch(/ander Supabase-project/);
    expect(verbodenInhoud(`const k = "${SERVICE}"`, REF).join()).toMatch(/geheime JWT/);
    expect(verbodenInhoud(`const k = "${ANON}"`, REF)).toEqual([]);
    expect(verbodenInhoud(`const k = "${SECRET_VORM}"`, REF).join()).toMatch(/secret key/);
  });
});

describe('bèta en productie (N4, N5, T20): alleen precies het vastgelegde project, nooit als demo', () => {
  // Een variant van omgevingen.json waarin de bèta al een project heeft (zoals na stap C3), met verzonnen kenmerken.
  const BETA_REF = 'bbbbbbbbbbbbbbbbbbbb', PROD_REF = 'pppppppppppppppppppp';
  const MET_BETA = { ...OMGEVINGEN, beta: { ...OMGEVINGEN.beta, supabaseRef: BETA_REF } };
  const MET_ALLES = { ...MET_BETA, productie: { ...OMGEVINGEN.productie, supabaseRef: PROD_REF } };
  const env = (ref: string, extra: Record<string, string> = {}) => ({ VITE_SUPABASE_URL: `https://${ref}.supabase.co`, VITE_SUPABASE_ANON_KEY: ANON, ...extra });

  it('bouwt alleen tegen het vastgelegde bètaproject, met de omgeving vast in de bundel', () => {
    expect(controleerOmgeving('beta', env(BETA_REF), { omgevingen: MET_BETA })).toEqual({ omgeving: 'beta', ref: BETA_REF });
    expect(controleerOmgeving('productie', env(PROD_REF), { omgevingen: MET_ALLES })).toEqual({ omgeving: 'productie', ref: PROD_REF });
  });

  it('zolang beta.supabaseRef (of productie.supabaseRef) null is, faalt de build met een duidelijke melding', () => {
    expect(OMGEVINGEN.beta.supabaseRef).toBeNull();
    expect(() => controleerOmgeving('beta', env(BETA_REF))).toThrow(/Bètabuild geweigerd[\s\S]*nog geen projectkenmerk[\s\S]*beta\.supabaseRef/);
    expect(() => controleerOmgeving('productie', env(PROD_REF), { omgevingen: MET_BETA })).toThrow(/Productiebuild geweigerd[\s\S]*productie\.supabaseRef/);
  });

  it('T20: een bètabuild tegen het stagingproject wordt geweigerd, en andersom', () => {
    expect(() => controleerOmgeving('beta', env(VAST.staging), { omgevingen: MET_BETA })).toThrow(/Bètabuild geweigerd[\s\S]*hoort bij de omgeving staging/);
    expect(() => controleerOmgeving('staging', env(BETA_REF), { omgevingen: MET_BETA })).toThrow(/Stagingbuild geweigerd[\s\S]*hoort bij de omgeving beta/);
    expect(() => controleerOmgeving('productie', env(BETA_REF), { omgevingen: MET_ALLES })).toThrow(/hoort bij de omgeving beta/);
    expect(() => controleerOmgeving('beta', env('zyxwvutsrqponmlkjihg'), { omgevingen: MET_BETA })).toThrow(/vastgelegde project van de bèta/);
  });

  it('weigert elk Huisplan-project, ook als dat (per vergissing) in omgevingen.json zou staan', () => {
    for (const r of huisplanRefs) {
      const fout = { ...OMGEVINGEN, beta: { ...OMGEVINGEN.beta, supabaseRef: r } };
      expect(() => controleerOmgeving('beta', env(r), { omgevingen: fout })).toThrow(/Bètabuild geweigerd[\s\S]*Huisplan-project/);
    }
  });

  it('dezelfde weigeringen van geheimen als staging: demovariabelen, service-rol, sb_secret_', () => {
    for (const [extra, fout] of [[{ VITE_DEMO_WACHTWOORD: 'x' }, /VITE_DEMO_WACHTWOORD hoort niet in een (bèta|productie)build/], [{ VITE_DEMO_ACCOUNTS: '[]' }, /VITE_DEMO_ACCOUNTS/],
      [{ VITE_SUPABASE_ANON_KEY: SERVICE }, /geheime sleutel/], [{ VITE_SUPABASE_ANON_KEY: SECRET_VORM }, /geheime sleutel/],
      [{ VITE_SUPABASE_SERVICE_ROLE_KEY: 'x' }, /geheime sleutel/]] as const) {
      expect(() => controleerOmgeving('beta', env(BETA_REF, extra), { omgevingen: MET_BETA })).toThrow(fout);
      expect(() => controleerOmgeving('productie', env(PROD_REF, extra), { omgevingen: MET_ALLES })).toThrow(fout);
    }
    expect(() => controleerOmgeving('beta', { VITE_SUPABASE_URL: `https://${BETA_REF}.supabase.co` }, { omgevingen: MET_BETA })).toThrow(/ANON_KEY ontbreekt/);
  });

  it('een gewone build of een andere modus kan geen bètabuild worden', () => {
    expect(() => controleerOmgeving('production', { VITE_OMGEVING: 'beta' })).toThrow(/npm run build:beta/);
    expect(() => controleerOmgeving('production', { VITE_OMGEVING: 'productie' })).toThrow(/npm run build:productie/);
    expect(() => controleerOmgeving('development', { VITE_OMGEVING: 'beta' })).toThrow(/npm run build:beta/);
    expect(() => controleerOmgeving('production', { VITE_OMGEVING: 'acceptatie' })).toThrow(/geen omgeving van Thuisplanner/);
    expect(() => controleerOmgeving('beta', env(BETA_REF, { VITE_OMGEVING: 'staging' }), { omgevingen: MET_BETA })).toThrow(/past niet bij --mode beta/);
    expect(controleerOmgeving('production', { VITE_OMGEVING: 'lokaal' })).toEqual({ omgeving: null, ref: null });
  });

  it('de uitzondering voor de offline e2e geldt alleen voor het verzonnen project', () => {
    expect(NEP_REF).toBe(REF);
    expect(controleerOmgeving('beta', env(NEP_REF), { nepproject: true })).toEqual({ omgeving: 'beta', ref: NEP_REF });
    // Tegenproef: zonder de uitzondering weigert de build het verzonnen project; met de uitzondering elk ander project.
    expect(() => controleerOmgeving('beta', env(NEP_REF))).toThrow(/Bètabuild geweigerd/);
    expect(() => controleerOmgeving('beta', env(VAST.staging), { nepproject: true })).toThrow(/alleen voor de offline e2e/);
    expect(() => controleerOmgeving('beta', env(BETA_REF), { nepproject: true, omgevingen: MET_BETA })).toThrow(/alleen voor de offline e2e/);
    // Het verzonnen project hoort bij geen enkele omgeving en is geen Huisplan-project.
    expect(Object.values(OMGEVINGEN).map(o => (o as { supabaseRef?: string })?.supabaseRef)).not.toContain(NEP_REF);
    expect(isHuisplanRef(NEP_REF)).toBe(false);
  });

  it('N4: de app start online alleen met een geldige configuratie, en een bèta- of productiebuild nooit als demo', () => {
    expect(appConfig({ VITE_OMGEVING: 'beta', ...env(BETA_REF) })).toMatchObject({ omgeving: 'beta', accounts: [] });
    expect(appConfig({ VITE_OMGEVING: 'productie', ...env(PROD_REF) })).toMatchObject({ omgeving: 'productie', accounts: [] });
    for (const o of ['beta', 'productie']) {
      expect(() => appConfig({ VITE_OMGEVING: o })).toThrow(/Weigering \((bèta|productie)\)/);
      expect(() => appConfig({ VITE_OMGEVING: o, VITE_SUPABASE_URL: 'http://127.0.0.1:55321', VITE_SUPABASE_ANON_KEY: ANON })).toThrow(/Weigering/);
      expect(() => appConfig({ VITE_OMGEVING: o, ...env(BETA_REF), VITE_DEMO_WACHTWOORD: 'x' })).toThrow(/Weigering/);
    }
    // Ingelogd blijven op de eigen telefoon, zoals staging; nooit een sessie uit de URL.
    for (const o of ['beta', 'productie'] as const) {
      expect(authOpties({ omgeving: o })).toMatchObject({ storage: window.localStorage, detectSessionInUrl: false });
    }
  });
});

describe('beveiligingsheaders (_headers voor Cloudflare Pages)', () => {
  it('staging: connect-src alleen het eigen adres en precies het stagingproject; verder streng', () => {
    const h = headersBestand(REF);
    const csp = /Content-Security-Policy: (.*)/.exec(h)![1];
    expect(csp).toContain(`connect-src 'self' https://${REF}.supabase.co wss://${REF}.supabase.co;`);
    for (const regel of [`default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `img-src 'self' data: blob:`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`]) {
      expect(csp).toContain(regel);
    }
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(h).toMatch(/X-Robots-Tag: noindex/);
    expect(h).toMatch(/Referrer-Policy: no-referrer/);
    expect(h).toMatch(/\/index\.html\n {2}Cache-Control: no-cache/);
    expect(h).toMatch(/\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
  });

  it('demo: geen enkele verbinding buiten de eigen site', () => {
    expect(/connect-src ([^;]*)/.exec(headersBestand(null))![1]).toBe(`'self'`);
  });
});

describe('sessie op een telefoon', () => {
  it('staging: ingelogd blijven na sluiten (localStorage); lokaal: per tabblad; nooit een sessie uit de URL', () => {
    const s = authOpties({ omgeving: 'staging' });
    expect(s.storage).toBe(window.localStorage);
    expect(s).toMatchObject({ persistSession: true, autoRefreshToken: true, detectSessionInUrl: false });
    const l = authOpties({ omgeving: 'lokaal' });
    expect(l.storage).toBe(window.sessionStorage);
    expect(l.detectSessionInUrl).toBe(false);
  });
});
