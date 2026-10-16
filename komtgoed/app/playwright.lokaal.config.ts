import { defineConfig } from '@playwright/test';

// End-to-end-tests van de React-app tegen de LOKALE Supabase-stack (supabase start in komtgoed/), met twee
// fictieve accounts in twee aparte browsercontexten (= twee telefoons). Nooit tegen een online project.
//   npm run e2e:lokaal
// Het fictieve gezin wordt per testbestand opnieuw klaargezet (scripts/lokaal.mjs seed).
// Met KG_VIA_PROXY=1 praat de browser alleen met de app (5182) en stuurt Vite Auth, REST en Realtime door naar
// Supabase: dezelfde weg als de telefoons op het netwerk (npm run lokaal:lan).
const viaProxy = process.env.KG_VIA_PROXY === '1';

export default defineConfig({
  testDir: './e2e-lokaal',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5182/', locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', contextOptions: { reducedMotion: 'reduce' } },
  webServer: {
    command: `node scripts/lokaal.mjs env${viaProxy ? ' --proxy 5182' : ''} && npx vite build --mode lokaal --outDir dist-lokaal && npx vite preview --mode lokaal --outDir dist-lokaal --port 5182`,
    url: 'http://127.0.0.1:5182/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'mobiel-390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
});
