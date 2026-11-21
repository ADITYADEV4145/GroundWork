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

const CURSOR_TOOLS: Record<string, string> = { Shell: 'Bash', Read: 'Read', Write: 'Write', Edit: 'Edit', Delete: 'Delete' };

/** Map agent-specific tool names onto Claude Code's, which handlers match on. */
function toolName(agent: AgentName, name: string | undefined): string | null {
  if (!name) return null;
  if (agent !== 'cursor') return name;
  if (name.startsWith('MCP:')) return `mcp__groundwork__${name.slice(4)}`;
  return CURSOR_TOOLS[name] ?? name;
}

export function normalise(agent: AgentName, event: HookEventName, raw: unknown): HookEvent {
  const p = payloadSchema.safeParse(raw);
  const d = p.success ? p.data : {};
  const roots = (raw as { workspace_roots?: unknown } | null)?.workspace_roots;
  const firstRoot = Array.isArray(roots) && typeof roots[0] === 'string' ? roots[0] : undefined;
  return {
    agent,
    event,
    sessionId: d.session_id ?? d.conversation_id ?? null,
    cwd: d.cwd ?? firstRoot ?? process.env.CURSOR_PROJECT_DIR ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    tool: toolName(agent, d.tool_name),
    input: d.tool_input ?? {},
    response: d.tool_response ?? d.tool_output ?? null,
    raw,
  };
}

const CLAUDE_EVENT: Record<HookEventName, string> = {
  pre_tool: 'PreToolUse',
  post_tool: 'PostToolUse',
  session_start: 'SessionStart',
  prompt: 'UserPromptSubmit',
  stop: 'Stop',
  pre_compact: 'PreCompact',
};

/** Cursor treats invalid or missing JSON on permission hooks as a block, so they always answer. */
function renderCursor(ev: HookEvent, r: HookResult): string {
  const msg = r.action === 'allow' ? undefined : r.message;
  switch (ev.event) {
    case 'pre_tool':
      return JSON.stringify(r.action === 'deny' && msg ? { permission: 'deny', agent_message: msg, user_message: msg } : { permission: 'allow' });
    case 'post_tool':
      return msg ? JSON.stringify({ additional_context: msg }) : '';
    case 'stop':
      return r.action === 'deny' && msg ? JSON.stringify({ followup_message: msg }) : '';
    case 'session_start':
      return msg ? JSON.stringify({ additional_context: msg }) : '';
    case 'pre_compact':
      return msg ? JSON.stringify({ user_message: msg }) : '';
    default:
      return '';
  }
}

/** Agent-specific stdout for a combined result. Claude Code and Codex share the same hook output contract. */
export function render(ev: HookEvent, r: HookResult): string {
  if (ev.agent === 'cursor') return renderCursor(ev, r);
  if (ev.agent === 'claude' && ev.event === 'pre_tool' && r.updatedInput && r.action !== 'deny')
    return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: r.updatedInput } });
  if (ev.event === 'stop' && r.action === 'deny' && r.message) return JSON.stringify({ decision: 'block', reason: r.message });
  if (ev.event === 'stop') return r.message ? JSON.stringify({ systemMessage: r.message }) : '';
  if (r.action === 'allow' || !r.message) return '';
  if (ev.event === 'pre_compact') return r.message;
  if (ev.event === 'pre_tool' && r.action === 'deny')
    return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: r.message } });
  return JSON.stringify({ hookSpecificOutput: { hookEventName: CLAUDE_EVENT[ev.event], additionalContext: r.message } });
}

/** What to print when the hook itself failed: nothing, except where silence would block (Cursor permission hooks). */
export function failOpenOutput(agent: AgentName, event: HookEventName): string {
  return agent === 'cursor' && event === 'pre_tool' ? JSON.stringify({ permission: 'allow' }) : '';
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
    const out = failOpenOutput(agent, event);
    if (out) process.stdout.write(out + '\n');
  }
}
