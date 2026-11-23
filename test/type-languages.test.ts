import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { typeCheck, type TypeLanguage } from '../src/types/index.js';

const dotnet = [process.env.DOTNET_ROOT, path.join(os.homedir(), '.dotnet')].filter((d): d is string => !!d && existsSync(path.join(d, 'dotnet')))[0];
if (dotnet && !(process.env.PATH ?? '').split(path.delimiter).includes(dotnet)) process.env.PATH = `${process.env.PATH}${path.delimiter}${dotnet}`;
const has = (binary: string, ...args: string[]) => spawnSync(binary, args, { stdio: 'ignore' }).status === 0;
const toolchain = { go: has('go', 'version'), rust: has('cargo', '--version'), java: has('javac', '-version'), csharp: has('dotnet', '--version') };

const directories: string[] = [];
afterEach(() => { for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true }); });
function repo(files: Record<string, string>, prepare?: (root: string) => void): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gw-type-languages-')); directories.push(root);
  for (const [file, text] of Object.entries(files)) { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); }
  prepare?.(root);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init'); git('add', '-A'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'base');
  return root;
}
const config = () => { const c = defaultConfig(); c.types.timeoutMs = 60000; return c; };
const edit = (root: string, file: string, from: string, to: string) => {
  const text = readFileSync(path.join(root, file), 'utf8');
  if (!text.includes(from)) throw new Error(`missing ${from}`);
  writeFileSync(path.join(root, file), text.replace(from, to));
};

interface Case {
  language: Exclude<TypeLanguage, 'typescript' | 'python'>; file: string; files: Record<string, string>; prepare?: (root: string) => void;
  /** [from, to, expected blocking code] edits applied to `file`, each a real API error. */
  errors: [string, string, string][];
  /** An error already present at the base commit, on the line that is edited without adding one. */
  preExisting: { base: [string, string]; touch: [string, string] };
  missingProject: string;
}
const cases: Case[] = [
  {
    language: 'go', file: 'main.go', missingProject: 'go.mod',
    files: {
      'go.mod': 'module example.com/app\n\ngo 1.21\n',
      'store/store.go': 'package store\n\ntype Store struct{ Names []string }\n\nfunc (s *Store) Add(name string) int { s.Names = append(s.Names, name); return len(s.Names) }\n\nfunc Normalize(name string) string { return name }\n',
      'main.go': 'package main\n\nimport (\n\t"fmt"\n\n\t"example.com/app/store"\n)\n\nfunc main() {\n\ts := &store.Store{}\n\tfmt.Println(s.Add("a"))\n\tfmt.Println(store.Normalize("b"))\n}\n',
    },
    errors: [['store.Normalize("b")', 'store.Normalise("b")', 'undefined'], ['s.Add("a")', 's.Insert("a")', 'missing-member'], ['s.Add("a")', 's.Add("a", 2)', 'arity'], ['s.Add("a")', 's.Add(7)', 'argument-type'], ['"example.com/app/store"', '"example.com/app/stores"', 'unresolved-import']],
    preExisting: { base: ['store.Normalize("b")', 'store.Normalise("b")'], touch: ['store.Normalise("b")', 'store.Normalise("c")'] },
  },
  {
    language: 'rust', file: 'src/lib.rs', missingProject: 'Cargo.toml',
    files: {
      'Cargo.toml': '[package]\nname = "app"\nversion = "0.1.0"\nedition = "2021"\n',
      'src/helpers.rs': 'pub struct Store { pub names: Vec<String> }\nimpl Store { pub fn add(&mut self, name: String) -> usize { self.names.push(name); self.names.len() } }\npub fn normalize(name: &str) -> String { name.to_lowercase() }\n',
      'src/lib.rs': 'mod helpers;\nuse crate::helpers::normalize;\nuse crate::helpers::Store;\n\npub fn run(store: &mut Store) -> usize {\n    let name = normalize("A");\n    store.add(name)\n}\n',
    },
    errors: [['normalize("A")', 'normalise("A")', 'E0425'], ['store.add(name)', 'store.insert(name)', 'E0599'], ['store.add(name)', 'store.add(name, 2)', 'E0061'], ['use crate::helpers::normalize;', 'use crate::helpers::normalise;', 'E0432'], ['store.add(name)', 'store.add(7)', 'E0308']],
    preExisting: { base: ['normalize("A")', 'normalise("A")'], touch: ['normalise("A")', 'normalise("B")'] },
  },
  {
    language: 'java', file: 'src/main/java/demo/App.java', missingProject: '',
    files: {
      'pom.xml': '<project><modelVersion>4.0.0</modelVersion><groupId>demo</groupId><artifactId>app</artifactId><version>1</version></project>\n',
      'src/main/java/demo/store/Store.java': 'package demo.store;\n\npublic class Store {\n    public int add(String name) { return name.length(); }\n    public static String normalize(String name) { return name.trim(); }\n}\n',
      'src/main/java/demo/App.java': 'package demo;\n\nimport demo.store.Store;\n\npublic class App {\n    public static int run(Store store) {\n        String name = Store.normalize("a");\n        return store.add(name);\n    }\n}\n',
    },
    errors: [['Store.normalize("a")', 'Store.normalise("a")', 'cant.resolve'], ['store.add(name)', 'store.insert(name)', 'cant.resolve'], ['store.add(name)', 'store.add(name, 2)', 'cant.apply'], ['import demo.store.Store;', 'import demo.store.Stores;', 'cant.resolve'], ['import demo.store.Store;', 'import demo.stores.Store;', 'doesnt.exist']],
    preExisting: { base: ['Store.normalize("a")', 'Store.normalise("a")'], touch: ['Store.normalise("a")', 'Store.normalise("b")'] },
  },
  {
    language: 'csharp', file: 'App.cs', missingProject: 'App.csproj',
    files: {
      'App.csproj': '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><OutputType>Library</OutputType></PropertyGroup></Project>\n',
      '.gitignore': 'bin/\nobj/\n',
      'Store.cs': 'namespace Demo.Storage;\n\npublic class Store {\n    public int Add(string name) { return name.Length; }\n    public static string Normalize(string name) { return name.Trim(); }\n}\n',
      'App.cs': 'using Demo.Storage;\n\nnamespace Demo;\n\npublic static class App {\n    public static int Run(Store store) {\n        var name = Store.Normalize("a");\n        return store.Add(name);\n    }\n}\n',
    },
    prepare: (root) => { execFileSync('dotnet', ['restore', '-v:q'], { cwd: root, stdio: 'ignore' }); },
    errors: [['Store.Normalize("a")', 'Store.Normalise("a")', 'CS0117'], ['store.Add(name)', 'store.Insert(name)', 'CS1061'], ['store.Add(name)', 'store.Add(name, 2)', 'CS1501'], ['using Demo.Storage;', 'using Demo.Storages;', 'CS0234'], ['store.Add(name)', 'store.Add(7)', 'CS1503']],
    preExisting: { base: ['Store.Normalize("a")', 'Store.Normalise("a")'], touch: ['Store.Normalise("a")', 'Store.Normalise("b")'] },
  },
];

describe('compiled-language type checks', () => {
  for (const c of cases) describe.skipIf(!toolchain[c.language])(c.language, () => {
    const check = (root: string, cfg = config()) => typeCheck(root, [{ file: c.file, ranges: null }], cfg);
    it('passes a clean edit and blocks each allowlisted API error on a changed line', async () => {
      const root = repo(c.files, c.prepare);
      writeFileSync(path.join(root, c.file), `${readFileSync(path.join(root, c.file), 'utf8')}\n`);
      const clean = await check(root);
      expect(clean.available[c.language]).toBe(true);
      expect(clean.findings).toEqual([]);
      const original = readFileSync(path.join(root, c.file), 'utf8');
      for (const [from, to, code] of c.errors) {
        edit(root, c.file, from, to);
        const result = await check(root);
        expect(result.findings.filter((f) => f.blocking).map((f) => f.code), `${from} -> ${to}`).toContain(code);
        expect(result.findings.every((f) => f.language === c.language && f.file === c.file)).toBe(true);
        writeFileSync(path.join(root, c.file), original);
      }
    }, 180_000);
    it('keeps an error that the base commit already had informational', async () => {
      const files = { ...c.files, [c.file]: c.files[c.file]!.replace(...c.preExisting.base) };
      const root = repo(files, c.prepare);
      edit(root, c.file, ...c.preExisting.touch);
      const result = await check(root);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings.every((f) => !f.blocking)).toBe(true);
      expect(result.findings.some((f) => f.preExisting)).toBe(true);
    }, 180_000);
    it('honours the per-language switch and reports a missing project without findings', async () => {
      const root = repo(c.files, c.prepare);
      edit(root, c.file, c.errors[0]![0], c.errors[0]![1]);
      const off = config(); off.types[c.language] = 'off';
      expect(await check(root, off)).toMatchObject({ available: { [c.language]: 'disabled' }, findings: [] });
      if (!c.missingProject) return;
      rmSync(path.join(root, c.missingProject));
      const result = await check(root);
      expect(typeof result.available[c.language]).toBe('string');
      expect(result.findings).toEqual([]);
    }, 180_000);
  });

  it.skipIf(!toolchain.csharp)('leaves the C# project bin and obj untouched', async () => {
    const c = cases.find((x) => x.language === 'csharp')!;
    const root = repo(c.files, c.prepare);
    const assets = statSync(path.join(root, 'obj/project.assets.json')).mtimeMs;
    edit(root, c.file, c.errors[0]![0], c.errors[0]![1]);
    expect((await typeCheck(root, [{ file: c.file, ranges: null }], config())).findings.some((f) => f.blocking)).toBe(true);
    expect(existsSync(path.join(root, 'bin'))).toBe(false);
    expect(statSync(path.join(root, 'obj/project.assets.json')).mtimeMs).toBe(assets);
    expect(existsSync(path.join(root, 'obj/Debug'))).toBe(false);
  }, 180_000);

  it.skipIf(!toolchain.java)('does not block Java errors when an imported library is not on the classpath', async () => {
    const c = cases.find((x) => x.language === 'java')!;
    const root = repo(c.files);
    edit(root, c.file, 'import demo.store.Store;', 'import demo.store.Store;\nimport com.example.absent.Thing;');
    edit(root, c.file, 'Store.normalize("a")', 'Store.normalise("a")');
    const result = await typeCheck(root, [{ file: c.file, ranges: null }], config());
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.every((f) => !f.blocking)).toBe(true);
  }, 180_000);

  it.skipIf(!toolchain.java)('does not block a Java import from a sibling module that shares the package prefix', async () => {
    const c = cases.find((x) => x.language === 'java')!;
    const root = repo({ ...c.files, 'settings.gradle': "include 'app', 'sibling'\n" });
    edit(root, c.file, 'import demo.store.Store;', 'import demo.store.Store;\nimport demo.sibling.Thing;');
    const result = await typeCheck(root, [{ file: c.file, ranges: null }], config());
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.every((f) => !f.blocking)).toBe(true);
  }, 180_000);

  it.skipIf(!toolchain.java)('blocks a broken nested-type import of a local class in a multi-module build', async () => {
    const c = cases.find((x) => x.language === 'java')!;
    const root = repo({ ...c.files, 'settings.gradle': "include 'app', 'sibling'\n" });
    edit(root, c.file, 'import demo.store.Store;', 'import demo.store.Store;\nimport demo.store.Store.Missing;');
    const result = await typeCheck(root, [{ file: c.file, ranges: null }], config());
    expect(result.findings.some((f) => f.blocking)).toBe(true);
  }, 180_000);

  it.skipIf(!toolchain.java)('keeps a Java error pre-existing when the edit removes an unresolved import', async () => {
    const c = cases.find((x) => x.language === 'java')!;
    const text = c.files[c.file]!.replace('import demo.store.Store;', 'import demo.store.Store;\nimport com.example.absent.Thing;').replace('Store.normalize("a")', 'Store.normalise("a")');
    const root = repo({ ...c.files, [c.file]: text });
    edit(root, c.file, 'import com.example.absent.Thing;\n', '');
    edit(root, c.file, 'Store.normalise("a")', 'Store.normalise("b")');
    const result = await typeCheck(root, [{ file: c.file, ranges: null }], config());
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.every((f) => !f.blocking)).toBe(true);
  }, 180_000);

  it.skipIf(!toolchain.java)('does not block Java errors in a project that generates code with annotation processors', async () => {
    const c = cases.find((x) => x.language === 'java')!;
    const root = repo({ ...c.files, 'build.gradle': "dependencies { annotationProcessor 'org.projectlombok:lombok:1.18.30' }\n" });
    edit(root, c.file, 'Store.normalize("a")', 'Store.builder()');
    const result = await typeCheck(root, [{ file: c.file, ranges: null }], config());
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.every((f) => !f.blocking)).toBe(true);
  }, 180_000);

  it.skipIf(!toolchain.go)('blocks a call to a function whose file was deleted', async () => {
    const root = repo({
      'go.mod': 'module demo\n\ngo 1.21\n',
      'helper.go': 'package main\n\nfunc helper(n int) int { return n }\n',
      'main.go': 'package main\n\nfunc main() {\n\t_ = helper(1)\n}\n',
    });
    rmSync(path.join(root, 'helper.go'));
    edit(root, 'main.go', 'helper(1)', 'helper(2)');
    const result = await typeCheck(root, [{ file: 'main.go', ranges: [[4, 4]] }], config());
    expect(result.findings.filter((f) => f.blocking).map((f) => f.code)).toEqual(['undefined']);
  }, 180_000);

  it.skipIf(!toolchain.go)('checks Go test files against the test build of their package, and every changed package in one run', async () => {
    const root = repo({
      'go.mod': 'module demo\n\ngo 1.21\n',
      'store/store.go': 'package store\n\ntype Store struct{ n int }\n\nfunc New() *Store { return &Store{} }\n',
      // A method only the test build has, reached through a package that imports the one under test.
      'store/export_test.go': 'package store\n\nfunc (s *Store) Count() int { return s.n }\n',
      'app/app.go': 'package app\n\nimport "demo/store"\n\nfunc Make() *store.Store { return store.New() }\n',
      'store/store_ext_test.go': 'package store_test\n\nimport (\n\t"testing"\n\n\t"demo/app"\n)\n\nfunc TestCount(t *testing.T) {\n\tif app.Make().Count() != 0 {\n\t\tt.Fatal("count")\n\t}\n}\n',
    });
    const changed = [{ file: 'store/store_ext_test.go', ranges: null }, { file: 'app/app.go', ranges: null }];
    writeFileSync(path.join(root, 'store/store_ext_test.go'), `${readFileSync(path.join(root, 'store/store_ext_test.go'), 'utf8')}\n`);
    const clean = await typeCheck(root, changed, config());
    expect(clean.available.go).toBe(true);
    expect(clean.findings).toEqual([]);
    edit(root, 'store/store_ext_test.go', 'Count()', 'Counts()');
    edit(root, 'app/app.go', 'store.New()', 'store.Make()');
    const result = await typeCheck(root, changed, config());
    expect(result.findings.filter((f) => f.blocking).map((f) => `${f.file} ${f.code}`).sort()).toEqual(['app/app.go undefined', 'store/store_ext_test.go missing-member']);
  }, 180_000);

  it.skipIf(!toolchain.go)('reports a Go import cycle as unavailable instead of waiting on it', async () => {
    const c = cases.find((x) => x.language === 'go')!;
    const root = repo({ ...c.files, 'cmd/cmd.go': 'package cmd\n\nfunc Name() string { return "app" }\n' });
    edit(root, 'store/store.go', 'package store\n', 'package store\n\nimport "example.com/app/cmd"\n\nvar _ = cmd.Name\n');
    edit(root, 'cmd/cmd.go', 'package cmd\n', 'package cmd\n\nimport "example.com/app/store"\n\nvar _ = store.Normalize\n');
    const result = await typeCheck(root, [{ file: 'store/store.go', ranges: null }, { file: 'cmd/cmd.go', ranges: null }], config());
    expect(result.available.go).toMatch(/import cycle not allowed/);
    expect(result.findings).toEqual([]);
    expect(result.timedOut).toBe(false);
  }, 180_000);

  it.skipIf(!toolchain.go || process.platform === 'win32')('checks Go in a checkout reached through a symlink', async () => {
    const c = cases.find((x) => x.language === 'go')!;
    const root = repo(c.files);
    const link = `${root}-link`; symlinkSync(root, link); directories.push(link);
    edit(link, c.file, c.errors[0]![0], c.errors[0]![1]);
    const result = await typeCheck(link, [{ file: c.file, ranges: null }], config());
    expect(result.findings.filter((f) => f.blocking).map((f) => `${f.file} ${f.code}`)).toEqual(['main.go undefined']);
  }, 180_000);

  it.skipIf(!toolchain.go)('checks Go without compiling the package', async () => {
    const c = cases.find((x) => x.language === 'go')!;
    const root = repo(c.files);
    const cache = mkdtempSync(path.join(os.tmpdir(), 'gw-type-languages-gocache-')); directories.push(cache);
    const { compilerDiagnostics, resetCompilerMemo } = await import('../src/types/compilers.js');
    const saved = process.env.GOCACHE;
    process.env.GOCACHE = cache;
    try {
      edit(root, c.file, c.errors[0]![0], c.errors[0]![1]);
      expect(compilerDiagnostics('go', root, c.file, Date.now() + 120_000).map((f) => f.code)).toContain('undefined');
      resetCompilerMemo();
      // The standard library is built for its export data; the module's own packages never are.
      const built = execFileSync('go', ['list', '-f', '{{.ImportPath}} {{.Stale}}', './...'], { cwd: root, encoding: 'utf8', env: { ...process.env, GOCACHE: cache } });
      expect(built.trim().split('\n').sort()).toEqual(['example.com/app true', 'example.com/app/store true']);
    } finally { if (saved === undefined) delete process.env.GOCACHE; else process.env.GOCACHE = saved; }
  }, 180_000);

  it.skipIf(!toolchain.rust)('checks Rust test code with the test targets, and only then', async () => {
    const root = repo({
      'Cargo.toml': '[package]\nname = "app"\nversion = "0.1.0"\nedition = "2021"\n',
      'src/lib.rs': 'pub fn double(n: u32) -> u32 { n * 2 }\n\npub fn run() -> u32 {\n    double(1)\n}\n\n#[cfg(test)]\nmod fixture;\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n\n    #[test]\n    fn runs() {\n        assert_eq!(run(), 2);\n    }\n}\n',
      // No attribute in this file says that only a test build compiles it.
      'src/fixture.rs': 'pub fn sample() -> u32 {\n    crate::double(2)\n}\n',
    });
    const blocking = async (file: string, ranges: [number, number][]) => (await typeCheck(root, [{ file, ranges }], config())).findings.filter((f) => f.blocking).map((f) => `${f.line} ${f.code}`);
    edit(root, 'src/lib.rs', 'assert_eq!(run(), 2);', 'assert_eq!(runs_twice(), 2);');
    // The test module holds an error, but the edit under check is outside it.
    expect(await blocking('src/lib.rs', [[4, 4]])).toEqual([]);
    expect(await blocking('src/lib.rs', [[16, 16]])).toEqual(['16 E0425']);
    edit(root, 'src/lib.rs', 'assert_eq!(runs_twice(), 2);', 'assert_eq!(run(), 2);');
    edit(root, 'src/lib.rs', 'double(1)', 'doubled(1)');
    expect(await blocking('src/lib.rs', [[4, 4]])).toEqual(['4 E0425']);
    edit(root, 'src/lib.rs', 'doubled(1)', 'double(1)');
    edit(root, 'src/fixture.rs', 'crate::double(2)', 'crate::doubled(2)');
    expect(await blocking('src/fixture.rs', [[2, 2]])).toEqual(['2 E0425']);
  }, 180_000);

  it('finds the Rust lines only a test build compiles', async () => {
    const { rustTestRegions } = await import('../src/types/compilers.js');
    expect(rustTestRegions('fn a() {}\n')).toEqual([]);
    expect(rustTestRegions('#[cfg(test)]\nuse x::y;\nfn a() {}\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn t() {}\n}\n')).toEqual([[1, 2], [4, 9]]);
    expect(rustTestRegions('fn a() {}\n#[cfg(all(test, unix))]\n#[allow(dead_code)]\nfn helper() { let s = "}"; }\nfn b() {}\n')).toEqual([[2, 6]]);
    expect(rustTestRegions('#![cfg(test)]\nfn a() {}\n')).toEqual([[1, 3]]);
  });

  it.skipIf(!toolchain.csharp)('does not guess between several C# projects in one directory', async () => {
    const c = cases.find((x) => x.language === 'csharp')!;
    const project = Object.keys(c.files).find((f) => f.endsWith('.csproj'))!;
    const root = repo(c.files, c.prepare);
    writeFileSync(path.join(root, path.dirname(project), 'Another.csproj'), c.files[project]!);
    edit(root, c.file, c.errors[0]![0], c.errors[0]![1]);
    const result = await typeCheck(root, [{ file: c.file, ranges: null }], config());
    expect(result.available.csharp).toBe('several .csproj in one directory');
    expect(result.findings).toEqual([]);
  }, 180_000);

  it('reports a missing toolchain as unavailable instead of failing', async () => {
    const root = repo(cases[0]!.files);
    const saved = process.env.PATH;
    process.env.PATH = path.dirname(process.execPath);
    try {
      // The worker inherits PATH when it starts, so a fresh module instance is not needed: no worker exists yet for this root's first call in a new process.
      const { compilerDiagnostics } = await import('../src/types/compilers.js');
      expect(() => compilerDiagnostics('go', root, 'main.go', Date.now() + 5000)).toThrow(/go not found/);
    } finally { process.env.PATH = saved; }
  });
});
