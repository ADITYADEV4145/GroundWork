import { realpathSync } from 'node:fs';
import { findRepoRoot } from '../util/paths.js';
import { dispatch, normalise, render } from './run.js';
import type { AgentName, HookEventName } from './types.js';

export async function serviceHook(root: string, message: { agent?: unknown; event?: unknown; raw?: unknown }): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  try {
    if (!['claude', 'codex', 'cursor'].includes(message.agent as string) || !['pre_tool', 'post_tool'].includes(message.event as string)) return '';
    const ev = normalise(message.agent as AgentName, message.event as HookEventName, message.raw);
    if (realpathSync(ev.cwd) !== root && realpathSync(findRepoRoot(ev.cwd)) !== root) return '';
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 250); });
    const result = await Promise.race([dispatch(ev, root), timeout]);
    return result ? render(ev, result) : '';
  } catch { return ''; }
  finally { clearTimeout(timer); }
}
