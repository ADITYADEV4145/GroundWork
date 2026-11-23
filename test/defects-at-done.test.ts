import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { grade } from '../src/bench/defects/grade.js';
import { armBlocker, loadArms, parseUsage, registered, runSuite } from '../src/bench/defects/harness.js';
import { prStudy } from '../src/bench/defects/pr-study.js';
import { buildReport, leaderboard, markdown, pairedBootstrap, tasksNeeded, verdicts, writeReport } from '../src/bench/defects/report.js';
import { CATEGORIES, dataRoot, loadManifest, manifestSchema, taskSetHash } from '../src/bench/defects/tasks.js';
import { applyReference, materialize, snapshotSetup } from '../src/bench/defects/workspaces.js';

const work = mkdtempSync(path.join(os.tmpdir(), 'gw-dad-test-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));
const manifest = loadManifest();
const find = (id: string) => {
  const task = manifest.tasks.find((t) => t.id === id)!;
  return { task, repo: manifest.repos.find((r) => r.id === task.repo)! };
};
async function graded(id: string, files: Record<string, string>, reference = false) {
  const { task, repo } = find(id), dir = path.join(work, `${id}-${Math.random().toString(36).slice(2)}`), base = materialize(repo, dir);
  if (reference) applyReference(task, dir);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  return grade(task, repo, dir, base);
}

describe('DefectsAtDone manifest', () => {
  it('covers five categories on two languages and hashes reproducibly', () => {
    expect(new Set(manifest.tasks.map((t) => t.category)).size).toBe(5);
    expect(new Set(manifest.repos.map((r) => r.language))).toEqual(new Set(['typescript', 'python']));
    expect(taskSetHash()).toMatch(/^[a-f0-9]{64}$/);
    expect(taskSetHash()).toBe(taskSetHash());
    expect(CATEGORIES).toContain('real-failure');
  });
  it('rejects real-failure tasks without provenance and ripple tasks without callers', () => {
    const base = { id: 't', repo: 'ledger-kit', prompt: 'x'.repeat(50), entry: 'src/a.ts', hidden: 'ledger-kit.mjs' };
    const parse = (task: object) => manifestSchema.safeParse({ version: 1, repos: manifest.repos, tasks: [task] }).success;
    expect(parse({ ...base, category: 'real-failure' })).toBe(false);
    expect(parse({ ...base, category: 'real-failure', provenance: 'https://example.test/pr/1' })).toBe(true);
    expect(parse({ ...base, category: 'ripple', trap: { affected: ['src/a.ts'] } })).toBe(false);
  });
});

describe('DefectsAtDone grader', () => {
  it('counts a re-implemented helper as a duplicate even when the task succeeds', async () => {
    const g = await graded('ledger-invoice-slug', { 'src/invoices/slug.ts': `import type { Invoice } from '../types.ts';
export function invoiceSlug(invoice: Invoice): string {
  const name = invoice.customer.normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return name ? \`\${name}-\${invoice.number}\` : String(invoice.number);
}
` });
    expect(g.success).toBe(true);
    expect(g.defects.duplicates).toBe(1);
    expect(g.totalDefects).toBe(1);
  }, 120_000);
  it('counts a helper re-implemented after compaction even when the first step reused it', async () => {
    const reference = await graded('ledger-credit-then-refund', {}, true);
    expect(reference.totalDefects).toBe(0);
    const g = await graded('ledger-credit-then-refund', { 'src/invoices/refund.ts': `import { subtotalCents } from './total.ts';
import type { Invoice } from '../types.ts';
export function refundCents(invoice: Invoice, feeFraction: number): number {
  const subtotal = subtotalCents(invoice), fee = subtotal * feeFraction, floor = Math.floor(fee), rest = fee - floor;
  return subtotal - (rest > 0.5 || (rest === 0.5 && floor % 2 === 1) ? floor + 1 : floor);
}
` }, true);
    expect(g.defects.duplicates).toBe(1);
  }, 120_000);

  it('does not count files written by arm setup as the agent\'s change', async () => {
    const { task, repo } = find('ledger-invoice-slug'), dir = path.join(work, 'setup-only');
    materialize(repo, dir);
    writeFileSync(path.join(dir, '.mcp.json'), '{"mcpServers":{}}\n');
    writeFileSync(path.join(dir, 'CLAUDE.md'), 'Use the tool.\n');
    const g = await grade(task, repo, dir, snapshotSetup(dir));
    expect(g.defects.duplicates).toBe(0);
    expect(g.defects.missedCallers).toBe(0);
  }, 120_000);

  it('counts an invented method and a wrong argument list', async () => {
    const invented = await graded('ledger-owner-email', { 'src/accounts/owner.ts': `import type { AccountStore } from './store.ts';
export function ownerEmail(store: AccountStore, handle: string): string | null {
  return store.getByHandle(handle)?.email.toLowerCase() ?? null;
}
` });
    expect(invented.success).toBe(false);
    expect(invented.defects.inventedCalls).toBe(1);
    const wrong = await graded('ledger-owner-email', { 'src/accounts/owner.ts': `import type { AccountStore } from './store.ts';
export function ownerEmail(store: AccountStore, handle: string): string | null {
  return store.findByHandle(handle)?.email.toLowerCase() ?? null;
}
` });
    expect(wrong.defects.wrongArguments).toBe(1);
    expect(wrong.defects.inventedCalls).toBe(0);
  }, 120_000);
  it('counts stale docs after a signature change and callers missed by a ripple change', async () => {
    const { repo } = find('ledger-tax-options');
    const original = (file: string) => readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../bench/defects-at-done/repos', repo.id, file), 'utf8');
    const stale = await graded('ledger-tax-options', { 'docs/billing.md': original('docs/billing.md') }, true);
    expect(stale.success).toBe(true);
    expect(stale.items.map((i) => `${i.defect}:${i.file}`)).toEqual(['missedCallers:docs/billing.md']);
    const missed = await graded('route-distance-unit', {
      'routeplan/reports/audit.py': readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../bench/defects-at-done/repos/route-plan/routeplan/reports/audit.py'), 'utf8'),
    }, true);
    expect(missed.success).toBe(false);
    expect(missed.defects.missedCallers).toBe(1);
    expect(missed.defects.failingTests).toBe(1);
  }, 120_000);
});

describe('DefectsAtDone harness and report', () => {
  const out = path.join(work, 'runs');
  // Stand-in for an agent: the native arm leaves the workspace untouched, the other arm writes the reference solution.
  const execute = ({ task, arm, dir }: { task: (typeof manifest.tasks)[number]; arm: { id: string }; dir: string }) => {
    if (arm.id !== 'native') applyReference(task, dir);
    return { exit: 0, timedOut: false, stdout: '', stderr: '' };
  };
  const options = { run: 'unit', out, agent: 'stand-in', model: 'none', replicates: 1, tasks: ['route-stop-key', 'route-depot-name'], execute };

  it('refuses unpinned competitor arms instead of skipping them silently', async () => {
    const serena = loadArms().find((a) => a.id === 'serena')!;
    expect(armBlocker(serena)).toMatch(/no pinned version/);
    const result = await runSuite({ ...options, arms: ['native', 'serena'] });
    expect(result.records).toBe(2);
    expect(result.blocked.map((b) => b.arm)).toEqual(['serena']);
    const again = await runSuite({ ...options, arms: ['native'] });
    expect([again.records, again.skipped]).toEqual([0, 2]);
    await expect(runSuite({ ...options, arms: ['native'], model: 'other' })).rejects.toThrow(/different model/);
    await expect(runSuite({ ...options, arms: ['native'], out: path.join(process.cwd(), 'x') })).rejects.toThrow(/outside/);
    // The blocked arm survives a later report rebuild, and a changed arm definition cannot resume the run.
    expect(buildReport(path.join(out, 'unit')).notRun.map((b) => b.arm)).toEqual(['serena']);
    const root = path.join(work, 'data');
    cpSync(dataRoot, root, { recursive: true });
    const armsPath = path.join(root, 'arms.json'), arms = JSON.parse(readFileSync(armsPath, 'utf8')) as { arms: { id: string; label: string }[] };
    arms.arms.find((a) => a.id === 'native')!.label = 'changed';
    writeFileSync(armsPath, JSON.stringify(arms));
    await expect(runSuite({ ...options, arms: ['native'], root })).rejects.toThrow(/different definition of arm native/);
  }, 120_000);

  it('reports exploratory runs without verdicts and keeps invalid records visible', async () => {
    const dir = path.join(out, 'unit');
    const record = JSON.parse(readFileSync(path.join(dir, 'records/native/route-stop-key.1.json'), 'utf8')) as { invalid: string[]; grade: { success: boolean } };
    expect(record.grade.success).toBe(false);
    const { report, files } = writeReport(dir, [{ arm: 'serena', reason: 'unpinned' }]);
    expect(report.preregistration).toBeNull();
    expect(report.verdicts).toEqual([]);
    expect(markdown(report)).toContain('supports no claim');
    expect(readFileSync(files.html, 'utf8')).toContain('serena: unpinned');
    const file = path.join(dir, 'records/native/route-depot-name.1.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), invalid: ['turn 0 hit the time budget'] }));
    const after = buildReport(dir);
    expect(after.arms[0]).toMatchObject({ arm: 'native', valid: 1, invalid: 1 });
    expect(leaderboard(after)).toContain('turn 0 hit the time budget');
  });

  it('never passes a preregistered verdict on incomplete evidence', () => {
    const report = buildReport(path.join(out, 'unit'));
    report.preregistration = { file: 'bench/prereg/defects-at-done-v1.md', commit: 'a'.repeat(40), committedAt: '2026-01-01T00:00:00Z', sha256: 'b'.repeat(64) };
    expect(verdicts(report).map((v) => v.passed)).toEqual([null, null, null, null, null]);
    report.arms = report.arms.filter((x) => x.arm !== 'native').map((x) => ({ ...x, arm: 'groundwork' }));
    expect(verdicts(report).map((v) => v.passed)).toEqual([null, null, null, null, null]);
  });

  it('only accepts a committed, unmodified preregistration', () => {
    const repo = path.join(work, 'prereg');
    mkdirSync(repo);
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@localhost', ...args], { cwd: repo, stdio: 'pipe' });
    git('init', '-q');
    writeFileSync(path.join(repo, 'p.md'), 'v1');
    expect(() => registered('p.md', repo)).toThrow(/uncommitted/);
    git('add', 'p.md'); git('commit', '-qm', 'prereg');
    expect(registered('p.md', repo).commit).toMatch(/^[0-9a-f]{40}$/);
    writeFileSync(path.join(repo, 'p.md'), 'v2');
    expect(() => registered('p.md', repo)).toThrow(/uncommitted/);
  });

  it('computes paired intervals, sample sizes and provider usage', () => {
    const interval = pairedBootstrap([[2, 1], [4, 1], [2, 0], [4, 2]], (b, a) => b ? 100 * (1 - a / b) : null)!;
    expect(interval.estimate).toBeCloseTo(66.67, 1);
    expect(interval.low).toBeLessThanOrEqual(interval.estimate);
    expect(interval.high).toBeGreaterThanOrEqual(interval.estimate);
    expect(pairedBootstrap([[0, 0]], (b, a) => b ? a / b : null)).toBeNull();
    expect(tasksNeeded(1, 0.5)).toBe(32);
    expect(parseUsage('claude-json', JSON.stringify({ usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 7 }, total_cost_usd: 0.01 }))?.usage)
      .toEqual({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 7, cacheWriteTokens: 0, costUsd: 0.01 });
    expect(parseUsage('claude-json', 'not json')).toBeNull();
  });
});

describe('AI-written PR study', () => {
  it('reports aggregates only', async () => {
    const cache = path.join(work, 'mirrors'), mirror = path.join(cache, 'acme__shop');
    mkdirSync(path.join(mirror, 'src'), { recursive: true });
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@localhost', ...args], { cwd: mirror, encoding: 'utf8', stdio: 'pipe' }).trim();
    git('init', '-q');
    writeFileSync(path.join(mirror, 'src/price.ts'), 'export function priceOf(sku: string): number { return sku.length; }\n');
    writeFileSync(path.join(mirror, 'src/cart.ts'), "import { priceOf } from './price.ts';\nexport const one = priceOf('a');\n");
    git('add', '-A'); git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(path.join(mirror, 'src/cart.ts'), "import { priceOf, discountFor } from './price.ts';\nexport const one = priceOf('a');\nexport const two = discountFor('a');\n");
    git('commit', '-qam', 'head');
    const head = git('rev-parse', 'HEAD'), list = path.join(work, 'prs.json');
    writeFileSync(list, JSON.stringify({ version: 1, sampling: 'One synthetic pull request used by the unit test.', prs: [
      { repo: 'acme/shop', number: 1, base, head, signal: 'trailer' }, { repo: 'acme/missing', number: 2, base, head, signal: 'label' }] }));
    const study = await prStudy(list, cache);
    expect(study).toMatchObject({ prs: 2, scanned: 1, failed: 1, prsWithFinding: 1 });
    expect(Object.values(study.findings).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(JSON.stringify(study)).not.toMatch(/acme|discountFor/);
    expect(existsSync(path.join(mirror, '.groundwork'))).toBe(false);
  }, 120_000);
});
