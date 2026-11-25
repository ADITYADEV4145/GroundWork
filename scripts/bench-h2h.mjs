import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { captureSchema, gradeSchema } from '../src/bench/schema.ts';
import { sessionSummary, sessionInterval } from '../src/bench/session-stats.ts';
import { loadSuite, withPinnedWorkspace } from '../src/bench/runner.ts';

export const arms = ['baseline', 'groundwork', 'serena', 'codebase-memory'];
export const comparisons = [['baseline', 'groundwork'], ['baseline', 'serena'], ['baseline', 'codebase-memory'], ['serena', 'groundwork'], ['codebase-memory', 'groundwork']];

export async function analyze(input, suites = ['nav', 'long-horizon'].map((name) => ({ name, ...loadSuite(name) })),
  graderRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8' }).trim()) {
  const captures = input.map((c) => captureSchema.parse(c));
  if (new Set(captures.map((c) => c.captureRevision)).size !== 1) throw new Error('Mixed captureRevision');
  if (captures[0].captureRevision !== graderRevision) throw new Error('captureRevision must match grader checkout HEAD');
  if (captures.some((c) => c.agent !== captures[0].agent || c.model !== captures[0].model || c.node !== captures[0].node)) {
    throw new Error('Captures must use the same agent, model and Node');
  }
  if (captures.some((c) => !suites.some((s) => s.name === c.suite))) throw new Error('Unexpected suite');
  const output = [];
  for (const { name, suite, grader } of suites) {
    const cs = captures.filter((c) => c.suite === name);
    for (const arm of arms) {
      const rows = cs.filter((c) => c.condition === arm);
      if (rows.length !== 16 || new Set(rows.map((c) => c.run)).size !== 16 || rows.some((c) => c.run > 16)) throw new Error('Incomplete arm: ' + name + '/' + arm);
    }
    if (cs.some((c) => c.protocol !== 'stable-v1' || c.sessionStartBasis !== 'workspace-ready' || c.revision !== suite.revision ||
      c.observations.length !== suite.tasks.length || c.observations.some((o, i) => o.task !== suite.tasks[i].id))) throw new Error('Non-stable timing, revision or manifest order');
    const grade = typeof grader === 'function' ? grader : (await import(pathToFileURL(grader).href)).grade;
    const graded = [];
    for (const c of cs) {
      const samples = [];
      for (const o of c.observations) {
        const task = suite.tasks.find((t) => t.id === o.task);
        if (c.condition === 'baseline' && o.tools.some((t) => t.action === 'mcp' || t.blocked)) throw new Error('Baseline used treatment');
        const result = gradeSchema.parse(await grade(task, o, {
          condition: c.condition, run: c.run, revision: suite.revision,
          withWorkspace: (run) => withPinnedWorkspace(suite.revision, task.repo, async (root, workspace) => {
            try {
              for (const prior of suite.tasks.filter((t) => t.sequence && t.sequence === task.sequence && t.step < task.step).sort((a, b) => a.step - b.step)) {
                workspace.applyPatch(root, c.observations.find((p) => p.task === prior.id).patch, prior.id);
              }
              workspace.applyPatch(root, o.patch);
            } catch { return false; }
            return run(root);
          }),
        }));
        samples.push({ task: o.task, success: typeof result === 'boolean' ? result : result.success,
          startedAt: o.startedAt, endedAt: o.endedAt,
          toolOutputBytes: o.tools.reduce((n, t) => n + t.bytes, 0),
          toolSideMs: o.tools.every((t) => t.durationMs !== undefined) ? o.tools.reduce((n, t) => n + t.durationMs, 0) : undefined });
      }
      graded.push({ ...c, samples });
    }
    for (const [reference, tested] of comparisons) {
      const pair = graded.filter((c) => [reference, tested].includes(c.condition)).map((c) => ({ ...c, condition: c.condition === reference ? 'baseline' : 'groundwork' }));
      const summary = sessionSummary({ captures: pair }, suite.tasks.length, 16);
      const metrics = {};
      for (const [key, value] of Object.entries(summary)) {
        if (key === 'basis') continue;
        const values = (arm) => pair.filter((c) => c.condition === arm).map((c) => key === 'elapsedMsPerTask' ? (c.sessionEndedAt - c.sessionStartedAt) / suite.tasks.length : c.samples.reduce((n, s) => n + s[key === 'emittedBytesPerSession' ? 'toolOutputBytes' : 'toolSideMs'], 0));
        metrics[key] = { referenceMean: value.baselineMean, testedMean: value.groundworkMean, reductionPct: sessionInterval(values('baseline'), values('groundwork'), 24) };
      }
      const successes = [...new Set(suite.tasks.map((t) => t.category))].map((category) => {
        const ids = suite.tasks.filter((t) => t.category === category).map((t) => t.id);
        const count = (arm) => pair.filter((c) => c.condition === arm).flatMap((c) => c.samples).filter((s) => ids.includes(s.task) && s.success).length;
        return { category, reference: count('baseline'), tested: count('groundwork'), total: ids.length * 16 };
      });
      const guardrail = successes.every((s) => s.tested >= s.reference);
      output.push({ suite: name, reference, tested, metrics, successes, guardrail, confirmatoryWin: guardrail && (metrics.elapsedMsPerTask.reductionPct?.adjustedLow ?? -Infinity) > 0 });
    }
  }
  return { protocol: 'h2h-v1', captureRevision: captures[0]?.captureRevision, comparisons: output };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const directory = process.argv[2];
  if (!directory) throw new Error('Usage: node --import tsx scripts/bench-h2h.mjs EXPORT_DIRECTORY');
  const input = readdirSync(directory).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(path.join(directory, f), 'utf8')));
  console.log(JSON.stringify(await analyze(input), null, 2));
}
