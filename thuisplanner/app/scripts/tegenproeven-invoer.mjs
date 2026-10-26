// Tegenproeven voor de slimme invoer (B1) en de boodschappencategorieën (C1): zet telkens één regel uit en controleer dat
// minstens één test in tests/zin.test.ts of tests/categorie.test.ts dan faalt. Zo is aangetoond dat de tests die regel
// echt bewaken. Het bronbestand wordt altijd teruggezet, ook na een fout.
//   node scripts/tegenproeven-invoer.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HIER, '..');
const ZIN = path.join(APP, 'src/lib/zin.ts');
const CAT = path.join(APP, 'src/lib/categorie.ts');

// [bestand, omschrijving, zoek, vervang]
const PROEVEN = [
  [ZIN, 'V2: "om 4" niet als middag', 'if (t.u >= 1 && t.u <= 6 && !t.nul)', 'if (false)'],
  [ZIN, 'morgen niet herkend', "if (MORGEN_WOORDEN.has(a)) return", 'if (false) return'],
  [ZIN, 'weekdag: vandaag telt mee', "((dag - nu + 7) % 7) || 7", '((dag - nu + 7) % 7)'],
  [ZIN, 'datum in het verleden blijft dit jaar', 'if (j === undefined && s < vandaag)', 'if (false)'],
  [ZIN, '"volgende week" niet herkend', "if (a === 'volgende' && b === 'week'", "if (false && a === 'volgende'"],
  [ZIN, 'tijdsbereik niet herkend', "if (a && b && a.u * 60 + a.m < b.u * 60 + b.m)", 'if (false)'],
  [ZIN, 'een los getal als tijd', "if (!kaal && !r[2] && t === w) return null;", ''],
  [ZIN, 'personen niet herkend', 'const lid = leden.find(x => x.k === w(i));', 'const lid = undefined as undefined | { l: Lid; k: string };'],
  [ZIN, 'een bijna-naam vanzelf gekoppeld', "if (bijna && !suggesties.some(s => s.lid === bijna.l.id)) {", "if (bijna) { wie.push(bijna.l.id);"],
  [ZIN, 'plek ook midden in de zin', 'for (let k = i + 1; k < tokens.length; k++) if (!vrij(k)) alleenVrij = false;', ''],
  [ZIN, 'boodschapwoord ook met een lid erbij', 'soortwoord = soortwoordIdx.length > 0 && !heeftLid;', 'soortwoord = soortwoordIdx.length > 0;'],
  [ZIN, 'tijd of plek maakt geen afspraak', "else if (start || plek || herhaling) soort = 'afspraak';", ''],
  [ZIN, 'herkende producten worden geen boodschappen', 'splitsBoodschappen(titelVan(new Set())).every(isProduct)) soort', 'false) soort'],
  [ZIN, 'V3: geen melding bij een herhalende taak', "meld({ soort: 'herhalende-taak'", "void ({ soort: 'herhalende-taak'"],
  [ZIN, 'privé stil toegepast bij een taak', "if (prive && soort !== 'afspraak') { meld(", "if (false) { meld("],
  [ZIN, 'een dag bij een boodschap stil weggelaten', "meld({ soort: 'boodschap-dag'", "void ({ soort: 'boodschap-dag'"],
  [ZIN, 'een taak met twee personen', "if (soort === 'taak' && wie.length > 1) {", 'if (false) {'],
  [ZIN, 'een aangenomen datum niet gemarkeerd', "datum = ctx.standaard?.datum ?? ctx.vandaag; aangenomen.push('datum');", 'datum = ctx.standaard?.datum ?? ctx.vandaag;'],
  [ZIN, 'terugzetten (negeer) werkt niet', "if (!negeer.has('datum') && !datum) {", 'if (!datum) {'],
  [ZIN, 'randwoorden altijd weggehaald', '(idx.length === 1 || weg(idx[0] + 1))', 'true'],
  [CAT, 'deelwoorden herkend (hamer → ham)', "const k = TABEL.get(woorden.slice(i, i + lengte).join(' '));",
    "const k = TABEL.get(woorden.slice(i, i + lengte).join(' ')) ?? [...TABEL.keys()].filter(t => !t.includes(' ') && t.length > 1).map(t => woorden.join(' ').includes(t) ? TABEL.get(t) : undefined).find(Boolean);"],
  [CAT, 'geen meervoud of verkleinwoord', 'for (const v of vormen(laatste)) {', 'for (const v of [laatste]) {'],
  [CAT, 'afgeleide vormen voor de lijst', "for (const [sleutel, lijst] of lijsten) for (const term of lijst) { const t = schoon(term); if (!TABEL.has(t)) TABEL.set(t, sleutel); }", ''],
];

const origineel = new Map([[ZIN, readFileSync(ZIN, 'utf8')], [CAT, readFileSync(CAT, 'utf8')]]);
let fouten = 0;
try {
  PROEVEN.forEach(([bestand, wat, zoek, vervang], i) => {
    const bron = origineel.get(bestand).replace(/\r\n/g, '\n');
    const n = bron.split(zoek).length - 1;
    if (n !== 1) throw new Error(`Tegenproef ${i + 1} (${wat}): tekst ${n}x gevonden in plaats van 1x; pas de proef aan`);
    writeFileSync(bestand, bron.replace(zoek, vervang));
    const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vitest', 'run', 'tests/zin.test.ts', 'tests/categorie.test.ts'],
      { cwd: APP, encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, FORCE_COLOR: '0' } });
    writeFileSync(bestand, origineel.get(bestand));
    const uit = (r.stdout || '') + (r.stderr || '');
    const gefaald = /Tests\s+\d+ failed/.test(uit) || /Failed Tests/.test(uit);
    if (gefaald) console.log(`tegenproef ${i + 1} gevangen: ${wat}`);
    else { fouten++; console.log(`TEGENPROEF ${i + 1} NIET GEVANGEN: ${wat}`); }
  });
} finally {
  for (const [bestand, inhoud] of origineel) writeFileSync(bestand, inhoud);
}
console.log(`Tegenproeven invoer gevangen: ${PROEVEN.length - fouten} van ${PROEVEN.length}`);
process.exit(fouten ? 1 : 0);
