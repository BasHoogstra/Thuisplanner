/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { supabaseProxy } from './scripts/lokaal-platform.mjs';
import { bewaking, controleerOmgeving } from './scripts/staging-build';
import { ontwerp } from './scripts/ontwerp';

// Relatieve paden: de build werkt ook vanuit een willekeurige map of als los bestand.
export default defineConfig(({ mode }) => {
  // Telefoonproef: alleen als scripts/lokaal.mjs een proxy-doel heeft gezet (KG_SUPABASE_DOEL in
  // .env.lokaal.local; zonder VITE_-voorvoegsel, dus nooit in de browser) stuurt Vite Auth, REST en Realtime
  // door naar de lokale Supabase. Anders geen proxy, zoals voorheen.
  const doel = loadEnv(mode, process.cwd(), 'KG_').KG_SUPABASE_DOEL;
  const proxy = doel ? supabaseProxy(doel) : undefined;
  // Omgeving bewaken (scripts/staging-build.ts): staging alleen met precies één online project en zonder
  // demo-gegevens of geheimen; elke build krijgt een _headers-bestand met de beveiligingsheaders.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const { staging } = controleerOmgeving(mode, env);
  return {
    base: './',
    plugins: [react(), ontwerp(), bewaking(mode, env)],
    define: staging ? { 'import.meta.env.VITE_OMGEVING': JSON.stringify('staging') } : undefined,
    // De sync-module staat naast de app (../sync); Vite mag die map lezen.
    server: { host: '127.0.0.1', port: 5180, strictPort: true, fs: { allow: ['..'] }, proxy },
    preview: { host: '127.0.0.1', port: 5181, strictPort: true, proxy },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
      // Schermtests met userEvent in jsdom duren onder volle parallelle belasting (plus de lokale Docker-stack) soms
      // langer dan de standaard 5 s; afzonderlijk zijn ze ruim binnen 1 s. Een ruimere grens, geen overgeslagen test.
      testTimeout: 20_000,
    },
  };
});
