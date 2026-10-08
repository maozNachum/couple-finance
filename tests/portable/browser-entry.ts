import { coreCases } from './core-cases.ts';

export function runCoreCases(): string[] {
  return coreCases.map((testCase) => { testCase.run(); return testCase.name; });
}
