import { expect, test } from '@playwright/test';
import { nav, SYNC, telefoon, toevoegen } from '../e2e-lokaal/hulp';

// Herstelronde 1, bevinding 2: de wifi-route. Twee "toestellen" (browsercontexten) op een andere netwerkhost
// dan de ontwikkelmachine openen http://<lan-ip>:5180. Bewijst: de pagina is geen secure context, en toch
// werken inloggen (Auth), toevoegen (UUID's via crypto.getRandomValues), REST en Realtime over het netwerk.
// Dit is geen proef met echte telefoons; die staat beschreven in docs/thuisplanner-app.md.

const LAN_URL = process.env.LAN_URL;
const IP = LAN_URL ? new URL(LAN_URL).hostname : '';

test.skip(!LAN_URL, 'alleen via scripts/lan-proef.sh (LAN_URL)');

test('twee toestellen via het netwerkadres: inloggen, toevoegen en afvinken synchroniseren via Realtime', async ({ browser }) => {
  expect(['127.0.0.1', 'localhost']).not.toContain(IP);
  const e = await telefoon(browser, 'Eva', { basis: LAN_URL!, hosts: [IP] });
  // Websockets van Thomas vanaf het begin bijhouden (het Realtime-kanaal).
  const sockets: string[] = [];
  const t = await telefoon(browser, 'Thomas', { basis: LAN_URL!, hosts: [IP], bijPagina: p => p.on('websocket', ws => sockets.push(ws.url())) });
  const eva = e.p, thomas = t.p;

  // De omstandigheden van een telefoon op http://<lan-ip>: geen secure context, geen crypto.randomUUID.
  const omgeving = await eva.evaluate(() => ({
    secure: window.isSecureContext, randomUUID: typeof (crypto as Crypto & { randomUUID?: unknown }).randomUUID,
    getRandomValues: typeof crypto.getRandomValues, adres: location.hostname,
  }));
  expect(omgeving).toEqual({ secure: false, randomUUID: 'undefined', getRandomValues: 'function', adres: IP });

  // Thomas wisselt van scherm en weer terug: het kanaal (en dus Realtime) blijft werken.
  await nav(thomas, 'Agenda');
  await nav(thomas, 'Vandaag');

  await toevoegen(eva, 'Afspraak', 'Ouderavond via wifi');
  await toevoegen(eva, 'Taak', 'Fietsen nakijken via wifi');
  await toevoegen(eva, 'Boodschap', 'Wifi-koekjes');
  await expect(thomas.getByText('Ouderavond via wifi')).toBeVisible(SYNC);
  const taak = thomas.getByRole('checkbox', { name: 'Fietsen nakijken via wifi' });
  await expect(taak).toBeEnabled(SYNC);
  await taak.click();
  await expect(eva.getByRole('checkbox', { name: 'Fietsen nakijken via wifi', checked: false })).toHaveCount(0, SYNC);
  await nav(thomas, 'Boodschappen');
  await expect(thomas.getByRole('checkbox', { name: 'Wifi-koekjes' })).toBeEnabled(SYNC);

  // Alles is bevestigd: geen waarschuwing, geen openstaande opdrachten op het toestel.
  await expect(eva.locator('.sync-waarschuwing')).toHaveCount(0);
  const open = await eva.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('thuisplanner-opdracht:')).length);
  expect(open).toBe(0);
  await e.ctx.close(); await t.ctx.close();
  expect(sockets.length).toBeGreaterThan(0);
  expect(sockets.every(s => new URL(s).hostname === IP)).toBe(true);
});
