import { it } from 'vitest';
import { coreCases } from './core-cases.ts';

for (const testCase of coreCases) it(testCase.name, testCase.run);
