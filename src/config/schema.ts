import { z } from 'zod';
import { indexConfigSchema } from './sections/index.js';
import { navigationConfigSchema } from './sections/navigation.js';
import { reuseConfigSchema } from './sections/reuse.js';
import { groundingConfigSchema } from './sections/grounding.js';
import { guardsConfigSchema } from './sections/guards.js';

// Each section lives in its own file so feature streams can extend their part without touching the others.
export const configSchema = z
  .object({
    $schema: z.string().optional(),
    profile: z.enum(['minimal', 'standard', 'strict']).default('standard'),
    index: indexConfigSchema.default(indexConfigSchema.parse({})),
    navigation: navigationConfigSchema.default(navigationConfigSchema.parse({})),
    reuse: reuseConfigSchema.default(reuseConfigSchema.parse({})),
    grounding: groundingConfigSchema.default(groundingConfigSchema.parse({})),
    guards: guardsConfigSchema.default(guardsConfigSchema.parse({})),
  })
  .strict();

export type GroundworkConfig = z.infer<typeof configSchema>;
export type ConfigInput = z.input<typeof configSchema>;
