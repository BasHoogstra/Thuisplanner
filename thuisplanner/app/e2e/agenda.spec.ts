import { expect, test, type Page } from '@playwright/test';

// Agenda, stap 1 (docs/thuisplanner-agenda.md): visuele rust. Geen woordbreuk (A12), de lidkleur in een streepje of
// rondje in plaats van een extra stip (A6), een rustige maand zonder legenda (A5) en informatieve tekst met genoeg
// contrast. Vaste demo-klok: zaterdag 10 oktober 2026, 11:20.
const START = './?nu=2026-10-10T11:20';
const isDesktop = (p: Page) => (p.viewportSize()?.width ?? 0) >= 960;
const weergave = (p: Page, naam: 'Dag' | 'Week' | 'Maand') => p.getByRole('tab', { name: naam, exact: true }).click();

/** Woorden die over twee regels zijn verdeeld (midden in het woord afgebroken), alleen in zichtbare tekst. */
async function gebrokenWoorden(p: Page): Promise<string[]> {
  return p.locator('.agenda').evaluate(root => {
    const uit: string[] = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode as Text;
      if (!n.parentElement || !n.parentElement.offsetParent) continue;
      for (const m of n.data.matchAll(/\S+/g)) {
        const r = document.createRange();
        r.setStart(n, m.index!); r.setEnd(n, m.index! + m[0].length);
        const vakken = [...r.getClientRects()].filter(x => x.width > 0);
        if (vakken.length > 1 && Math.abs(vakken[0].top - vakken[vakken.length - 1].top) > 4) uit.push(m[0]);
      }
    }
    return uit;
  });
}

async function geenHorizontaleScroll(p: Page) {
  const { breed, scherm } = await p.evaluate(() => ({ breed: document.documentElement.scrollWidth, scherm: window.innerWidth }));
  expect(breed, 'pagina is breder dan het scherm').toBeLessThanOrEqual(scherm);
}

/** Het laagste contrast (WCAG) van de zichtbare elementen die bij de selector horen, tegen hun werkelijke achtergrond. */
async function laagsteContrast(p: Page, selector: string): Promise<{ waarde: number; tekst: string } | null> {
  return p.evaluate(sel => {
    const kanaal = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lees = (k: string): [number, number, number, number] => {
      const getallen = (k.match(/[\d.]+/g) ?? []).map(Number);
      if (k.startsWith('color(')) { const [r, g, b, a = 1] = getallen; return [r * 255, g * 255, b * 255, a]; }
      const [r, g, b, a = 1] = getallen; return [r, g, b, a];
    };
    const meng = (boven: number[], onder: number[]) => boven.slice(0, 3).map((c, i) => c * boven[3] + onder[i] * (1 - boven[3]));
    const achtergrond = (el: Element | null): number[] => {
      const lagen: number[][] = [];
      for (let e = el; e; e = e.parentElement) {
        const k = lees(getComputedStyle(e).backgroundColor);
        if (k[3] > 0) { lagen.push(k); if (k[3] >= 1) break; }
      }
      let kleur = lees(getComputedStyle(document.body).backgroundColor).slice(0, 3);
      for (const laag of lagen.reverse()) kleur = meng(laag, kleur);
      return kleur;
    };
    const licht = (k: number[]) => 0.2126 * kanaal(k[0]) + 0.7152 * kanaal(k[1]) + 0.0722 * kanaal(k[2]);
    let laagste: { waarde: number; tekst: string } | null = null;
    for (const el of document.querySelectorAll(sel)) {
      if (!(el as HTMLElement).offsetParent || !el.textContent?.trim()) continue;
      const stijl = getComputedStyle(el);
      const ondergrond = achtergrond(el.parentElement);
      // Doorzichtigheid van het element en zijn voorouders maakt de tekst lichter: die telt mee.
      let doorzicht = 1;
      for (let e: Element | null = el; e; e = e.parentElement) doorzicht *= Number(getComputedStyle(e).opacity);
      const tekstKleur = lees(stijl.color);
      const voor = meng([...tekstKleur.slice(0, 3), tekstKleur[3] * doorzicht], ondergrond);
      const [a, b] = [licht(voor), licht(ondergrond)].sort((x, y) => y - x);
      const waarde = (a + 0.05) / (b + 0.05);
      if (!laagste || waarde < laagste.waarde) laagste = { waarde, tekst: el.textContent.trim() };
    }
    return laagste;
  }, selector);
}

test.beforeEach(async ({ page }) => {
  page.on('request', r => {
    const u = new URL(r.url());
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !['data:', 'file:'].includes(u.protocol)) throw new Error('Externe aanvraag: ' + r.url());
  });
  await page.goto(START);
  await page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Agenda' }).click();
});

test('geen woord breekt midden in het woord af, in Week, Dag en Maand (A12)', async ({ page }) => {
  for (const w of ['Week', 'Dag', 'Maand'] as const) {
    await weergave(page, w);
    await expect(page.getByRole('tab', { name: w, exact: true })).toHaveAttribute('aria-selected', 'true');
    expect(await gebrokenWoorden(page), `afgebroken woorden in ${w}`).toEqual([]);
    await geenHorizontaleScroll(page);
  }
  // Ook de volgende week, met andere (langere) titels.
  await weergave(page, 'Week');
  await page.getByRole('button', { name: 'Volgende week' }).click();
  expect(await gebrokenWoorden(page), 'afgebroken woorden in week 42').toEqual([]);
});

test('lidkleur: een afspraak heeft een streepje, een taak een rondje, en er staat geen extra stip (A6)', async ({ page }) => {
  await weergave(page, 'Week');
  const zwemles = page.locator('li.week-rij.afspraak').filter({ has: page.getByRole('button', { name: /^Zwemles, 09:15/ }) });
  await expect(zwemles).toHaveAttribute('style', /--kleur:\s*var\(--lid-4\)/);
  await expect(zwemles).toContainText('Daan');
  const randKleur = await zwemles.evaluate(li => {
    const el = getComputedStyle(li.querySelector('.week-inhoud')!).display === 'contents' ? li.querySelector('.week-rij-knop')! : li.querySelector('.week-inhoud')!;
    return getComputedStyle(el).borderLeftWidth;
  });
  expect(randKleur).toBe('3px');
  const plantenbak = page.getByRole('checkbox', { name: 'Plantenbak water geven' });
  await expect(plantenbak.locator('.vinkje')).toHaveAttribute('style', /--ring:\s*var\(--lid-3\)/);
  await expect(page.locator('.week .week-wie .stip')).toHaveCount(0);
  // Een afspraak voor het hele huishouden heeft geen streepje en geen naam.
  await page.getByRole('button', { name: 'Volgende week' }).click();
  await expect(page.locator('li.week-rij.afspraak:not([style])').first()).toBeVisible();
});

test('maand: geen legenda; mobiel één drukte-streepje, desktop titels met "nog" en "taken" (A5)', async ({ page }) => {
  await weergave(page, 'Maand');
  const dag = page.getByRole('cell').filter({ has: page.getByRole('button', { name: /^zaterdag 10 oktober \(vandaag\): 4 afspraken, 2 taken$/ }) });
  await expect(page.locator('.maand-legenda')).toHaveCount(0);
  await expect(page.locator('.maand-stip')).toHaveCount(0);
  if (isDesktop(page)) {
    await expect(dag.locator('.maand-titels')).toContainText('nog 2');
    await expect(dag.locator('.maand-titels')).toContainText('2 taken');
    await expect(dag.locator('.maand-drukte')).toBeHidden();
  } else {
    await expect(dag.locator('.maand-drukte.n3')).toBeVisible();
    await expect(dag.locator('.maand-titels')).toBeHidden();
  }
  await geenHorizontaleScroll(page);
});

test('informatieve tekst in de Agenda heeft minstens 4,5:1 contrast, ook voorbije afspraken en lege dagen', async ({ page }) => {
  await weergave(page, 'Week');
  for (const sel of ['.week-tijd', '.week-sub', '.week-leeg', '.week-dag-naam', '.week-dag-nr', '.week-rij-titel']) {
    const c = await laagsteContrast(page, sel);
    if (c) expect(c.waarde, `${sel} ("${c.tekst}")`).toBeGreaterThanOrEqual(4.5);
  }
  await weergave(page, 'Maand');
  for (const sel of ['.maand-koppen span', '.maand-dag:not(.buiten) .maand-nr', '.maand-titels span']) {
    const c = await laagsteContrast(page, sel);
    if (c) expect(c.waarde, `${sel} ("${c.tekst}")`).toBeGreaterThanOrEqual(4.5);
  }
});
