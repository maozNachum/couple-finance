import { build } from 'vite';
import { boundaryPlugin } from './check-boundaries.mjs';
import { aliases } from './aliases.mjs';

// A test-only browser bundle. Never included in the application or its dist/.
await build({
  configFile: false,
  plugins: [boundaryPlugin()],
  resolve: { alias: aliases },
  build: {
    outDir: '.artifacts/core-probe',
    emptyOutDir: true,
    lib: { entry: 'tests/portable/browser-entry.ts', name: 'FinanceCoreProbe', formats: ['iife'], fileName: () => 'core.js' },
  },
});
