import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { aliases } from './scripts/aliases.mjs';
import { boundaryPlugin } from './scripts/check-boundaries.mjs';

export default defineConfig({
  plugins: [boundaryPlugin(), react()],
  resolve: { alias: aliases },
  server: {
    host: '127.0.0.1',
    fs: { deny: ['.env', '.env.*', '**/.git/**', '**/sources/**', '**/supabase/functions/_shared/application/**', '**/supabase/functions/_shared/infrastructure/**', '**/supabase/functions/_shared/providers/**'] },
  },
  build: { target: 'es2022' },
});
