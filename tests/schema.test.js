// Dataformaat v1 (stap 0.13): het schema in docs/ beschrijft de echte data, en de app zet
// meta.schemaVersion alleen mee bij een opslag die toch al gebeurt, zonder iets anders te raken.
'use strict';
const fs = require('fs');
const path = require('path');
const { openApp, readFixture, clone, diffPaths, waitForPut, assert } = require('./lib');

const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'dataformaat-v1.schema.json'), 'utf8'));

// Kleine validator voor het deel van JSON Schema dat ons schema gebruikt (geen extra pakketten nodig).
function validate(schema, value, root = schema, at = '$', errs = []) {
  if (schema.$ref) {
    const def = schema.$ref.replace('#/', '').split('/').reduce((o, k) => o[k], root);
    return validate(def, value, root, at, errs);
  }
  (schema.allOf || []).forEach(s => validate(s, value, root, at, errs));
  if (schema.enum && !schema.enum.some(e => e === value)) errs.push(at + ': ' + JSON.stringify(value) + ' niet in ' + JSON.stringify(schema.enum));
  if (schema.type) {
    const types = [].concat(schema.type);
    const t = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    const ok = types.some(x => x === t || (x === 'integer' && Number.isInteger(value)));
    if (!ok) { errs.push(at + ': type ' + t + ', verwacht ' + types.join('/')); return errs; }
  }
  if (typeof value === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(at + ': "' + value + '" past niet op ' + schema.pattern);
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errs.push(at + ': kleiner dan ' + schema.minimum);
    if (schema.maximum != null && value > schema.maximum) errs.push(at + ': groter dan ' + schema.maximum);
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => validate(schema.items, v, root, at + '[' + i + ']', errs));
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    (schema.required || []).forEach(k => { if (!(k in value)) errs.push(at + ': veld ' + k + ' ontbreekt'); });
    Object.keys(value).forEach(k => {
      if (schema.propertyNames && schema.propertyNames.pattern && !new RegExp(schema.propertyNames.pattern).test(k)) errs.push(at + ': sleutel "' + k + '" ongeldig');
      if (schema.properties && schema.properties[k]) validate(schema.properties[k], value[k], root, at + '.' + k, errs);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') validate(schema.additionalProperties, value[k], root, at + '.' + k, errs);
    });
  }
  return errs;
}
function assertValid(data, label) {
  const errs = validate(SCHEMA, data);
  assert(errs.length === 0, label + ' voldoet niet aan het schema:\n    ' + errs.slice(0, 8).join('\n    '));
}

module.exports = {
  async 'testdata voldoet aan het schema, en het schema keurt fouten af'() {
    assertValid(readFixture('huishouden.json'), 'huishouden.json');
    assertValid(readFixture('legacy.json'), 'legacy.json');
    const kapot = clone(readFixture('huishouden.json'));
    kapot.tasks['2026-10-02'][0].priority = 'urgent';
    delete kapot.boodschappen[0].id;
    kapot.tasks['2 oktober'] = [];
    kapot.meta = { schemaVersion: 'een' };
    const errs = validate(SCHEMA, kapot);
    assert(errs.length === 4, 'Schema moet 4 fouten vinden, vond: ' + errs.join(' | '));
  },

  async 'eerste opslag zet meta.schemaVersion en verder niets; uitvoer voldoet aan het schema'(ctx) {
    for (const name of ['huishouden.json', 'legacy.json']) {
      const fx = readFixture(name);
      const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
      await page.waitForTimeout(1000);
      assert(state.puts >= 1, name + ': verwacht de bekende eerste opslag');
      assert(state.db.meta && state.db.meta.schemaVersion === 1, name + ': meta.schemaVersion niet gezet: ' + JSON.stringify(state.db.meta));
      const strict = diffPaths(fx, state.db, '', { strictMeta: true }).filter(p => !/assignedTo$/.test(p));
      assert(strict.join() === 'meta', name + ': onverwachte wijzigingen: ' + strict.join(', '));
      assertValid(state.db, name + ' na opslaan');
      // Daarna schrijft alleen openen niets meer.
      const puts = state.puts;
      await page.reload(); await page.waitForTimeout(2500);
      assert(state.puts === puts, name + ': herladen sloeg opnieuw op');
      assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
      await c.close();
    }
  },

  async 'bestaande meta blijft staan; een hogere schemaVersion wordt niet overschreven'(ctx) {
    const fx = readFixture('huishouden.json');
    fx.meta = { schemaVersion: 2, bron: 'later' };
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx });
    await page.click('[data-view="boodschappenView"]');
    const before = state.puts;
    await page.fill('#boodschapInput', 'Pindakaas'); await page.press('#boodschapInput', 'Enter');
    await waitForPut(state, before);
    assert(JSON.stringify(state.db.meta) === JSON.stringify({ schemaVersion: 2, bron: 'later' }), 'meta veranderd: ' + JSON.stringify(state.db.meta));
    assert(state.errors.length === 0, 'Fouten: ' + state.errors.join(' | '));
    await c.close();
  },

  async 'live-versie bewaart meta.schemaVersion bij opslaan (achterwaarts compatibel)'(ctx) {
    const fx = readFixture('huishouden.json');
    fx.meta = { schemaVersion: 1 };
    const { page, state, ctx: c } = await openApp(ctx.browser, ctx.base, { data: fx, target: 'root' });
    await page.click('[data-view="boodschappenView"]');
    const before = state.puts;
    await page.fill('#boodschapInput', 'Pindakaas'); await page.press('#boodschapInput', 'Enter');
    await waitForPut(state, before);
    assert(state.db.meta && state.db.meta.schemaVersion === 1, 'Live-versie gooide meta weg: ' + JSON.stringify(state.db.meta));
    const diff = diffPaths(fx, state.db, '', { strictMeta: true });
    assert(diff.length === 1 && /^boodschappen\[/.test(diff[0]), 'Onverwachte wijzigingen door live-versie: ' + diff.join(', '));
    await c.close();
  },
};
