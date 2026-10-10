import { defineConfig } from '@playwright/test';

// End-to-end-tests en screenshots tegen de gebouwde demo (vite preview), op 360, 390 en desktopbreedte.
// De klok staat vast via ?nu=..., zodat de tests en screenshots elke dag hetzelfde zijn.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5181/', locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', contextOptions: { reducedMotion: 'reduce' } },
  webServer: {
    command: 'npx vite build && npx vite preview',
    url: 'http://127.0.0.1:5181/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'mobiel-360', use: { viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'mobiel-390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
  ],
});
