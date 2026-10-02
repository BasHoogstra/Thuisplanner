#!/usr/bin/env node
// Draait alle tests: node tests/run.js [--target=test|root] [filter]
//   --target=test  test/index.html (standaard)
//   --target=root  index.html (de live-versie)
'use strict';
const fs = require('fs');
const path = require('path');
const { startServer, launch } = require('./lib');

(async () => {
  const args = process.argv.slice(2);
  const t = args.find(a => a.startsWith('--target='));
  if (t) process.env.TARGET = t.split('=')[1];
  const filter = args.find(a => !a.startsWith('--'));
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
  const { srv, base } = await startServer();
  const browser = await launch();
  let pass = 0, fail = 0;
  console.log('Huisplan-tests · doel: ' + (process.env.TARGET || 'test'));
  for (const f of files) {
    const mod = require(path.join(__dirname, f));
    for (const name of Object.keys(mod)) {
      if (filter && !(f + ' ' + name).toLowerCase().includes(filter.toLowerCase())) continue;
      const t0 = Date.now();
      try {
        await mod[name]({ browser, base });
        pass++; console.log('  ✓ ' + f.replace('.test.js', '') + ' › ' + name + ' (' + (Date.now() - t0) + ' ms)');
      } catch (e) {
        fail++; console.log('  ✗ ' + f.replace('.test.js', '') + ' › ' + name + '\n    ' + String(e && e.message || e).split('\n').join('\n    '));
      }
    }
  }
  await browser.close(); srv.close();
  console.log((fail ? 'MISLUKT' : 'GESLAAGD') + ': ' + pass + ' geslaagd, ' + fail + ' mislukt');
  process.exit(fail ? 1 : 0);
})();
