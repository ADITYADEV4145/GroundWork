import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Deterministic synthetic repos and random edit sequences for perf and incremental-correctness checks.

export function prng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERBS = ['load', 'parse', 'format', 'build', 'fetch', 'save', 'merge', 'compute', 'render', 'resolve'];
const NOUNS = ['user', 'order', 'config', 'report', 'token', 'invoice', 'session', 'item', 'path', 'event'];

function tsModule(i: number, fnPerFile: number, rnd: () => number, files: number): string {
  const out: string[] = [];
  if (i > 0) {
    const j = Math.floor(rnd() * i);
    out.push(`import { ${VERBS[j % 10]}${cap(NOUNS[(j * 7) % 10]!)}${j}_0 } from './mod${j}.js';`);
  }
  out.push(`export const MOD${i}_URL = 'https://example.com/api/v${i}';`);
  for (let k = 0; k < fnPerFile; k++) {
    const name = `${VERBS[i % 10]}${cap(NOUNS[(i * 7) % 10]!)}${i}_${k}`;
    out.push(`/** ${name} doc. */`);
    out.push(`export function ${name}(input: string, count = ${k}): string {`);
    out.push(`  const parts = input.split(',');`);
    out.push(`  let acc = '';`);
    out.push(`  for (let n = 0; n < count; n++) acc += parts[n % parts.length] ?? '';`);
    if (k > 0) out.push(`  acc += ${VERBS[i % 10]}${cap(NOUNS[(i * 7) % 10]!)}${i}_${k - 1}(acc, 1);`);
    out.push(`  return acc.trim();`);
    out.push(`}`);
  }
  out.push(`export class Service${i} {`);
  out.push(`  constructor(private readonly base: string) {}`);
  out.push(`  run(x: string): string { return this.base + x; }`);
  out.push(`}`);
  void files;
  return out.join('\n') + '\n';
}

function pyModule(i: number, fnPerFile: number, rnd: () => number): string {
  const out: string[] = [];
  if (i > 0) out.push(`from .pmod${Math.floor(rnd() * i)} import helper_0`);
  out.push(`BASE_${i} = "/srv/data/${i}"`);
  for (let k = 0; k < fnPerFile; k++) {
    out.push(``, `def helper_${k}(value, scale=${k}):`, `    """Helper ${k}."""`, `    total = 0`, `    for n in range(scale):`, `        total += n * value`);
    if (k > 0) out.push(`    total += helper_${k - 1}(total)`);
    out.push(`    return total`);
  }
  out.push(``, `class Model${i}:`, `    def __init__(self, name):`, `        self.name = name`, ``, `    def describe(self):`, `        return helper_0(len(self.name))`);
  return out.join('\n') + '\n';
}

function cap(s: string): string {
  return s[0]!.toUpperCase() + s.slice(1);
}

/** Write a repo with roughly `lines` lines of TS and Python under `dir`. */
export function synthRepo(dir: string, lines: number, seed = 1): { files: number } {
  const rnd = prng(seed);
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  mkdirSync(path.join(dir, 'py', 'pkg'), { recursive: true });
  writeFileSync(path.join(dir, 'py', 'pkg', '__init__.py'), '');
  const fnPerFile = 10;
  const tsLines = tsModule(1, fnPerFile, prng(9), 1).split('\n').length;
  const pyLines = pyModule(1, fnPerFile, prng(9)).split('\n').length;
  const pairs = Math.max(1, Math.round(lines / (tsLines + pyLines)));
  for (let i = 0; i < pairs; i++) {
    writeFileSync(path.join(dir, 'src', `mod${i}.ts`), tsModule(i, fnPerFile, rnd, pairs));
    writeFileSync(path.join(dir, 'py', 'pkg', `pmod${i}.py`), pyModule(i, fnPerFile, rnd));
  }
  return { files: pairs * 2 + 1 };
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const rec = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.groundwork' || e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else out.push(path.relative(dir, p));
    }
  };
  rec(dir);
  return out.sort();
}

export type EditOp = 'modify' | 'add' | 'delete' | 'rename' | 'syntax-error' | 'rename-symbol' | 'noop-touch';
export const EDIT_OPS: EditOp[] = ['modify', 'add', 'delete', 'rename', 'syntax-error', 'rename-symbol', 'noop-touch'];

/** Apply one random edit; returns a short description. */
export function randomEdit(dir: string, rnd: () => number, op?: EditOp): string {
  const files = listFiles(dir).filter((f) => /\.(ts|py)$/.test(f));
  const kind = op ?? EDIT_OPS[Math.floor(rnd() * EDIT_OPS.length)]!;
  const pick = () => files[Math.floor(rnd() * files.length)];
  const n = Math.floor(rnd() * 1e6);
  switch (kind) {
    case 'add': {
      const py = rnd() < 0.5;
      const rel = py ? `py/pkg/extra${n}.py` : `src/extra${n}.ts`;
      writeFileSync(path.join(dir, rel), py ? `from .pmod0 import helper_1\n\ndef extra_${n}(a, b=1):\n    return helper_1(a)\n` : `import { Service0 } from './mod0.js';\nexport function extra${n}(a: number, b?: number) { return new Service0('x').run(String(a + (b ?? 0))); }\n`);
      return `add ${rel}`;
    }
    case 'delete': {
      const f = pick();
      if (!f || files.length < 3) return 'noop';
      rmSync(path.join(dir, f));
      return `delete ${f}`;
    }
    case 'rename': {
      const f = pick();
      if (!f) return 'noop';
      const to = f.replace(/(\.\w+)$/, `_r${n}$1`);
      renameSync(path.join(dir, f), path.join(dir, to));
      return `rename ${f} -> ${to}`;
    }
    case 'syntax-error': {
      const f = pick();
      if (!f) return 'noop';
      const p = path.join(dir, f);
      writeFileSync(p, readFileSync(p, 'utf8') + (f.endsWith('.py') ? '\ndef broken(:\n' : '\nexport function broken( {\n'));
      return `break ${f}`;
    }
    case 'rename-symbol': {
      const f = pick();
      if (!f) return 'noop';
      const p = path.join(dir, f);
      writeFileSync(p, readFileSync(p, 'utf8').replace(/(helper|_0)\b/, `$1x${n % 10}`));
      return `rename-symbol ${f}`;
    }
    case 'noop-touch': {
      const f = pick();
      if (!f) return 'noop';
      const p = path.join(dir, f);
      writeFileSync(p, readFileSync(p, 'utf8'));
      return `touch ${f}`;
    }
    default: {
      const f = pick();
      if (!f) return 'noop';
      const p = path.join(dir, f);
      const body = readFileSync(p, 'utf8');
      writeFileSync(p, f.endsWith('.py') ? `${body}\n\ndef added_${n}(x):\n    return helper_0(x)\n` : `${body}\nexport const added${n} = (x: string) => x.length;\n`);
      return `modify ${f}`;
    }
  }
}

export function copyDir(from: string, to: string): void {
  for (const rel of listFiles(from)) {
    const dest = path.join(to, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(path.join(from, rel)));
  }
}

export function existsIn(dir: string, rel: string): boolean {
  return existsSync(path.join(dir, rel));
}
