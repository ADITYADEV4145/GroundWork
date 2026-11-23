import * as z from 'zod';

const severity = z.enum(['block', 'warn', 'off']);

// Plan phase 6 (GitHub Action). What `gw ci` fails the check on, what it only reports, and what it leaves out.
export const ciConfigSchema = z
  .object({
    /** block fails the check (high-confidence findings only), warn is reported without failing, off is dropped. gw ci never runs the type checker, so type-error does not occur there. */
    severity: z
      .object({
        'invented-call': severity.default('block'),
        'wrong-arguments': severity.default('block'),
        'duplicate-logic': severity.default('warn'),
        'duplicate-constant': severity.default('warn'),
        'dead-code': severity.default('warn'),
        'type-error': severity.default('warn'),
      })
      .strict()
      .default({ 'invented-call': 'block', 'wrong-arguments': 'block', 'duplicate-logic': 'warn', 'duplicate-constant': 'warn', 'dead-code': 'warn', 'type-error': 'warn' }),
    /** Findings in these paths (globs) are not reported. */
    ignore: z.array(z.string()).default([]),
    /** Check only pull requests that look agent-written; others are skipped and pass. */
    onlyAi: z.boolean().default(false),
    /** Pull request labels that mark agent-written work. */
    aiLabels: z.array(z.string()).default(['ai', 'ai-generated', 'agent', 'devin', 'copilot', 'claude', 'codex', 'cursor']),
    /** Most findings shown in the pull request comment. */
    maxFindings: z.number().int().positive().default(10),
  })
  .strict();
