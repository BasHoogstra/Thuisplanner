// Thuisplanner KG-5D herstelronde 1: tegenproeven voor de synchronisatiemodule. Elke regel zet één
// herstelde eigenschap terug (in een kopie van de module) en controleert dat de bijbehorende
// regressietest in herstel.test.mjs of herstel2.test.mjs dan FAALT. Zo is aangetoond dat de tests de oude fout vangen.
//   (door run.sh aangeroepen; vraagt dezelfde omgevingsvariabelen als herstel.test.mjs)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const BRON = readFileSync(path.resolve(HIER, '../../../sync/thuisplanner-sync.js'), 'utf8');

// [bevinding, test (naampatroon), omschrijving, [[zoek, vervang], ...]]
const PROEVEN = [
  ['1', '^B1a', 'geen generatie- of levenscycluscontrole', [
    ['const geldig = g => levend && g === generatie;', 'const geldig = g => true;'],
    ['  const zet = (delta) => {\n    if (!levend) return;\n', '  const zet = (delta) => {\n']]],
  ['1', '^B1b', 'geen generatiecontrole en terugdraaien naar een momentopname (zoals in 3f3b7da)', [
    ['const geldig = g => levend && g === generatie;', 'const geldig = g => true;'],
    ['  const zet = (delta) => {\n    if (!levend) return;\n', '  const zet = (delta) => {\n'],
    ['    if (optimistisch) zet(optimistisch(toestand));', '    const vorige = toestand;\n    if (optimistisch) zet(optimistisch(toestand));'],
    ['      if (terugdraaien) zet(terugdraaien(toestand));', '      if (terugdraaien) zet({ boodschappen: vorige.boodschappen, taken: vorige.taken, afspraken: vorige.afspraken });']]],
  ['1', '^B1c', 'alleen "gestopt?", geen generatie', [
    ['const geldig = g => levend && g === generatie;', 'const geldig = g => levend;']]],
  ['1', '^B1d', 'terugdraaien naar een oude momentopname', [
    ['    if (optimistisch) zet(optimistisch(toestand));', '    const vorige = toestand;\n    if (optimistisch) zet(optimistisch(toestand));'],
    ['      if (terugdraaien) zet(terugdraaien(toestand));', '      if (terugdraaien) zet({ boodschappen: vorige.boodschappen, taken: vorige.taken, afspraken: vorige.afspraken });']]],
  ['3', '^B3a', 'opnieuw proberen met een nieuwe UUID', [
    ['      if (!o) return Promise.resolve({ ok: false });\n      return voegToe(o);', '      if (!o) return Promise.resolve({ ok: false });\n      return nieuweToevoeging({ ...o, id: nieuweId() }, { bewustNieuw: true });']]],
  ['3', '^B3a', 'bestaand id (23505) niet als "al opgeslagen" herkend', [
    ["if (fout.code === '23505' && o.soort !== 'boodschap') {", 'if (false) {']]],
  ['3', '^B3c', 'onbekende uitkomst behandeld als mislukt', [
    ['function onbekend(fout) {\n  if (!fout) return false;', 'function onbekend(fout) {\n  return false;']]],
  ['3', '^B3d', 'opdracht niet bewaard voor een herstart', [
    ['    if (!duurzaam) return false;\n    const inhoud', '    return false;\n    const inhoud']]],
  ['4', '^B4a', 'één pagina (grens van de server)', [
    ['      if (!r.data.length) return rijen;\n      rijen.push(...r.data);', '      return r.data;']]],
  ['4', '^B4c', 'pagineren met offset in plaats van op id', [
    ["if (na !== null) q = q.gt('id', na);", 'if (na !== null) q = q.range(rijen.length, rijen.length + paginaGrootte - 1);']]],
  ['2', '^B2 ', 'client stapt niet over naar het nieuwe kanaal', [
    ['if (wasVerbonden) verbind();', '']]],
  // Herstelronde 2 (herstel2.test.mjs)
  ['R2-1', '^H1a', 'mislukte herhaalpoging verwijdert de opdracht', [
    ['    } else if (o.ooitOnzeker) {', '    } else if (false) {']]],
  ['R2-1', '^H1c', 'verlopen sessie bij de eerste poging verwijdert de invoer', [
    ['    } else if (sessieFout(u.fout)) {\n      // Eerste poging', '    } else if (false) {\n      // Eerste poging']]],
  ['R2-2', '^H2a', 'opdracht herkennen en hergebruiken op titel (zoals in 79a5852)', [
    ['[o.soort, tekstSleutel(o.titel), zonderLeeg(o.velden)]', '[o.soort, tekstSleutel(o.titel)]'],
    ['        return Promise.resolve({ ok: false, mogelijkDubbel: al.id, melding });', '        return voegToe(al);']]],
  ['R2-2', '^H2b', 'gelijke inhoud stil hergebruiken in plaats van een keuze', [
    ['        return Promise.resolve({ ok: false, mogelijkDubbel: al.id, melding });', '        return voegToe(al);']]],
  ['R2-3', '^H3a', 'stop() wist de onbevestigde opdrachten', [
    ['    metOpslag();\n    toestand = { status, melding,', '    for (const id of [...openstaand.keys()]) vergeet(id);\n    toestand = { status, melding,']]],
  ['R2-3', '^H3a', 'geen paginageheugen (unmount verliest de opdracht)', [
    ['    openstaand = gebruiker ? geheugen.get(sleutel) : new Map();', '    openstaand = new Map();']]],
  ['R2-3', '^H3c', 'één opslagsleutel voor alle opdrachten (tabbladen overschrijven elkaar)', [
    ['opslag.setItem(prefix() + o.id,', 'opslag.setItem(prefix(),']]],
  ['R2-3', '^H3d', 'geweigerde opslag niet gemeld', [
    ['    duurzaam = opslagProef();', '    duurzaam = !!opslag;']]],
  ['R2-3', '^H3e', 'opdracht van een ander account overgenomen', [
    [' && o.gebruiker === gebruiker && o.huishouden === huishoudenId)', ' && o.huishouden === huishoudenId)']]],
  ['R2-3', '^H3f', 'inhoud van een privé-afspraak in de opslag', [
    ['    const inhoud = prive(o) ? { inhoudNietBewaard: true, afspraak: { visibility: \'private\' } }\n      : { naam:', '    const inhoud = false ? {}\n      : { naam:']]],
];

const map = mkdtempSync(path.join(tmpdir(), 'kg-sync-tegenproef-'));
let fouten = 0;
try {
  PROEVEN.forEach(([bevinding, patroon, wat, vervangingen], i) => {
    let code = BRON;
    for (const [zoek, vervang] of vervangingen) {
      const n = code.split(zoek).length - 1;
      if (n !== 1) throw new Error(`Tegenproef ${i + 1} (${wat}): tekst ${n}x gevonden in plaats van 1x; pas de proef aan`);
      code = code.replace(zoek, vervang);
    }
    const bestand = path.join(map, `proef-${i + 1}.js`);
    writeFileSync(bestand, code);
    const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=600000', '--test-force-exit',
      `--test-name-pattern=${patroon}`, patroon.startsWith('^H') ? 'herstel2.test.mjs' : 'herstel.test.mjs'], { cwd: HIER, env: { ...process.env, KG_SYNC_MODULE: bestand }, encoding: 'utf8' });
    const geslaagd = /^# pass [1-9]/m.test(r.stdout) && /^# fail 0/m.test(r.stdout);
    const gefaald = /^# fail [1-9]/m.test(r.stdout);
    if (gefaald && !geslaagd) console.log(`sync-tegenproef ${i + 1} (bevinding ${bevinding}: ${wat}) gevangen door ${patroon.replace('^', '').trim()}`);
    else { fouten++; console.log(`SYNC-TEGENPROEF ${i + 1} NIET GEVANGEN (bevinding ${bevinding}: ${wat}, ${patroon})`); }
  });
} finally {
  rmSync(map, { recursive: true, force: true });
}
console.log(`Sync-tegenproeven gevangen: ${PROEVEN.length - fouten} van ${PROEVEN.length}`);
process.exit(fouten ? 1 : 0);
