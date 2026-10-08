import { coreCases } from '../portable/core-cases.ts';

for (const testCase of coreCases) Deno.test(testCase.name, testCase.run);
