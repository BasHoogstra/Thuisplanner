/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relatieve paden: de build werkt ook vanuit een willekeurige map of als los bestand.
export default defineConfig({
  base: './',
  plugins: [react()],
  // De sync-module staat naast de app (../sync); Vite mag die map lezen.
  server: { host: '127.0.0.1', port: 5180, strictPort: true, fs: { allow: ['..'] } },
  preview: { host: '127.0.0.1', port: 5181, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
