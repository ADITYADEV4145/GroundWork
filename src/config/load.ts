import { existsSync, readFileSync } from 'node:fs';
import { configSchema, type GroundworkConfig } from './schema.js';
import { gwPath } from '../util/paths.js';
import { formatZodError } from '../util/zod.js';

export class ConfigError extends Error {}

type Json = Record<string, unknown>;

/** Profile presets fill in defaults; anything set explicitly in config.json wins. `strict` differs from `standard` only in that the Stop gate blocks. */
const PROFILE_PRESETS: Record<string, Json> = {
  minimal: {
    reuse: { duplicateGate: false },
    grounding: { enabled: false },
    types: { enabled: false },
    guards: { repeatCommand: { enabled: false }, outputTrimmer: { enabled: false }, explorationHint: { enabled: false } },
  },
};

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function underlay(preset: Json, raw: Json): Json {
  const out: Json = { ...preset };
  for (const [k, v] of Object.entries(raw)) out[k] = isObj(v) && isObj(preset[k]) ? underlay(preset[k], v) : v;
  return out;
}

export function applyProfile(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  const preset = typeof raw.profile === 'string' ? PROFILE_PRESETS[raw.profile] : undefined;
  return preset ? underlay(preset, raw) : raw;
}

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
  const res = configSchema.safeParse(applyProfile(raw));
  if (!res.success) throw new ConfigError(`.groundwork/config.json is invalid:\n${formatZodError(res.error)}`);
  return res.data;
}
