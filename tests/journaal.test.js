// 1.4.2, E2 — tweede Codex-herreview van PR #15: het schrijfjournaal (reload-veiligheid), de
// tijdslimiet over het hele antwoord, de strengere automatische acceptatie, de onzekerheidsvraag en
// overige ontbrekende tests. Alleen de testversie; alleen fictieve data.
'use strict';
const { readFixture, serverWrite, assert, DB_URL } = require('./lib');
const H = require('./schrijfhulp');
const { startNepDb } = require('./nepdb');
const { wait, boodTexts, syncText, journaal, addBood, afvinken, refresh, until, bewaker, open, rustig, vraagZichtbaar, vraagBeantwoord, volgStatus, statussen, VEILIG } = H;

// Na herladen: geen PUT vóór de herstellezing, en nooit "opgeslagen/bijgewerkt" zolang de onzekerheid
// open is. Geeft het aantal PUT's ná herladen terug.
async function naHerladenVeilig(o, bw, ms) {
  const p0 = bw.puts;
  await volgStatus(o.page);
  await wait(ms || 2500);
  const st = await statussen(o.page);
  assert(!st.some(t => VEILIG.test(t)), 'Toonde "opgeslagen/bijgewerkt" met een open onzekerheid: ' + st.join(' | '));
  return bw.puts - p0;
}

module.exports = {
  // ── Blocker 1: reload-veiligheid ──────────────────────────────────────────────────────────────
  async 'Journaal: staat er vóór de PUT de deur uit gaat (verzonden inhoud + oude basis)'(ctx) {
    let fase = 0, gezien = null;
    const bw = bewaker(info => { if (info.method === 'PUT' && fase === 1) { fase = 2; return 'hang'; } });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Journaal J0');
    await until(async () => fase === 2, 3000, 'PUT onderweg');
    gezien = await journaal(o.page);
    assert(gezien && gezien.state === 'sending' && gezien.sent.includes('Journaal J0') && typeof gezien.oldBase === 'string' && !gezien.oldBase.includes('Journaal J0'), 'Journaal tijdens de PUT: ' + JSON.stringify(gezien && { state: gezien.state }));
    await o.ctx.close();
  },

  async 'Reload tijdens PUT (niet verwerkt): geen automatische schrijfactie, geen "opgeslagen", één vraag'(ctx) {
    let fase = 0;
    const bw = bewaker(info => { if (info.method === 'PUT' && fase === 1) { fase = 2; return 'hang'; } });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Reload J1');
    await until(async () => fase === 2, 3000, 'PUT onderweg');
    await o.page.reload(); fase = 3;
    const puts = await naHerladenVeilig(o, bw, 2000);
    assert(puts === 0, 'Na herladen automatisch geschreven (' + puts + 'x)');
    assert(await vraagZichtbaar(o.page), 'Geen vraag na herladen met een onzekere PUT');
    assert(/Reload J1/.test(await o.page.textContent('#confirmTitle')), 'Vraag noemt de onzekere wijziging niet');
    await o.page.click('#confirmOkBtn');
    await until(async () => boodTexts(o.state.db).includes('Reload J1'), 5000, 'opgeslagen na de keuze');
    assert(boodTexts(o.state.db).filter(t => t === 'Reload J1').length === 1 && bw.zonderIfMatch === 0, 'Niet precies één keer of onvoorwaardelijk');
    await until(async () => (await journaal(o.page)) === null, 3000, 'journaal opgeruimd');
    await o.ctx.close();
  },

  async 'Reload tijdens PUT die de server al verwerkte: automatisch bevestigd, geen vraag, niets dubbel'(ctx) {
    let fase = 0;
    const bw = bewaker(info => { if (info.method === 'PUT' && fase === 1) { fase = 2; return { delay: 8000, commitFirst: true }; } });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    const p0 = o.state.puts;
    await addBood(o.page, 'Reload J2');
    await until(async () => fase === 2, 3000, 'PUT onderweg');
    await o.page.reload(); fase = 3;
    await until(async () => VEILIG.test(await syncText(o.page)), 6000, 'bevestigd na herladen');
    assert(!(await vraagZichtbaar(o.page, 800)), 'Onnodige vraag: de server had onze versie al');
    assert(o.state.puts - p0 === 1 && boodTexts(o.state.db).filter(t => t === 'Reload J2').length === 1, 'Dubbel geschreven');
    assert((await journaal(o.page)) === null, 'Journaal niet opgeruimd');
    await o.ctx.close();
  },

  async 'Reload na verloren antwoord, herstellezing hangt, ander toestel verwijdert: niets terugdraaien'(ctx) {
    let fase = 0;
    const bw = bewaker(info => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
      if (info.method === 'GET' && fase === 2) { fase = 3; return 'hang'; }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Weg J3');
    await until(async () => fase === 3, 4000, 'herstellezing hangt');
    serverWrite(o.state, db => { db.boodschappen = db.boodschappen.filter(b => b.text !== 'Weg J3'); }); // ander toestel
    await o.page.reload(); fase = 4;
    const puts = await naHerladenVeilig(o, bw);
    assert(puts === 0 && !boodTexts(o.state.db).includes('Weg J3'), 'Verwijdering van het andere toestel teruggedraaid');
    await vraagBeantwoord(o.page, false);
    await wait(1500);
    assert(!boodTexts(o.state.db).includes('Weg J3') && (await journaal(o.page)) === null, 'Na "server laten" toch terug, of journaal blijft staan');
    await o.ctx.close();
  },

  async 'Reload tijdens hangende herstellezing, ander toestel wijzigt het item: wijziging blijft'(ctx) {
    let fase = 0;
    const bw = bewaker(info => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
      if (info.method === 'GET' && fase === 2) { fase = 3; return 'hang'; }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Gewijzigd J4');
    await until(async () => fase === 3, 4000, 'herstellezing hangt');
    serverWrite(o.state, db => { db.boodschappen.forEach(b => { if (b.text === 'Gewijzigd J4') b.done = true; }); });
    await o.page.reload(); fase = 4;
    const puts = await naHerladenVeilig(o, bw);
    const item = o.state.db.boodschappen.find(b => b.text === 'Gewijzigd J4');
    assert(puts === 0 && item && item.done === true, 'Wijziging van het andere toestel teruggedraaid');
    assert(await vraagZichtbaar(o.page), 'Geen vraag');
    await o.ctx.close();
  },

  async 'Reload na mislukte herstellezing, ander toestel verwijdert: niets terugdraaien'(ctx) {
    let fase = 0;
    const bw = bewaker(info => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
      if (info.method === 'GET' && fase === 2) { fase = 3; return 'abort'; }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Weg J5');
    await until(async () => fase === 3, 4000, 'herstellezing mislukt');
    const j = await journaal(o.page);
    assert(j && j.state === 'unknown', 'Journaal na mislukte herstellezing: ' + JSON.stringify(j && j.state));
    serverWrite(o.state, db => { db.boodschappen = db.boodschappen.filter(b => b.text !== 'Weg J5'); });
    await o.page.reload(); fase = 4;
    const puts = await naHerladenVeilig(o, bw);
    assert(puts === 0 && !boodTexts(o.state.db).includes('Weg J5'), 'Verwijdering teruggedraaid na herladen');
    assert(await vraagZichtbaar(o.page), 'Geen vraag');
    await o.ctx.close();
  },

  async 'Meerdere opeenvolgende verloren bevestigingen: elk afgehandeld, niets dubbel, geen vraag'(ctx) {
    let actief = false;
    const bw = bewaker(info => (info.method === 'PUT' && actief ? 'lost' : undefined));
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); actief = true;
    for (const t of ['Kwijt 1', 'Kwijt 2', 'Kwijt 3']) {
      await addBood(o.page, t);
      await until(async () => boodTexts(o.state.db).includes(t) && VEILIG.test(await syncText(o.page)), 6000, t + ' bevestigd');
    }
    ['Kwijt 1', 'Kwijt 2', 'Kwijt 3'].forEach(t => assert(boodTexts(o.state.db).filter(x => x === t).length === 1, t + ' niet precies één keer'));
    assert(!(await vraagZichtbaar(o.page, 500)) && (await journaal(o.page)) === null, 'Vraag of journaal over terwijl alles eenduidig was');
    await o.ctx.close();
  },

  async 'Meerdere verloren bevestigingen met herladen tussen de pogingen'(ctx) {
    let fase = 'normaal';
    const bw = bewaker(info => {
      if (info.method === 'PUT' && fase === 'kwijt') { fase = 'herstel'; return 'lost'; }
      if (info.method === 'GET' && fase === 'herstel') { fase = 'hangt'; return 'hang'; }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o);
    for (const t of ['Herlaad 1', 'Herlaad 2']) {
      fase = 'kwijt';
      await addBood(o.page, t);
      await until(async () => fase === 'hangt', 4000, t + ': herstellezing hangt');
      const p0 = o.state.puts;
      await o.page.reload(); fase = 'normaal';
      await until(async () => VEILIG.test(await syncText(o.page)), 6000, t + ': bevestigd na herladen');
      assert(o.state.puts === p0, t + ': na herladen opnieuw geschreven');
    }
    ['Herlaad 1', 'Herlaad 2'].forEach(t => assert(boodTexts(o.state.db).filter(x => x === t).length === 1, t + ' niet precies één keer'));
    assert(!(await vraagZichtbaar(o.page, 500)), 'Onnodige vraag');
    await o.ctx.close();
  },

  async 'Journaal niet te bewaren (opslag vol): niet versturen, eerlijke melding'(ctx) {
    const bw = bewaker();
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o);
    await o.page.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('plannerJournal_')) throw new DOMException('vol', 'QuotaExceededError'); return set.call(this, k, v); };
    });
    const p0 = bw.puts;
    await addBood(o.page, 'Zonder journaal'); await wait(1500);
    assert(bw.puts === p0, 'Verstuurd zonder duurzaam journaal');
    assert(/gepauzeerd/.test(await syncText(o.page)), 'Geen eerlijke melding: ' + await syncText(o.page));
    await o.ctx.close();
  },

  // ── Punt 2: tijdslimiet over het hele antwoord ────────────────────────────────────────────────
  async 'Herstellezing: headers binnen, body blijft hangen — begrensd, daarna veilig verder'(ctx) {
    const nep = await startNepDb(readFixture('huishouden.json'));
    try {
      const o = await open(ctx, { allowUrl: nep.url, timeouts: { get: 1500, put: 4000 }, localStorage: { plannerDbUrl: nep.url } });
      await until(async () => VEILIG.test(await syncText(o.page)), 6000, 'app in rust');
      await wait(800);
      nep.st.putAfbreken = 1; nep.st.bodyHangt = 1;
      const p0 = nep.st.puts, t0 = Date.now();
      await addBood(o.page, 'Body hangt');
      assert(await vraagZichtbaar(o.page, 9000), 'Coördinator kwam niet uit een hangende body: ' + nep.st.log.join(','));
      assert(Date.now() - t0 < 9000 && nep.st.log.includes('GET body hangt'), 'Body hing niet of te traag: ' + nep.st.log.join(','));
      assert(nep.st.puts === p0, 'Geschreven vóór een volledige herstellezing');
      await o.page.click('#confirmOkBtn');
      await until(async () => boodTexts(nep.st.db).includes('Body hangt'), 5000, 'opgeslagen na de keuze');
      await o.ctx.close();
    } finally { await nep.stop(); }
  },

  async 'Gewone leesactie: headers binnen, body blijft hangen — opslaan blijft daarna werken'(ctx) {
    const nep = await startNepDb(readFixture('huishouden.json'));
    try {
      const o = await open(ctx, { allowUrl: nep.url, timeouts: { get: 1500, put: 4000 }, localStorage: { plannerDbUrl: nep.url } });
      await until(async () => VEILIG.test(await syncText(o.page)), 6000, 'app in rust');
      await wait(800);
      nep.st.bodyHangt = 1;
      await refresh(o.page); await wait(2200); // de hangende leesactie is nu verlopen
      await addBood(o.page, 'Na hangende lezing');
      await until(async () => boodTexts(nep.st.db).includes('Na hangende lezing'), 5000, 'opslaan na hangende leesactie');
      await o.ctx.close();
    } finally { await nep.stop(); }
  },

  // ── Punt 3 (end-to-end): gelijke hypothesen, toch verlies bij een lijst zonder id ──────────────
  async 'Gelijke hypothesen met verlies (lijst zonder id): niet automatisch, beide kanten behouden'(ctx) {
    // Onze PUT (nieuwe boodschap) wordt verwerkt, het antwoord gaat verloren. Tijdens de herstellezing
    // vinkt de gebruiker Melk af (lokaal: boodschappenHistory + Melk); een ander toestel vinkt Brood
    // af (server: boodschappenHistory + Brood). "Lokaal wint" geeft onder beide hypothesen dezelfde
    // uitkomst, maar die verliest de geschiedenis van het andere toestel. Dus: vraag, niet schrijven.
    let fase = 0;
    const bw = bewaker(info => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
      if (info.method === 'GET' && fase === 2) { fase = 3; return { delay: 2500 }; }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Hyp J10');
    await until(async () => fase === 3, 4000, 'herstellezing onderweg');
    serverWrite(o.state, db => {
      db.boodschappen.forEach(b => { if (b.text === 'Brood') b.done = true; });
      (db.boodschappenHistory = db.boodschappenHistory || []).push({ text: 'Brood', norm: 'brood', date: '2026-10-02' });
    });
    await afvinken(o.page, 'Melk');
    const p0 = bw.puts;
    assert(await vraagZichtbaar(o.page, 6000), 'Automatisch samengevoegd terwijl de geschiedenis van het andere toestel verloren zou gaan');
    assert(bw.puts === p0, 'Toch geschreven');
    assert((o.state.db.boodschappenHistory || []).some(h => h.norm === 'brood'), 'Geschiedenis van het andere toestel weg');
    await o.ctx.close();
  },

  // ── Punt 4: de vraag ──────────────────────────────────────────────────────────────────────────
  async 'Vraag: serverwijziging tussen tonen en keuze gaat mee; schrijven daarna voorwaardelijk'(ctx) {
    let fase = 0;
    const bw = bewaker(info => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
      if (info.method === 'GET' && fase === 2) { fase = 3; serverWrite(info.state, db => { db.boodschappen = db.boodschappen.filter(b => b.text !== 'Keuze J11'); }); }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Keuze J11');
    assert(await vraagZichtbaar(o.page), 'Geen vraag');
    // Terwijl de vraag openstaat, wijzigt een ander toestel de server.
    serverWrite(o.state, db => { db.boodschappen.push({ id: 'tussendoor', text: 'Tussendoor', addedBy: 'Sanne', done: false }); });
    await o.page.click('#confirmOkBtn');
    await until(async () => boodTexts(o.state.db).includes('Keuze J11'), 5000, 'opnieuw toegepast');
    assert(boodTexts(o.state.db).includes('Tussendoor'), 'Serverwijziging tussen vraag en keuze verloren');
    assert(bw.zonderIfMatch === 0, 'Onvoorwaardelijk geschreven');
    await o.ctx.close();
  },

  async 'Vraag: noemt de onzekere wijzigingen; latere lokale wijzigingen blijven bij "server laten"'(ctx) {
    let fase = 0;
    const bw = bewaker(info => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
      if (info.method === 'GET' && fase === 2) { fase = 3; serverWrite(info.state, db => { db.boodschappen = db.boodschappen.filter(b => b.text !== 'Onzeker J12'); }); }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Onzeker J12');
    assert(await vraagZichtbaar(o.page), 'Geen vraag');
    const tekst = await o.page.textContent('#confirmTitle');
    assert(/boodschap toegevoegd “Onzeker J12”/.test(tekst) && /daarna nog hebt gewijzigd, blijft in beide gevallen bewaard/.test(tekst), 'Vraag: ' + tekst);
    // Vraag even weg (zoals bij een andere vraag ertussen) en een nieuwe lokale wijziging maken.
    await o.page.evaluate(() => document.getElementById('confirmOverlay').classList.remove('open'));
    await addBood(o.page, 'Later J12');
    await wait(800);
    assert(!boodTexts(o.state.db).includes('Later J12'), 'Geschreven terwijl de vraag openstaat');
    await refresh(o.page);
    await vraagBeantwoord(o.page, false);
    await until(async () => boodTexts(o.state.db).includes('Later J12'), 5000, 'latere wijziging opgeslagen');
    assert(!boodTexts(o.state.db).includes('Onzeker J12'), '"Server laten" paste de onzekere wijziging toch toe');
    await o.ctx.close();
  },

  // ── Punt 5: overige ontbrekende tests ─────────────────────────────────────────────────────────
  async 'Wijzigingen vóór, tijdens en direct na een leesactie; "opgeslagen" alleen als de server alles heeft'(ctx) {
    let houd = false;
    const bw = bewaker(info => {
      if (info.method === 'GET' && houd) return { delay: 1500, snapshot: true };
      if (info.method === 'PUT') return { delay: 700 }; // bevestiging telkens tegengehouden
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o);
    const lokaal = [], fouten = [];
    let stop = false;
    const steekproef = (async () => {
      while (!stop) {
        const t = await syncText(o.page);
        if (VEILIG.test(t) && /^Opgeslagen/.test(t)) {
          const op = boodTexts(o.state.db), mist = lokaal.filter(x => !op.includes(x));
          if (mist.length) fouten.push(t + ' terwijl de server mist: ' + mist.join(','));
        }
        await wait(60);
      }
    })();
    await addBood(o.page, 'Voor'); lokaal.push('Voor');
    houd = true; await refresh(o.page); await wait(200); houd = false;
    await addBood(o.page, 'Tijdens'); lokaal.push('Tijdens');
    await wait(1500);
    await addBood(o.page, 'Erna'); lokaal.push('Erna');
    await until(async () => lokaal.every(x => boodTexts(o.state.db).includes(x)), 8000, 'alles op de server');
    await wait(1000); stop = true; await steekproef;
    assert(!fouten.length, '"Opgeslagen" getoond terwijl de server nog niet alles had: ' + fouten.slice(0, 3).join(' | '));
    assert(bw.maxTegelijk === 1 && bw.zonderIfMatch === 0, 'Gelijktijdige of onvoorwaardelijke schrijfactie');
    await o.ctx.close();
  },

  async 'Geslaagde herstellezing zonder bruikbare ETag: niet blind schrijven, geen lus'(ctx) {
    let fase = 0;
    const bw = bewaker(info => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
      if (info.method === 'GET' && fase >= 2) return { noETag: true };
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    await addBood(o.page, 'Zonder ETag J14');
    await until(async () => boodTexts(o.state.db).includes('Zonder ETag J14'), 4000, 'verwerkt');
    const g0 = bw.log.length;
    await wait(3000);
    // Alleen leesacties op de planner tellen (niet de beveiligingscheck op planners.json).
    const lezingen = bw.urls.slice(g0).filter(u => /\/planners\/[^/]+\.json/.test(u));
    assert(lezingen.length <= 2, 'Leeslus zonder ETag: ' + lezingen.length + ' leesacties in 3 s');
    const p0 = bw.puts;
    await addBood(o.page, 'Daarna J14'); await wait(1200);
    assert(bw.puts === p0, 'Geschreven zonder bruikbare ETag');
    assert(/niet veilig/.test(await syncText(o.page)), 'Geen melding: ' + await syncText(o.page));
    await o.ctx.close();
  },

  async 'Geen snelle herhaallus: PUT en herstellezingen falen steeds'(ctx) {
    let actief = false;
    const bw = bewaker(info => (actief ? 'abort' : undefined));
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o);
    const g0 = bw.gets, p0 = bw.puts;
    actief = true;
    await addBood(o.page, 'Lus J15');
    await wait(7500);
    assert(bw.puts - p0 === 1, 'Opnieuw geschreven zonder geslaagde herstellezing: ' + (bw.puts - p0));
    assert(bw.gets - g0 <= 5, 'Te veel herstellezingen in 7,5 s (oplopende wachttijd ontbreekt): ' + (bw.gets - g0));
    assert(!VEILIG.test(await syncText(o.page)), 'Onterechte "opgeslagen"');
    await o.ctx.close();
  },

  async 'Lokale wijziging (afvinken) + verloren antwoord + ander toestel verwijdert dat item: niets terug'(ctx) {
    let fase = 0;
    const bw = bewaker(info => {
      if (info.method === 'PUT' && fase === 1) { fase = 2; return 'lost'; }
      if (info.method === 'GET' && fase === 2) { fase = 3; serverWrite(info.state, db => { db.boodschappen = db.boodschappen.filter(b => b.text !== 'Melk'); }); }
    });
    const o = await open(ctx, { data: readFixture('huishouden.json'), onRequest: bw.onRequest });
    await rustig(o); fase = 1;
    await afvinken(o.page, 'Melk');
    assert(await vraagZichtbaar(o.page), 'Geen vraag');
    await wait(800);
    assert(!boodTexts(o.state.db).includes('Melk'), 'Verwijdering van Melk door het andere toestel teruggedraaid');
    await vraagBeantwoord(o.page, false);
    await wait(1500);
    assert(!boodTexts(o.state.db).includes('Melk'), 'Na "server laten" toch terug');
    await o.ctx.close();
  }
};
