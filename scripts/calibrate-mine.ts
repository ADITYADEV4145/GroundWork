import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = process.env.GW_OSS_CACHE ?? path.join(os.homedir(), 'work/array-uniq-cache');
const repository = 'https://github.com/sindresorhus/array-uniq.git';
const old = '3341fbc7cbbe748d1153efee053f723ac8bc0835';
const modern = 'f6c4c20c6985b966f9510667c79abfe6f4dffcc5';
if (!existsSync(cache)) {
  mkdirSync(path.dirname(cache), { recursive: true });
  execFileSync('git', ['clone', repository, cache], { stdio: 'inherit' });
}
const git = (...args: string[]) => execFileSync('git', args, { cwd: cache, encoding: 'utf8' });
const dir = path.join(root, 'bench/dupes/corpus/unique-values/oss');
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, 'old.js'), git('show', `${old}:index.js`));
writeFileSync(path.join(dir, 'modern.js'), git('show', `${modern}:index.js`));
writeFileSync(path.join(dir, 'LICENSE'), git('show', `${old}:license`));
const ref = (symbol: string, modern = false) => ({ file: `corpus/unique-values/oss/${modern ? 'modern' : 'old'}.js`, symbol });
const pairs = [
  { a: ref('uniqSet'), b: ref('uniqSetWithForEach'), label: 'dup', cloneType: 4, reasoning: 'Both preserve first-occurrence order using Set SameValueZero equality; filter versus Set iteration differs only in implementation on a modern runtime.' },
  { a: ref('uniqSet'), b: ref('arrayUniq', true), label: 'dup', cloneType: 4, reasoning: 'The historical filter-with-Set and modern Set spread both perform stable SameValueZero deduplication on ordinary dense arrays.' },
  { a: ref('uniqSetWithForEach'), b: ref('arrayUniq', true), label: 'dup', cloneType: 4, reasoning: 'Modern Set spread replaces the historical Set-forEach implementation with identical dense-array results.' },
  ...['uniqSet', 'uniqSetWithForEach', 'arrayUniq'].map((name) => ({ a: ref('uniqNoSet'), b: ref(name, name === 'arrayUniq'), label: 'not', cloneType: null, negativeKind: 'same-purpose-different-edge-behavior', reasoning: 'indexOf uses strict equality and retains repeated NaN values, unlike Set SameValueZero; the implementations are not interchangeable over numeric arrays containing NaN.' })),
].map((pair, i) => ({ id: `oss-array-uniq-${i + 1}`, ...pair, source: { repository, commits: [old, modern] } }));
writeFileSync(path.join(root, 'bench/dupes/oss-pairs.jsonl'), pairs.map((p) => JSON.stringify(p)).join('\n') + '\n');
console.log(`Mined ${pairs.length} reviewed history pairs from array-uniq; snapshots pinned to ${old} and ${modern}.`);
