import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { policy, repositoryRoot } from './aliases.mjs';

const coreRoot = 'supabase/functions/_shared/core/';
const codePattern = /\.(?:[cm]?[jt]sx?)$/;
const testPattern = /\.(?:test|spec)\.[jt]sx?$/;
const forbiddenCoreGlobals = new Set([
  'React', 'ReactDOM', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'Worker', 'SharedWorker', 'navigator', 'window', 'document', 'localStorage',
  'sessionStorage', 'process', 'Deno', 'Bun', 'global', 'globalThis', 'self',
  'setTimeout', 'setInterval', 'performance', 'Date',
]);
const normalize = (file) => file.replaceAll('\\', '/');
const isCore = (file) => file.startsWith(`${coreRoot}contracts/`) || file.startsWith(`${coreRoot}domain/`);
const packageName = (specifier) => specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];

/** Inspect all source files, including unused core helpers, so re-exports cannot launder dependencies. */
export function checkFiles(files, activePolicy = policy) {
  const errors = [];
  const report = (file, message) => errors.push(`${file}: ${message}`);
  for (const [alias, target] of Object.entries(activePolicy.financeModules)) {
    if (!alias.startsWith('@finance/') || alias.includes('*') || !isCore(target) || target.includes('..')) {
      report('architecture-policy', `Invalid approved core module: ${alias}`);
    }
    if (!files.has(target)) report('architecture-policy', `Missing approved core module: ${target}`);
  }
  for (const [file, source] of files) {
    const browser = file.startsWith('src/');
    const core = isCore(file);
    if (!browser && !core) continue;
    if (file.endsWith('.css')) {
      for (const match of source.matchAll(/(?:@import\s+(?:url\()?|url\()\s*['"]?([^'"\s;)]+)/g)) {
        const specifier = match[1];
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
        if (!specifier.startsWith('.') || !target.startsWith('src/') || !target.endsWith('.css') || !files.has(target)) {
          report(file, `Stylesheet dependency is not approved: ${specifier}`);
        }
      }
      continue;
    }
    if (!codePattern.test(file)) continue;
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    for (const reference of [...ast.referencedFiles, ...ast.typeReferenceDirectives]) {
      report(file, `Triple-slash dependency is not allowed: ${reference.fileName}`);
    }
    function checkImport(specifier) {
      if (/[?#!\\]/.test(specifier)) return report(file, `Import suffix or noncanonical path is prohibited: ${specifier}`);
      let target;
      if (specifier.startsWith('@finance/')) {
        target = activePolicy.financeModules[specifier];
        if (!target) return report(file, `Unapproved @finance module: ${specifier}`);
      } else if (specifier.startsWith('@/')) {
        target = path.posix.normalize(`src/${specifier.slice(2)}`);
      } else if (specifier.startsWith('.')) {
        target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      } else {
        const allowed = core ? activePolicy.corePackages : [...activePolicy.browserPackages, ...(testPattern.test(file) ? activePolicy.browserTestPackages : [])];
        if (!allowed.includes(packageName(specifier))) report(file, `Unapproved ${core ? 'core' : 'browser'} package or absolute import: ${specifier}`);
        if (core && allowed.includes(packageName(specifier)) && !allowed.includes(specifier)) report(file, `Core package subpaths require explicit review: ${specifier}`);
        const owners = activePolicy.corePackageOwners?.[packageName(specifier)];
        if (core && owners && !owners.includes(file)) report(file, `Package must stay in its canonical wrapper: ${specifier}`);
        return;
      }
      if (browser && target.startsWith('supabase/') && !specifier.startsWith('@finance/')) {
        return report(file, 'Browser core access requires an exact approved @finance alias');
      }
      if ((core && !isCore(target)) || (browser && !target.startsWith('src/') && !isCore(target))) {
        return report(file, `Dependency escapes its runtime boundary: ${specifier}`);
      }
      const resolved = [target, `${target}.ts`, `${target}.tsx`, `${target}.js`, `${target}/index.ts`, `${target}/index.tsx`].find((candidate) => files.has(candidate));
      if (!resolved) return report(file, `Unresolved local dependency: ${specifier}`);
      if (!testPattern.test(file) && testPattern.test(resolved)) report(file, 'Production code cannot import tests');
      if (file.startsWith('src/shared/') && !resolved.startsWith('src/shared/') && !isCore(resolved)) report(file, 'Shared UI cannot depend on app, pages, or features');
      if (file.startsWith('src/features/')) {
        if (resolved.startsWith('src/app/') || resolved.startsWith('src/pages/')) report(file, 'Features cannot depend on app or pages');
        const feature = file.split('/')[2];
        if (resolved.startsWith('src/features/') && resolved.split('/')[2] !== feature && !/^src\/features\/[^/]+\/index\.ts$/.test(resolved)) report(file, 'Cross-feature imports must use the feature public entry');
      }
    }
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) checkImport(node.moduleSpecifier.text);
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) checkImport(node.argument.literal.text);
      if (ts.isImportEqualsDeclaration(node)) report(file, 'Import-equals/require dependencies are prohibited');
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg) && node.arguments.length === 1) checkImport(arg.text);
        else report(file, 'Dynamic imports require one static string literal');
      }
      if (ts.isIdentifier(node) && ['require', 'eval', 'Function', 'Worker', 'SharedWorker'].includes(node.text)) report(file, `Uninspectable runtime loading is prohibited: ${node.text}`);
      if (ts.isMetaProperty(node) && core) report(file, 'Core cannot use runtime import metadata');
      if (ts.isPropertyAccessExpression(node) && ts.isMetaProperty(node.expression)) report(file, 'Runtime import.meta access belongs only in approved infrastructure, not current source');
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL') report(file, 'Asset URL imports need an explicit architecture policy before use');
      if (core && ts.isIdentifier(node) && forbiddenCoreGlobals.has(node.text)) report(file, `Core cannot access runtime capability: ${node.text}`);
      if (core && ts.isPropertyAccessExpression(node) && node.expression.getText(ast) === 'Math' && node.name.text === 'random') report(file, 'Core randomness must be supplied as an input');
      if (core && (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) report(file, 'Core cannot contain JSX');
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return [...new Set(errors)];
}

export function readSourceFiles(root = repositoryRoot) {
  const files = new Map();
  function walk(relative) {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = normalize(path.join(relative, entry.name));
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed in runtime source: ${child}`);
      if (entry.isDirectory()) walk(child);
      else if (codePattern.test(child) || child.endsWith('.css')) {
        const resolved = realpathSync(path.join(root, child));
        if (!resolved.startsWith(realpathSync(root) + path.sep)) throw new Error(`Source escapes repository: ${child}`);
        files.set(child, readFileSync(resolved, 'utf8'));
      }
    }
  }
  walk('src');
  walk(coreRoot);
  return files;
}

export function assertArchitecture(root = repositoryRoot) {
  const errors = checkFiles(readSourceFiles(root));
  const config = JSON.parse(readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
  const expectedPaths = { '@/*': ['./src/*'], ...Object.fromEntries(Object.entries(policy.financeModules).map(([alias, target]) => [alias, [`./${target}`]])) };
  if (JSON.stringify(config.compilerOptions.paths) !== JSON.stringify(expectedPaths)) errors.push('tsconfig.json aliases must match the exact reviewed architecture policy');
  const deno = JSON.parse(readFileSync(path.join(root, 'tests/runtime/deno.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const expectedImports = {
    ...Object.fromEntries(policy.corePackages.map((name) => [name, `npm:${name}@${manifest.dependencies[name]}`])),
    ...Object.fromEntries(Object.entries(policy.financeModules).map(([alias, target]) => [alias, `../../${target}`])),
  };
  if (JSON.stringify(deno.imports) !== JSON.stringify(expectedImports)) errors.push('Deno imports must match exact reviewed modules and npm dependency versions');
  if (deno.nodeModulesDir !== 'manual' || deno.lock !== false) errors.push('Deno tests must use the npm-installed, npm-lockfile-controlled dependency tree');
  if (errors.length) throw new Error(`Architecture boundary violations:\n${errors.join('\n')}`);
}

/** Also guards Vite's real graph, including package re-exports and unanticipated loaders. */
export function boundaryPlugin() {
  return {
    name: 'couple-finance-boundaries',
    buildStart() { assertArchitecture(); },
    handleHotUpdate() { assertArchitecture(); },
    moduleParsed(info) {
      const id = normalize(info.id.split('?')[0]);
      const base = normalize(repositoryRoot);
      if (!id.startsWith(base)) return;
      const relative = id.slice(base.length).replace(/^\//, '');
      if (relative.startsWith('supabase/') && !isCore(relative)) throw new Error(`Server module reached browser build: ${relative}`);
      if (relative.startsWith('sources/')) throw new Error('Synced references must not enter the browser bundle');
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertArchitecture();
  console.log('Architecture passed: exact @finance imports, transitive core purity, source boundaries, and alias parity.');
}
