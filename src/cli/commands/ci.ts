import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { gwPath } from '../../util/paths.js';
import { globalOpts, repoRoot, withIndex } from '../context.js';
import { emit, fail } from '../output.js';

interface CiOptions { event?: string; base?: string; onlyAi?: boolean; block?: string; warn?: string; off?: string; ignore?: string; commentFile?: string; sarifFile?: string; summaryFile?: string; outputFile?: string }
const list = (s: string | undefined) => (s ?? '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export function register(program: Command): void {
  program.command('ci')
    .description('check a pull request: scan what it changed, fail on blocking findings, write the comment and SARIF for the GitHub Action')
    .option('--event <file>', 'GitHub pull_request event payload (default: GITHUB_EVENT_PATH)')
    .option('--base <ref>', 'base commit to compare against (default: the base of the event)')
    .option('--only-ai', 'skip pull requests that do not look agent-written')
    .option('--block <kinds>', 'finding kinds that fail the check, comma-separated')
    .option('--warn <kinds>', 'finding kinds that are reported without failing')
    .option('--off <kinds>', 'finding kinds that are not reported')
    .option('--ignore <globs>', 'paths whose findings are not reported, comma-separated')
    .option('--comment-file <file>', 'write the pull request comment here (left empty when there are no findings)')
    .option('--sarif-file <file>', 'write SARIF 2.1.0 here')
    .option('--summary-file <file>', 'append the summary here (GITHUB_STEP_SUMMARY)')
    .option('--output-file <file>', 'append conclusion, blocking and warnings as key=value here (GITHUB_OUTPUT)')
    .option('--json', 'machine-readable output')
    .action(async (options: CiOptions, cmd: Command) => {
      const opts = globalOpts(cmd);
      const { SCAN_KINDS } = await import('../../scan/index.js');
      const ci = await import('../../ci/index.js');
      const eventPath = options.event ?? process.env.GITHUB_EVENT_PATH;
      let pr = null;
      if (eventPath && existsSync(eventPath)) {
        try { pr = ci.readEvent(JSON.parse(readFileSync(eventPath, 'utf8'))); } catch { fail(opts, `cannot read the event payload ${eventPath}`); }
      }
      const severity: Record<string, 'block' | 'warn' | 'off'> = {};
      for (const level of ['block', 'warn', 'off'] as const) {
        for (const kind of list(options[level])) {
          if (!(SCAN_KINDS as string[]).includes(kind)) fail(opts, `unknown finding kind ${kind}; kinds are ${SCAN_KINDS.join(', ')}`);
          severity[kind] = level;
        }
      }
      const root = repoRoot(opts);
      const baseRef = options.base ?? pr?.base;
      if (!baseRef) fail(opts, 'no base commit: pass --base <ref> or run on a pull_request event');
      try { execFileSync('git', ['cat-file', '-e', `${baseRef}^{commit}`], { cwd: root, stdio: 'ignore' }); }
      catch { fail(opts, `base commit ${baseRef} is not in this checkout; use actions/checkout with fetch-depth: 0`); }
      const base = ci.mergeBase(root, baseRef);
      // Like gw scan: a repository that never ran `gw init` must not get its index into git status.
      const state = gwPath(root);
      if (!existsSync(state)) { mkdirSync(state, { recursive: true }); writeFileSync(path.join(state, '.gitignore'), '*\n'); }
      await withIndex(opts, async ({ db, config }) => {
        const agent = ci.detectAi(pr ?? { author: '', authorIsBot: false, labels: [] }, ci.commitTexts(root, base), config.ci.aiLabels);
        const result = (options.onlyAi || config.ci.onlyAi) && !agent
          ? { conclusion: 'skipped' as const, reason: 'no agent label, bot author or agent commit trailer', blocking: [], warnings: [], lowConfidence: 0, files: 0, skipped: [], ms: 0 }
          : { ...await ci.runCheck(db, root, { config, base, severity, ignore: list(options.ignore) }), reason: agent };
        const { report, ...summary } = result as typeof result & { report?: unknown };
        const text = ci.renderSummary(summary);
        if (options.commentFile) writeFileSync(options.commentFile, ci.renderComment(summary, config.ci.maxFindings) ?? '');
        if (options.sarifFile && report) writeFileSync(options.sarifFile, JSON.stringify(ci.checkSarif(result as Parameters<typeof ci.checkSarif>[0]), null, 2) + '\n');
        if (options.summaryFile) appendFileSync(options.summaryFile, '```\n' + text.replace(/```/g, "'''") + '\n```\n');
        if (options.outputFile) appendFileSync(options.outputFile, `conclusion=${summary.conclusion}\nblocking=${summary.blocking.length}\nwarnings=${summary.warnings.length}\n`);
        emit(opts, summary, () => text);
        if (summary.conclusion === 'fail') process.exitCode = 1;
      });
    });

  program.command('badge')
    .description('print the README badge that shows the latest GroundWork check and links to its runs')
    .option('--repo <owner/name>', 'GitHub repository (default: the origin remote)')
    .option('--workflow <file>', 'workflow file that runs the check', 'groundwork.yml')
    .option('--json', 'machine-readable output')
    .action(async (options: { repo?: string; workflow: string }, cmd: Command) => {
      const opts = globalOpts(cmd);
      const { badgeMarkdown, repoSlug } = await import('../../ci/index.js');
      let slug = options.repo ?? process.env.GITHUB_REPOSITORY ?? null;
      if (!slug) {
        try { slug = repoSlug(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: repoRoot(opts), stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch { slug = null; }
      }
      if (!slug || !/^[\w.-]+\/[\w.-]+$/.test(slug)) fail(opts, 'cannot tell the GitHub repository; pass --repo owner/name');
      if (!/^[\w.-]+\.ya?ml$/.test(options.workflow)) fail(opts, '--workflow is a workflow file name such as groundwork.yml');
      const markdown = badgeMarkdown(slug, options.workflow);
      emit(opts, { repo: slug, workflow: options.workflow, markdown }, () => markdown);
    });
}
