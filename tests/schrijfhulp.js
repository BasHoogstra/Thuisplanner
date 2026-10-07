// Gedeelde hulpjes voor de schrijftests (E2): bewaking van PUT's, wachten, boodschappen, de
// onzekerheidsvraag. Geen testbestand (geen .test.js).
'use strict';
const { openApp, assert } = require('./lib');

const wait = ms => new Promise(r => setTimeout(r, ms));
const boodTexts = d => ((d && d.boodschappen) || []).map(b => b.text).sort();
const syncText = page => page.textContent('#syncText');
const readCacheOf = page => page.evaluate(() => {
  const k = Object.keys(localStorage).find(x => x.startsWith('plannerCache_'));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
});
const journaal = page => page.evaluate(() => {
  const k = Object.keys(localStorage).find(x => x.startsWith('plannerJournal_'));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
});
async function addBood(page, text) {
  await page.click('[data-view="boodschappenView"]');
  await page.fill('#boodschapInput', text);
  await page.press('#boodschapInput', 'Enter');
}
async function afvinken(page, text) {
  await page.click('[data-view="boodschappenView"]');
  await page.locator('#boodschappenList .list-row', { hasText: text }).locator('.check').first().click();
}
const refresh = page => page.evaluate(() => document.getElementById('refreshBtn').click());
async function until(cond, ms, label) {
  const t0 = Date.now();
  while (!(await cond())) { if (Date.now() - t0 > ms) throw new Error('Time-out: ' + label); await wait(100); }
}
// Telt PUT's (met en zonder if-match) en hoeveel er tegelijk onderweg zijn; geeft instructies
// ongewijzigd door aan de nagebootste database.
function bewaker(extra) {
  const b = { puts: 0, gets: 0, zonderIfMatch: 0, tegelijk: 0, maxTegelijk: 0, log: [] };
  b.onRequest = async info => {
    const act = extra ? extra(info, b) : undefined;
    b.log.push(info.method + (act ? ':' + (typeof act === 'string' ? act : JSON.stringify(act)) : ''));
    if (info.method === 'GET') b.gets++;
    if (info.method === 'PUT') { b.puts++; if (!info.ifMatch) b.zonderIfMatch++; b.tegelijk++; b.maxTegelijk = Math.max(b.maxTegelijk, b.tegelijk); }
    return act;
  };
  b.onDone = info => { if (info.method === 'PUT') b.tegelijk--; };
  b.onRequest.bewaker = b;
  return b;
}
const open = (ctx, o) => openApp(ctx.browser, ctx.base, Object.assign({ target: 'test' }, o, o && o.onRequest && o.onRequest.bewaker ? { onDone: o.onRequest.bewaker.onDone } : {}));
async function rustig(o) {
  await until(async () => /^(Opgeslagen|Bijgewerkt)/.test(await syncText(o.page)), 5000, 'app in rust na laden');
  await until(async () => o.state.puts >= 1, 4000, 'terugschrijven na het laden');
  await wait(400);
}
// De onzekerheidsvraag.
const ONZEKER = /verbinding( viel)? weg/;
async function vraagZichtbaar(page, ms) {
  try { await page.waitForSelector('#confirmOverlay.open', { timeout: ms || 6000 }); } catch (e) { return false; }
  return ONZEKER.test(await page.textContent('#confirmTitle'));
}
async function vraagBeantwoord(page, opnieuw) {
  assert(await vraagZichtbaar(page), 'Geen vraag na een onzekere uitkomst');
  await page.click(opnieuw ? '#confirmOkBtn' : '#confirmCancelBtn');
}
// Alle statusteksten die de app toont (ook kortstondige).
const volgStatus = page => page.evaluate(() => {
  window.__statussen = [];
  const el = document.getElementById('syncText');
  window.__statussen.push(el.textContent);
  new MutationObserver(() => window.__statussen.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
});
const statussen = page => page.evaluate(() => window.__statussen || []);
const VEILIG = /^(Opgeslagen|Bijgewerkt)/;

module.exports = { wait, boodTexts, syncText, readCacheOf, journaal, addBood, afvinken, refresh, until, bewaker, open, rustig, ONZEKER, vraagZichtbaar, vraagBeantwoord, volgStatus, statussen, VEILIG };
