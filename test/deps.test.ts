import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { DependencyChecker } from '../src/deps/check.js';
import { checkContracts, loadContracts } from '../src/deps/contracts.js';
import { openJar, parseClass, readJarEntry } from '../src/deps/jar.js';
import { gradleDependencies, pomDependencies } from '../src/deps/maven.js';
import { parseGoMod } from '../src/deps/go.js';
import { arityAllows, arityText, shortVersion } from '../src/deps/surface.js';
import { discoverWorkspaces } from '../src/deps/workspaces.js';
import { renderResults, verifyChanged, verifyChangedDeep } from '../src/grounding/index.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { PHASE4_DEPS_CHECKS } from '../src/selftest/checks/phase4-deps.js';
import { DEPS_FIXTURE_FILES, depsFixtureExpected, writeDepsFixture } from '../src/selftest/deps-fixture.js';
import { tempDir } from '../src/selftest/fixtures.js';
import { initSqlBackend, openDb, type Db } from '../src/store/db.js';

const MAIN = path.resolve(__dirname, '../src/cli/main.ts');
const TSX = import.meta.resolve('tsx');
const changed = DEPS_FIXTURE_FILES.map((file) => ({ file, ranges: null }));

describe('checking beyond the repo', () => {
  let dir: string;
  let db: Db;
  beforeAll(async () => {
    dir = tempDir('gw-deps-test-');
    writeDepsFixture(dir);
    await initSqlBackend();
    await refreshIndex(dir);
    db = openDb(indexDbPath(dir), { readonly: true });
  });
  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes its phase gate', async () => {
    for (const check of PHASE4_DEPS_CHECKS) expect(await check.run({ quick: true, sequences: 1 })).toMatchObject({ ok: true });
  });

  it('flags exactly the planted mistakes across npm, PyPI, Go, a workspace sibling and contracts', async () => {
    const findings = (await verifyChangedDeep(db, dir, changed, defaultConfig())).flatMap((r) => r.findings);
    expect([...new Set(findings.map((f) => `${f.file}:${f.line}:${f.kind}`))].sort()).toEqual(depsFixtureExpected());
    // Deprecations and contract mismatches inform; they never block.
    expect(findings.filter((f) => f.kind === 'deprecated' || f.kind === 'contract').every((f) => !f.blocking)).toBe(true);
    expect(findings.filter((f) => f.kind === 'unknown-export' || f.kind === 'unknown-member' || f.kind === 'arity').every((f) => f.blocking)).toBe(true);
  });

  it('names the real alternative and the installed version', async () => {
    const text = renderResults(await verifyChangedDeep(db, dir, changed, defaultConfig()), 4000);
    expect(text).toContain('mathkit has no `clampAll`; installed version has `clamp` (v2.3).');
    expect(text).toContain('mathkit has no `clampTo`; installed version has `clamp` (v2.3).');
    expect(text).toContain('clamp takes 3 arguments, got 2 (mathkit v2.3');
    expect(text).toContain('textkit has no `unwrap`; installed version has `wrap` (v1.4).');
    expect(text).toContain('@fx/shared has no `slugifyAll`; it has `slugify` (workspace package).');
    expect(text).toContain('example.com/strkit has no `PadLeft`; installed version has `Pad` (v1.2).');
    expect(text).toContain('`limit` is deprecated in mathkit v2.3. use clamp.');
    expect(text).toContain('`/users` has no DELETE in api/openapi.yaml; it allows GET, POST.');
    expect(text).toContain('query `account` is not in api/schema.graphql');
    expect(text).toContain('service `Greeter` has no rpc `sayGoodbye` in api/greeter.proto');
  });

  it('adds nothing when deps.enabled is off, and honours changed-line ranges', async () => {
    const off = { ...defaultConfig(), deps: { ...defaultConfig().deps, enabled: false } };
    expect(await verifyChangedDeep(db, dir, changed, off)).toEqual(verifyChanged(db, dir, changed, off));
    const ranged = await verifyChangedDeep(db, dir, [{ file: 'src/app.ts', ranges: [[4, 4]] }], defaultConfig());
    expect(ranged[0]!.findings).toEqual([]);
    const one = await verifyChangedDeep(db, dir, [{ file: 'src/app.ts', ranges: [[5, 5]] }], defaultConfig());
    expect(one[0]!.findings.map((f) => f.kind)).toEqual(['arity']);
  });

  it('checks Go files that in-repo grounding leaves as unsupported', async () => {
    const [result] = await verifyChangedDeep(db, dir, [{ file: 'svc/main.go', ranges: null }], defaultConfig());
    expect(result!.unchecked).toBeNull();
    expect(result!.findings.length).toBe(3);
  });

  it('reads each package version once, then serves it from .groundwork/deps', async () => {
    rmSync(path.join(dir, '.groundwork', 'deps'), { recursive: true, force: true });
    const cold = new DependencyChecker(db, dir, defaultConfig());
    for (const f of DEPS_FIXTURE_FILES) await cold.check(f);
    expect(cold.stats.built).toBeGreaterThan(0);
    expect(existsSync(path.join(dir, '.groundwork', 'deps', 'npm', 'mathkit@2.3.1'))).toBe(true);
    const warm = new DependencyChecker(db, dir, defaultConfig());
    const findings = [];
    for (const f of DEPS_FIXTURE_FILES) findings.push(...(await warm.check(f)).findings);
    // Workspace siblings are never cached: their source changes without a version bump.
    expect(warm.stats.cached).toBeGreaterThan(0);
    expect(warm.stats.built).toBeLessThan(cold.stats.built);
    expect(findings.length).toBeGreaterThan(5);
    // A different installed version is a different cache entry.
    const pkg = path.join(dir, 'node_modules', 'mathkit');
    writeFileSync(path.join(pkg, 'package.json'), '{"name":"mathkit","version":"3.0.0","main":"index.js","types":"index.d.ts"}\n');
    writeFileSync(path.join(pkg, 'index.d.ts'), readFileSync(path.join(pkg, 'index.d.ts'), 'utf8') + 'export declare function clampAll(values: number[]): number[];\n');
    try {
      const upgraded = await new DependencyChecker(db, dir, defaultConfig()).check('src/app.ts');
      expect(upgraded.findings.some((f) => f.name === 'clampAll')).toBe(false);
      expect(upgraded.findings.find((f) => f.name === 'mk.clampTo' || f.name === 'clampTo')!.message).toContain('(v3.0)');
    } finally {
      writeDepsFixture(dir);
    }
  });

  it('fails open on files it cannot read or does not know', async () => {
    const checker = new DependencyChecker(db, dir, defaultConfig());
    expect(await checker.check('missing.ts')).toEqual({ checked: false, findings: [] });
    expect(await checker.check('api/openapi.yaml')).toEqual({ checked: false, findings: [] });
    expect(checkContracts(dir, 'nope.ts')).toEqual([]);
  });

  it('gw deps reports workspaces and contracts, builds the cache and shows a surface, with --json', () => {
    const gw = (...args: string[]): string => execFileSync(process.execPath, ['--import', TSX, MAIN, ...args], { cwd: dir, encoding: 'utf8' });
    const status = JSON.parse(gw('deps', '--json')) as { workspaces: { name: string }[]; contracts: { httpPaths: number; protoServices: number } };
    expect(status.workspaces.map((w) => w.name).sort()).toEqual(['@fx/shared', '@fx/web']);
    expect(status.contracts).toMatchObject({ httpPaths: 2, protoServices: 1 });
    const built = JSON.parse(gw('deps', 'build', '--json')) as { packages: number; byEcosystem: Record<string, number> };
    expect(built.byEcosystem).toMatchObject({ npm: 2, pypi: 2 });
    expect(gw('deps', 'show', 'mathkit')).toMatch(/mathkit@2\.3\.1 \(npm\).*checked\n.*clamp/s);
    expect(gw('deps', 'show', 'loosejs')).toContain('open, not checked');
    const verify = spawnSync(process.execPath, ['--import', TSX, MAIN, 'verify', 'src/app.ts'], { cwd: dir, encoding: 'utf8' });
    expect(verify.status).toBe(1);
    expect(verify.stdout).toContain('mathkit has no `clampAll`');
  });

  it('never reaches for the network or a subprocess', () => {
    const src = path.resolve(__dirname, '../src/deps');
    for (const file of readdirSync(src)) {
      const text = readFileSync(path.join(src, file), 'utf8');
      expect(text, file).not.toMatch(/from 'node:(https?|net|dns|tls|dgram|child_process)'|\bfetch\(|XMLHttpRequest|WebSocket/);
    }
  });
});

describe('dependency metadata readers', () => {
  it('arity helpers', () => {
    expect(arityAllows([[1, 2]], 2)).toBe(true);
    expect(arityAllows([[1, 2]], 3)).toBe(false);
    expect(arityAllows([[0, null]], 9)).toBe(true);
    expect(arityAllows([[1, 1], [3, 3]], 3)).toBe(true);
    expect(arityText([[2, 3]])).toBe('2-3');
    expect(shortVersion('4.17.21')).toBe('v4.17');
  });

  it('reads go.mod requires and replaces', () => {
    const dir = tempDir('gw-gomod-');
    try {
      writeFileSync(path.join(dir, 'go.mod'), 'module example.com/a\n\ngo 1.21\n\nrequire (\n\tgithub.com/x/y v1.2.3\n\tgithub.com/z/w v0.1.0 // indirect\n)\n\nreplace github.com/z/w => ../w\n');
      const mod = parseGoMod(dir)!;
      expect(mod.module).toBe('example.com/a');
      expect(mod.requires.get('github.com/x/y')).toBe('v1.2.3');
      expect(mod.replaces.get('github.com/z/w')).toBe('../w');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads Maven and Gradle coordinates, resolving properties', () => {
    const dir = tempDir('gw-pom-');
    try {
      const pom = path.join(dir, 'pom.xml');
      writeFileSync(pom, '<project><properties><guava.version>33.0.0-jre</guava.version></properties><modules><module>core</module></modules><dependencies><dependency><groupId>com.google.guava</groupId><artifactId>guava</artifactId><version>${guava.version}</version></dependency></dependencies></project>');
      const read = pomDependencies(readFileSync(pom, 'utf8'));
      expect(read.modules).toEqual(['core']);
      expect(read.deps).toEqual([{ group: 'com.google.guava', artifact: 'guava', version: '33.0.0-jre' }]);
      expect(gradleDependencies("dependencies {\n  implementation 'com.google.code.gson:gson:2.10.1'\n  testImplementation(\"junit:junit:4.13.2\")\n}")).toEqual([
        { group: 'com.google.code.gson', artifact: 'gson', version: '2.10.1' },
        { group: 'junit', artifact: 'junit', version: '4.13.2' },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('discovers pnpm, Go, Cargo and Maven workspaces', () => {
    const dir = tempDir('gw-ws-');
    const write = (rel: string, text: string): void => {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), text);
    };
    try {
      write('pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');
      write('packages/a/package.json', '{"name":"@w/a"}');
      write('go.work', 'go 1.21\n\nuse (\n\t./svc\n)\n');
      write('svc/go.mod', 'module example.com/svc\n');
      write('Cargo.toml', '[workspace]\nmembers = ["crates/*"]\n');
      write('crates/util/Cargo.toml', '[package]\nname = "util"\nversion = "0.1.0"\n');
      write('pom.xml', '<project><modules><module>core</module></modules></project>');
      write('core/pom.xml', '<project><artifactId>core</artifactId></project>');
      const ws = discoverWorkspaces(dir, true);
      expect(ws.npm.get('@w/a')).toBeDefined();
      expect(ws.go.get('example.com/svc')).toBeDefined();
      expect(ws.cargo.get('util')).toBeDefined();
      expect(ws.maven.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads OpenAPI JSON, GraphQL and protobuf contracts', () => {
    const dir = tempDir('gw-contracts-');
    try {
      writeFileSync(path.join(dir, 'swagger.json'), JSON.stringify({ paths: { '/pets': { get: {}, parameters: [] }, '/pets/{id}': { delete: {} } } }));
      writeFileSync(path.join(dir, 'schema.graphql'), 'schema { query: Root }\ntype Root {\n  pets(first: Int): [Pet]\n  "a pet"\n  pet(id: ID!): Pet\n}\ntype Pet { id: ID }\n');
      writeFileSync(path.join(dir, 'pets.proto'), 'service Pets {\n  rpc List (A) returns (B);\n  rpc Get (A) returns (B);\n}\n');
      const c = loadContracts(dir);
      expect([...c.http.get('/pets')!.methods]).toEqual(['get']);
      expect([...c.http.get('/pets/{id}')!.methods]).toEqual(['delete']);
      expect([...c.graphql.query].sort()).toEqual(['pet', 'pets']);
      expect([...c.services.get('Pets')!.rpcs]).toEqual(['List', 'Get']);
      writeFileSync(path.join(dir, 'client.py'), 'import requests\nrequests.get("http://api/pets/1")\nrequests.post("http://api/pets")\nrequests.get("http://api/owners")\n');
      expect(checkContracts(dir, 'client.py').map((f) => `${f.line}:${f.blocking}`)).toEqual(['2:false', '3:false']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const javac = spawnSync('javac', ['-version']).status === 0 && spawnSync('jar', ['--version']).status === 0;
  it.skipIf(!javac)('reads methods, arities and deprecation from a JAR', () => {
    const dir = tempDir('gw-jar-');
    try {
      mkdirSync(path.join(dir, 'p'));
      writeFileSync(path.join(dir, 'p', 'Tool.java'), 'package p;\npublic class Tool {\n  public Tool(int a) {}\n  public static String join(String a, String b) { return a + b; }\n  public static String all(String... parts) { return ""; }\n  @Deprecated public static void old() {}\n  private void hidden() {}\n}\n');
      execFileSync('javac', ['-d', path.join(dir, 'out'), path.join(dir, 'p', 'Tool.java')]);
      execFileSync('jar', ['cf', path.join(dir, 'tool.jar'), '-C', path.join(dir, 'out'), '.']);
      const jar = openJar(path.join(dir, 'tool.jar'))!;
      const info = parseClass(readJarEntry(jar, 'p/Tool.class')!)!;
      const member = (name: string) => info.members.find((m) => m.name === name)!;
      expect(member('join')).toMatchObject({ params: 2, isMethod: true, varargs: false });
      expect(member('all').varargs).toBe(true);
      expect(member('old').deprecated).toBe(true);
      expect(member('<init>').params).toBe(1);
      expect(info.members.some((m) => m.name === 'hidden')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('review regressions', () => {
  const write = (dir: string, rel: string, text: string): void => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  };
  const run = async (dir: string, files: { file: string; ranges: [number, number][] | null }[]) => {
    await initSqlBackend();
    await refreshIndex(dir);
    const db = openDb(indexDbPath(dir), { readonly: true });
    try {
      return (await verifyChangedDeep(db, dir, files, defaultConfig())).flatMap((r) => r.findings.map((f) => `${f.file}:${f.line}:${f.kind}:${f.name}`));
    } finally {
      db.close();
    }
  };

  it('leaves shadowed imports, monkeypatched modules and multi-line imports right', async () => {
    const dir = tempDir('gw-deps-review-');
    try {
      writeDepsFixture(dir);
      write(dir, 'src/shadow.ts', "import { clamp } from 'mathkit';\nexport const a = (clamp: (n: number) => number) => clamp(1);\nexport function b(clamp: () => number) {\n  return clamp();\n}\n");
      write(dir, 'src/patch.py', 'import textkit\n\ntextkit.whisper = lambda s: s.lower()\na = textkit.whisper("X")\n');
      write(dir, 'src/multi.ts', "import {\n  clamp,\n  clampEvery,\n} from 'mathkit';\nexport const a = [clamp, clampEvery];\n");
      expect(await run(dir, [{ file: 'src/shadow.ts', ranges: null }, { file: 'src/patch.py', ranges: null }])).toEqual([]);
      expect(await run(dir, [{ file: 'src/multi.ts', ranges: [[3, 3]] }])).toEqual(['src/multi.ts:3:unknown-export:clampEvery']);
      expect(await run(dir, [{ file: 'src/multi.ts', ranges: [[1, 2]] }])).toEqual([]);
      // The statement's own context still applies to a name on a later line.
      write(dir, 'src/opt.py', 'try:\n    from textkit import (\n        shout,\n        nope,\n    )\nexcept ImportError:\n    nope = None\n');
      write(dir, 'src/ignored.ts', "// gw: ignore\nimport {\n  clamp,\n  clampEvery,\n} from 'mathkit';\nexport const a = [clamp, clampEvery];\n");
      // Importing by destructuring, or testing the name in a condition, is not shadowing.
      write(dir, 'src/req.cjs', "const { clamp } = require('mathkit');\nif (clamp) {\n  clamp();\n}\n");
      expect(await run(dir, [{ file: 'src/opt.py', ranges: null }, { file: 'src/ignored.ts', ranges: null }])).toEqual([]);
      expect(await run(dir, [{ file: 'src/req.cjs', ranges: null }])).toEqual(['src/req.cjs:3:arity:clamp']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prefers the installed copy over a workspace of the same name, and the require branch for CommonJS', async () => {
    const dir = tempDir('gw-deps-review-');
    try {
      write(dir, '.gitignore', 'node_modules/\n');
      write(dir, 'package.json', '{"name":"root","private":true,"workspaces":["packages/*"]}');
      write(dir, 'packages/shared/package.json', '{"name":"shared","version":"2.0.0","types":"index.ts"}');
      write(dir, 'packages/shared/index.ts', 'export function fresh(): number {\n  return 1;\n}\n');
      write(dir, 'packages/app/package.json', '{"name":"app","version":"1.0.0","dependencies":{"shared":"1.0.0","dual":"1.0.0"}}');
      write(dir, 'packages/app/node_modules/shared/package.json', '{"name":"shared","version":"1.0.0","types":"index.d.ts"}');
      write(dir, 'packages/app/node_modules/shared/index.d.ts', 'export declare function old(): number;\n');
      write(dir, 'packages/app/node_modules/dual/package.json', '{"name":"dual","version":"1.0.0","exports":{".":{"import":{"types":"./esm.d.ts"},"require":{"types":"./cjs.d.cts"}}}}');
      write(dir, 'packages/app/node_modules/dual/esm.d.ts', 'export declare function esmOnly(): void;\n');
      write(dir, 'packages/app/node_modules/dual/cjs.d.cts', 'export declare function cjsOnly(): void;\n');
      write(dir, 'packages/app/node_modules/untyped/package.json', '{"name":"untyped","version":"1.0.0","main":"index.js"}');
      write(dir, 'packages/app/node_modules/untyped/index.js', 'module.exports = {};\n');
      write(dir, 'packages/app/node_modules/@types/untyped/package.json', '{"name":"@types/untyped","version":"1.0.0","exports":{".":{"import":{"types":"./esm.d.ts"},"require":{"types":"./cjs.d.cts"}}}}');
      write(dir, 'packages/app/node_modules/@types/untyped/esm.d.ts', 'export declare function esmOnly(): void;\n');
      write(dir, 'packages/app/node_modules/@types/untyped/cjs.d.cts', 'export declare function cjsOnly(): void;\n');
      write(dir, 'packages/app/c.ts', "import { esmOnly, cjsOnly } from 'untyped';\nexport const y = [esmOnly, cjsOnly];\n");
      write(dir, 'packages/app/d.cjs', "const u = require('untyped');\nu.cjsOnly();\nu.esmOnly();\n");
      write(dir, 'packages/app/a.ts', "import { old, fresh } from 'shared';\nimport { esmOnly, cjsOnly } from 'dual';\nexport const x = [old, fresh, esmOnly, cjsOnly];\n");
      write(dir, 'packages/app/b.cjs', "const dual = require('dual');\ndual.cjsOnly();\ndual.esmOnly();\n");
      expect(await run(dir, ['a.ts', 'b.cjs', 'c.ts', 'd.cjs'].map((f) => ({ file: `packages/app/${f}`, ranges: null })))).toEqual([
        'packages/app/a.ts:1:unknown-export:fresh',
        'packages/app/a.ts:2:unknown-export:cjsOnly',
        'packages/app/b.cjs:3:unknown-member:esmOnly',
        'packages/app/c.ts:1:unknown-export:cjsOnly',
        'packages/app/d.cjs:3:unknown-member:esmOnly',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops a cached surface when a package it re-exports from changes version', async () => {
    const dir = tempDir('gw-deps-review-');
    try {
      write(dir, '.gitignore', 'node_modules/\n');
      write(dir, 'package.json', '{"name":"root","private":true}');
      write(dir, 'node_modules/wrap/package.json', '{"name":"wrap","version":"1.0.0","types":"index.d.ts"}');
      write(dir, 'node_modules/wrap/index.d.ts', "export * from 'inner';\n");
      write(dir, 'node_modules/inner/package.json', '{"name":"inner","version":"1.0.0","types":"index.d.ts"}');
      write(dir, 'node_modules/inner/index.d.ts', 'export declare function one(): void;\n');
      write(dir, 'a.ts', "import { one, two } from 'wrap';\nexport const x = [one, two];\n");
      const files = [{ file: 'a.ts', ranges: null }];
      expect(await run(dir, files)).toEqual(['a.ts:1:unknown-export:two']);
      write(dir, 'node_modules/inner/package.json', '{"name":"inner","version":"1.1.0","types":"index.d.ts"}');
      write(dir, 'node_modules/inner/index.d.ts', 'export declare function one(): void;\nexport declare function two(): void;\n');
      expect(await run(dir, files)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('caps what a JAR entry may inflate to', () => {
    const dir = tempDir('gw-jar-bomb-');
    try {
      const name = Buffer.from('p/Big.class');
      const data = deflateRawSync(Buffer.alloc(32 * 1024 * 1024));
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(8, 8);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(10, 22); // understated size
      local.writeUInt16LE(name.length, 26);
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(8, 10);
      central.writeUInt32LE(data.length, 20);
      central.writeUInt32LE(10, 24);
      central.writeUInt16LE(name.length, 28);
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0);
      end.writeUInt16LE(1, 8);
      end.writeUInt16LE(1, 10);
      end.writeUInt32LE(46 + name.length, 12);
      end.writeUInt32LE(30 + name.length + data.length, 16);
      writeFileSync(path.join(dir, 'bomb.jar'), Buffer.concat([local, name, data, central, name, end]));
      const jar = openJar(path.join(dir, 'bomb.jar'))!;
      expect(jar.entries.has('p/Big.class')).toBe(true);
      expect(readJarEntry(jar, 'p/Big.class')).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
