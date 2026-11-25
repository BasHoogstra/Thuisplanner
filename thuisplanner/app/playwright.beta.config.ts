import { defineConfig } from '@playwright/test';
import { NEP_REF } from './scripts/staging-build';

// De bètabuild (`vite build --mode beta`) in de browser, op telefoonbreedte, met de CSP uit het gegenereerde
// _headers-bestand; zoals de staging-e2e (playwright.staging.config.ts), maar op een eigen poort en map. Er is geen
// online project nodig: de build gebruikt het verzonnen project NEP_REF en de test beantwoordt elk verzoek naar dat
// adres zelf (e2e-staging/hulp.ts). KG_E2E_NEPPROJECT=1 is de enige uitzondering op de kenmerkcontrole van
// omgevingen.json, en geldt alleen voor NEP_REF (scripts/staging-build.ts). De tegenproeven van de buildbewaking staan
// in e2e-beta/bewaking.spec.ts.
const jwt = (payload: object) => ['{"alg":"HS256","typ":"JWT"}', JSON.stringify(payload)]
  .map(d => Buffer.from(d).toString('base64url')).join('.') + '.handtekening-fictief';

export default defineConfig({
  testDir: './e2e-beta',
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5183/', locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', contextOptions: { reducedMotion: 'reduce' } },
  webServer: {
    command: 'npx vite build --mode beta --outDir dist-beta && npx vite preview --outDir dist-beta --port 5183',
    url: 'http://127.0.0.1:5183/',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: `https://${NEP_REF}.supabase.co`,
      VITE_SUPABASE_ANON_KEY: jwt({ iss: 'supabase', role: 'anon', ref: NEP_REF }),
      KG_E2E_NEPPROJECT: '1',
    },
  },
  projects: [
    { name: 'mobiel-390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
});
