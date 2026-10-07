import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export const policy = JSON.parse(readFileSync(new URL('./architecture-policy.json', import.meta.url), 'utf8'));
export const aliases = [
  ...Object.entries(policy.financeModules).map(([name, file]) => ({
    find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    replacement: fileURLToPath(new URL(`../${file}`, import.meta.url)),
  })),
  { find: '@', replacement: fileURLToPath(new URL('../src', import.meta.url)) },
];
