import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
