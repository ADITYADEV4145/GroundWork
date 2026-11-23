import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// A small project with "installed" dependencies in four ecosystems, a workspace sibling and three service
// contracts, written from literals so the gate and the tests run offline. `// expect: <kind>` marks the lines
// the dependency checker must flag; every other line must stay silent.

const FILES: Record<string, string> = {
  '.gitignore': 'node_modules/\n.venv/\nvendor/\n.groundwork/\n',
  'package.json': '{"name":"deps-fixture","private":true,"workspaces":["packages/*"],"dependencies":{"mathkit":"2.3.1","loosejs":"1.0.0"}}\n',
  'node_modules/mathkit/package.json': '{"name":"mathkit","version":"2.3.1","main":"index.js","types":"index.d.ts"}\n',
  'node_modules/mathkit/index.d.ts': [
    'export declare function clamp(value: number, min: number, max: number): number;',
    'export declare function sum(...values: number[]): number;',
    '/** @deprecated use clamp */',
    'export declare function limit(value: number, max: number): number;',
    'export declare class Matrix { constructor(rows: number, cols: number); transpose(): Matrix; static identity(n: number): Matrix; }',
    'export declare const VERSION: string;',
    '',
  ].join('\n'),
  'node_modules/mathkit/index.js': 'module.exports = {};\n',
  // No types: the surface is open, so nothing about it may be flagged.
  'node_modules/loosejs/package.json': '{"name":"loosejs","version":"1.0.0","main":"index.js"}\n',
  'node_modules/loosejs/index.js': 'module.exports = new Proxy({}, { get: () => () => 1 });\n',
  'packages/shared/package.json': '{"name":"@fx/shared","version":"0.1.0","main":"src/index.ts","types":"src/index.ts"}\n',
  'packages/shared/src/index.ts': 'export function slugify(text: string): string {\n  return text.toLowerCase();\n}\n',
  'packages/web/package.json': '{"name":"@fx/web","version":"0.1.0","dependencies":{"@fx/shared":"workspace:*"}}\n',
  'packages/web/src/page.ts': [
    "import { slugify, slugifyAll } from '@fx/shared'; // expect: unknown-export",
    "export const a = slugify('A b');",
    "export const b = slugify('A b', '-'); // expect: arity",
    'export const c = slugifyAll;',
    '',
  ].join('\n'),
  'src/app.ts': [
    "import { clamp, sum, clampAll, limit } from 'mathkit'; // expect: unknown-export, deprecated",
    "import * as mk from 'mathkit';",
    "import loose from 'loosejs';",
    'export const a = clamp(1, 0, 2);',
    'export const b = clamp(1, 0); // expect: arity',
    'export const c = sum(1, 2, 3, 4);',
    'export const d = mk.clamp(1, 0, 2);',
    'export const e = mk.clampTo(1, 0, 2); // expect: unknown-member',
    'export const f = loose.anything(1, 2, 3);',
    'export const g = limit(1, 2); // expect: deprecated',
    'export const h = [clampAll];',
    '',
  ].join('\n'),
  '.venv/lib/python3.12/site-packages/textkit/__init__.py': [
    'from .core import wrap, Wrapper',
    '',
    'def shout(text, times=1):',
    '    return text.upper() * times',
    '',
    'DEFAULT_WIDTH = 80',
    '',
  ].join('\n'),
  '.venv/lib/python3.12/site-packages/textkit/core.py': 'def wrap(text, width):\n    return text\n\nclass Wrapper:\n    pass\n',
  '.venv/lib/python3.12/site-packages/textkit-1.4.0.dist-info/METADATA': 'Name: textkit\nVersion: 1.4.0\n',
  '.venv/lib/python3.12/site-packages/textkit-1.4.0.dist-info/top_level.txt': 'textkit\n',
  // Module-level __getattr__: any name may exist, so the surface is open.
  '.venv/lib/python3.12/site-packages/lazykit/__init__.py': 'def __getattr__(name):\n    return name\n',
  '.venv/lib/python3.12/site-packages/lazykit-0.1.0.dist-info/METADATA': 'Name: lazykit\nVersion: 0.1.0\n',
  'src/tool.py': [
    'import textkit',
    'import lazykit',
    'from textkit import wrap, Wrapper, unwrap  # expect: unknown-export',
    'from textkit.core import wrap as core_wrap',
    '',
    'a = textkit.shout("x")',
    'b = textkit.shout("x", 2)',
    'c = textkit.whisper("x")  # expect: unknown-member',
    'd = textkit.shout()  # expect: arity',
    'e = lazykit.whatever("x")',
    'f = textkit.DEFAULT_WIDTH',
    'g = [wrap, Wrapper, unwrap, core_wrap]',
    '',
  ].join('\n'),
  'svc/go.mod': 'module example.com/svc\n\ngo 1.21\n\nrequire example.com/strkit v1.2.0\n',
  'svc/vendor/modules.txt': '# example.com/strkit v1.2.0\n## explicit\nexample.com/strkit\n',
  'svc/vendor/example.com/strkit/strkit.go': [
    'package strkit',
    '',
    '// Pad pads s to width.',
    'func Pad(s string, width int) string { return s }',
    '',
    '// Trim is the old name.',
    '//',
    '// Deprecated: use Pad.',
    'func Trim(s string) string { return s }',
    '',
    'func helper() {}',
    '',
  ].join('\n'),
  'svc/main.go': [
    'package main',
    '',
    'import "example.com/strkit"',
    '',
    'func main() {',
    '\t_ = strkit.Pad("a", 3)',
    '\t_ = strkit.PadLeft("a", 3) // expect: unknown-member',
    '\t_ = strkit.Pad("a", 3, 4) // expect: arity',
    '\t_ = strkit.Trim("a") // expect: deprecated',
    '}',
    '',
  ].join('\n'),
  'api/openapi.yaml': 'openapi: 3.0.0\npaths:\n  /users:\n    get: {}\n    post: {}\n  /users/{id}:\n    get: {}\n',
  'api/schema.graphql': 'type Query {\n  user(id: ID!): User\n}\ntype Mutation {\n  createUser(name: String!): User\n}\ntype User { id: ID! }\n',
  'api/greeter.proto': 'syntax = "proto3";\nservice Greeter {\n  rpc SayHello (Req) returns (Res);\n}\n',
  'src/client.ts': [
    'declare const gql: (s: TemplateStringsArray) => string;',
    'declare const GreeterClient: new (addr: string) => Record<string, (r: unknown) => unknown>;',
    'export async function run(id: string): Promise<unknown[]> {',
    '  const ok = await fetch(`/users/${id}`);',
    "  const gone = await fetch('/users/1/avatar'); // expect: contract",
    "  const del = await fetch('/users', { method: 'DELETE' }); // expect: contract",
    "  const other = await fetch('/health');",
    '  const q = gql`query { user(id: 1) { id } account(id: 1) { id } }`; // expect: contract',
    "  const greeter = new GreeterClient('x');",
    '  const hi = greeter.sayHello({});',
    '  const bye = greeter.sayGoodbye({}); // expect: contract',
    '  return [ok, gone, del, other, q, hi, bye];',
    '}',
    '',
  ].join('\n'),
};

export const DEPS_FIXTURE_FILES = ['src/app.ts', 'packages/web/src/page.ts', 'src/tool.py', 'svc/main.go', 'src/client.ts'];

export function writeDepsFixture(dir: string): void {
  for (const [rel, text] of Object.entries(FILES)) {
    const file = path.join(dir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

/** `file:line:kind` for every `expect:` marker (a line may expect several kinds). */
export function depsFixtureExpected(): string[] {
  const out: string[] = [];
  for (const rel of DEPS_FIXTURE_FILES) {
    FILES[rel]!.split('\n').forEach((line, i) => {
      const m = /(?:\/\/|#)\s*expect:\s*([a-z, -]+)$/.exec(line);
      for (const kind of m ? m[1]!.split(',').map((k) => k.trim()) : []) out.push(`${rel}:${i + 1}:${kind}`);
    });
  }
  return out.sort();
}
