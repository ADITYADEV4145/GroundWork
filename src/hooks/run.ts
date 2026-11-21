import { z } from 'zod';
import { loadConfig } from '../config/load.js';
import { initSqlBackend } from '../store/db.js';
import { log } from '../util/log.js';
import { findRepoRoot } from '../util/paths.js';
import { HANDLERS } from './handlers/index.js';
import type { AgentName, HookEvent, HookEventName, HookResult } from './types.js';

const payloadSchema = z
  .object({
    session_id: z.string().optional(),
    conversation_id: z.string().optional(),
    cwd: z.string().optional(),
    hook_event_name: z.string().optional(),
    tool_name: z.string().optional(),
    tool_input: z.record(z.string(), z.unknown()).optional(),
    tool_response: z.unknown().optional(),
    tool_output: z.unknown().optional(),
  })
  .passthrough();

export function normalise(agent: AgentName, event: HookEventName, raw: unknown): HookEvent {
  const p = payloadSchema.safeParse(raw);
  const d = p.success ? p.data : {};
  return {
    agent,
    event,
    sessionId: d.session_id ?? d.conversation_id ?? null,
    cwd: d.cwd ?? process.cwd(),
    tool: d.tool_name ?? null,
    input: d.tool_input ?? {},
    response: d.tool_response ?? d.tool_output ?? null,
    raw,
  };
}

/** Agent-specific stdout for a combined result. Claude Code's format is used for codex/cursor until their adapters land. */
export function render(ev: HookEvent, r: HookResult): string {
  if (ev.agent === 'claude' && ev.event === 'pre_tool' && r.updatedInput && r.action !== 'deny')
    return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: r.updatedInput } });
  if (ev.event === 'stop') return r.message ? JSON.stringify({ systemMessage: r.message }) : '';
  if (r.action === 'allow' || !r.message) return '';
  if (ev.event === 'pre_compact') return r.message;
  if (ev.event === 'pre_tool' && r.action === 'deny')
    return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: r.message } });
  const hookEventName = ev.event === 'post_tool' ? 'PostToolUse' : ev.event === 'pre_tool' ? 'PreToolUse' : ev.event === 'session_start' ? 'SessionStart' : 'UserPromptSubmit';
  return JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: r.message } });
}

export async function dispatch(ev: HookEvent, root: string): Promise<HookResult> {
  const config = loadConfig(root);
  const notes: string[] = [];
  let updatedInput: Record<string, unknown> | undefined;
  for (const h of HANDLERS) {
    if (!h.events.includes(ev.event)) continue;
    if (h.tools && (!ev.tool || !h.tools.includes(ev.tool))) continue;
    try {
      const r = await h.run(ev, { root, config });
      if (!r) continue;
      if (r.updatedInput) updatedInput = r.updatedInput;
      if (r.action === 'allow') continue;
      if (r.action === 'deny') return r;
      if (r.message) notes.push(r.message);
    } catch (e) {
      log(root, 'error', 'hook_handler_failed', { handler: h.name, error: (e as Error).message });
    }
  }
  return notes.length ? { action: 'context', message: notes.join('\n'), updatedInput } : { action: 'allow', updatedInput };
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** Entry point for `gw hook`. Fails open: any error or timeout means "allow" and exit 0. */
export async function runHook(agent: AgentName, event: HookEventName, timeoutMs = 2000): Promise<void> {
  let root = process.cwd();
  try {
    const text = await readStdin();
    const raw: unknown = text.trim() ? JSON.parse(text) : {};
    const ev = normalise(agent, event, raw);
    root = findRepoRoot(ev.cwd);
    await initSqlBackend();
    const timeout = new Promise<HookResult>((res) => setTimeout(() => res({ action: 'allow' }), timeoutMs).unref());
    const r = await Promise.race([dispatch(ev, root), timeout]);
    const out = render(ev, r);
    if (out) process.stdout.write(out + '\n');
  } catch (e) {
    log(root, 'error', 'hook_failed', { agent, event, error: (e as Error).message });
  }
}
