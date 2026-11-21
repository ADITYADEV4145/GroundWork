import * as z from 'zod';

// Phase 5 (waste guards). Owner: waste-guards stream.
export const guardsConfigSchema = z
  .object({
    repeatCommand: z
      .object({
        enabled: z.boolean().default(true),
        exempt: z.array(z.string()).default(['git fetch', 'git pull', 'curl', 'wget', 'date', 'npm view', 'gh ']),
      })
      .strict()
      .default({ enabled: true, exempt: ['git fetch', 'git pull', 'curl', 'wget', 'date', 'npm view', 'gh '] }),
    outputTrimmer: z.object({ enabled: z.boolean().default(true) }).strict().default({ enabled: true }),
    explorationHint: z
      .object({ enabled: z.boolean().default(true), threshold: z.number().int().positive().default(12) })
      .strict()
      .default({ enabled: true, threshold: 12 }),
    sessionSummary: z.boolean().default(false),
  })
  .strict();
