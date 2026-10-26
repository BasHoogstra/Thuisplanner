import { defineConfig } from '@playwright/test';

// De stagingbuild in de browser, op telefoonbreedte, met de CSP uit het gegenereerde _headers-bestand. Er is
// geen online project nodig: de build gebruikt een verzonnen projectadres en de test beantwoordt elk verzoek
// naar dat adres zelf (e2e-staging/hulp.ts). Zo wordt precies de build getest die Cloudflare zou bouwen.
export const NEP_REF = 'abcdefghijklmnopqrst';
const jwt = (payload: object) => ['{"alg":"HS256","typ":"JWT"}', JSON.stringify(payload)]
  .map(d => Buffer.from(d).toString('base64url')).join('.') + '.handtekening-fictief';

export default defineConfig({
  testDir: './e2e-staging',
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5182/', locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', contextOptions: { reducedMotion: 'reduce' } },
  webServer: {
    command: 'npx vite build --mode staging --outDir dist-staging && npx vite preview --outDir dist-staging --port 5182',
    url: 'http://127.0.0.1:5182/',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: `https://${NEP_REF}.supabase.co`,
      VITE_SUPABASE_ANON_KEY: jwt({ iss: 'supabase', role: 'anon', ref: NEP_REF }),
    },
  },
  projects: [
    { name: 'mobiel-390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
});
