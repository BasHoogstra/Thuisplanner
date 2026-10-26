// Thuisplanner F8 Vakanties (V1.2): tegenproeven voor de synchronisatielaag. Elke regel zet één eigenschap terug (in een
// kopie van de module) en controleert dat de bijbehorende test in vakanties-sync.test.mjs dan FAALT. Zo is aangetoond
// dat de tests de fout vangen. Zelfde werkwijze als sync-tegenproeven.mjs.
//   (door run.sh aangeroepen; vraagt dezelfde omgevingsvariabelen als vakanties-sync.test.mjs)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
// Regeleinden gelijkgetrokken: in een Windows-checkout (core.autocrlf) heeft de module CRLF, de proeven zoeken op \n.
const BRON = readFileSync(path.resolve(HIER, '../../../sync/thuisplanner-sync.js'), 'utf8').replace(/\r\n/g, '\n');

// [test (naampatroon), omschrijving, [[zoek, vervang], ...]]
const PROEVEN = [
  ['^V1', 'een bekende versie van een vakantietabel wordt niet overgeslagen', [
    ["const MET_VERSIE = new Set(['shopping_items', 'tasks', 'events', 'trips', 'trip_packing_items', 'trip_shopping_links', 'trip_packing_lists']);",
      "const MET_VERSIE = new Set(['shopping_items', 'tasks', 'events']);"]]],
  ['^V3', 'een unieke-sleutelfout (HTTP 409) gemeld als versieconflict', [
    ["  if (code === '23505') return { soort: 'dubbel', tekst: MELDINGEN.dubbel };\n  if (code === 'PT409'", "  if (code === 'PT409'"]]],
  ['^V3', 'een zekere weigering na een onzekere poging blijft eeuwig "niet bevestigd"', [
    ["      if (o.soort === 'pakitem' || o.soort === 'paklijst') return { uitkomst: 'mislukt', fout, zeker: true };\n", '']]],
  ['^V4', 'ongedaan maken van een overname verwijdert ook intussen aangepaste items', [
    [".in('id', ids).eq('version', 1)", ".in('id', ids)"]]],
  ['^V5', 'vinkjes terugzetten zonder het oorspronkelijke moment', [
    ['        ...(i.packed_at ? { packed_at: i.packed_at } : {}), ', '        ']]],
  ['^V7', 'paklijsten van alle (ook afgelopen) vakanties steeds opgehaald', [
    ['    const actief = v.filter(x => geopend.has(x.id) || !vakantieVoorbij(x, dag)).map(x => x.id);', '    const actief = v.map(x => x.id);']]],
  ['^V7', 'een geopende afgelopen vakantie wordt niet opgehaald', [
    ['v.filter(x => geopend.has(x.id) || !vakantieVoorbij(x, dag))', 'v.filter(x => !vakantieVoorbij(x, dag))']]],
  ['^V8', 'inhoud van vakanties en pakitems duurzaam op het toestel (P1)', [
    ['    const inhoud = prive(o) || !bewaarInhoud || o.inhoudNietBewaard\n', '    const inhoud = prive(o) || o.inhoudNietBewaard\n']]],
  ['^V8', 'overnemen opnieuw proberen met een nieuwe opdracht-ID', [
    ['      const opdr = opdracht || nieuweId();', '      const opdr = nieuweId();']]],
  // Extra inpaklijsten (§20, stap 2).
  ['^V12', 'list_id van pakitems niet opgehaald (een lijst-item lijkt Gezamenlijk)', [
    ["const VELDEN_PAKITEM = 'id,household_id,trip_id,member_id,list_id,name,", "const VELDEN_PAKITEM = 'id,household_id,trip_id,member_id,name,"]]],
  ['^V12', 'extra lijsten niet opgehaald', [
    ["      actief.length ? allePaginas(() => supabase.from('trip_packing_lists').select(VELDEN_PAKLIJST)", "      false ? allePaginas(() => supabase.from('trip_packing_lists').select(VELDEN_PAKLIJST)"]]],
  ['^V12', 'vinkjes opnieuw voor Gezamenlijk raakt ook items van extra lijsten', [
    [' && (groep !== null || !x.list_id)', '']]],
  ['^V13', 'toevoegen aan een verwijderde lijst gemeld als "geen toegang"', [
    ["        : lijstWeg ? { soort: 'weg', tekst: MELDINGEN.paklijstWeg } : meldingVoor(u.fout) };", '        : meldingVoor(u.fout) };']]],
  ['^V14', 'ongedaan maken van een overname laat een nieuwe, lege lijst staan', [
    ['      if (nieuweLijsten?.length) {', '      if (false) {']]],
  ['^V14', 'overnemen zonder de gekozen lijsten', [
    ['...(lijsten?.length ? { p_lists: lijsten } : {})', '']]],
  ['^V15', 'naam van een onbevestigde lijst duurzaam op het toestel (P1)', [
    ['    const inhoud = prive(o) || !bewaarInhoud || o.inhoudNietBewaard\n', '    const inhoud = prive(o) || o.inhoudNietBewaard\n']]],
];

const map = mkdtempSync(path.join(tmpdir(), 'kg-vakanties-tegenproef-'));
let fouten = 0;
try {
  PROEVEN.forEach(([patroon, wat, vervangingen], i) => {
    let code = BRON;
    for (const [zoek, vervang] of vervangingen) {
      const n = code.split(zoek).length - 1;
      if (n !== 1) throw new Error(`Tegenproef ${i + 1} (${wat}): tekst ${n}x gevonden in plaats van 1x; pas de proef aan`);
      code = code.replace(zoek, vervang);
    }
    const bestand = path.join(map, `proef-${i + 1}.js`);
    writeFileSync(bestand, code);
    const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=600000', '--test-force-exit', '--test-reporter=tap',
      `--test-name-pattern=${patroon}`, 'vakanties-sync.test.mjs'], { cwd: HIER, env: { ...process.env, KG_SYNC_MODULE: bestand }, encoding: 'utf8' });
    const geslaagd = /^# pass [1-9]/m.test(r.stdout) && /^# fail 0/m.test(r.stdout);
    const gefaald = /^# fail [1-9]/m.test(r.stdout);
    if (gefaald && !geslaagd) console.log(`vakanties-sync-tegenproef ${i + 1} (${wat}) gevangen door ${patroon.replace('^', '')}`);
    else { fouten++; console.log(`VAKANTIES-SYNC-TEGENPROEF ${i + 1} NIET GEVANGEN (${wat}, ${patroon})`); }
  });
} finally {
  rmSync(map, { recursive: true, force: true });
}
console.log(`Vakanties-sync-tegenproeven gevangen: ${PROEVEN.length - fouten} van ${PROEVEN.length}`);
process.exit(fouten ? 1 : 0);
