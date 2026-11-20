import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { alsEva, SYNC, telefoon, venster } from './hulp';

// Review Vakanties V-01: overnemen van een AFGELOPEN vakantie die je niet eerst opende. In de lokale modus haalt de
// sync de paklijst van een afgelopen vakantie pas op bij openen; zonder dat gingen de extra lijsten ("Oma") stil niet
// mee. Fictief gezin (scripts/lokaal.mjs seed), alles via de API als Eva (RLS).

async function klaarzetten() {
  execFileSync('node', ['scripts/lokaal.mjs', 'seed'], { stdio: 'ignore' });
  const eva = await alsEva();
  const moet = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    if (r.data === null) throw new Error('geen gegevens');
    return r.data;
  };
  const gelukt = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };
  const hh = moet(await eva.from('household_members').select('household_id').limit(1))[0].household_id as string;
  const bron = randomUUID(), doel = randomUUID(), oma = randomUUID();
  gelukt(await eva.from('trips').insert([
    { id: bron, household_id: hh, name: 'Zomer 2026', start_date: '2026-07-01', end_date: '2026-07-14' },
    { id: doel, household_id: hh, name: 'Zomer 2099', start_date: '2099-07-01', end_date: '2099-07-14' },
  ]));
  gelukt(await eva.from('trip_packing_lists').insert({ id: oma, household_id: hh, trip_id: bron, name: 'Oma' }));
  gelukt(await eva.from('trip_packing_items').insert([
    { household_id: hh, trip_id: bron, name: 'Zonnebrand' }, { household_id: hh, trip_id: bron, name: 'Tent' },
    { household_id: hh, trip_id: bron, list_id: oma, name: 'Leesbril' }, { household_id: hh, trip_id: bron, list_id: oma, name: 'Pillendoos' },
  ]));
  const inDoel = async () => ({
    lijsten: moet(await eva.from('trip_packing_lists').select('name').eq('trip_id', doel).is('deleted_at', null)).map(l => l.name as string),
    items: moet(await eva.from('trip_packing_items').select('name').eq('trip_id', doel).is('deleted_at', null)).map(i => i.name as string).sort(),
  });
  return { inDoel };
}

async function openInpakken(p: Page, naam: string) {
  await p.goto('./#/vakanties');
  await p.getByRole('button', { name: new RegExp(`^${naam},`) }).click();
  await expect(p.getByRole('heading', { level: 1, name: naam })).toBeVisible(SYNC);
  await p.getByRole('tab', { name: 'Inpakken' }).click();
}

test('overnemen van een afgelopen, niet-geopende vakantie neemt de extra lijsten mee (V-01)', async ({ browser }) => {
  const { inDoel } = await klaarzetten();
  const { ctx, p } = await telefoon(browser, 'Eva');
  await openInpakken(p, 'Zomer 2099');
  await p.getByRole('button', { name: 'Overnemen van een eerdere vakantie' }).click();
  const v = venster(p);
  await v.getByRole('radio', { name: /Zomer 2026/ }).click();
  // De bron wordt geopend: "Ook meenemen" verschijnt met Oma, standaard aangevinkt.
  await expect(v.getByRole('checkbox', { name: /Oma/ })).toHaveAttribute('aria-checked', 'true', SYNC);
  await v.getByRole('button', { name: 'Overnemen', exact: true }).click();
  await expect(v).toHaveCount(0);
  await expect.poll(async () => (await inDoel()).items, SYNC).toEqual(['Leesbril', 'Pillendoos', 'Tent', 'Zonnebrand']);
  expect((await inDoel()).lijsten).toEqual(['Oma']);
  await ctx.close();
});

test('de suggestie bij een lege paklijst neemt ook de extra lijsten van de afgelopen vakantie mee (V-01)', async ({ browser }) => {
  const { inDoel } = await klaarzetten();
  const { ctx, p } = await telefoon(browser, 'Eva');
  await openInpakken(p, 'Zomer 2099');
  // De suggestie verschijnt pas als de paklijst van de bron bekend is (en niet leeg).
  await expect(p.getByText('Begin met de paklijst van Zomer 2026?')).toBeVisible(SYNC);
  await p.locator('.pak-voorstel').getByRole('button', { name: 'Overnemen' }).click();
  await expect.poll(async () => (await inDoel()).items, SYNC).toEqual(['Leesbril', 'Pillendoos', 'Tent', 'Zonnebrand']);
  expect((await inDoel()).lijsten).toEqual(['Oma']);
  await ctx.close();
});
