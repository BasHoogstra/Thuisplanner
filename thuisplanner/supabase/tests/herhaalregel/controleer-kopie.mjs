// Controleert dat de vergelijkingskopie van private.occurs_on in rule_occurs_on.sql letterlijk gelijk is aan de
// definitie in de migratie (20261012120000_kg5c_inhoud.sql). Wijkt een van beide af, dan faalt deze controle, zodat de
// gelijkwaardigheidstest nooit stil tegen een verouderde of aangepaste kopie vergelijkt.
// Gebruik: node controleer-kopie.mjs [migratiebestand] [testbestand]   (zonder argumenten: de standaardpaden)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const hier = (p) => fileURLToPath(new URL(p, import.meta.url));
const migratie = process.argv[2] ?? hier('../../migrations/20261012120000_kg5c_inhoud.sql');
const test = process.argv[3] ?? hier('./rule_occurs_on.sql');

/** De tekst van "<kop>…$$;" (één functiedefinitie), met Windows-regeleinden genormaliseerd. */
function definitie(bestand, kop) {
  const s = readFileSync(bestand, 'utf8').replace(/\r\n/g, '\n');
  const i = s.indexOf(kop);
  if (i < 0) throw new Error(`${kop} niet gevonden in ${bestand}`);
  const j = s.indexOf('$$;', i);
  if (j < 0) throw new Error(`einde van ${kop} niet gevonden in ${bestand}`);
  return s.slice(i + kop.length, j + 3);
}

const oud = definitie(migratie, 'create function private.occurs_on(');
const kopie = definitie(test, 'create or replace function private.occurs_on(');
if (oud !== kopie) {
  console.error('KOPIECONTROLE MISLUKT: private.occurs_on in rule_occurs_on.sql wijkt af van de migratie.');
  process.exit(1);
}
console.log('kopiecontrole: private.occurs_on is letterlijk gelijk aan 20261012120000_kg5c_inhoud.sql');
