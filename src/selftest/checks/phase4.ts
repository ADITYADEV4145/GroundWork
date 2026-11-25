import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defaultConfig, loadConfig } from '../../config/load.js';
import { Grounder, type Finding } from '../../grounding/index.js';
import { dispatch } from '../../hooks/run.js';
import type { HookEvent } from '../../hooks/types.js';
import { refreshIndex } from '../../index/refresh.js';
import { indexDbPath } from '../../index/store.js';
import { initSqlBackend, openDb, type Db } from '../../store/db.js';
import { FIXTURES, FIXTURES_DIR, tempDir, withIndexedFixture } from '../fixtures.js';
import type { Check } from '../registry.js';
import { GroundingReposMissing, prepareGroundingRepos } from '../grounding-repos.js';
import { groundingHookLatency } from '../grounding-latency.js';
import { validateStoredResults } from '../../bench/grounding/report.js';

// Phase 4 gate: grounding catches every planted error, stays silent on valid dynamic code and clean repos,
// and the PostToolUse path is fast enough to run on every edit.

export const GROUNDING_FIXTURES = ['grounding-ts', 'grounding-py', 'grounding-go'];

/** `// expect: arity` / `# expect: unknown-keyword` markers in a fixture, as `file:line:kind`. */
export function plantedErrors(dir: string): Set<string> {
  const out = new Set<string>();
  const walk = (rel: string) => {
    for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name !== '.groundwork' && e.name !== 'node_modules') walk(r);
      } else
        readFileSync(path.join(dir, r), 'utf8')
          .split('\n')
          .forEach((l, i) => {
            const m = /(?:\/\/|#)\s*expect:\s*([a-z-]+)/.exec(l);
            if (m) out.add(`${r}:${i + 1}:${m[1]}`);
          });
    }
  };
  walk('');
  return out;
}

export function groundAll(db: Db, root: string): Finding[] {
  const g = new Grounder(db, root);
  const files = db.prepare('SELECT path FROM files ORDER BY path').all().map((r) => String(r.path));
  return files.flatMap((f) => g.verify(f).findings);
}

export function plantedReport(dir: string, findings: Finding[]): { missed: string[]; extra: string[]; planted: number } {
  const want = plantedErrors(dir);
  const got = new Set(findings.map((f) => `${f.file}:${f.line}:${f.kind}`));
  return { planted: want.size, missed: [...want].filter((k) => !got.has(k)), extra: [...got].filter((k) => !want.has(k)) };
}

const planted: Check = {
  phase: 4,
  name: 'grounding: 100% of planted errors caught, 0 flags on valid/dynamic code',
  async run() {
    let total = 0;
    const problems: string[] = [];
    for (const name of GROUNDING_FIXTURES) {
      const r = await withIndexedFixture(name, (db, dir) => plantedReport(dir, groundAll(db, dir)));
      total += r.planted;
      problems.push(...r.missed.map((k) => `${name}: missed ${k}`), ...r.extra.map((k) => `${name}: false positive ${k}`));
    }
    return {
      ok: problems.length === 0 && total > 0,
      detail: problems.length ? problems.slice(0, 8).join('; ') : `${total} planted errors caught, 0 false positives`,
      metrics: { planted: total, problems: problems.length },
    };
  },
};

const didYouMean: Check = {
  phase: 4,
  name: 'grounding: did-you-mean names the real symbol with location and signature',
  async run() {
    const cases: [string, string, string, string][] = [
      ['grounding-ts', 'findByEmail', 'getUserByEmail', 'src/lib/users.ts:8, getUserByEmail(email: string)'],
      ['grounding-py', 'Invoce', 'Invoice', 'app/models.py:5, class Invoice'],
      ['grounding-py', 'tax.rates', 'rate', 'app/tax.py:1, def rate(region)'],
      ['grounding-py', 'Invoice.from_json', 'from_dict', 'app/models.py:20'],
    ];
    const bad: string[] = [];
    for (const [fx, name, want, loc] of cases) {
      const f = await withIndexedFixture(fx, (db, dir) => groundAll(db, dir).find((x) => x.name === name));
      if (!f || f.suggestions[0]?.name !== want || !f.message.includes(loc)) bad.push(`${name} -> ${f?.message ?? 'no finding'}`);
    }
    return { ok: !bad.length, detail: bad.length ? bad.join('; ') : `${cases.length}/${cases.length} suggestions correct` };
  },
};

async function groundCopy(src: string, own = false, pinned = false): Promise<{ files: number; findings: Finding[] }> {
  const dir = tempDir('gw-ground-');
  try {
    const skip = pinned ? /(^|[\\/])\.groundwork$/ : /(^|[\\/])(node_modules|\.git|\.groundwork|dist)$/;
    // Groundwork's own fixtures plant errors on purpose; the rest of a repo must be clean.
    cpSync(src, dir, { recursive: true, filter: (p) => !skip.test(p) && !(own && path.relative(src, p) === 'fixtures') });
    const config = defaultConfig();
    config.index.skipGenerated = false;
    config.index.maxFileBytes = Number.MAX_SAFE_INTEGER;
    await refreshIndex(dir, { config });
    const db = openDb(indexDbPath(dir), { readonly: true });
    try {
      const files = Number(db.prepare('SELECT COUNT(*) AS n FROM files').get()!.n);
      return { files, findings: groundAll(db, dir) };
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const cleanRepos: Check = {
  phase: 4,
  name: 'grounding: clean repos produce zero findings',
  async run(options) {
    await initSqlBackend();
    const self = path.resolve(FIXTURES_DIR, '..');
    const repos = [...FIXTURES.map((f) => path.join(FIXTURES_DIR, f)), ...(existsSync(path.join(self, 'src')) ? [self] : [])];
    if (options.quick) return { ok: true, skipped: true, detail: 'skipped (--quick): pinned real-repo grounding requires a full run' };
    let pinned: string[];
    try { pinned = prepareGroundingRepos(self); }
    catch (e) {
      if (e instanceof GroundingReposMissing) return { ok: false, detail: e.message };
      throw e;
    }
    repos.push(...pinned);
    // Extra real repositories at clean commits: GW_GROUNDING_REPOS=/path/a:/path/b
    repos.push(...(process.env.GW_GROUNDING_REPOS ?? '').split(path.delimiter).filter(Boolean));
    const notes: string[] = [];
    let flagged = 0;
    for (const r of repos) {
      const { files, findings } = await groundCopy(r, r === self, pinned.includes(r));
      flagged += findings.length;
      notes.push(`${pinned.includes(r) ? path.basename(path.dirname(r)) + '@' + path.basename(r) : path.basename(r)} ${files} files/${findings.length}`);
      for (const f of findings.slice(0, 5)) notes.push(`  ${f.file}:${f.line} ${f.kind} ${f.message}`);
    }
    return { ok: flagged === 0, detail: notes.join(', '), metrics: { repos: repos.length, findings: flagged } };
  },
};

function editEvent(dir: string, file: string, newString: string): HookEvent {
  return { agent: 'claude', event: 'post_tool', sessionId: null, cwd: dir, tool: 'Edit', input: { file_path: path.join(dir, file), old_string: '', new_string: newString }, response: null, raw: {} };
}

const hookBehaviour: Check = {
  phase: 4,
  name: 'grounding hook: reports only changed lines, silent when clean, fails open',
  async run() {
    return withIndexedFixture('grounding-ts', async (_db, dir) => {
      const problems: string[] = [];
      const append = async (file: string, text: string) => {
        writeFileSync(path.join(dir, file), readFileSync(path.join(dir, file), 'utf8') + text);
        return dispatch(editEvent(dir, file, text), dir);
      };
      const bad = await append('src/bad.ts', `\nexport function extra(): number {\n  return add(1);\n}\n`);
      if (bad.action !== 'context' || !/bad\.ts:\d+ arity/.test(bad.message ?? '') || /unknown-export/.test(bad.message ?? ''))
        problems.push(`new arity error not reported alone: ${bad.message ?? bad.action}`);
      const clean = await append('src/bad.ts', `\nexport function fine(): number {\n  return add(1, 2);\n}\n`);
      if (clean.action !== 'allow') problems.push(`clean edit in a file with old errors was not silent: ${clean.message}`);
      const garbage = await dispatch({ ...editEvent(dir, 'src/nope.ts', 'x'), input: { file_path: 42 } }, dir);
      if (garbage.action !== 'allow') problems.push('malformed payload did not fail open');
      const off = loadConfig(dir).grounding.postToolHook;
      if (!off) problems.push('postToolHook default should be on');
      return { ok: !problems.length, detail: problems.length ? problems.join('; ') : 'changed-lines only, silent when clean, fail-open' };
    });
  },
};

const hookLatency: Check = {
  phase: 4,
  slow: true,
  name: 'grounding hook median batch p95 < 200 ms on a 100k-line repo',
  run: groundingHookLatency,
};

const benchmarkV3: Check = {
  phase: 4,
  name: 'Benchmark v3: paired grounding results with intervals and no success drop',
  async run(opts) {
    if (opts.quick) return { ok: true, skipped: true, detail: 'Benchmark v3 evidence validation skipped (--quick); full runs require both 15-task agent arms' };
    return validateStoredResults();
  },
};

export const PHASE4_CHECKS: Check[] = [planted, didYouMean, cleanRepos, hookBehaviour, hookLatency, benchmarkV3];
