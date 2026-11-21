import * as z from 'zod';

// Phase 4 (grounding). Owner: grounding stream.
export const groundingConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Report findings to the agent right after Edit/Write/MultiEdit (PostToolUse). */
    postToolHook: z.boolean().default(true),
    /** Token budget for one hook/MCP message. */
    budgetTokens: z.number().int().positive().default(400),
    /** Files never checked (globs), on top of generated files. */
    exclude: z.array(z.string()).default([]),
  })
  .strict();
