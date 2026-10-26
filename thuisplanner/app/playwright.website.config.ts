import { defineConfig } from '@playwright/test';

// De publieke website (thuisplanner/website) in een echte browser, op een telefoon (390 px). De website heeft zelf geen
// afhankelijkheden; deze tests lenen Playwright van de app. De server (website/voorbeeld.mjs) gedraagt zich als
// Cloudflare Pages: nette adressen, 404.html en de headers uit _headers.
//   npm run e2e:website
export default defineConfig({
  testDir: './e2e-website',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5185/', locale: 'nl-NL', contextOptions: { reducedMotion: 'reduce' } },
  webServer: {
    command: 'node ../website/bouw.mjs && node ../website/voorbeeld.mjs 5185',
    url: 'http://127.0.0.1:5185/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'mobiel-390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'breed-1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
});
