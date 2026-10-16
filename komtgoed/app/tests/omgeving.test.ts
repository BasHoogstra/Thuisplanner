// Staging (docs/thuisplanner-staging.md): de app en de build gebruiken uitsluitend het bedoelde Supabase-project,
// zonder demo-gegevens of geheimen; de sessie blijft op een telefoon bewaard; elke build krijgt beveiligingsheaders.
// De Huisplan-projectkenmerken staan nergens in komtgoed/ (statisch.js); de test leest ze uit de Huisplan-README.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stagingFouten, stagingRef } from '../src/lib/omgeving';
import { appConfig, authOpties } from '../src/lib/lokaal/sessie';
import { controleerOmgeving, headersBestand, isGeheimeSleutel, isHuisplanRef, stagingBuildFouten, verbodenInhoud } from '../scripts/staging-build';

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

describe('staging: alleen precies het bedoelde project', () => {
  it('alleen https://<20 letters>.supabase.co, zonder poort, pad, gebruiker, query of andere schrijfwijze', () => {
    expect(stagingRef(URL_OK)).toBe(REF);
    expect(stagingRef(URL_OK + '/')).toBe(REF);
    for (const u of [`http://${REF}.supabase.co`, `https://${REF}.supabase.co:8443`, `https://${REF}.supabase.co/rest`,
      `https://${REF}.supabase.co.evil.nl`, `https://x.${REF}.supabase.co`, `https://${REF}.supabase.com`, `https://a@${REF}.supabase.co`,
      `https://${REF}.supabase.co?x=1`, 'https://abc.supabase.co', `https://${REF.toUpperCase()}.supabase.co`, 'http://127.0.0.1:55321', '', undefined]) {
      expect(stagingRef(u)).toBeNull();
    }
  });

  it('de build weigert de Huisplan-projecten (zonder dat hun kenmerk in komtgoed/ staat)', () => {
    expect(huisplanRefs).toHaveLength(2);
    for (const r of huisplanRefs) {
      expect(isHuisplanRef(r)).toBe(true);
      expect(stagingBuildFouten({ ...STAGING, VITE_SUPABASE_URL: `https://${r}.supabase.co` }).join()).toMatch(/Huisplan-project/);
      expect(verbodenInhoud(`const x = "${r}";`, REF).join()).toMatch(/Huisplan-project/);
    }
    expect(isHuisplanRef(REF)).toBe(false);
  });

  it('geen demo-gegevens en geen geheime sleutels in een stagingconfiguratie', () => {
    expect(stagingBuildFouten(STAGING)).toEqual([]);
    expect(stagingFouten({ ...STAGING, VITE_DEMO_WACHTWOORD: 'x' }).join()).toMatch(/VITE_DEMO_WACHTWOORD/);
    expect(stagingFouten({ ...STAGING, VITE_DEMO_ACCOUNTS: '[]' }).join()).toMatch(/VITE_DEMO_ACCOUNTS/);
    expect(stagingBuildFouten({ ...STAGING, VITE_SUPABASE_ANON_KEY: SERVICE }).join()).toMatch(/geheime sleutel/);
    expect(stagingBuildFouten({ ...STAGING, VITE_SUPABASE_ANON_KEY: SECRET_VORM }).join()).toMatch(/geheime sleutel/);
    expect(stagingBuildFouten({ ...STAGING, VITE_SUPABASE_SERVICE_ROLE_KEY: 'x' }).join()).toMatch(/geheime sleutel/);
    expect(stagingFouten({ VITE_OMGEVING: 'staging', VITE_SUPABASE_URL: URL_OK }).join()).toMatch(/ANON_KEY ontbreekt/);
    expect(isGeheimeSleutel(ANON)).toBe(false);
    expect(isGeheimeSleutel(PUBLISHABLE_VORM)).toBe(false);
  });

  it('de app start alleen met een geldige stagingconfiguratie, en nooit stil als demo', () => {
    expect(appConfig(STAGING)).toMatchObject({ omgeving: 'staging', url: URL_OK, accounts: [] });
    expect(appConfig(STAGING)?.wachtwoord).toBeUndefined();
    expect(() => appConfig({ ...STAGING, VITE_SUPABASE_URL: 'http://127.0.0.1:55321' })).toThrow(/Weigering \(testomgeving\)/);
    expect(() => appConfig({ ...STAGING, VITE_DEMO_WACHTWOORD: 'x' })).toThrow(/Weigering \(testomgeving\)/);
    expect(() => appConfig({ VITE_OMGEVING: 'productie', VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: ANON })).toThrow(/onbekende omgeving/);
    // Zonder de stagingmarkering blijft een online adres geweigerd (zoals voorheen).
    expect(() => appConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: ANON })).toThrow(/lokale Supabase/);
    expect(appConfig({})).toBeNull();
  });

  it('een gewone build kan geen stagingbuild worden; staging alleen met --mode staging', () => {
    expect(() => controleerOmgeving('production', { VITE_OMGEVING: 'staging' })).toThrow(/build:staging/);
    expect(() => controleerOmgeving('staging', {})).toThrow(/Stagingbuild geweigerd/);
    expect(controleerOmgeving('staging', { VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: ANON })).toEqual({ staging: true, ref: REF });
    expect(controleerOmgeving('production', {})).toEqual({ staging: false, ref: null });
  });

  it('de gebouwde bestanden: geen geheimen en geen ander project', () => {
    expect(verbodenInhoud(`fetch("${URL_OK}/rest/v1")`, REF)).toEqual([]);
    expect(verbodenInhoud(`fetch("https://zyxwvutsrqponmlkjihg.supabase.co")`, REF).join()).toMatch(/ander Supabase-project/);
    expect(verbodenInhoud(`const k = "${SERVICE}"`, REF).join()).toMatch(/geheime JWT/);
    expect(verbodenInhoud(`const k = "${ANON}"`, REF)).toEqual([]);
    expect(verbodenInhoud(`const k = "${SECRET_VORM}"`, REF).join()).toMatch(/secret key/);
  });
});

describe('beveiligingsheaders (_headers voor Cloudflare Pages)', () => {
  it('staging: connect-src alleen het eigen adres en precies het stagingproject; verder streng', () => {
    const h = headersBestand(REF);
    const csp = /Content-Security-Policy: (.*)/.exec(h)![1];
    expect(csp).toContain(`connect-src 'self' https://${REF}.supabase.co wss://${REF}.supabase.co;`);
    for (const regel of [`default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `img-src 'self' data:`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`]) {
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
