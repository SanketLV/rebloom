// Test-only: which source files reach src/backend through their imports, directly or through other
// files. Imports are read with the TypeScript parser (not a regex), so every form counts: import,
// import with no bindings, export ... from, require(), import(), template literals, `import x =
// require()`. Paths resolve like Metro: the `@/` alias, `./` and `../`, extensions and platform
// suffixes, index files. Used by src/__tests__/guards.test.ts.

import { posix } from 'path';
import ts from 'typescript';

export const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const PLATFORM_SUFFIXES = ['', '.native', '.ios', '.android'];

/** Module specifiers of every import-like construct in `source`. */
export function importSpecifiers(fileName: string, source: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const literal = (node: ts.Node | undefined) => {
    if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
      found.push(node.text);
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) literal(node.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      literal(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isRequire = ts.isIdentifier(callee) && callee.text === 'require';
      const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isJestMock =
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'jest' &&
        ['mock', 'requireActual'].includes(callee.name.text);
      if (isRequire || isDynamicImport || isJestMock) literal(node.arguments[0]);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      literal(node.argument.literal);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The file `specifier` (imported from `from`) resolves to, or null for packages / unknown files. */
export function resolveImport(from: string, specifier: string, files: Set<string>): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = specifier.slice(2);
  else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    base = posix.join(posix.dirname(from), specifier);
  } else return null;
  base = posix.normalize(base);
  const candidates = [base];
  for (const suffix of PLATFORM_SUFFIXES) {
    for (const ext of SOURCE_EXTENSIONS) {
      candidates.push(`${base}${suffix}${ext}`, `${base}/index${suffix}${ext}`);
    }
  }
  return candidates.find((candidate) => files.has(candidate)) ?? null;
}

/**
 * Files (paths relative to src/, with `/`) outside backend/ and testing/ that reach backend/,
 * other than the allowed ones. A path into backend/ that isn't a known file still counts.
 */
export function backendReachers(sources: Record<string, string>, allowed: string[]): string[] {
  const files = new Set(Object.keys(sources));
  const inBackend = (path: string) => path === 'backend' || path.startsWith('backend/');
  const edges = new Map<string, string[]>();
  const direct = new Set<string>();
  for (const [path, source] of Object.entries(sources)) {
    const targets: string[] = [];
    for (const specifier of importSpecifiers(path, source)) {
      const resolved = resolveImport(path, specifier, files);
      if (resolved) targets.push(resolved);
      else if (specifier.startsWith('@/') || specifier.startsWith('.')) {
        const raw = specifier.startsWith('@/')
          ? posix.normalize(specifier.slice(2))
          : posix.normalize(posix.join(posix.dirname(path), specifier));
        if (inBackend(raw)) direct.add(path);
      }
    }
    edges.set(path, targets);
  }
  const reaches = new Map<string, boolean>();
  const visit = (path: string, seen: Set<string>): boolean => {
    if (inBackend(path)) return true;
    if (reaches.has(path)) return reaches.get(path)!;
    if (seen.has(path)) return false;
    seen.add(path);
    const result = direct.has(path) || (edges.get(path) ?? []).some((next) => visit(next, seen));
    reaches.set(path, result);
    return result;
  };
  return [...files]
    .filter((path) => !inBackend(path) && !path.startsWith('testing/') && !allowed.includes(path))
    .filter((path) => visit(path, new Set()))
    .sort();
}
