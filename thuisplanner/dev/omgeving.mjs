// Thuisplanner dev: de lokale Supabase-gegevens ophalen (URL's en de lokale demosleutels) uit de omgeving of
// uit `supabase status -o env`. Weigert alles wat niet lokaal is.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const DEMO = {
  wachtwoord: 'thuisplanner-demo-lokaal',   // alleen voor de fictieve demo-accounts op een lokale stack
  accounts: {
    anna: { email: 'anna.demo@test.invalid', naam: 'Anna' },
    bram: { email: 'bram.demo@test.invalid', naam: 'Bram' },
  },
  huishouden: 'Familie Demo',
};

export function lokaleSupabase() {
  let { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = process.env;
  if (!API_URL || !ANON_KEY) {
    const map = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const cli = process.env.SUPABASE || 'supabase';
    const [bin, ...args] = cli.split(' ');
    const env = execFileSync(bin, [...args, 'status', '-o', 'env'], { cwd: map, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const lees = k => (env.match(new RegExp('^' + k + '="?([^"\\n]*)"?$', 'm')) || [])[1];
    API_URL = API_URL || lees('API_URL');
    ANON_KEY = ANON_KEY || lees('ANON_KEY');
    SERVICE_ROLE_KEY = SERVICE_ROLE_KEY || lees('SERVICE_ROLE_KEY');
  }
  if (!API_URL || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(API_URL)) {
    throw new Error('Weigering: de demo draait alleen tegen een lokale Supabase (http://127.0.0.1:<poort>)');
  }
  return { API_URL, ANON_KEY, SERVICE_ROLE_KEY };
}
