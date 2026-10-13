import { defineConfig } from '@playwright/test';

// LAN-proef: de browser draait op een ANDERE netwerkhost (een container met een eigen netwerkstack) en opent
// de app en Supabase via het netwerkadres van de ontwikkelmachine, zoals een telefoon op hetzelfde wifi.
// Daar is de pagina geen "secure context" (http://<ip>, niet localhost). Starten: scripts/lan-proef.sh.
// Geen webServer hier: de app draait op de ontwikkelmachine via `node scripts/lokaal.mjs dev --host <ip>`.
export default defineConfig({
  testDir: './e2e-lan',
  outputDir: process.env.LAN_UITVOER || 'test-results-lan',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: [['list']],
  use: { baseURL: process.env.LAN_URL, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', contextOptions: { reducedMotion: 'reduce' } },
  projects: [
    { name: 'telefoon-390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
});
