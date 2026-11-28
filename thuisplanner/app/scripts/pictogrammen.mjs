// Maakt de app-pictogrammen (PWA, PR P0) uit de ene bron thuisplanner/ontwerp/pictogram.svg:
//   public/pictogrammen/icon-192.png, icon-512.png           (purpose "any": het pictogram met ronde hoeken)
//   public/pictogrammen/icon-maskable-192.png, -512.png       (purpose "maskable": vlak tot de rand)
//   public/pictogrammen/apple-touch-icon.png (180)            (iOS legt er zelf een masker over; geen doorzichtige hoeken)
// Het huis met het vinkje past al binnen de veilige zone van een maskable pictogram (een cirkel van 80 %), dus de
// vlakke variant is alleen het pictogram zonder ronde hoeken; er wordt niets geschaald of verschoven.
//
// Rendert met de Chromium van Playwright (al een devDependency), zonder netwerk:
//   node scripts/pictogrammen.mjs
// De PNG's staan in git; draai dit alleen opnieuw als ontwerp/pictogram.svg verandert (tests/pwa.test.ts controleert
// de maten).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bron = readFileSync(path.resolve(app, '../ontwerp/pictogram.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const uit = path.join(app, 'public', 'pictogrammen');
mkdirSync(uit, { recursive: true });

/** Het pictogram zonder ronde hoeken (voor maskable en iOS). */
const vlak = svg => {
  const r = svg.replace(/(<rect\b[^>]*?)\s+rx="[^"]*"/, '$1');
  if (r === svg) throw new Error('pictogram.svg: geen <rect rx="..."> gevonden voor de vlakke variant');
  return r;
};

const soorten = [
  { naam: 'icon-192.png', maat: 192, svg: bron },
  { naam: 'icon-512.png', maat: 512, svg: bron },
  { naam: 'icon-maskable-192.png', maat: 192, svg: vlak(bron) },
  { naam: 'icon-maskable-512.png', maat: 512, svg: vlak(bron) },
  { naam: 'apple-touch-icon.png', maat: 180, svg: vlak(bron) },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  // Geen verzoeken naar buiten: alleen de inhoud die we zelf zetten.
  await page.route('**/*', route => route.abort());
  for (const { naam, maat, svg } of soorten) {
    const data = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
    await page.setViewportSize({ width: maat, height: maat });
    await page.setContent(`<html><body style="margin:0;background:transparent"><img src="${data}" width="${maat}" height="${maat}" style="display:block"></body></html>`);
    await page.waitForFunction(() => document.images[0]?.complete);
    writeFileSync(path.join(uit, naam), await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: maat, height: maat } }));
    console.log(`Gemaakt: public/pictogrammen/${naam} (${maat}×${maat})`);
  }
} finally {
  await browser.close();
}
