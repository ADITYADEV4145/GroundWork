import * as z from 'zod';

// Phase 2 (navigation + read guard). Owner: navigation stream.
export const navigationConfigSchema = z
  .object({
    experimentalReadPaths: z.boolean().default(false),
    readGuard: z
      .object({
        enabled: z.boolean().default(true),
        largeFileLines: z.number().int().positive().default(400),
      })
      .strict()
      .default({ enabled: true, largeFileLines: 400 }),
  })
  .strict();

export function experimentalReadPathsEnabled(config: { navigation: { experimentalReadPaths: boolean } }): boolean {
  const override = process.env.GW_EXPERIMENTAL_READ_PATHS;
  return override === undefined ? config.navigation.experimentalReadPaths : override === '1';
}
