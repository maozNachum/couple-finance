// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkFiles, assertArchitecture } from '../../scripts/check-boundaries.mjs';
import { policy } from '../../scripts/aliases.mjs';

const contract = 'supabase/functions/_shared/core/contracts/application-context.ts';
const core = 'supabase/functions/_shared/core/';
const fixtures = (browser, extra = []) => new Map([
  ['src/app/main.ts', browser],
  ...Object.values(policy.financeModules).map((file) => [file, 'export const value = 1;']),
  ...extra,
]);

describe('architecture boundaries', () => {
  it('validates the repository and its exact TypeScript aliases', () => expect(() => assertArchitecture()).not.toThrow());
  it('allows approved runtime-independent imports', () => {
    expect(checkFiles(fixtures("import { value } from '@finance/contracts/application-context';"))).toEqual([]);
  });
  it.each(Object.entries(policy.financeModules))('checks the complete boundary for %s', (alias, target) => {
    expect(checkFiles(fixtures(`import '${alias}';`))).toEqual([]);
    for (const forbidden of [
      "import type { X } from '../../infrastructure/database.ts';",
      "export * from '../../providers/bank.ts';",
      "import { service } from '../../application/service.ts';",
      "const now = Date.now();",
      "const token = process.env.TOKEN;",
    ]) {
      expect(checkFiles(fixtures(`import '${alias}';`, [[target, forbidden]])).length).toBeGreaterThan(0);
    }
    const helper = `${core}domain/boundary-helper.ts`;
    const relative = target.includes('/domain/money/') ? '../boundary-helper.ts'
      : target.includes('/domain/dates/') ? '../boundary-helper.ts' : '../domain/boundary-helper.ts';
    expect(checkFiles(fixtures(`import '${alias}';`, [
      [target, `export * from '${relative}';`],
      [helper, "import secrets from '../../infrastructure/secrets.ts';"],
    ])).join('\n')).toContain('escapes its runtime boundary');
  });
  it('confines the decimal dependency to its canonical wrapper', () => {
    expect(checkFiles(fixtures('', [[contract, "import { Decimal } from 'decimal.js';"]])).join('\n')).toContain('canonical wrapper');
    expect(checkFiles(fixtures('', [[contract, "import 'zod/experimental';"]])).join('\n')).toContain('subpaths require explicit review');
  });
  it.each([
    "import x from '../../supabase/functions/_shared/infrastructure/secrets.ts';",
    "export * from '../../supabase/functions/_shared/providers/bank.ts';",
    "import type { X } from '@finance/application/use-case';",
    "type X = import('@finance/providers/bank').X;",
    "import('@finance/infrastructure/database');",
    "import(path);",
    "import.meta.glob('../../supabase/**');",
    "import x from '@finance/contracts/application-context?raw';",
    "import x from '/supabase/functions/_shared/infrastructure/secrets.ts';",
    "import { value } from '../../supabase/functions/_shared/core/contracts/application-context.ts';",
    "import x from '@supabase/supabase-js';",
    "const worker = new Worker('server.ts');",
    "const x = new URL('../../supabase/server.ts', import.meta.url);",
    "const x = require('../../supabase/server.ts');",
    "eval('import(server)');",
    "import x from '@/../supabase/functions/_shared/providers/bank.ts';",
    "import x from '@/app/missing';",
  ])('rejects forbidden browser dependency: %s', (source) => {
    expect(checkFiles(fixtures(source)).length).toBeGreaterThan(0);
  });
  it.each([
    "export * from '../../infrastructure/secrets.ts';",
    "import React from 'react';",
    "import db from '@supabase/supabase-js';",
    "import fs from 'node:fs';",
    "fetch('https://example.com');",
    "const token = Deno.env.get('TOKEN');",
    "const token = process.env.TOKEN;",
    "const network = globalThis['fetch'];",
    "const now = Date.now();",
    "const env = import.meta.env;",
  ])('rejects runtime dependencies hidden behind an approved contract: %s', (source) => {
    const files = fixtures("import '@finance/contracts/application-context';", [[contract, source]]);
    expect(checkFiles(files).length).toBeGreaterThan(0);
  });
  it('traces approved modules through local helpers and re-exports', () => {
    const files = fixtures("import '@finance/contracts/application-context';", [
      [contract, "export * from '../domain/helper.ts';"],
      [`${core}domain/helper.ts`, "import secret from '../../infrastructure/secrets.ts';"],
    ]);
    expect(checkFiles(files).join('\n')).toContain('escapes its runtime boundary');
  });
  it('does not allow stylesheet imports to expose server sources', () => {
    expect(checkFiles(fixtures('', [['src/app/styles.css', "@import '../../../supabase/functions/_shared/providers/secret.css';"]])).length).toBeGreaterThan(0);
  });
  it('keeps shared presentation independent from pages', () => {
    const files = fixtures('', [['src/shared/ui/Button.ts', "import x from '../../pages/home/page';"], ['src/pages/home/page.ts', 'export default 1;']]);
    expect(checkFiles(files).join('\n')).toContain('Shared UI cannot depend');
  });
});
