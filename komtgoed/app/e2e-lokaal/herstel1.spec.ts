import { execFileSync } from 'node:child_process';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { alsEva, nav, SYNC, telefoon, venster } from './hulp';

// Herstelronde 1 (review PR #23), in de echte app tegen de lokale stack met twee accounts:
//   bevinding 1: alleen de titel aanpassen laat notities, einddatum en de rest van een afspraak staan;
//   bevinding 4: een onbevestigde privé-afspraak zonder bewaarde inhoud is opnieuw in te voeren onder
//                dezelfde opdracht-ID, zonder dubbele afspraak.

let eva: Page, thomas: Page;
const contexten: BrowserContext[] = [];

test.beforeEach(async ({ browser }) => {
  execFileSync('node', ['scripts/lokaal.mjs', 'seed'], { stdio: 'ignore' });
  const e = await telefoon(browser, 'Eva');
  const t = await telefoon(browser, 'Thomas');
  contexten.push(e.ctx, t.ctx);
  eva = e.p; thomas = t.p;
});
test.afterEach(async () => { for (const c of contexten.splice(0)) await c.close(); });

const KOLOMMEN = 'id,start_date,start_time,end_date,end_time,visibility,title,location,notes,preparation,participant_ids,recurrence_freq,recurrence_until,series_id,original_date,version';

async function afspraak(titel: string) {
  const c = await alsEva();
  const r = await c.from('event_overview').select(KOLOMMEN).eq('title', titel).is('deleted_at', null);
  if (r.error) throw r.error;
  return r.data as Record<string, unknown>[];
}

async function openInAgenda(p: Page, naam: RegExp) {
  await nav(p, 'Agenda');
  const rij = p.getByRole('button', { name: naam });
  for (let i = 0; i < 2 && !(await rij.count()); i++) await p.getByRole('button', { name: 'Volgende week' }).click();
  await rij.first().click();
}

test('bevinding 1: alleen de titel van een meerdaagse afspraak met notities aanpassen behoudt alle andere velden op de server', async () => {
  const [voor] = await afspraak('Kamp Daan');
  expect(voor).toMatchObject({ notes: 'Slaapzak en zaklamp mee. Ophalen bij de achteringang.', start_time: '18:00:00', end_time: '11:00:00' });
  expect(voor.end_date).not.toBe(voor.start_date);

  await openInAgenda(eva, /^Kamp Daan, 18:00/);
  await venster(eva).locator('#item-titel').fill('Kamp Daan (welpen)');
  await venster(eva).getByRole('button', { name: 'Opslaan' }).click();
  await expect(venster(eva)).toHaveCount(0);

  await expect.poll(async () => (await afspraak('Kamp Daan (welpen)')).length, SYNC).toBe(1);
  const [na] = await afspraak('Kamp Daan (welpen)');
  expect({ ...na, title: voor.title, version: voor.version }).toEqual(voor);
  expect(na.version).toBe((voor.version as number) + 1);
});

test('bevinding 1: één voorkomen van een reeks met notities aanpassen: het losse voorkomen houdt de notities', async () => {
  await eva.getByRole('button', { name: /^Zwemles, 09:15/ }).first().click();
  await venster(eva).locator('#item-titel').fill('Zwemles (diploma A)');
  await venster(eva).getByRole('button', { name: 'Alleen deze opslaan' }).click();
  await expect.poll(async () => (await afspraak('Zwemles (diploma A)')).length, SYNC).toBe(1);
  const [los] = await afspraak('Zwemles (diploma A)');
  const [reeks] = await afspraak('Zwemles');
  expect(los).toMatchObject({ series_id: reeks.id, notes: 'Badpas zit in de blauwe tas', location: 'Sportfondsenbad', start_time: '09:15:00', end_time: '10:00:00' });
  expect(reeks.notes).toBe('Badpas zit in de blauwe tas');
});

// Privé-afspraak toevoegen terwijl de verbinding wegvalt. Met bereikt: de server slaat hem op, maar het
// antwoord komt niet aan; zonder: het verzoek komt niet aan.
const SAVE_EVENT = '**/rest/v1/rpc/save_event*';
const OVERZICHT = '**/rest/v1/event_overview*';
async function priveToevoegenZonderAntwoord(p: Page, titel: string, { bereikt }: { bereikt: boolean }) {
  // De verbinding blijft weg tot na het herladen: ook nakijken lukt dus niet meer vóór het herladen.
  if (bereikt) await p.route(OVERZICHT, route => route.abort('connectionreset'));
  await p.route(SAVE_EVENT, async route => {
    if (bereikt) await route.fetch();
    await route.abort('connectionreset');
  });
  await p.getByRole('button', { name: 'Toevoegen' }).first().click();
  await venster(p).getByRole('tab', { name: 'Afspraak' }).click();
  await venster(p).locator('#item-titel').fill(titel);
  await venster(p).locator('#item-prive').check();
  await venster(p).getByRole('button', { name: 'Toevoegen', exact: true }).click();
  await expect(p.locator('.sync-waarschuwing')).toContainText('nog niet bevestigd', SYNC);
  // De opdracht-ID staat op het toestel; de inhoud van een privé-afspraak niet (zie de sync-module).
  const opslag = await p.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('thuisplanner-opdracht:')));
  expect(opslag).toHaveLength(1);
  expect(opslag[0][1]).not.toContain(titel);
  const id = opslag[0][0].split(':').pop()!;
  await p.unroute(SAVE_EVENT);
  if (bereikt) await p.unroute(OVERZICHT);
  return id;
}

test('bevinding 4: privé-afspraak niet aangekomen, herladen, opnieuw invoeren met dezelfde ID: precies één afspraak', async () => {
  const id = await priveToevoegenZonderAntwoord(eva, 'Tandarts Eva', { bereikt: false });
  await eva.reload();
  await expect(eva.locator('.sync-status')).toHaveText('Verbonden', SYNC);
  expect(await afspraak('Tandarts Eva')).toHaveLength(0);

  // Herstelroute: Meer → opnieuw invoeren (niet: vergeten en een nieuwe maken).
  await nav(eva, 'Meer');
  const rij = eva.getByRole('region', { name: 'Niet bevestigd' });
  await expect(rij).toContainText('Privé-afspraak (inhoud niet op dit toestel)');
  await rij.getByRole('button', { name: 'Opnieuw invoeren' }).click();
  await expect(venster(eva).getByRole('heading', { name: 'Privé-afspraak opnieuw invoeren' })).toBeVisible();
  await expect(venster(eva).locator('#item-prive')).toBeChecked();
  await expect(venster(eva).locator('#item-prive')).toBeDisabled();
  await venster(eva).locator('#item-titel').fill('Tandarts Eva');
  await venster(eva).getByRole('button', { name: 'Opslaan' }).click();
  await expect(eva.getByText('Alles is door de server bevestigd.')).toBeVisible(SYNC);

  const rijen = await afspraak('Tandarts Eva');
  expect(rijen).toHaveLength(1);
  expect(rijen[0]).toMatchObject({ id, visibility: 'private' });
  await expect.poll(() => eva.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('thuisplanner-opdracht:')).length)).toBe(0);
  // Thomas ziet hem één keer, als "Bezet".
  await expect(thomas.getByRole('button', { name: /^Bezet, Hele dag/ })).toHaveCount(1, SYNC);
  await expect(thomas.locator('body')).not.toContainText('Tandarts Eva');
});

test('bevinding 4: privé-afspraak wél aangekomen (antwoord weg), herladen: de server bevestigt hem laat, zonder herinvoer en zonder dubbele', async () => {
  const id = await priveToevoegenZonderAntwoord(eva, 'Fysio Eva', { bereikt: true });
  await eva.reload();
  await expect(eva.locator('.sync-status')).toHaveText('Verbonden', SYNC);
  await expect(eva.getByRole('button', { name: /^Fysio Eva/ })).toBeVisible(SYNC);
  await nav(eva, 'Meer');
  await expect(eva.getByText('Alles is door de server bevestigd.')).toBeVisible(SYNC);
  const rijen = await afspraak('Fysio Eva');
  expect(rijen.map(r => r.id)).toEqual([id]);
});

test('bevinding 4: herinvoer-venster open terwijl de late bevestiging binnenkomt: het venster wisselt naar de bewaarde afspraak, geen tweede', async () => {
  const id = await priveToevoegenZonderAntwoord(eva, 'Pedicure Eva', { bereikt: false });
  await eva.reload();
  await expect(eva.locator('.sync-status')).toHaveText('Verbonden', SYNC);
  await nav(eva, 'Meer');
  await eva.getByRole('region', { name: 'Niet bevestigd' }).getByRole('button', { name: 'Opnieuw invoeren' }).click();
  await expect(venster(eva).getByRole('heading', { name: 'Privé-afspraak opnieuw invoeren' })).toBeVisible();

  // Intussen komt dezelfde opdracht (zelfde ID) alsnog op de server, bijvoorbeeld een verzoek dat lang onderweg was.
  const c = await alsEva();
  const lid = (await c.rpc('my_memberships')).data[0];
  const vandaag = await eva.evaluate(() => new Date().toLocaleDateString('sv-SE'));
  const r = await c.rpc('save_event', {
    p_household: lid.household_id, p_id: id, p_version: null, p_start_date: vandaag, p_start_time: null, p_end_date: null,
    p_end_time: null, p_visibility: 'private', p_title: 'Pedicure Eva', p_location: null, p_notes: null, p_preparation: null,
    p_participants: [], p_recurrence_freq: null, p_recurrence_until: null,
  });
  expect(r.error).toBeNull();

  // Het venster toont nu de bevestigde afspraak; opslaan wijzigt die ene afspraak, er komt er geen bij.
  await expect(venster(eva).getByRole('heading', { name: 'Afspraak', exact: true })).toBeVisible(SYNC);
  await expect(venster(eva).locator('#item-titel')).toHaveValue('Pedicure Eva');
  await venster(eva).getByRole('button', { name: 'Opslaan' }).click();
  await expect.poll(async () => (await afspraak('Pedicure Eva')).map(x => x.id), SYNC).toEqual([id]);
});

test('screenshots herstelronde 1 @screenshot', async () => {
  test.skip(!process.env.KG_SCREENSHOTS, 'alleen via npm run screenshots:lokaal');
  const pad = (s: string) => `screenshots/lokaal/${s}.png`;
  await priveToevoegenZonderAntwoord(eva, 'Huisarts Eva', { bereikt: false });
  await eva.reload();
  await expect(eva.locator('.sync-status')).toHaveText('Verbonden', SYNC);
  await nav(eva, 'Meer');
  await expect(eva.getByRole('region', { name: 'Niet bevestigd' })).toContainText('Privé-afspraak');
  await eva.screenshot({ path: pad('10-eva-prive-zonder-inhoud'), fullPage: true });
  await eva.getByRole('region', { name: 'Niet bevestigd' }).getByRole('button', { name: 'Opnieuw invoeren' }).click();
  await venster(eva).locator('#item-titel').fill('Huisarts Eva');
  await eva.screenshot({ path: pad('11-eva-prive-opnieuw-invoeren') });
  await venster(eva).getByRole('button', { name: 'Opslaan' }).click();
  await expect(eva.getByText('Alles is door de server bevestigd.')).toBeVisible(SYNC);
  await openInAgenda(eva, /^Kamp Daan, 18:00/);
  await eva.screenshot({ path: pad('12-eva-meerdaagse-afspraak-bewerken') });
});
