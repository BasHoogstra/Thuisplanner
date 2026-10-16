// @vitest-environment node
// scripts/lokaal.mjs op Windows (telefoonproef): het script moet echt draaien, Vite en de Supabase-CLI starten
// zonder .cmd-bestanden via spawn, en het wifi-adres kiezen in plaats van een virtuele Hyper-V/WSL-adapter.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
// lokaal.mjs zelf heeft een shebang en is niet te importeren; de platformhulp wel.
import { isHoofdscript, isPriveAdres, lanAdressen, leesStatus, supabaseOpdracht, supabaseProxy, viteOpdracht } from '../scripts/lokaal-platform.mjs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const SCRIPT = join(__dirname, '..', 'scripts', 'lokaal.mjs');
const FICTIEF = { API_URL: 'http://127.0.0.1:55321', ANON_KEY: 'fictief-anon', SERVICE_ROLE_KEY: 'fictief-service' };
const draai = (args: string[], env: Record<string, string>) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 30_000 });

describe('hoofdscript-herkenning', () => {
  it('herkent het script aan zijn eigen pad, ook met een Windows-pad (C:\\...)', () => {
    expect(isHoofdscript(pathToFileURL(SCRIPT).href, SCRIPT)).toBe(true);
  });
  it('niet bij een ander bestand of zonder argv[1] (geïmporteerd, bijvoorbeeld door deze test)', () => {
    expect(isHoofdscript(pathToFileURL(SCRIPT).href, join(__dirname, 'setup.ts'))).toBe(false);
    expect(isHoofdscript(pathToFileURL(SCRIPT).href, undefined)).toBe(false);
    expect(isHoofdscript(pathToFileURL(SCRIPT).href, join(__dirname, 'bestaat-niet.mjs'))).toBe(false);
  });
});

describe('het script draait echt (op elk platform, ook Windows)', () => {
  it('onbekende opdracht: gebruiksmelding en code 2, niet stil stoppen', () => {
    const r = draai(['onbekend'], FICTIEF);
    expect(r.stderr).toMatch(/Gebruik: node scripts\/lokaal\.mjs/);
    expect(r.status).toBe(2);
  });
  it('een niet-lokaal adres wordt geweigerd (de controle wordt dus echt uitgevoerd)', () => {
    const r = draai(['onbekend'], { ...FICTIEF, API_URL: 'https://voorbeeld.supabase.co' });
    expect(r.stderr).toMatch(/Weigering: alleen een lokale Supabase/);
    expect(r.status).not.toBe(0);
  });
});

describe('opdrachten starten zonder .cmd via spawn', () => {
  it('Vite via Node zelf en het JS-bestand van Vite (geen npx)', () => {
    const [cmd, args] = viteOpdracht(['--mode', 'lokaal']);
    expect(cmd).toBe(process.execPath);
    expect(args[0]).toMatch(/node_modules[\\/]vite[\\/]bin[\\/]vite\.js$/);
    expect(args.slice(1)).toEqual(['--mode', 'lokaal']);
  });
  it('Supabase-CLI als één opdrachtregel via de shell, zodat SUPABASE="npx supabase@x" ook op Windows werkt', () => {
    expect(supabaseOpdracht(undefined)).toBe('supabase status -o env');
    expect(supabaseOpdracht('npx supabase@2.120.0')).toBe('npx supabase@2.120.0 status -o env');
  });
});

describe('Vite-proxy naar de lokale Supabase (telefoonproef)', () => {
  it('stuurt alleen Auth, REST en Realtime door, Realtime met websocket', () => {
    const p = supabaseProxy('http://127.0.0.1:55321/');
    expect(Object.keys(p).sort()).toEqual(['/auth/v1', '/realtime/v1', '/rest/v1']);
    expect(Object.values(p).every(o => o.target === 'http://127.0.0.1:55321')).toBe(true);
    expect(p['/realtime/v1'].ws).toBe(true);
    expect(p['/auth/v1'].ws).toBeUndefined();
  });
  it('weigert elk doel buiten dit toestel (netwerkadres, online project, https, leeg)', () => {
    for (const doel of ['http://172.20.10.9:55321', 'https://voorbeeld.supabase.co', 'https://127.0.0.1:55321', 'http://127.0.0.1.voorbeeld.nl', '', undefined]) {
      expect(() => supabaseProxy(doel)).toThrow(/Weigering/);
    }
  });

  describe('env-bestand', () => {
    let map: string;
    beforeEach(() => { map = mkdtempSync(join(tmpdir(), 'kg-env-')); });
    afterEach(() => rmSync(map, { recursive: true, force: true }));
    const lees = (args: string[]) => {
      const bestand = join(map, '.env.lokaal.local');
      const r = draai(['env', ...args], { ...FICTIEF, KG_ENV_BESTAND: bestand });
      expect(r.status, r.stderr).toBe(0);
      return Object.fromEntries(readFileSync(bestand, 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
    };
    it('zonder proxy: de browser praat direct met Supabase op dit toestel, geen proxy-doel', () => {
      const env = lees([]);
      expect(env.VITE_SUPABASE_URL).toBe('http://127.0.0.1:55321');
      expect(env.KG_SUPABASE_DOEL).toBeUndefined();
    });
    it('met --proxy: de browser praat met de app zelf; het proxy-doel staat er alleen zonder VITE_ (niet in de browser)', () => {
      const env = lees(['--proxy', '5182']);
      expect(env.VITE_SUPABASE_URL).toBe('http://127.0.0.1:5182');
      expect(env.KG_SUPABASE_DOEL).toBe('http://127.0.0.1:55321');
      expect(Object.keys(env).filter(k => k.startsWith('VITE_')).some(k => /DOEL|SERVICE/.test(k))).toBe(false);
      expect(Object.values(env)).not.toContain('fictief-service');
    });
    it('met --host (telefoons): altijd via de proxy op poort 5180, nooit direct naar Supabase', () => {
      const env = lees(['--host', '172.20.10.9']);
      expect(env.VITE_SUPABASE_URL).toBe('http://172.20.10.9:5180');
      expect(env.KG_SUPABASE_DOEL).toBe('http://127.0.0.1:55321');
    });
  });
});

describe('uitvoer van supabase status -o env', () => {
  const sleutels = { API_URL: 'http://127.0.0.1:55321', ANON_KEY: 'anon.fictief', SERVICE_ROLE_KEY: 'service.fictief' };
  const tekst = Object.entries({ DB_URL: 'postgresql://x', ...sleutels }).map(([k, v]) => `${k}="${v}"`);
  it('met LF (Linux, macOS)', () => expect(leesStatus(tekst.join('\n') + '\n')).toEqual(sleutels));
  it('met CRLF (Windows): geen \\r in de waarden', () => expect(leesStatus(tekst.join('\r\n') + '\r\n')).toEqual(sleutels));
});

describe('wifi-adres kiezen op Windows', () => {
  it('het hotspotadres van een iPhone (172.20.10.x) telt als eigen netwerk; een publiek adres niet', () => {
    expect(isPriveAdres('172.20.10.9')).toBe(true);
    expect(isPriveAdres('8.8.8.8')).toBe(false);
  });
  const ipv4 = (address: string) => ({ address, family: 'IPv4' as const, internal: false, netmask: '', mac: '', cidr: null });
  it('slaat Hyper-V/WSL (vEthernet), VMware en VirtualBox over en kiest de telefoonhotspot', () => {
    const uit = lanAdressen({
      'vEthernet (WSL (Hyper-V firewall))': [ipv4('172.17.0.1')],
      'vEthernet (Default Switch)': [ipv4('172.29.80.1')],
      'VMware Network Adapter VMnet8': [ipv4('192.168.150.1')],
      'VirtualBox Host-Only Network': [ipv4('192.168.56.1')],
      'Wi-Fi': [ipv4('172.20.10.9')],
      'Loopback Pseudo-Interface 1': [{ ...ipv4('127.0.0.1'), internal: true }],
    });
    expect(uit).toEqual([{ naam: 'Wi-Fi', adres: '172.20.10.9' }]);
  });
  it('Linux- en macOS-namen blijven werken zoals voorheen', () => {
    const uit = lanAdressen({ docker0: [ipv4('172.17.0.1')], wlan0: [ipv4('192.168.1.20')], en0: [ipv4('10.0.0.5')] });
    expect(uit).toEqual([{ naam: 'wlan0', adres: '192.168.1.20' }, { naam: 'en0', adres: '10.0.0.5' }]);
  });
});
