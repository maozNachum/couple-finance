import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { aliases } from './scripts/aliases.mjs';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: aliases },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/architecture/**/*.test.mjs', 'tests/portable/**/*.test.ts'],
    clearMocks: true,
  },
});
