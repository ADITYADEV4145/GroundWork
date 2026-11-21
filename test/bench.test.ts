import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadSuite, renderReport, runBenchmark, withPinnedWorkspace } from '../src/bench/runner.js';
import type { Evidence, Sample, Suite } from '../src/bench/schema.js';
import { summarize } from '../src/bench/stats.js';
import { tempDir } from '../src/selftest/fixtures.js';

const revision = 'e0709ce62f2e8766080ec753c90a46fc96620610';
const suite: Suite = {
  revision,
  tasks: [
    { id: 'first', repo: 'groundwork', category: 'locate', prompt: 'first' },
    { id: 'second', repo: 'groundwork', category: 'trace', prompt: 'second' },
  ],
};
const sample = (task: string, bytes: number, success: boolean, count: number): Sample => ({
  task, success, toolCalls: 1, toolOutputBytes: bytes, filesRead: 0, readBytes: 0, readBlocks: 0, wallMs: 1,
  metrics: { duplicatesAdded: count },
});
const evidence = (): Evidence => ({
  format: 1, suite: 'nav', suiteDigest: '0'.repeat(64), captures: [
    { suite: 'nav', revision, captureRevision: revision, run: 1, condition: 'baseline', agent: 'Devin normal', model: null, node: process.version,
      samples: [sample('first', 800, true, 1), sample('second', 200, true, 2)] },
    { suite: 'nav', revision, captureRevision: revision, run: 1, condition: 'groundwork', agent: 'Devin normal', model: null, node: process.version,
      samples: [sample('first', 400, true, 1), sample('second', 150, false, 0)] },
  ],
});

describe('benchmark reporting', () => {
  it('computes paired task-level bootstrap medians and flags category regression', () => {
    const report = summarize(suite, 'nav', evidence(), 1);
    expect(report.estimatedToolOutputReductionPct).toEqual({ median: 37.5, low: 25, high: 50 });
    expect(report.modelInputReductionPct).toBeNull();
    expect(report.noSuccessDrop).toBe(false);
    expect(report.metrics.duplicatesAdded?.pairedDeltaPerTask).toEqual({ median: -1, low: -2, high: 0 });
    expect(renderReport(report)).toContain('| second | trace | 1/1 | 0/1 |');
    expect(renderReport(report)).toContain('| Provider input tokens per attempt | unavailable | unavailable |');
    expect(renderReport(report)).toContain(`Capture implementation: \`${revision}\`.`);
  });

  it('rejects mixed revisions and missing, duplicated or unmatched observations', () => {
    const e = evidence();
    expect(() => summarize(suite, 'nav', e, 2)).toThrow('Missing baseline or GroundWork replicate 2');
    e.captures[1]!.samples.pop();
    expect(() => summarize(suite, 'nav', e, 1)).toThrow('missing second');
    e.captures[1]!.samples.push(e.captures[1]!.samples[0]!);
    expect(() => summarize(suite, 'nav', e, 1)).toThrow('Incomplete or duplicate');
    e.captures[1]!.revision = '0'.repeat(40);
    expect(() => summarize(suite, 'nav', e, 1)).toThrow('pinned revision');
  });

  it('reports provider input separately when every attempt supplies usage', () => {
    const e = evidence();
    for (const capture of e.captures) for (const result of capture.samples) {
      result.usage = { inputTokens: capture.condition === 'baseline' ? 600 : 500, outputTokens: 10 };
    }
    const report = summarize(suite, 'nav', e, 1);
    expect(report.modelInputReductionPct?.median).toBeCloseTo(100 / 6);
    expect(report.baseline.providerUsage?.outputTokens).toBe(20);
  });

  it('writes both report formats from a complete set of trusted captures', async () => {
    const root = tempDir('gw-bench-files-');
    try {
      const { suite: nav } = loadSuite('nav');
      for (const arm of evidence().captures) {
        const { samples: _, ...meta } = arm;
        writeFileSync(path.join(root, meta.condition + '.json'), JSON.stringify({ ...meta, observations: nav.tasks.map((task) => ({
          task: task.id, startedAt: 0, wallMs: 10, answer: [], tools: task.id === 'gw-01' ? [] : [{ action: 'shell', bytes: 24 }],
        })) }));
      }
      const output = await runBenchmark({ suite: 'nav', runs: 1, observations: root, outputDir: root });
      expect(output.summaries).toHaveLength(1);
      expect(readFileSync(output.markdown, 'utf8')).toContain('30 tasks × 1 paired repeats');
      expect(JSON.parse(readFileSync(output.json, 'utf8'))[0].summary.tasks).toHaveLength(30);
      expect(output.summaries[0]?.tasks.find((task) => task.task === 'gw-01')?.estimatedReductionPct).toBeNull();
      const repeated = await runBenchmark({ suite: 'nav', runs: 1, observations: root, outputDir: root });
      expect(repeated.summaries).toEqual(output.summaries);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe('navigation task checks', () => {
  it('matches a reference set exactly, ignoring order', async () => {
    const { suite: nav, grader } = loadSuite('nav');
    const { grade } = await import(pathToFileURL(grader).href);
    const task = nav.tasks.find((t) => t.id === 'gw-02');
    const answer = ['src/store/schema.ts:ensureSchema', 'src/index/store.ts:openIndex'];
    await expect(grade(task, { answer: answer.toReversed() }, {})).resolves.toBe(true);
    await expect(grade(task, { answer: [...answer, answer[0]] }, {})).resolves.toBe(false);
  });

  it.each([
    ['edit-01', 'src/utils/text.ts', 'text.toLowerCase()', 'text.trim().toLowerCase()'],
    ['edit-02', 'app/cli.py', 'argv or sys.argv[1]', 'argv[0] if isinstance(argv, list) else argv or sys.argv[1]'],
    ['edit-03', 'src/utils/date.ts', 'pad(Number(p))', 'Number.isNaN(Number(p)) ? p : pad(Number(p))'],
    ['edit-04', 'app/models.py', 'def total(self) -> float:\n        return sum(self.amounts)',
      'discount: float = 0.0\n\n    def total(self) -> float:\n        return sum(self.amounts) - self.discount'],
    ['edit-05', 'src/services/api.ts', 'timeout?: number) {}', 'private readonly timeout?: number) {}'],
    ['edit-06', 'app/services/tax.py', '[rate(r) for r in regions]', '[rate(r, **opts) for r in regions]'],
  ])('rejects pinned behavior and accepts a correct edit for %s', async (id, file, from, to) => {
    const { suite: nav, grader } = loadSuite('nav');
    const { grade } = await import(pathToFileURL(grader).href);
    const task = nav.tasks.find((t) => t.id === id)!;
    await withPinnedWorkspace(nav.revision, task.repo, async (root) => {
      const withWorkspace = (run: (root: string) => unknown) => run(root);
      await expect(grade(task, { patch: 'test' }, { withWorkspace })).resolves.toBe(false);
      const target = path.join(root, file);
      let changed = readFileSync(target, 'utf8').replace(from, to);
      if (id === 'edit-05') changed = changed.replace('headers: { key, cfg: CONFIG_KEY }',
        'headers: { key, cfg: CONFIG_KEY }, ...(this.timeout !== undefined ? { signal: AbortSignal.timeout(this.timeout) } : {})');
      writeFileSync(target, changed);
      await expect(grade(task, { patch: 'test' }, { withWorkspace })).resolves.toBe(true);
    });
  });
});
