// @vitest-environment node
import { it } from 'vitest';
import { csvCases } from './csv-cases';
for(const c of csvCases)it(c.name,c.run);
