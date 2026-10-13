import { execFileSync } from 'node:child_process';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { nav, SYNC, telefoon, toevoegen, venster } from './hulp';

// Twee telefoons, één gezin: Eva en Thomas (fictief) in twee aparte browsercontexten, tegen de lokale
// Supabase-stack. Wat de een toevoegt, wijzigt of afvinkt, verschijnt bij de ander via de sync-module.

let eva: Page, thomas: Page;
const contexten: BrowserContext[] = [];

test.beforeEach(async ({ browser }) => {
  // Elk scenario begint met hetzelfde verzonnen gezin.
  execFileSync('node', ['scripts/lokaal.mjs', 'seed'], { stdio: 'ignore' });
  const e = await telefoon(browser, 'Eva');
  const t = await telefoon(browser, 'Thomas');
  contexten.push(e.ctx, t.ctx);
  eva = e.p; thomas = t.p;
});

test.afterEach(async () => {
  for (const c of contexten.splice(0)) await c.close();
});

test('privé: Eva ziet de privé-afspraak van Thomas alleen als bezet, Thomas ziet de details', async () => {
  await expect(thomas.getByText('Fysiotherapie')).toBeVisible();
  await expect(eva.getByRole('button', { name: /^Bezet, 15:00/ })).toBeVisible();
  await expect(eva.locator('body')).not.toContainText('Fysiotherapie');
  await expect(eva.locator('body')).not.toContainText('Praktijk Oost');
  await eva.getByRole('button', { name: /^Bezet, 15:00/ }).click();
  await expect(venster(eva).getByRole('heading', { name: 'Bezet' })).toBeVisible();
  await expect(venster(eva).getByRole('button', { name: 'Opslaan' })).toHaveCount(0);
});

test('afspraak: toevoegen, aanpassen en één keer van een reeks verwijderen verschijnt op de andere telefoon', async () => {
  await toevoegen(eva, 'Afspraak', 'Kapper Lotte');
  await expect(thomas.getByText('Kapper Lotte')).toBeVisible(SYNC);

  await thomas.getByRole('button', { name: /^Kapper Lotte/ }).click();
  await venster(thomas).locator('#item-titel').fill('Kapper Lotte en Daan');
  await venster(thomas).getByRole('button', { name: 'Opslaan' }).click();
  await expect(eva.getByText('Kapper Lotte en Daan')).toBeVisible(SYNC);

  // Herhalende afspraak: alleen het voorkomen van vandaag verwijderen.
  await eva.getByRole('button', { name: /^Zwemles, 09:15/ }).first().click();
  await venster(eva).getByRole('button', { name: 'Alleen deze verwijderen' }).click();
  await expect(thomas.getByRole('button', { name: /^Zwemles, 09:15/ })).toHaveCount(0, SYNC);
  // De reeks zelf bestaat nog (volgende week).
  await nav(thomas, 'Agenda');
  await thomas.getByRole('button', { name: 'Volgende week' }).click();
  await expect(thomas.getByRole('button', { name: /^Zwemles, 09:15/ }).first()).toBeVisible();
});

test('taak: toevoegen bij Eva, afvinken bij Thomas, afgevinkt bij Eva', async () => {
  await toevoegen(eva, 'Taak', 'Fietspomp terugbrengen');
  const bijThomas = thomas.getByRole('checkbox', { name: 'Fietspomp terugbrengen' });
  await expect(bijThomas).toBeVisible(SYNC);
  await expect(bijThomas).toBeEnabled(SYNC);
  await bijThomas.click();
  await expect(eva.getByRole('checkbox', { name: 'Fietspomp terugbrengen', checked: false })).toHaveCount(0, SYNC);
  await eva.getByRole('button', { name: /afgerond vandaag/ }).click();
  await expect(eva.getByRole('checkbox', { name: 'Fietspomp terugbrengen', checked: true })).toBeVisible();
});

test('boodschappen: toevoegen bij Thomas, afvinken bij Eva, in het mandje bij Thomas', async () => {
  await nav(thomas, 'Boodschappen');
  await nav(eva, 'Boodschappen');
  await thomas.locator('#snel-boodschap').fill('hagelslag, pindakaas');
  await thomas.locator('form.snel').getByRole('button', { name: 'Toevoegen' }).click();
  await expect(eva.getByRole('checkbox', { name: 'Hagelslag' })).toBeEnabled(SYNC);
  await expect(eva.getByRole('checkbox', { name: 'Pindakaas' })).toBeVisible();

  await eva.getByRole('checkbox', { name: 'Hagelslag' }).click();
  await expect(thomas.getByRole('region', { name: /In het mandje/ }).getByText('Hagelslag')).toBeVisible(SYNC);

  // Opnieuw toevoegen wat al op de lijst staat: geen dubbele (server: al_op_lijst).
  await thomas.locator('#snel-boodschap').fill('Pindakaas');
  await thomas.locator('form.snel').getByRole('button', { name: 'Toevoegen' }).click();
  await expect(thomas.getByRole('status')).toContainText('Pindakaas');
  await expect(eva.getByRole('checkbox', { name: 'Pindakaas' })).toHaveCount(1);
});

test('versieconflict: een gelijktijdige wijziging wordt niet stil overschreven', async () => {
  await nav(eva, 'Boodschappen');
  await nav(thomas, 'Boodschappen');
  await eva.getByRole('button', { name: 'Melk aanpassen' }).click();
  await venster(eva).locator('#item-titel').fill('Melk (halfvol)');
  // Intussen past Thomas dezelfde boodschap aan.
  await thomas.getByRole('button', { name: 'Melk aanpassen' }).click();
  await venster(thomas).locator('#item-titel').fill('Melk (vol)');
  await venster(thomas).getByRole('button', { name: 'Opslaan' }).click();
  await expect(eva.getByRole('button', { name: 'Melk (vol) aanpassen' })).toBeVisible(SYNC);
  // Eva bewaart met de versie waarmee ze begon: geweigerd, met uitleg; die van Thomas blijft staan.
  await venster(eva).getByRole('button', { name: 'Opslaan' }).click();
  await expect(eva.locator('.sync-waarschuwing')).toContainText('Iemand anders heeft dit net aangepast', SYNC);
  await expect(eva.getByRole('button', { name: 'Melk (vol) aanpassen' })).toBeVisible();
  await expect(thomas.getByRole('button', { name: 'Melk (vol) aanpassen' })).toBeVisible();
  await expect(thomas.getByText('Melk (halfvol)')).toHaveCount(0);
});

// De verbinding valt weg tijdens het versturen. Met bereikt: de server voert het uit, maar het antwoord komt
// nooit aan; zonder: het verzoek komt niet aan. In beide gevallen weet de app niet of het is opgeslagen.
const TAKEN = '**/rest/v1/tasks*';
const BOODSCHAPPEN = '**/rest/v1/rpc/add_shopping_items*';
async function verbindingWeg(p: Page, { bereikt, pad = TAKEN }: { bereikt: boolean; pad?: string }) {
  const teller = { pogingen: 0 };
  await p.route(pad, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    teller.pogingen++;
    if (bereikt) await route.fetch();
    await route.abort('connectionreset');
  });
  return teller;
}

test('onbevestigd: maar wel aangekomen → bij de volgende ronde bevestigd, niet dubbel', async () => {
  const t = await verbindingWeg(eva, { bereikt: true });
  await toevoegen(eva, 'Taak', 'Zwemspullen wassen');
  await expect(eva.locator('.sync-waarschuwing')).toContainText('nog niet bevestigd', SYNC);
  await expect(eva.getByRole('checkbox', { name: 'Zwemspullen wassen' })).toBeEnabled(SYNC);
  expect(t.pogingen).toBe(1);
  await expect(thomas.getByRole('checkbox', { name: 'Zwemspullen wassen' })).toHaveCount(1, SYNC);
});

test('onbevestigd: niet aangekomen → "niet bevestigd" op de rij, herstelkeuze in Meer, opnieuw proberen maakt het niet dubbel', async () => {
  await verbindingWeg(eva, { bereikt: false });
  await toevoegen(eva, 'Taak', 'Regenjassen opruimen');
  await expect(eva.locator('.sync-waarschuwing')).toContainText('nog niet bevestigd', SYNC);
  await expect(eva.getByText('niet bevestigd', { exact: true })).toBeVisible();
  await expect(eva.getByRole('checkbox', { name: 'Regenjassen opruimen' })).toBeDisabled();
  await expect(thomas.getByRole('checkbox', { name: 'Regenjassen opruimen' })).toHaveCount(0);

  // Nog een keer hetzelfde toevoegen: niet stil dubbel, maar een keuze.
  await eva.getByRole('button', { name: 'Toevoegen' }).first().click();
  await venster(eva).getByRole('tab', { name: 'Taak' }).click();
  await venster(eva).locator('#item-titel').fill('Regenjassen opruimen');
  await venster(eva).getByRole('button', { name: 'Toevoegen', exact: true }).click();
  await expect(venster(eva).getByRole('heading', { name: 'Al eerder toegevoegd?' })).toBeVisible(SYNC);
  await venster(eva).getByRole('button', { name: 'Eerdere opnieuw versturen' }).click();
  await expect(eva.locator('.sync-waarschuwing')).toContainText('nog niet bevestigd', SYNC);

  await eva.unroute(TAKEN);
  await nav(eva, 'Meer');
  await expect(eva.getByRole('region', { name: 'Niet bevestigd' })).toContainText('Regenjassen opruimen');
  await eva.getByRole('button', { name: 'Opnieuw proberen' }).click();
  await expect(eva.getByText('Alles is door de server bevestigd.')).toBeVisible(SYNC);
  await expect(thomas.getByRole('checkbox', { name: 'Regenjassen opruimen' })).toHaveCount(1, SYNC);
});

test('onbevestigd + herladen: de opdracht blijft op het toestel bewaard (unmount wist niets) en is daarna te herstellen', async () => {
  await verbindingWeg(eva, { bereikt: false });
  await toevoegen(eva, 'Taak', 'Fietsverlichting kopen');
  await expect(eva.locator('.sync-waarschuwing')).toContainText('nog niet bevestigd', SYNC);
  const bewaard = () => eva.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('thuisplanner-opdracht:')).length);
  expect(await bewaard()).toBe(1);

  // Herladen: alle onderdelen unmounten en de pagina start opnieuw (zelfde tabblad, zelfde inlogsessie).
  await eva.unroute(TAKEN);
  await eva.reload();
  await expect(eva.locator('.sync-status')).toHaveText('Verbonden', SYNC);
  expect(await bewaard()).toBe(1);
  await expect(eva.getByRole('checkbox', { name: 'Fietsverlichting kopen' })).toBeDisabled();
  await nav(eva, 'Meer');
  await eva.getByRole('button', { name: 'Opnieuw proberen' }).click();
  await expect(eva.getByText('Alles is door de server bevestigd.')).toBeVisible(SYNC);
  await expect.poll(bewaard, SYNC).toBe(0);
  await expect(thomas.getByRole('checkbox', { name: 'Fietsverlichting kopen' })).toHaveCount(1, SYNC);
});

test('onbevestigd: "Vergeten op dit toestel" haalt hem alleen hier weg', async () => {
  await verbindingWeg(eva, { bereikt: false, pad: BOODSCHAPPEN });
  await toevoegen(eva, 'Boodschap', 'Koffiefilters');
  await nav(eva, 'Meer');
  await expect(eva.getByRole('region', { name: 'Niet bevestigd' })).toContainText('Koffiefilters', SYNC);
  await eva.getByRole('button', { name: 'Vergeten op dit toestel' }).click();
  await expect(eva.getByText('Alles is door de server bevestigd.')).toBeVisible();
  await nav(eva, 'Boodschappen');
  await expect(eva.getByText('Koffiefilters')).toHaveCount(0);
});

test('schermwissels en StrictMode stoppen de synchronisatie niet; uitloggen wel', async () => {
  for (const s of ['Agenda', 'Boodschappen', 'Meer', 'Vandaag']) await nav(eva, s);
  await toevoegen(thomas, 'Taak', 'Sleutels bijmaken');
  await expect(eva.getByRole('checkbox', { name: 'Sleutels bijmaken' })).toBeVisible(SYNC);

  await nav(eva, 'Meer');
  await eva.getByRole('button', { name: 'Uitloggen' }).click();
  await expect(eva.getByRole('heading', { name: 'Inloggen' })).toBeVisible();
  await expect(eva.locator('body')).not.toContainText('Sleutels bijmaken');
});

test('screenshots @screenshot', async () => {
  test.skip(!process.env.KG_SCREENSHOTS, 'alleen via npm run screenshots:lokaal');
  test.setTimeout(120_000);
  const pad = (s: string) => `screenshots/lokaal/${s}.png`;
  await eva.screenshot({ path: pad('01-eva-vandaag-bezet'), fullPage: true });
  await thomas.screenshot({ path: pad('02-thomas-vandaag-prive-details'), fullPage: true });

  // Eva voegt een afspraak, taak en boodschap toe; ze verschijnen bij Thomas.
  await toevoegen(eva, 'Afspraak', 'Kapper Lotte');
  await toevoegen(eva, 'Taak', 'Fietspomp terugbrengen');
  await toevoegen(eva, 'Boodschap', 'Appelsap');
  await expect(thomas.getByRole('checkbox', { name: 'Fietspomp terugbrengen' })).toBeEnabled(SYNC);
  await expect(thomas.getByText('Kapper Lotte')).toBeVisible(SYNC);
  await thomas.screenshot({ path: pad('03-thomas-ziet-toevoegingen-van-eva'), fullPage: true });
  await nav(thomas, 'Boodschappen');
  await expect(thomas.getByRole('checkbox', { name: 'Appelsap' })).toBeEnabled(SYNC);
  await thomas.getByRole('checkbox', { name: 'Appelsap' }).click();
  await nav(eva, 'Boodschappen');
  await expect(eva.getByRole('region', { name: /In het mandje/ }).getByText('Appelsap')).toBeVisible(SYNC);
  await eva.screenshot({ path: pad('04-eva-boodschappen-afgevinkt-door-thomas'), fullPage: true });

  await nav(eva, 'Agenda');
  await eva.screenshot({ path: pad('05-eva-agenda-week'), fullPage: true });

  // Versieconflict.
  await nav(eva, 'Boodschappen');
  await nav(thomas, 'Boodschappen');
  await eva.getByRole('button', { name: 'Melk aanpassen' }).click();
  await venster(eva).locator('#item-titel').fill('Melk (halfvol)');
  await thomas.getByRole('button', { name: 'Melk aanpassen' }).click();
  await venster(thomas).locator('#item-titel').fill('Melk (vol)');
  await venster(thomas).getByRole('button', { name: 'Opslaan' }).click();
  await expect(eva.getByRole('button', { name: 'Melk (vol) aanpassen' })).toBeVisible(SYNC);
  await venster(eva).getByRole('button', { name: 'Opslaan' }).click();
  await expect(eva.locator('.sync-waarschuwing')).toBeVisible(SYNC);
  await eva.screenshot({ path: pad('06-eva-versieconflict') });
  await eva.locator('.sync-waarschuwing').getByRole('button', { name: 'Sluiten' }).click();

  // Onbevestigd: verbinding weg tijdens het versturen.
  await nav(eva, 'Vandaag');
  await verbindingWeg(eva, { bereikt: false });
  await toevoegen(eva, 'Taak', 'Regenjassen opruimen');
  await expect(eva.getByText('niet bevestigd', { exact: true })).toBeVisible(SYNC);
  await eva.screenshot({ path: pad('07-eva-niet-bevestigd'), fullPage: true });
  await nav(eva, 'Meer');
  await eva.screenshot({ path: pad('08-eva-meer-herstelkeuzes'), fullPage: true });
  await eva.unroute(TAKEN);

  await eva.getByRole('button', { name: 'Uitloggen' }).click();
  await expect(eva.getByRole('heading', { name: 'Inloggen' })).toBeVisible();
  await eva.screenshot({ path: pad('09-inloggen-fictieve-accounts'), fullPage: true });
});
