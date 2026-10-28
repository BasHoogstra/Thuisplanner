// Tegenproeven voor de slimme invoer (B1), de boodschappencategorieën (C1), en de vragen in de + met Mijn spullen &
// Documenten (§13): zet telkens één regel uit en controleer dat minstens één test in tests/zin.test.ts,
// tests/categorie.test.ts, tests/intentie.test.ts of tests/spullen.test.ts dan faalt. Zo is aangetoond dat de tests die regel
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
const INT = path.join(APP, 'src/lib/intentie.ts');
const VRA = path.join(APP, 'src/lib/vraag/spullen.ts');
const SPL = path.join(APP, 'src/lib/spullen/logica.ts');
const BST = path.join(APP, 'src/lib/spullen/bestand.ts');

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
  // Vragen in de + (intentie): vraag, actie, vraag en actie, onduidelijk.
  [INT, 'een vraagteken maakt geen vraag', "const vraagteken = ruw.endsWith('?');", 'const vraagteken = false;'],
  [INT, 'een vraagwoord vooraan maakt geen vraag', 'const vraagwoord = VRAAGWOORDEN.has(w[0]) ||', 'const vraagwoord = false ||'],
  [INT, '"factuur betalen" wordt een zoekopdracht', "!w.some(x => DOE_WOORDEN.has(x) ||", "!w.some(x => false ||"],
  [INT, 'een onbekend tweede zinsdeel wordt toch een vraag', "return { soort: 'actie' }; // tweede deel onbekend", ''],
  [INT, 'een vraag zonder onderwerp wordt gegokt', "return { soort: 'onduidelijk', vraag, vervolgvraag: 'Waar gaat je vraag over?' };", "return { soort: 'vraag', vraag };"],
  [INT, 'herinnering: aantal en eenheid genegeerd', "? Number(m[1]) : GETAL[m[1]];", '? 1 : 1; m[2] = "maand";'],
  // De vraagbron: niets verzinnen, terugvallen op de bestaande werking.
  [VRA, 'een zoekopdracht zonder resultaat valt niet terug', "if (vraag.zekerheid === 'zoek') return null;", ''],
  [VRA, 'een voorstel als zeker antwoord', "const NIET_BEVESTIGD = ' (nog niet bevestigd)';", "const NIET_BEVESTIGD = '';"],
  [VRA, 'een bestaande taak wordt nog een keer voorgesteld', 'const bestaat = taken.some(', 'const bestaat = false && taken.some('],
  [VRA, 'geen spul genoemd: gokken in plaats van vragen', "if (!kandidaten.length && actief.length) {", 'if (false) {'],
  // Spullen: zichtbaarheid, status, koppelen, zoeken, bestanden.
  [SPL, 'een persoonlijk item van een ander is zichtbaar', "x.zichtbaarheid === 'gedeeld' || x.eigenaar === ik;", 'true;'],
  [SPL, 'een voorstel telt als bevestigd', "return s.status?.[v] === 'voorstel' ? 'voorstel' : 'bevestigd';", "return 'bevestigd';"],
  [SPL, 'koppelen maakt een tweede rij', 'return isGekoppeld(k, documentId, spulId) ? k :', 'return false ? k :'],
  [SPL, 'zoeken vindt stukjes midden in een woord', 'return zoek.length >= 4 && woord.startsWith(zoek);', 'return woord.includes(zoek);'],
  [SPL, 'de prullenbak houdt niet op na 30 dagen', 'return nu.getTime() - new Date(x.verwijderdOp).getTime() < PRULLENBAK_DAGEN * 86_400_000;', 'return true;'],
  [BST, 'een bestand met een verkeerd type wordt toegelaten', "if (!type) return { ok: false, reden:", "if (false) return { ok: false, reden:"],
];

const origineel = new Map([ZIN, CAT, INT, VRA, SPL, BST].map(b => [b, readFileSync(b, 'utf8')]));
let fouten = 0;
try {
  PROEVEN.forEach(([bestand, wat, zoek, vervang], i) => {
    const bron = origineel.get(bestand).replace(/\r\n/g, '\n');
    const n = bron.split(zoek).length - 1;
    if (n !== 1) throw new Error(`Tegenproef ${i + 1} (${wat}): tekst ${n}x gevonden in plaats van 1x; pas de proef aan`);
    writeFileSync(bestand, bron.replace(zoek, vervang));
    const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vitest', 'run', 'tests/zin.test.ts', 'tests/categorie.test.ts', 'tests/intentie.test.ts', 'tests/spullen.test.ts'],
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
