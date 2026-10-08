import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { aliases } from './scripts/aliases.mjs';
import { boundaryPlugin } from './scripts/check-boundaries.mjs';
import { assertPublicConfig } from './scripts/check-public-config.mjs';

export default defineConfig(({ mode }) => {
  assertPublicConfig({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env });
  return {
  plugins: [boundaryPlugin(), react()],
  resolve: { alias: aliases },
  server: {
    host: '127.0.0.1',
    fs: { deny: ['.env', '.env.*', '**/.git/**', '**/sources/**', '**/supabase/functions/_shared/application/**', '**/supabase/functions/_shared/infrastructure/**', '**/supabase/functions/_shared/providers/**'] },
  },
  build: { target: 'es2022' },
  };
});
