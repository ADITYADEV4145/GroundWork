import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { findRepoRoot } from '../util/paths.js';
import { dispatch, normalise, render } from './run.js';
import type { AgentName, HookEventName } from './types.js';
import { loadConfig } from '../config/load.js';

export async function serviceHook(root: string, message: { groundworkCwd?: unknown; agent?: unknown; event?: unknown; raw?: unknown }): Promise<string | null> {
  if (!['claude', 'codex', 'cursor'].includes(message.agent as string) || !['pre_tool', 'post_tool', 'stop'].includes(message.event as string)) return message.event === 'stop' ? null : '';
  let cwd: string;
  try {
    if (typeof message.groundworkCwd !== 'string' || !path.isAbsolute(message.groundworkCwd)) return null;
    cwd = realpathSync(message.groundworkCwd);
    if (!statSync(cwd).isDirectory() || (cwd !== root && realpathSync(findRepoRoot(cwd)) !== root)) return null;
  } catch { return null; }
  let timer: NodeJS.Timeout | undefined;
  const stop = message.event === 'stop';
  try {
    const config = loadConfig(root);
    if (message.event === 'post_tool' && config.types.postToolHook) return null;
    const ev = normalise(message.agent as AgentName, message.event as HookEventName, message.raw, cwd);
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), !stop ? 250 : config.types.enabled && config.types.stopGate ? config.types.timeoutMs + 1500 : 2000); });
    const result = await Promise.race([dispatch(ev, root), timeout]);
    return result ? render(ev, result) : '';
  } catch { return stop ? null : ''; }
  finally { clearTimeout(timer); }
}
