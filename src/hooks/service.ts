import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { findRepoRoot } from '../util/paths.js';
import { dispatch, normalise, render } from './run.js';
import type { AgentName, HookEventName } from './types.js';

export async function serviceHook(root: string, message: { groundworkCwd?: unknown; agent?: unknown; event?: unknown; raw?: unknown }): Promise<string | null> {
  if (!['claude', 'codex', 'cursor'].includes(message.agent as string) || !['pre_tool', 'post_tool'].includes(message.event as string)) return '';
  let cwd: string;
  try {
    if (typeof message.groundworkCwd !== 'string' || !path.isAbsolute(message.groundworkCwd)) return null;
    cwd = realpathSync(message.groundworkCwd);
    if (!statSync(cwd).isDirectory() || (cwd !== root && realpathSync(findRepoRoot(cwd)) !== root)) return null;
  } catch { return null; }
  let timer: NodeJS.Timeout | undefined;
  try {
    const ev = normalise(message.agent as AgentName, message.event as HookEventName, message.raw, cwd);
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 250); });
    const result = await Promise.race([dispatch(ev, root), timeout]);
    return result ? render(ev, result) : '';
  } catch { return ''; }
  finally { clearTimeout(timer); }
}
