// Thuisplanner: platformafhankelijke hulpfuncties voor scripts/lokaal.mjs (Linux, macOS en Windows).
// Los bestand zonder shebang en zonder afhankelijkheden, zodat de tests het direct kunnen importeren.
import { realpathSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Of dit bestand (import.meta.url) het script is dat Node start (argv[1]). Op Windows is argv[1] een pad
 * als C:\...\lokaal.mjs en de URL file:///C:/..., dus vergelijken via pathToFileURL; Node zelf gebruikt het
 * echte pad (realpath), en op Windows telt hoofdletter of kleine letter niet.
 */
export function isHoofdscript(url, argv1) {
  if (!argv1) return false;
  let pad;
  try { pad = pathToFileURL(realpathSync(argv1)).href; } catch { return false; }
  return process.platform === 'win32' ? pad.toLowerCase() === url.toLowerCase() : pad === url;
}

/**
 * Vite starten via Node zelf en het JS-bestand van Vite, niet via `npx`: op Windows is dat npx.cmd, en
 * spawn start geen .cmd-bestanden zonder shell.
 */
export function viteOpdracht(args) {
  return [process.execPath, [join(APP, 'node_modules', 'vite', 'bin', 'vite.js'), ...args]];
}

/**
 * De Supabase-CLI als één opdrachtregel voor de shell (execSync). SUPABASE mag zelf meerdere woorden zijn
 * (bijvoorbeeld "npx supabase@2.120.0"); via de shell werkt dat ook op Windows (npx.cmd). De waarde komt uit
 * de eigen omgeving van de ontwikkelaar, nooit van buiten.
 */
export function supabaseOpdracht(supabase) {
  return `${supabase || 'supabase'} status -o env`;
}

/** URL en sleutels uit de uitvoer van `supabase status -o env` (regels KEY="waarde"; ook met CRLF). */
export function leesStatus(uit) {
  const waarde = k => uit.match(new RegExp(`^${k}="?([^"\\r\\n]*)"?\\r?$`, 'm'))?.[1];
  return { API_URL: waarde('API_URL'), ANON_KEY: waarde('ANON_KEY'), SERVICE_ROLE_KEY: waarde('SERVICE_ROLE_KEY') };
}

const PRIVE =/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
// Virtuele netwerken op de ontwikkelmachine (Docker, VM's, VPN; op Windows Hyper-V/WSL als "vEthernet (...)",
// VMware en VirtualBox) zijn niet het wifi-netwerk van de telefoons.
const VIRTUEEL = /^(docker|br-|veth|virbr|vmnet|vboxnet|utun|tun|tap|wg|zt|tailscale|lo|vEthernet|VMware|VirtualBox)/i;

/** Of een adres op een eigen netwerk ligt (10.x, 172.16-31.x, 192.168.x). */
export const isPriveAdres = adres => PRIVE.test(adres);

/** Kandidaten voor het adres op het eigen (wifi-)netwerk, de waarschijnlijkste eerst. */
export function lanAdressen(interfaces = networkInterfaces()) {
  const uit = [];
  for (const [naam, lijst] of Object.entries(interfaces)) {
    for (const a of lijst ?? []) {
      if (a.family === 'IPv4' && !a.internal && PRIVE.test(a.address) && !VIRTUEEL.test(naam)) uit.push({ naam, adres: a.address });
    }
  }
  const rang = x => (x.adres.startsWith('192.168.') ? 0 : x.adres.startsWith('10.') ? 1 : 2);
  return uit.sort((x, y) => rang(x) - rang(y));
}
