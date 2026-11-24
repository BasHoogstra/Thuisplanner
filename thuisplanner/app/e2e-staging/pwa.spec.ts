// PWA-basis (PR P0) in de stagingbuild, met de CSP uit dist-staging/_headers: de service worker registreert zich op het
// vaste pad met de hele app als scope, het manifest en de pictogrammen laden, en er komt niets in de browsercache
// (besluit 17). Een echte pushmelding kan hier niet: de testbrowser heeft geen pushdienst (dat is de proef op de
// telefoons, README "Pushproef").
import { expect, test } from '@playwright/test';
import { proef } from './hulp';

test('PWA: service worker op ./sw.js voor de hele app, manifest en pictogrammen, geen cache en geen CSP-overtreding', async ({ page }) => {
  const p = await proef(page, () => ({ status: 500, json: {} }));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Inloggen' })).toBeVisible();

  const sw = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return { scope: r.scope, script: r.active?.scriptURL };
  });
  expect(sw).toEqual({ scope: 'http://127.0.0.1:5182/', script: 'http://127.0.0.1:5182/sw.js' });

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
    const json = await (await fetch(link.href, { credentials: 'include' })).json();
    const pictogrammen = await Promise.all(
      [...json.icons.map((i: { src: string }) => new URL(i.src, link.href).href),
        document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')!.href]
        .map(async (u: string) => { const r = await fetch(u); return `${r.status} ${r.headers.get('content-type')}`; }),
    );
    return { crossOrigin: link.crossOrigin, start: json.start_url, display: json.display, pictogrammen };
  });
  expect(manifest).toMatchObject({ crossOrigin: 'use-credentials', start: './', display: 'standalone' });
  expect(manifest.pictogrammen).toHaveLength(5);
  for (const r of manifest.pictogrammen) expect(r).toBe('200 image/png');

  // Herladen gaat gewoon via het netwerk (geen fetch-handler), en er is geen enkele cache.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Inloggen' })).toBeVisible();
  expect(await page.evaluate(async () => (await caches.keys()).length)).toBe(0);
  expect(p.overtredingen).toEqual([]);
});

test('zonder de vlag VITE_PUSHPROEF is er geen pushproef: geen regel boven de app, en #/pushproef is gewoon de app', async ({ page }) => {
  await proef(page, () => ({ status: 500, json: {} }));
  await page.goto('./#/pushproef');
  await expect(page.getByRole('heading', { name: 'Inloggen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pushproef' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Pushproef' })).toHaveCount(0);
});
