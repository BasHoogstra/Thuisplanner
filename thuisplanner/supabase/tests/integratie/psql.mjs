// Eén psql-aanroep voor de integratietests (alleen een lokale database). Standaard psql op het PATH (zoals in de CI).
// Op een machine zonder psql: KG_PSQL_CONTAINER=supabase_db_<project_id> voert dezelfde opdracht uit met de psql in de
// databasecontainer van die lokale stack (docker exec), met het adres binnen de container. Geen ander programma nodig.
import { execFileSync } from 'node:child_process';

const ARGS = ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'];

export function psql(dbUrl, q) {
  if (!/\/\/([^@/]*@)?(127\.0\.0\.1|localhost):\d+\//.test(dbUrl || '')) throw new Error('Weigering: alleen een lokale database');
  const container = process.env.KG_PSQL_CONTAINER;
  if (container) {
    if (!/^supabase_db_[a-z0-9_]+$/.test(container)) throw new Error('KG_PSQL_CONTAINER moet supabase_db_<project_id> zijn');
    const binnen = dbUrl.replace(/@(127\.0\.0\.1|localhost):\d+\//, '@127.0.0.1:5432/');
    return execFileSync('docker', ['exec', '-i', container, 'psql', ...ARGS, '-d', binnen, '-c', q]).toString().trim();
  }
  return execFileSync(process.env.PSQL || 'psql', [...ARGS, '-d', dbUrl, '-c', q]).toString().trim();
}
