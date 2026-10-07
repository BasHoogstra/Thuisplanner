// 1.4.2, E2 — derde Codex-review van PR #15: het journaal fail-safe inspecteren (absent / valid /
// unknown-invalid), pas opruimen ná een duurzaam vastgelegde afgehandelde toestand, een keuze-route
// zonder verlies van onafhankelijke wijzigingen, eigenaarschap tussen vensters, journaalcontext en
// cache/journaal-divergentie. Alleen de testversie; alleen fictieve data.
'use strict';
const { readFixture, serverWrite, assert, DB_URL, PLANNER_KEY, FIXED_NOW } = require('./lib');
const H = require('./schrijfhulp');
const { wait, boodTexts, syncText, addBood, afvinken, refresh, until, bewaker, open, rustig, vraagZichtbaar, vraagBeantwoord, volgStatus, statussen, VEILIG } = H;

const JPRE = 'plannerJournal_' + PLANNER_KEY;
const CKEY = 'plannerCache_' + PLANNER_KEY;
const journalen = page => page.evaluate(p => {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(p)) o[k] = localStorage.getItem(k); }
  return o;
}, JPRE);
const eenRecord = async page => { const j = await journalen(page), k = Object.keys(j); return k.length ? JSON.parse(j[k[0]]) : null; };
const gateZichtbaar = page => page.evaluate(() => { const e = document.getElementById('journalGateOverlay'); return !!e && !e.hidden; });
// Wat de app toont (de boodschappenlijst) en wat er in de lokale cache staat.
const appToont = (page, t) => page.evaluate(x => (document.getElementById('boodschappenList').textContent || '').includes(x), t);
const cacheData = page => page.evaluate(k => { try { return JSON.parse(localStorage.getItem(k)).data; } catch (e) { return null; } }, CKEY);
const GEEN_LOCKS = "try{Object.defineProperty(Navigator.prototype,'locks',{get:function(){return undefined;},configurable:true});}catch(e){}";
const VANDAAG = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
const ids = async page => Object.keys(await journalen(page)).map(k => k.slice(JPRE.length + 1));

// Storingen in localStorage (alleen localStorage, niet sessionStorage). Regels:
// {op: 'set'|'get'|'remove', key: regex, val?: regex (alleen set), n: aantal keer (-1 = altijd)}.
// 'set' en 'get' gooien een fout; 'remove' doet stil niets (zoals een opslag die niet meewerkt).
// Tijdens het draaien: storing(page, regels). Vóór het laden (ook na herladen): de regels in
// sessionStorage '__storing' zetten; het script staat dan als initScript in de context.
const STORING_SRC = `
window.__installeer = function (rs) {
  window.__storing = rs;
  if (window.__storingActief) return;
  window.__storingActief = true;
  var P = Storage.prototype, oSet = P.setItem, oGet = P.getItem, oRem = P.removeItem;
  function raak(st, op, k, v) {
    if (st !== window.localStorage) return false;
    var rs = window.__storing || [];
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      if (r.op !== op || r.n === 0) continue;
      if (!new RegExp(r.key).test(String(k))) continue;
      if (r.val && !new RegExp(r.val).test(String(v))) continue;
      if (r.n > 0) r.n--;
      return true;
    }
    return false;
  }
  // 'pauze-set' / 'pauze-remove' (met ms): de pagina blijft vlak vóór de echte schrijf-/verwijderactie
  // synchroon staan, dus NA de eigenaarscontrole van de app (zoals een gepauzeerd venster).
  function pauze(st, op, k, v) {
    if (st !== window.localStorage) return;
    var rs = window.__storing || [];
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      if (r.op !== op || r.n === 0 || !new RegExp(r.key).test(String(k))) continue;
      if (r.val && !new RegExp(r.val).test(String(v))) continue;
      if (r.n > 0) r.n--;
      window.__gepauzeerd = (window.__gepauzeerd || 0) + 1;
      try { oSet.call(window.sessionStorage, '__gepauzeerd', String(window.__gepauzeerd)); } catch (e) {}
      var t = performance.now(); while (performance.now() - t < r.ms) {}
      return;
    }
  }
  P.setItem = function (k, v) { if (raak(this, 'set', k, v)) throw new DOMException('storing', 'QuotaExceededError'); pauze(this, 'pauze-set', k, v); return oSet.call(this, k, v); };
  P.getItem = function (k) { if (raak(this, 'get', k)) throw new DOMException('storing', 'SecurityError'); return oGet.call(this, k); };
  P.removeItem = function (k) { if (raak(this, 'remove', k)) return; pauze(this, 'pauze-remove', k); return oRem.call(this, k); };
};
(function () { try { var rs = JSON.parse(sessionStorage.getItem('__storing') || 'null'); if (rs) window.__installeer(rs); } catch (e) {} })();
`;
const storing = (page, regels) => page.evaluate(([src, rs]) => { if (!window.__installeer) (0, eval)(src); window.__installeer(rs); }, [STORING_SRC, regels]);
const geenStoring = page => page.evaluate(() => { window.__storing = []; sessionStorage.removeItem('__storing'); });

// Een geldig record (voor de varianten die er telkens één ding aan veranderen).
function geldigRecord(extra) {
  const sent = readFixture('huishouden.json');
  sent.boodschappen.push({ id: 'jr-x', text: 'Uit journaal', done: false });
  return Object.assign({ v: 2, ctx: { db: DB_URL, planner: PLANNER_KEY, gen: 1 }, id: 'i0123456789abcdef', owner: null, hb: 0, state: 'unknown', sent: JSON.stringify(sent), oldBase: '', cacheInst: null, cacheSeq: 0, cacheOk: false }, extra || {});
}
const CACHE_ZAAD = JSON.stringify({ data: { boodschappen: [{ id: 'c-1', text: 'Alleen in cache' }] }, base: '', t: 1 });

// Een onzekere uitkomst opbouwen: PUT verloren (commit: verwerkt; anders: verbinding weg vóór de
// server), herstellezing ziet een wijziging van een ander toestel (anders), zodat de vraag komt.
async function onzeker(ctx, o2) {
  let fase = 0;
  const bw = bewaker(info => {
    if (info.method === 'PUT' && fase === 1) { fase = 2; return o2.commit ? 'lost' : 'abort'; }
    if (info.method === 'GET' && fase === 2) { fase = 3; serverWrite(info.state, o2.anders); }
  });
  const o = await open(ctx, Object.assign({ data: readFixture('huishouden.json'), onRequest: bw.onRequest }, o2.open || {}));
  await rustig(o); fase = 1;
  await o2.actie(o.page);
  assert(await vraagZichtbaar(o.page), 'Geen vraag na een onzekere uitkomst');
  return { o, bw };
}
// Vraag even wegzetten (zoals bij een andere vraag ertussen), lokaal verder werken, dan opnieuw vragen.
async function vraagWeg(page) { await page.evaluate(() => document.getElementById('confirmOverlay').classList.remove('open')); }

module.exports = {
  // ── Blocker 1: het journaal fail-safe inspecteren ─────────────────────────────────────────────
  async 'Tijdelijke leesfout op het journaal: niet "geen journaal"; blokkeert, daarna gewoon herstel'(ctx) {
    let fase = 0;
    const bw = bewaker(info => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
      if (info.method === 'GET' && fase === 2) { fase = 3; return 'hang'; }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest, timeouts: { gate: 700 }, initScript: STORING_SRC });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Leesfout L1');
    await until(async () => fase === 3, 4000, 'herstellezing hangt');
    serverWrite(o.state, db => { db.boodschappen = db.boodschappen.filter(b => b.text !== 'Leesfout L1'); }); // ander toestel
    await o.page.evaluate(() => sessionStorage.setItem('__storing', JSON.stringify([{ op: 'get', key: '^plannerJournal_', n: 5 }])));
    const p0 = bw.puts;
    await o.page.reload(); fase = 4;
    await until(() => gateZichtbaar(o.page), 3000, 'blokkade bij een onleesbaar journaal');
    assert(/onafgeronde opslag/.test(await syncText(o.page)), 'Geen eerlijke melding: ' + await syncText(o.page));
    assert(bw.puts === p0, 'Geschreven terwijl het journaal niet te lezen was');
    // De storing gaat voorbij: dan gewoon het herstel (vraag), nog steeds zonder schrijven.
    assert(await vraagZichtbaar(o.page, 10000), 'Geen herstel na een tijdelijke leesfout');
    assert(!(await gateZichtbaar(o.page)) && bw.puts === p0 && !boodTexts(o.state.db).includes('Leesfout L1'), 'Verwijdering van het andere toestel teruggedraaid');
    await vraagBeantwoord(o.page, false);
    await wait(1500);
    assert(!boodTexts(o.state.db).includes('Leesfout L1') && !Object.keys(await journalen(o.page)).length, 'Na "server laten" terug of journaal blijft');
    await o.ctx.close();
  },

  async 'Ongeldig journaal (JSON, versie, sent, oldBase, toestand, database, planner, generatie): blokkeert, raakt niets aan'(ctx) {
    const sleutel = JPRE + '_i0123456789abcdef';
    const varianten = [
      ['kapotte JSON', sleutel, '{"v":2,"ctx":'],
      ['onbekende versie', sleutel, JSON.stringify(geldigRecord({ v: 3 }))],
      ['oude versie zonder id', JPRE, JSON.stringify({ v: 1, state: 'unknown', sent: geldigRecord().sent, oldBase: '', t: 1 })],
      ['sent geen JSON', sleutel, JSON.stringify(geldigRecord({ sent: 'geen json' }))],
      ['sent geen object', sleutel, JSON.stringify(geldigRecord({ sent: '[1,2]' }))],
      ['oldBase kapot', sleutel, JSON.stringify(geldigRecord({ oldBase: '{kapot' }))],
      ['onbekende toestand', sleutel, JSON.stringify(geldigRecord({ state: 'klaar' }))],
      ['andere database', sleutel, JSON.stringify(geldigRecord({ ctx: { db: 'https://andere-db.test', planner: PLANNER_KEY, gen: 1 } }))],
      ['andere planner', sleutel, JSON.stringify(geldigRecord({ ctx: { db: DB_URL, planner: 'andereplanner', gen: 1 } }))],
      ['andere generatie', sleutel, JSON.stringify(geldigRecord({ ctx: { db: DB_URL, planner: PLANNER_KEY, gen: 2 } }))],
      ['sleutel past niet bij id', sleutel, JSON.stringify(geldigRecord({ id: 'ifedcba9876543210' }))]
    ];
    for (const [naam, k, raw] of varianten) {
      const bw = bewaker();
      const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest, timeouts: { gate: 600 }, localStorage: { [k]: raw, [CKEY]: CACHE_ZAAD } });
      await wait(800);
      assert(await gateZichtbaar(o.page), naam + ': niet geblokkeerd');
      assert(bw.puts === 0, naam + ': geschreven');
      const j = await journalen(o.page), c = await o.page.evaluate(k2 => localStorage.getItem(k2), CKEY);
      assert(j[k] === raw && Object.keys(j).length === 1, naam + ': journaal aangeraakt');
      assert(c === CACHE_ZAAD, naam + ': cache aangeraakt');
      assert(!(await appToont(o.page, 'Alleen in cache')), naam + ': cache toch hervat');
      if (naam === 'kapotte JSON') {
        // Na herstel van buitenaf (record weg) gaat de app vanzelf verder en hervat de cache gewoon.
        await o.page.evaluate(k2 => localStorage.removeItem(k2), k);
        await until(async () => !(await gateZichtbaar(o.page)), 4000, 'verder na opruimen');
        await until(async () => boodTexts(o.state.db).includes('Alleen in cache'), 5000, 'cache hervat en opgeslagen');
      }
      await o.ctx.close();
    }
  },

  async 'Open journaal + ontbrekende, kapotte of oudere cache: de verzonden stand telt, niets wordt gewist'(ctx) {
    for (const variant of ['ontbrekend', 'kapot', 'ouder']) {
      let fase = 0;
      const bw = bewaker(info => {
        if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
        if (info.method === 'GET' && fase === 2) { fase = 3; return 'hang'; }
      });
      const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
      await rustig(o);
      const oud = await o.page.evaluate(k => localStorage.getItem(k), CKEY);
      fase = 1;
      const t = 'Cache ' + variant;
      await addBood(o.page, t);
      await until(async () => fase === 3, 4000, variant + ': herstellezing hangt');
      await o.page.evaluate(([k, v, oudC]) => {
        if (v === 'ontbrekend') localStorage.removeItem(k);
        else if (v === 'kapot') localStorage.setItem(k, '{kapot');
        else localStorage.setItem(k, oudC); // de cache van vóór de wijziging (zelfde venster, ouder)
      }, [CKEY, variant, oud]);
      const p0 = bw.puts;
      await o.page.reload(); fase = 4;
      await until(async () => VEILIG.test(await syncText(o.page)), 6000, variant + ': bevestigd na herladen');
      await wait(1500);
      assert(boodTexts(o.state.db).filter(x => x === t).length === 1, variant + ': wijziging weg of dubbel op de server');
      assert(await appToont(o.page, t), variant + ': wijziging niet in de app');
      assert(bw.puts === p0 && !(await vraagZichtbaar(o.page, 300)), variant + ': onnodig geschreven of gevraagd');
      assert(!Object.keys(await journalen(o.page)).length, variant + ': journaal niet opgeruimd');
      await o.ctx.close();
    }
  },

  // ── Punt 6: cache/journaal-divergentie ────────────────────────────────────────────────────────
  async 'Cache-opslag mislukt, journaal lukt, bevestiging verloren, herladen: verzonden stand is de waarheid'(ctx) {
    let fase = 0;
    const bw = bewaker(info => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
      if (info.method === 'GET' && fase === 2) { fase = 3; return 'hang'; }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o);
    await storing(o.page, [{ op: 'set', key: '^plannerCache_', n: -1 }]);
    await volgStatus(o.page);
    fase = 1;
    await addBood(o.page, 'Alleen verzonden');
    await until(async () => fase === 3, 4000, 'herstellezing hangt');
    const rec = await eenRecord(o.page);
    const c = await o.page.evaluate(k => JSON.parse(localStorage.getItem(k)), CKEY);
    assert(rec && rec.local.includes('Alleen verzonden') && rec.sent.includes('Alleen verzonden'), 'Record heeft de nieuwste lokale stand niet');
    assert(!JSON.stringify(c.data).includes('Alleen verzonden') && c.jrev !== rec.rev, 'Testopzet: de cache had de wijziging toch, of spiegelt het record: ' + JSON.stringify({ jrev: c.jrev, rev: rec.rev, jkey: c.jkey, heeft: JSON.stringify(c.data).includes('Alleen verzonden') }));
    assert(!(await statussen(o.page)).slice(1).some(t => VEILIG.test(t)), 'Toonde "opgeslagen" terwijl de cache faalde: ' + (await statussen(o.page)).join(' | '));
    const p0 = bw.puts;
    await o.page.reload(); fase = 4;
    await until(async () => VEILIG.test(await syncText(o.page)), 6000, 'bevestigd na herladen');
    await wait(1500);
    assert(boodTexts(o.state.db).filter(x => x === 'Alleen verzonden').length === 1, 'Wijziging op de server gewist (oude cache als waarheid genomen)');
    assert((await appToont(o.page, 'Alleen verzonden')) && bw.puts === p0, 'Niet in de app, of onnodig geschreven');
    await o.ctx.close();
  },

  async 'Cache-opslag mislukt na een geslaagde PUT: geen "opgeslagen", record blijft; na herladen hersteld'(ctx) {
    const bw = bewaker();
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o);
    await storing(o.page, [{ op: 'set', key: '^plannerCache_', n: -1 }]);
    await volgStatus(o.page);
    await addBood(o.page, 'Lokaal mislukt');
    await until(async () => boodTexts(o.state.db).includes('Lokaal mislukt'), 4000, 'verstuurd');
    await wait(800);
    assert(/Lokaal bewaren mislukt/.test(await syncText(o.page)), 'Geen eerlijke melding: ' + await syncText(o.page));
    assert(!(await statussen(o.page)).slice(1).some(t => VEILIG.test(t)), 'Toonde "opgeslagen" terwijl de stand niet op het toestel staat: ' + (await statussen(o.page)).join(' | '));
    const rec = await eenRecord(o.page);
    assert(rec && rec.state === 'settled' && rec.local.includes('Lokaal mislukt'), 'Afgehandelde toestand niet in het record: ' + JSON.stringify(rec && rec.state));
    // Verdere wijzigingen gaan niet de deur uit zolang dit niet duurzaam vastligt.
    const p0 = bw.puts;
    await addBood(o.page, 'Wacht op opslag'); await wait(1200);
    assert(bw.puts === p0, 'Verder geschreven zonder duurzaam vastgelegde toestand');
    await o.page.reload();
    await until(async () => VEILIG.test(await syncText(o.page)), 6000, 'na herladen in rust');
    await wait(1200);
    assert(boodTexts(o.state.db).filter(x => x === 'Lokaal mislukt').length === 1 && (await appToont(o.page, 'Lokaal mislukt')), 'Wijziging kwijt na herladen');
    assert(boodTexts(o.state.db).includes('Wacht op opslag'), 'Latere wijziging (in het record) kwijt');
    assert(!Object.keys(await journalen(o.page)).length, 'Record niet opgeruimd');
    await o.ctx.close();
  },

  // ── Blocker 2: pas opruimen ná duurzaam vastgelegde afgehandelde toestand ─────────────────────
  // Veilige automatische afhandeling (server: X + Y), journaal weg, daarna verwijdert de server X;
  // herladen mag X niet terugbrengen. Ook met een opslagfout tussen elke stap van het afhandelen.
  ...(() => {
    const out = {};
    const stappen = [
      ['zonder storing', null],
      ['record → afgehandeld mislukt', [{ op: 'set', key: '^plannerJournal_', val: '"state":"settled"', n: -1 }]],
      ['cache mislukt', [{ op: 'set', key: '^plannerCache_', n: -1 }]],
      ['record opruimen mislukt', [{ op: 'remove', key: '^plannerJournal_', n: -1 }]]
    ];
    stappen.forEach(([naam, regels]) => {
      out['Veilig afgehandeld X+Y, server verwijdert X, herladen: X komt niet terug (' + naam + ')'] = async ctx => {
        let fase = 0;
        const bw = bewaker(info => {
          if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
          if (info.method === 'GET' && fase === 2) { fase = 3; serverWrite(info.state, db => { db.boodschappen.push({ id: 'y-ander', text: 'Y van ander', addedBy: 'Sanne', done: false }); }); }
        });
        const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
        await rustig(o);
        if (regels) await storing(o.page, regels);
        await volgStatus(o.page);
        fase = 1;
        await addBood(o.page, 'X van mij');
        await until(async () => fase === 3, 4000, 'herstellezing');
        await wait(1500);
        assert(!(await vraagZichtbaar(o.page, 300)), 'Vraag bij een veilige afhandeling');
        const st = await syncText(o.page);
        if (!regels) {
          assert(VEILIG.test(st) && !Object.keys(await journalen(o.page)).length, 'Niet afgehandeld: ' + st);
        } else {
          assert(!VEILIG.test(st) && !(await statussen(o.page)).slice(1).some(t => VEILIG.test(t)), 'Toonde "opgeslagen/bijgewerkt" terwijl het afhandelen niet duurzaam lukte: ' + st);
          assert(Object.keys(await journalen(o.page)).length === 1, 'Record weg terwijl de afgehandelde toestand niet vastligt');
        }
        assert(['X van mij', 'Y van ander'].every(t => boodTexts(o.state.db).includes(t)), 'Testopzet: server heeft niet X + Y');
        serverWrite(o.state, db => { db.boodschappen = db.boodschappen.filter(b => b.text !== 'X van mij'); }); // ander toestel
        await geenStoring(o.page);
        const p0 = bw.puts;
        await o.page.reload(); fase = 4;
        await wait(3000);
        const vraag = await vraagZichtbaar(o.page, 300);
        assert(!boodTexts(o.state.db).includes('X van mij'), 'X is teruggekomen op de server');
        if (vraag) {
          // Alleen als de afgehandelde toestand niet was vastgelegd: dan is de uitkomst weer onzeker.
          assert(naam === 'record → afgehandeld mislukt' && bw.puts === p0, 'Onverwachte vraag of schrijfactie');
          await vraagBeantwoord(o.page, false); await wait(1500);
        }
        assert(!boodTexts(o.state.db).includes('X van mij') && !(await appToont(o.page, 'X van mij')), 'X teruggekomen');
        assert(boodTexts(o.state.db).includes('Y van ander'), 'Y verloren');
        assert(!Object.keys(await journalen(o.page)).length, 'Journaal niet opgeruimd na herstel');
        await o.ctx.close();
      };
    });
    return out;
  })(),

  // ── Blocker 3: de keuze-route verliest geen onafhankelijke wijzigingen ────────────────────────
  async 'Keuze "opnieuw toepassen" + geschiedenis van een ander (lijst zonder id): niets schrijven, beide bewaard'(ctx) {
    const { o, bw } = await onzeker(ctx, {
      actie: p => afvinken(p, 'Melk'),
      anders: db => { db.boodschappen.forEach(b => { if (b.text === 'Brood') b.done = true; }); db.boodschappenHistory.push({ text: 'Brood', norm: 'brood', date: '2026-10-02' }); }
    });
    const p0 = bw.puts;
    await o.page.click('#confirmOkBtn');
    await wait(2000);
    assert(bw.puts === p0, 'Geschreven terwijl de geschiedenis van het andere toestel verloren zou gaan');
    assert(o.state.db.boodschappenHistory.some(h => h.norm === 'brood'), 'Geschiedenis van het andere toestel weg');
    assert(/niet zonder verlies/.test(await syncText(o.page)), 'Geen eerlijke melding: ' + await syncText(o.page));
    assert(Object.keys(await journalen(o.page)).length === 1, 'Onzekerheid niet meer vastgelegd');
    assert((await cacheData(o.page)).boodschappen.find(b => b.text === 'Melk').done === true, 'Lokale wijziging weg');
    await o.ctx.close();
  },

  async 'Keuze "server laten" + geschiedenis van een ander: die blijft, de onzekere wijziging vervalt'(ctx) {
    const { o, bw } = await onzeker(ctx, {
      actie: p => afvinken(p, 'Melk'),
      anders: db => { db.boodschappenHistory.push({ text: 'Brood', norm: 'brood', date: '2026-10-02' }); }
    });
    await o.page.click('#confirmCancelBtn');
    await until(async () => !Object.keys(await journalen(o.page)).length, 4000, 'afgehandeld');
    await wait(1000);
    assert(o.state.db.boodschappenHistory.some(h => h.norm === 'brood'), 'Geschiedenis van het andere toestel weg');
    assert(!o.state.db.boodschappen.find(b => b.text === 'Melk').done, '"Server laten" paste de onzekere wijziging toch toe');
    assert(bw.zonderIfMatch === 0, 'Onvoorwaardelijk geschreven');
    await o.ctx.close();
  },

  async 'Keuze "server laten" + latere lokale geschiedenis + geschiedenis van een ander: niets schrijven'(ctx) {
    const { o, bw } = await onzeker(ctx, {
      actie: p => addBood(p, 'Onzeker H1'),
      anders: db => { db.boodschappenHistory.push({ text: 'Brood', norm: 'brood', date: '2026-10-02' }); }
    });
    await vraagWeg(o.page);
    await afvinken(o.page, 'Melk'); // lokaal: geschiedenis + Melk, ná de onzekere schrijfactie
    await wait(600);
    const p0 = bw.puts;
    await refresh(o.page);
    await vraagBeantwoord(o.page, false);
    await wait(2000);
    assert(bw.puts === p0, 'Geschreven terwijl lokale en andermans geschiedenis botsen');
    assert(o.state.db.boodschappenHistory.some(h => h.norm === 'brood'), 'Geschiedenis van het andere toestel weg');
    assert(/niet zonder verlies/.test(await syncText(o.page)), 'Geen eerlijke melding: ' + await syncText(o.page));
    await o.ctx.close();
  },

  async 'Keuze bij geneste/gemengde wijzigingen van een ander: beide keuzes behouden ze'(ctx) {
    for (const opnieuw of [true, false]) {
      const { o, bw } = await onzeker(ctx, {
        actie: p => addBood(p, 'Genest ' + opnieuw),
        anders: db => {
          db.vakanties[0].budget.bedrag = 3100;                                   // genest veld
          db.vakanties[0].budget.uitgaven.push({ desc: 'Skiles', amount: 90 });  // geneste lijst zonder id
          db.vakanties[0].paklijst.Bas.push({ id: 'p-muts', text: 'Muts', done: false }); // geneste id-lijst
        }
      });
      await o.page.click(opnieuw ? '#confirmOkBtn' : '#confirmCancelBtn');
      await until(async () => !Object.keys(await journalen(o.page)).length, 5000, 'afgehandeld');
      await wait(1000);
      const v = o.state.db.vakanties[0];
      assert(v.budget.bedrag === 3100 && v.budget.uitgaven.some(u => u.desc === 'Skiles') && v.paklijst.Bas.some(p => p.id === 'p-muts'), (opnieuw ? 'opnieuw' : 'laten') + ': geneste wijziging van een ander verloren');
      assert(boodTexts(o.state.db).includes('Genest ' + opnieuw) === opnieuw, (opnieuw ? 'opnieuw' : 'laten') + ': onzekere wijziging verkeerd afgehandeld');
      assert(bw.zonderIfMatch === 0, 'Onvoorwaardelijk geschreven');
      await o.ctx.close();
    }
  },

  async 'Keuze: bewerking en verwijdering van een ander tussen tonen en beantwoorden'(ctx) {
    for (const opnieuw of [true, false]) {
      const { o, bw } = await onzeker(ctx, {
        actie: p => afvinken(p, 'Brood'),
        anders: db => { db.notitieboek = 'Notitie van een ander'; }
      });
      // Terwijl de vraag openstaat: een ander bewerkt Brood (ander veld) en verwijdert Appels.
      serverWrite(o.state, db => {
        db.boodschappen.forEach(b => { if (b.text === 'Brood') b.text = 'Bruin brood'; });
        db.boodschappen = db.boodschappen.filter(b => b.text !== 'Appels');
      });
      await o.page.click(opnieuw ? '#confirmOkBtn' : '#confirmCancelBtn');
      await until(async () => !Object.keys(await journalen(o.page)).length, 5000, 'afgehandeld');
      await wait(1000);
      const tx = boodTexts(o.state.db), brood = o.state.db.boodschappen.find(b => b.id === 'b-brood');
      const w = opnieuw ? 'opnieuw' : 'laten';
      assert(!tx.includes('Appels'), w + ': verwijdering van een ander teruggedraaid');
      assert(brood && brood.text === 'Bruin brood', w + ': bewerking van een ander teruggedraaid: ' + JSON.stringify(brood));
      assert(o.state.db.notitieboek === 'Notitie van een ander', w + ': andere wijziging verloren');
      assert(!!brood.done === opnieuw, w + ': onzekere wijziging verkeerd afgehandeld');
      assert(bw.zonderIfMatch === 0, 'Onvoorwaardelijk geschreven');
      await o.ctx.close();
    }
  },

  async 'Keuze met meerdere nieuwe lokale wijzigingen na de onzekere schrijfactie'(ctx) {
    for (const opnieuw of [true, false]) {
      const { o, bw } = await onzeker(ctx, {
        actie: p => addBood(p, 'Onzeker M'),
        anders: db => { db.inbox = (db.inbox || []).concat([{ id: 'in-ander', text: 'Van een ander' }]); }
      });
      await vraagWeg(o.page);
      await addBood(o.page, 'Later 1');
      await addBood(o.page, 'Later 2');
      await afvinken(o.page, 'Brood');
      await wait(800);
      await refresh(o.page);
      await vraagBeantwoord(o.page, opnieuw);
      await until(async () => boodTexts(o.state.db).includes('Later 2'), 6000, 'latere wijzigingen opgeslagen');
      await wait(800);
      const tx = boodTexts(o.state.db);
      assert(tx.includes('Later 1') && o.state.db.boodschappen.find(b => b.text === 'Brood').done === true, 'Latere lokale wijziging verloren');
      assert(tx.includes('Onzeker M') === opnieuw, 'Onzekere wijziging verkeerd afgehandeld');
      assert((o.state.db.inbox || []).some(i => i.id === 'in-ander'), 'Wijziging van een ander verloren');
      assert(bw.zonderIfMatch === 0, 'Onvoorwaardelijk geschreven');
      await o.ctx.close();
    }
  },

  // ── Punt 4: meerdere vensters op hetzelfde toestel ────────────────────────────────────────────
  async 'Tweede venster tijdens een open opslag: wacht, overschrijft en wist niets, gaat daarna verder'(ctx) {
    let fase = 0;
    const bw = bewaker(info => { if (info.method === 'PUT' && fase === 1) { fase = 2; return { delay: 4000 }; } });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest, timeouts: { gate: 700 } });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Venster A');
    await until(async () => fase === 2, 3000, 'PUT van A onderweg');
    const voor = await journalen(o.page);
    const b = await o.ctx.newPage();
    await b.clock.setFixedTime(FIXED_NOW);
    const p0 = bw.puts;
    await b.goto(o.url); await b.waitForTimeout(800);
    assert(await gateZichtbaar(b), 'Tweede venster ging verder terwijl het eerste een opslag open had');
    assert(JSON.stringify(await journalen(b)) === JSON.stringify(voor), 'Record van venster A aangeraakt');
    assert(bw.puts === p0, 'Tweede venster schreef');
    await until(async () => !(await gateZichtbaar(b)), 8000, 'tweede venster gaat verder');
    await until(() => appToont(b, 'Venster A'), 4000, 'tweede venster ziet de wijziging');
    assert(boodTexts(o.state.db).filter(x => x === 'Venster A').length === 1, 'Niet precies één keer');
    await o.ctx.close();
  },

  async 'Twee vensters schrijven tegelijk: elk een eigen record, geen van beide wist dat van de ander'(ctx) {
    let fase = 0;
    const bw = bewaker(info => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return { delay: 3000 }; }
      if (info.method === 'PUT' && fase === 2) { fase = 3; return { delay: 800 }; }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o);
    const b = await o.ctx.newPage();
    await b.clock.setFixedTime(FIXED_NOW);
    await b.goto(o.url);
    await until(async () => VEILIG.test(await b.textContent('#syncText')), 5000, 'venster B in rust');
    await wait(500);
    fase = 1;
    await addBood(o.page, 'Tegelijk A');
    await until(async () => fase === 2, 3000, 'PUT van A onderweg');
    const [idA] = await ids(o.page);
    const kA = JPRE + '_' + idA;
    const rawA = (await journalen(o.page))[kA];
    // B schrijft terwijl A nog wacht; B's eigen record staat dan naast dat van A.
    await addBood(b, 'Tegelijk B');
    await until(async () => fase === 3, 3000, 'PUT van B onderweg');
    const beide = await ids(b);
    assert(beide.length === 2 && beide.includes(idA), 'Geen twee eigen records naast elkaar: ' + JSON.stringify(beide));
    await until(async () => boodTexts(o.state.db).includes('Tegelijk B'), 4000, 'B opgeslagen');
    await wait(300);
    const j = await journalen(b);
    assert(j[kA] === rawA, 'Record van A gewist, overschreven of overgenomen door B: ' + JSON.stringify(Object.keys(j)));
    assert(Object.keys(j).length === 1, 'Record van B niet opgeruimd');
    await until(async () => ['Tegelijk A', 'Tegelijk B'].every(t => boodTexts(o.state.db).includes(t)), 8000, 'beide opgeslagen');
    await until(async () => !Object.keys(await journalen(b)).length, 4000, 'beide records opgeruimd');
    assert(bw.zonderIfMatch === 0, 'Onvoorwaardelijk geschreven');
    await o.ctx.close();
  },

  async 'Verweesd record (venster gesloten midden in een opslag): pas daarna overgenomen en hersteld'(ctx) {
    let fase = 0;
    const bw = bewaker(info => { if (info.method === 'PUT' && fase === 1) { fase = 2; return 'hang'; } });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest, timeouts: { gate: 700 } });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Wees W');
    await until(async () => fase === 2, 3000, 'PUT hangt');
    const [idA] = await ids(o.page);
    const b = await o.ctx.newPage();
    await b.clock.setFixedTime(FIXED_NOW);
    await b.goto(o.url); await b.waitForTimeout(1500);
    assert(await gateZichtbaar(b), 'Record van een levend venster overgenomen');
    assert(JSON.parse((await journalen(b))[JPRE + '_' + idA]).owner === idA, 'Eigenaar gewijzigd terwijl A nog leefde');
    await o.page.close(); // A weg (zoals een crash): de browser geeft het lock vrij
    fase = 3;
    assert(await vraagZichtbaar(b, 8000), 'Verweesd record niet overgenomen en hersteld');
    const eig = JSON.parse((await journalen(b))[JPRE + '_' + idA]).owner;
    assert(eig && eig !== idA, 'Record niet op naam van het nieuwe venster: ' + eig);
    await b.click('#confirmOkBtn');
    await until(async () => boodTexts(o.state.db).includes('Wees W'), 5000, 'na de keuze opgeslagen');
    await until(async () => !Object.keys(await journalen(b)).length, 4000, 'record opgeruimd');
    await o.ctx.close();
  },

  async 'Zonder Web Locks: een record van een ander venster wordt nooit overgenomen (open, gesloten of gecrasht)'(ctx) {
    for (const afloop of ['levend', 'gesloten', 'gecrasht']) {
      let fase = 0;
      const bw = bewaker(info => { if (info.method === 'PUT' && fase === 1) { fase = 2; return afloop === 'levend' ? { delay: 5000 } : 'hang'; } });
      const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest, timeouts: { gate: 400 }, initScript: GEEN_LOCKS + STORING_SRC });
      await rustig(o); fase = 1;
      assert(await o.page.evaluate(() => !navigator.locks), 'Testopzet: Web Locks nog aanwezig');
      await addBood(o.page, 'Geen lock ' + afloop);
      await until(async () => fase === 2, 3000, 'PUT onderweg');
      const [idA] = await ids(o.page);
      const kA = JPRE + '_' + idA, rawA = (await journalen(o.page))[kA];
      const b = await o.ctx.newPage();
      await b.clock.setFixedTime(FIXED_NOW);
      await b.goto(o.url); await b.waitForTimeout(1200);
      assert(await gateZichtbaar(b) && /niet veilig vaststellen/.test(await b.textContent('#journalGateText')), afloop + ': geen eerlijke herstelstatus');
      if (afloop === 'gecrasht') await storing(o.page, [{ op: 'set', key: '^plannerJournal_', n: -1 }]);
      if (afloop !== 'levend') await o.page.close();
      if (afloop === 'levend') {
        // Het venster dat de opslag begon, rondt hem zelf af; daarna gaat B vanzelf verder.
        await until(async () => !(await gateZichtbaar(b)), 9000, 'B gaat verder als A klaar is');
        await until(() => appToont(b, 'Geen lock levend'), 4000, 'B ziet de wijziging');
      } else {
        await wait(3000);
        const j = await journalen(b);
        assert(await gateZichtbaar(b), afloop + ': B ging toch verder');
        assert(j[kA] && JSON.parse(j[kA]).owner === idA && JSON.parse(j[kA]).local === JSON.parse(rawA).local, afloop + ': record overgenomen, gewijzigd of verwijderd');
        assert(!(await vraagZichtbaar(b, 300)), afloop + ': toch hersteld');
      }
      await o.ctx.close();
    }
  },

  // ── Vierde Codex-review, B1: een oudere cache vervangt nooit een nieuwer duurzaam record ───────
  // X bevestigd; opruimen van het record mislukt; Z erbij; het record ('settled', X+Z) lukt, de cache
  // niet; herladen. Z moet blijven, en het record mag pas weg als het herstel aantoonbaar veilig is.
  // Ook met storingen tijdens het herstel: cache niet te lezen, cache niet te schrijven, record niet
  // te schrijven.
  ...(() => {
    const out = {};
    const varianten = [
      ['geen storing bij herstel', null],
      ['cache niet te lezen bij herstel', [{ op: 'get', key: '^plannerCache_', n: 3 }]],
      ['cache niet te schrijven bij herstel', [{ op: 'set', key: '^plannerCache_', n: -1 }]],
      ['record niet te schrijven bij herstel', [{ op: 'set', key: '^plannerJournal_', n: -1 }]]
    ];
    varianten.forEach(([naam, bijHerstel]) => {
      out['B1: oudere cache vervangt nooit het nieuwere record (X, opruimen mislukt, Z, cache mislukt, herladen; ' + naam + ')'] = async ctx => {
        const bw = bewaker();
        const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest, timeouts: { gate: 500 }, initScript: STORING_SRC });
        await rustig(o);
        await storing(o.page, [{ op: 'remove', key: '^plannerJournal_', n: -1 }]);
        await addBood(o.page, 'X B1');
        await until(async () => boodTexts(o.state.db).includes('X B1'), 4000, 'X bevestigd');
        await wait(600);
        let rec = await eenRecord(o.page);
        assert(rec && rec.state === 'settled' && rec.local.includes('X B1'), 'Testopzet: record niet blijven staan na mislukt opruimen');
        await storing(o.page, [{ op: 'remove', key: '^plannerJournal_', n: -1 }, { op: 'set', key: '^plannerCache_', n: -1 }]);
        const p0 = bw.puts;
        await addBood(o.page, 'Z B1');
        await wait(1200);
        rec = await eenRecord(o.page);
        const c = await o.page.evaluate(k => JSON.parse(localStorage.getItem(k)), CKEY);
        assert(rec.state === 'settled' && rec.local.includes('Z B1'), 'Z niet duurzaam in het record');
        assert(!JSON.stringify(c.data).includes('Z B1') && JSON.stringify(c.data).includes('X B1') && c.jrev < rec.rev, 'Testopzet: cache is niet de oudere stand X');
        assert(bw.puts === p0 && /Lokaal bewaren mislukt/.test(await syncText(o.page)), 'Verstuurd of geen eerlijke melding: ' + await syncText(o.page));
        await geenStoring(o.page);
        if (bijHerstel) await o.page.evaluate(r => sessionStorage.setItem('__storing', JSON.stringify(r)), bijHerstel);
        await o.page.reload();
        const leesStoring = naam === 'cache niet te lezen bij herstel';
        await wait(leesStoring ? 400 : 2500);
        if (leesStoring) assert(await gateZichtbaar(o.page), 'Geen blokkade bij een onleesbare cache');
        if (bijHerstel) {
          // Tijdens de storing: het record staat er nog en bevat Z.
          const r2 = await eenRecord(o.page);
          assert(r2 && r2.local.includes('Z B1'), naam + ': record weg of zonder Z tijdens een storing');
          await geenStoring(o.page);
          if (!leesStoring) await o.page.reload(); // anders herstelt de app vanzelf
        }
        await until(async () => boodTexts(o.state.db).includes('Z B1'), 8000, naam + ': Z opgeslagen na herstel');
        await wait(800);
        assert(await appToont(o.page, 'Z B1') && await appToont(o.page, 'X B1'), naam + ': Z of X niet in de app');
        assert(boodTexts(o.state.db).filter(t => t === 'Z B1').length === 1 && boodTexts(o.state.db).filter(t => t === 'X B1').length === 1, naam + ': niet precies één keer');
        await until(async () => !Object.keys(await journalen(o.page)).length, 4000, naam + ': record opgeruimd na veilig herstel');
        await o.ctx.close();
      };
    });
    return out;
  })(),

  // ── Vierde Codex-review, B2: fencing — een hervatte oude eigenaar muteert niets meer ──────────
  // ── Vijfde Codex-review: check-to-write race zonder Web Locks ─────────────────────────────────
  // Exact de Codex-interleaving: A passeert de eigenaarscontrole en pauzeert (synchroon) vlak vóór de
  // schrijfactie: het record naar 'settled', de cache, of het opruimen van het record. Intussen
  // probeert B over te nemen en (als dat lukt) Z toe te voegen. Daarna hervat A.
  // Bewijs: B neemt zonder Web Locks nooit over, dus er is geen herstelbewijs van B dat A kan
  // overschrijven of verwijderen; X staat precies één keer op de server en een Z die ooit duurzaam
  // was, overleeft een crash/herladen van B.
  ...(() => {
    const out = {};
    const grenzen = [
      ['record → afgehandeld', { op: 'pauze-set', key: '^plannerJournal_', val: '"state":"settled"', n: 1, ms: 8000 }, 'sending'],
      // De cache-schrijfactie in settle(): de enige waarvan de basis al X bevat.
      ['cache-schrijven', { op: 'pauze-set', key: '^plannerCache_', val: '\\\\"Race R5\\\\"', n: 1, ms: 8000 }, 'settled'],
      ['opruimen van het record', { op: 'pauze-remove', key: '^plannerJournal_', n: 1, ms: 8000 }, 'settled']
    ];
    grenzen.forEach(([naam, regel, toestand]) => {
      out['R5: zonder Web Locks — A pauzeert na de eigenaarscontrole vóór ' + naam + '; B probeert over te nemen; A hervat: niets verloren'] = async ctx => {
        let fase = 0;
        const bw = bewaker(info => {
          if (info.method === 'PUT' && fase === 1) { fase = 2; return { delay: 200 }; }
          if (info.method === 'GET' && fase === 3 && /\/planners\/[^/]+\.json/.test(info.url)) { fase = 4; return 'hang'; } // herstellezing van B (als B overneemt)
        });
        // hb/stale: alleen relevant voor de oude code (tegenproef), die zonder Web Locks op hartslag overnam.
        const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest, timeouts: { gate: 300, get: 60000, hb: 300, stale: 1000 }, initScript: GEEN_LOCKS + STORING_SRC, realClock: true, localStorage: { briefingShown: VANDAAG() } });
        await rustig(o);
        await storing(o.page, [regel]);
        fase = 1;
        await addBood(o.page, 'Race R5');
        await wait(1500); // A staat nu stil in settle(), na zijn eigenaarscontrole
        fase = 3;
        const b = await o.ctx.newPage();
        await b.goto(o.url); await b.waitForTimeout(2500);
        // A staat stil, dus zijn record moet er nog precies zo staan. Is het weg of van eigenaar
        // gewisseld, dan heeft B het van een levend venster overgenomen (alleen de oude code).
        const j0 = await journalen(b), sleutels = Object.keys(j0);
        assert(sleutels.length <= 1, 'Testopzet: meer dan één record');
        const kA = sleutels[0], idA = kA ? kA.slice(JPRE.length + 1) : null;
        const overgenomen = !kA || JSON.parse(j0[kA]).owner !== idA;
        if (!overgenomen) assert(JSON.parse(j0[kA]).state === toestand, naam + ': testopzet — A pauzeert niet op de bedoelde grens (record ' + JSON.parse(j0[kA]).state + ')');
        let zToegevoegd = false;
        if (!(await gateZichtbaar(b))) { await addBood(b, 'Z R5'); zToegevoegd = true; await wait(800); }
        const zDuurzaam = zToegevoegd && (JSON.stringify(await journalen(b)).includes('Z R5') || ((await b.evaluate(k => localStorage.getItem(k), CKEY)) || '').includes('Z R5'));
        // A hervat en rondt af.
        await until(async () => !Object.keys(await journalen(b)).length, 15000, naam + ': A rondt zijn opslag af');
        await wait(1500);
        // B crasht/herlaadt.
        await b.reload(); await wait(3000);
        if (zDuurzaam) assert(boodTexts(o.state.db).includes('Z R5') || await appToont(b, 'Z R5'), naam + ': Z was duurzaam bewaard en is verloren gegaan');
        assert(!overgenomen && !zToegevoegd, naam + ': B nam zonder Web Locks het record over van een venster dat nog leefde');
        assert(boodTexts(o.state.db).filter(t => t === 'Race R5').length === 1, naam + ': X niet precies één keer op de server');
        // Daarna gaat B gewoon verder.
        await until(async () => !(await gateZichtbaar(b)), 5000, naam + ': B blijft geblokkeerd na A\'s afronding');
        await addBood(b, 'Na race R5');
        await until(async () => boodTexts(o.state.db).includes('Na race R5'), 6000, naam + ': B schrijft daarna gewoon');
        await o.ctx.close();
      };
    });
    return out;
  })(),

  async 'B2: met Web Locks — een gepauzeerd maar levend venster wordt nooit overgenomen'(ctx) {
    let fase = 0;
    const bw = bewaker(info => { if (info.method === 'PUT' && fase === 1) { fase = 2; return { delay: 5000 }; } });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest, timeouts: { gate: 400, hb: 300, stale: 1000 }, initScript: STORING_SRC });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Levend L');
    await until(async () => fase === 2, 3000, 'PUT onderweg');
    const [idA] = await ids(o.page);
    await storing(o.page, [{ op: 'set', key: '^plannerJournal_', n: -1 }]); // geen hartslag meer
    const b = await o.ctx.newPage();
    await b.clock.setFixedTime(FIXED_NOW);
    await b.goto(o.url);
    await wait(2500);
    assert(await gateZichtbaar(b), 'Levend venster overgenomen');
    assert(JSON.parse((await journalen(b))[JPRE + '_' + idA]).owner === idA, 'Eigenaar gewijzigd terwijl A leefde');
    await geenStoring(o.page);
    await until(async () => !(await gateZichtbaar(b)), 8000, 'B gaat verder als A klaar is');
    await until(() => appToont(b, 'Levend L'), 4000, 'B ziet de wijziging');
    await o.ctx.close();
  },

  async 'B2: met Web Locks — twee vensters claimen tegelijk een verweesd record — precies één neemt het over'(ctx) {
    for (const zonderLocks of [false]) { // zonder Web Locks wordt er nooit overgenomen (zie hierboven)
      const geenLocks = '';
      let fase = 0;
      const bw = bewaker(info => { if (info.method === 'PUT' && fase === 1) { fase = 2; return 'hang'; } });
      const extra = zonderLocks ? { realClock: true, localStorage: { briefingShown: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }) } } : {};
      const o = await open(ctx, Object.assign({ data: readFixture('huishouden.json'), onRequest: bw.onRequest, timeouts: { gate: 300, hb: 300, stale: 1000 }, initScript: geenLocks + STORING_SRC }, extra));
      await rustig(o); fase = 1;
      await addBood(o.page, 'Wees ' + zonderLocks);
      await until(async () => fase === 2, 3000, 'PUT hangt');
      const [idA] = await ids(o.page);
      await storing(o.page, [{ op: 'set', key: '^plannerJournal_', n: -1 }]); // crash zonder vrijgeven
      await o.page.close();
      const [b, c] = await Promise.all([o.ctx.newPage(), o.ctx.newPage()]);
      if (!zonderLocks) { await b.clock.setFixedTime(FIXED_NOW); await c.clock.setFixedTime(FIXED_NOW); }
      await Promise.all([b.goto(o.url), c.goto(o.url)]);
      const [vb, vc] = await Promise.all([vraagZichtbaar(b, 8000), vraagZichtbaar(c, 8000)]);
      assert(vb !== vc, (zonderLocks ? 'zonder' : 'met') + ' Web Locks: ' + (vb ? 'beide vensters namen het record over' : 'geen venster nam het record over'));
      const eig = JSON.parse((await journalen(b))[JPRE + '_' + idA]).owner;
      assert(eig && eig !== idA, 'Record niet op naam van het overnemende venster');
      const winnaar = vb ? b : c, ander = vb ? c : b;
      assert(await gateZichtbaar(ander), 'Het andere venster wacht niet');
      await winnaar.click('#confirmOkBtn');
      await until(async () => !Object.keys(await journalen(winnaar)).length, 6000, 'record opgeruimd');
      await until(async () => !(await gateZichtbaar(ander)), 6000, 'het andere venster gaat daarna verder');
      await until(async () => boodTexts(o.state.db).includes('Wees ' + zonderLocks), 5000, 'opgeslagen na de keuze');
      await wait(800);
      assert(boodTexts(o.state.db).filter(t => t === 'Wees ' + zonderLocks).length === 1, 'Niet precies één keer');
      await o.ctx.close();
    }
  }
};
