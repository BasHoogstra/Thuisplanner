// Thuisplanner-staging, stap 5: de controles rond het deployen van de Edge Functions (staging/functies.ps1). Zie
// docs/thuisplanner-staging-overstap.md, stap 5. Dit script deployt zelf niets en maakt geen verbinding.
//   node functies.mjs vooraf <kenmerk> [omgeving]   vóór het deployen: het juiste project, de bedoelde functies, alles
//                                                     gecommit, verify_jwt uit zoals in config.toml
//   node functies.mjs na <kenmerk>                    na het deployen: de functielijst (JSON van `functions list`, via stdin)
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isHuisplanRef, omgevingFouten } from './verbinding-controle.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const KG = path.resolve(HIER, '..');
/** Precies deze functies, en geen andere (de map _gedeeld is geen functie). */
export const FUNCTIES = ['controleer-code', 'mail-bezorging', 'stuur-code', 'stuur-uitnodiging'];

/** Het kenmerk en de omgeving: precies het vastgelegde project, nooit Huisplan. Leeg = in orde. */
export function kenmerkFouten(ref, omgeving = 'staging') {
  if (!/^[a-z]{20}$/.test(ref || '')) return ['het kenmerk is geen projectkenmerk van 20 kleine letters'];
  if (isHuisplanRef(ref)) return ['het kenmerk is een Huisplan-project'];
  return omgevingFouten(omgeving, ref);
}

/** De functiemappen: precies FUNCTIES, plus mappen die met _ beginnen (gedeelde code). */
export function mapFouten(mappen) {
  const functies = mappen.filter(m => !m.startsWith('_') && !m.startsWith('.')).sort();
  return JSON.stringify(functies) === JSON.stringify(FUNCTIES) ? [] : [`functiemappen ${JSON.stringify(functies)} in plaats van ${JSON.stringify(FUNCTIES)}`];
}

/** In config.toml staat voor elke functie verify_jwt = false (ze controleren zelf: hook-handtekening, geheim, HMAC). */
export function configFouten(tekst) {
  const f = [];
  for (const naam of FUNCTIES) {
    const blok = tekst.match(new RegExp(`^\\[functions\\.${naam.replace(/-/g, '\\-')}\\]\\s*\\n([^\\[]*)`, 'm'))?.[1] ?? null;
    if (blok === null) f.push(`config.toml mist [functions.${naam}]`);
    else if (!/^verify_jwt\s*=\s*false\s*$/m.test(blok)) f.push(`config.toml: ${naam} zonder verify_jwt = false`);
  }
  return f;
}

/** Niets ongecommit in de functies of de configuratie: online komt precies wat in git staat. */
export function gitFouten(status) {
  const regels = String(status || '').split('\n').map(r => r.trim()).filter(Boolean);
  return regels.length ? [`niet-gecommitte wijzigingen: ${regels.join('; ')}`] : [];
}

/**
 * Na het deployen: de lijst van `supabase functions list -o json`. Precies FUNCTIES, elk ACTIVE en met verify_jwt uit.
 * Extra functies (die er niet horen) worden ook gemeld.
 */
export function lijstFouten(lijst) {
  if (!Array.isArray(lijst)) return ['de functielijst is geen lijst'];
  const f = [];
  const namen = lijst.map(x => x.slug ?? x.name).sort();
  if (JSON.stringify(namen) !== JSON.stringify(FUNCTIES)) f.push(`functies online ${JSON.stringify(namen)} in plaats van ${JSON.stringify(FUNCTIES)}`);
  for (const x of lijst) {
    if (x.status !== 'ACTIVE') f.push(`${x.slug ?? x.name}: status ${x.status}`);
    if (x.verify_jwt !== false) f.push(`${x.slug ?? x.name}: verify_jwt staat niet uit`);
  }
  return f;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [opdracht, ref, omgeving = 'staging'] = process.argv.slice(2);
  const k = kenmerkFouten(ref, omgeving);
  if (k.length) { console.log('GEWEIGERD:\n- ' + k.join('\n- ')); process.exit(2); }
  if (opdracht === 'vooraf') {
    const status = execFileSync('git', ['-C', KG, 'status', '--porcelain', '--untracked-files=all', '--', 'functions', 'config.toml'], { encoding: 'utf8' });
    const f = [...mapFouten(readdirSync(path.join(KG, 'functions'))), ...configFouten(readFileSync(path.join(KG, 'config.toml'), 'utf8').replace(/\r\n/g, '\n')),
      ...gitFouten(status.split('\n').filter(r => !/functions\/\.env$/.test(r.trim())).join('\n'))];
    if (f.length) { console.log('GEWEIGERD vóór het deployen:\n- ' + f.join('\n- ')); process.exit(1); }
    const commit = execFileSync('git', ['-C', KG, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    console.log(`IN ORDE: project ${ref} (${omgeving}), functies ${FUNCTIES.join(', ')}, verify_jwt uit, commit ${commit}`);
  } else if (opdracht === 'na') {
    let lijst;
    try { lijst = JSON.parse(readFileSync(0, 'utf8')); } catch { console.log('AFWIJKING: de functielijst is onleesbaar'); process.exit(1); }
    const f = lijstFouten(lijst);
    for (const x of Array.isArray(lijst) ? lijst : []) console.log(`  ${x.slug ?? x.name}: ${x.status}, versie ${x.version}, verify_jwt ${x.verify_jwt}`);
    if (f.length) { console.log('AFWIJKING na het deployen:\n- ' + f.join('\n- ')); process.exit(1); }
    console.log('IN ORDE: precies de vier functies, actief, verify_jwt uit');
  } else { console.log('gebruik: vooraf <kenmerk> [omgeving] | na <kenmerk> [omgeving] (lijst via stdin)'); process.exit(2); }
}
