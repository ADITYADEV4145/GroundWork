import { existsSync, readFileSync } from 'node:fs';
import { configSchema, type GroundworkConfig } from './schema.js';
import { gwPath } from '../util/paths.js';
import { formatZodError } from '../util/zod.js';

export class ConfigError extends Error {}

export function defaultConfig(): GroundworkConfig {
  return configSchema.parse({});
}

export function configPath(root: string): string {
  return gwPath(root, 'config.json');
}

export function loadConfig(root: string): GroundworkConfig {
  const p = configPath(root);
  if (!existsSync(p)) return defaultConfig();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(p, 'utf8'));
  } catch (err) {
    throw new ConfigError(`.groundwork/config.json is not valid JSON: ${(err as Error).message}`);
  }
  const res = configSchema.safeParse(raw);
  if (!res.success) throw new ConfigError(`.groundwork/config.json is invalid:\n${formatZodError(res.error)}`);
  return res.data;
}
