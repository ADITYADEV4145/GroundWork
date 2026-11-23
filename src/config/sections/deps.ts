import * as z from 'zod';

// Checking beyond the repo: installed dependencies, sibling workspace packages and local service contracts.
export const depsConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Keep each package version's surface under .groundwork/deps so it is read once. */
    cache: z.boolean().default(true),
    /** Extra site-packages directories, relative to the repo root (virtualenvs at .venv/venv/env are found). */
    pythonPaths: z.array(z.string()).default([]),
    /** Compare HTTP, GraphQL and gRPC client calls with OpenAPI/GraphQL/protobuf files in the repo (warnings). */
    contracts: z.boolean().default(true),
  })
  .strict();
