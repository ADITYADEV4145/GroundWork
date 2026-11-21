import path from 'node:path';
import { Command } from 'commander';
import { validateReferences } from '../src/bench/grounding/acceptance.js';
import { armSchema, dataRoot } from '../src/bench/grounding/tasks.js';
import { prepare } from '../src/bench/grounding/workspaces.js';
import { score } from '../src/bench/grounding/score.js';
import { writeReport, markdown } from '../src/bench/grounding/report.js';

const program = new Command().name('bench:grounding').description('Benchmark v3: prepare isolated agent tasks, score committed histories, report paired results');
program.command('prepare').requiredOption('--arm <arm>').requiredOption('--repo <id>').requiredOption('--out <dir>')
  .action((o: { arm: string; repo: string; out: string }) => {
    const run = prepare(armSchema.parse(o.arm), o.repo, o.out);
    console.log(`Prepared ${o.arm}/${o.repo}: ${path.resolve(o.out)} (${run.taskSetHash})`);
    for (const w of run.workspaces) console.log(`  ${w.task}/  base ${w.base}`);
  });
program.command('score').requiredOption('--arm <arm>').requiredOption('--out <dir>', 'prepared arm directory').requiredOption('--agent <label>')
  .option('--results <dir>', 'results directory', path.join(dataRoot, 'results'))
  .action(async (o: { arm: string; out: string; agent: string; results: string }) => {
    const result = await score(path.resolve(o.out), armSchema.parse(o.arm), o.agent, path.resolve(o.results));
    console.log(`Scored ${result.arm}: ${result.rows.filter((r) => r.success).length}/15 succeeded; wrote ${path.join(o.results, result.arm + '.json')}`);
  });
program.command('report').option('--results <dir>', 'results directory', path.join(dataRoot, 'results'))
  .action((o: { results: string }) => {
    const report = writeReport(path.resolve(o.results));
    console.log(markdown(report));
    if (!report.noSuccessDrop) process.exitCode = 1;
  });
program.command('validate').description('Run all hidden acceptance tests on reference solutions and unmodified fixtures')
  .action(() => {
    const result = validateReferences();
    for (const row of result.rows) console.log(`${row.task}: reference ${row.reference ? 'PASS' : 'FAIL'}, unmodified ${row.unmodified ? 'PASS (unexpected)' : 'FAIL (expected)'}`);
    console.log(`Reference solutions: ${result.referencePassed}/${result.total} pass; unmodified repos: ${result.unmodifiedFailed}/${result.total} fail (expected)`);
    if (result.referencePassed !== 15 || result.unmodifiedFailed !== 15) process.exitCode = 1;
  });
program.parseAsync(process.argv).catch((e: unknown) => { console.error((e as Error).message); process.exitCode = 1; });
