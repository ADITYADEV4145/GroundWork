import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from '../../src/config/load.js';
import { findCode } from '../../src/index/navigation.js';
import { searchDocuments } from '../../src/index/query.js';
import { refreshIndex } from '../../src/index/refresh.js';
import { indexDbPath } from '../../src/index/store.js';
import { searchCode } from '../../src/search/index.js';
import { DEFAULT_EMBEDDING_MODEL, hasLocalEmbeddings } from '../../src/reuse/embeddings.js';
import { openDb } from '../../src/store/db.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const MANIFEST_SHA = 'b692809e064e38238daaf5b05e81e403460a38592bb249d3004ef023426fd24b';
export interface Task { id: string; set: string; corpus: string; query: string; expected: string[] }
export function manifest(): { anchor: string; tasks: Task[] } {
  const raw = readFileSync(path.join(HERE, 'tasks.json'));
  if (createHash('sha256').update(raw).digest('hex') !== MANIFEST_SHA) throw new Error('Frozen manifest SHA mismatch');
  return JSON.parse(raw.toString());
}
export function metrics(ranks: number[]) {
  const n = ranks.length;
  return { tasks: n, recall1: ranks.filter((r) => r === 1).length / n,
    recall5: ranks.filter((r) => r > 0 && r <= 5).length / n,
    mrr: ranks.reduce((sum, r) => sum + (r ? 1 / r : 0), 0) / n };
}
export async function evaluateTask(db: ReturnType<typeof openDb>, task: Task, arm: 'baseline' | 'lexical' | 'hybrid', root?: string) {
  const hits = arm === 'baseline' ? findCode(db, task.query) : await searchCode(db, task.query, { limit: 100, semantic: arm === 'hybrid', ...(root ? { root } : {}) });
  const ids = hits.map((h) => h.id);
  const at = ids.findIndex((id) => task.expected.includes(id));
  return { task: task.id, set: task.set, arm, rank: at < 0 ? 0 : at + 1, ids };
}

export function prepareBenchmarkEmbeddings(roots: string[], consent: boolean,
  installed = (root: string) => hasLocalEmbeddings(root, DEFAULT_EMBEDDING_MODEL),
  install = (root: string) => {
    execFileSync(process.execPath,
      ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e',
        `import { initializeEmbeddings } from ${JSON.stringify(path.join(REPO, 'src/reuse/embeddings.ts'))}; await initializeEmbeddings(${JSON.stringify(root)}, { consent: true });`],
      { timeout: 90000, stdio: 'pipe' });
  }): { semanticStatus: string; semanticReason: string } {
  try {
    if (consent) for (const root of roots) if (!installed(root)) install(root);
    return roots.every(installed) ? { semanticStatus: 'RUN', semanticReason: '' }
      : { semanticStatus: 'NOT RUN', semanticReason: 'Local model unavailable; installation requires explicit --embeddings consent.' };
  } catch (error) { return { semanticStatus: 'NOT RUN', semanticReason: (error as Error).message }; }
}

async function run() {
  const frozen = manifest();
  execFileSync('git', ['merge-base', '--is-ancestor', frozen.anchor, 'HEAD'], { cwd: REPO });
  const workspace = path.join(os.homedir(), process.argv.includes('--validate-only') ? 'groundwork-search-validation-v1' : 'groundwork-search-evaluation-v1');
  if (existsSync(workspace)) throw new Error(`Refusing to reuse benchmark workspace: ${workspace}`);
  mkdirSync(workspace);
  const archive = execFileSync('git', ['archive', frozen.anchor, 'src', 'fixtures/py-app/app'], { cwd: REPO, maxBuffer: 50 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', workspace], { input: archive });
  const roots = { groundwork: workspace, python: path.join(workspace, 'fixtures/py-app') };
  const config = defaultConfig();
  config.index.include = ['src/**'];
  await refreshIndex(roots.groundwork, { config });
  await refreshIndex(roots.python);
  const dbs = Object.fromEntries(Object.entries(roots).map(([key, root]) => [key, openDb(indexDbPath(root), { readonly: true })]));
  const rows: Awaited<ReturnType<typeof evaluateTask>>[] = [];
  let semanticStatus = 'NOT RUN';
  let semanticReason = '';
  try {
    for (const task of frozen.tasks) {
      const ids = new Set(searchDocuments(dbs[task.corpus]!).map((s) => s.id));
      if (!task.expected.every((id) => ids.has(id))) throw new Error(`Missing frozen target: ${task.id} ${task.expected.join(',')}`);
    }
    if (process.argv.includes('--validate-only')) { console.log('All 50 frozen target IDs validated. No rankings evaluated.'); return; }
    ({ semanticStatus, semanticReason } = prepareBenchmarkEmbeddings(Object.values(roots), process.argv.includes('--embeddings')));
    for (const task of frozen.tasks) for (const arm of ['baseline', 'lexical', ...(semanticStatus === 'RUN' ? ['hybrid'] : [])] as ('baseline' | 'lexical' | 'hybrid')[]) {
      rows.push(await evaluateTask(dbs[task.corpus]!, task, arm, roots[task.corpus as keyof typeof roots]));
    }
    const summary = ['baseline', 'lexical', ...(semanticStatus === 'RUN' ? ['hybrid'] : [])].flatMap((arm) => ['paraphrase', 'exact'].map((set) => ({ arm, set, ...metrics(rows.filter((r) => r.arm === arm && r.set === set).map((r) => r.rank)) })));
    const get = (arm: string, set: string) => summary.find((s) => s.arm === arm && s.set === set)!;
    const gain = get('lexical', 'paraphrase').recall5 - get('baseline', 'paraphrase').recall5;
    const controls = (['recall1', 'recall5', 'mrr'] as const).every((m) => get('lexical', 'exact')[m] >= get('baseline', 'exact')[m]);
    const pass = gain >= 0.15 && controls;
    const result = { anchor: frozen.anchor, manifestSha256: MANIFEST_SHA, semanticStatus, semanticReason, summary, gain, controls, gate: pass ? 'PASS' : 'FAIL', rows };
    const results = path.join(HERE, 'results');
    mkdirSync(results, { recursive: true });
    writeFileSync(path.join(results, 'results.json'), JSON.stringify(result, null, 2) + '\n');
    const percent = (n: number) => (100 * n).toFixed(1) + '%';
    const md = `# Natural-language search — frozen v1 results\n\nDeterministic retrieval only, not an agent evaluation. No speed, token or cost claims.\n\n| Arm | Set | N | Recall@1 | Recall@5 | MRR |\n| --- | --- | ---: | ---: | ---: | ---: |\n${summary.map((s) => `| ${s.arm} | ${s.set} | ${s.tasks} | ${percent(s.recall1)} | ${percent(s.recall5)} | ${s.mrr.toFixed(4)} |`).join('\n')}\n\n**Gate: ${result.gate}.** Paraphrase Recall@5 gain: ${(100 * gain).toFixed(1)} points (required ≥15). Exact controls no drop: ${controls ? 'PASS' : 'FAIL'}.\n\nEmbeddings: ${semanticStatus}. ${semanticReason}\n\nCorpus anchor: ${frozen.anchor}. Manifest SHA256: ${MANIFEST_SHA}.\nAll 50 target IDs validated. One full evaluation, no post-result tuning.\nMRR retrieval horizon: search API returns at most 100 hits; baseline uses its full result list.\nFull returned ID lists and per-task ranks are retained in results.json.\nLimitations: small author-written corpus; behavior paraphrases are not an independent user sample.\n`;
    writeFileSync(path.join(results, 'RESULTS.md'), md);
    console.log(md);
  } finally { for (const db of Object.values(dbs)) db.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
