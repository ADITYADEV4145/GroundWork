import type { GroundworkConfig } from '../config/schema.js';

// Agent hooks are normalised to one event shape so handlers don't care which agent called them.

export type AgentName = 'claude' | 'codex' | 'cursor';
export type HookEventName = 'pre_tool' | 'post_tool' | 'session_start' | 'prompt' | 'stop';

export interface HookEvent {
  agent: AgentName;
  event: HookEventName;
  sessionId: string | null;
  cwd: string;
  tool: string | null;
  input: Record<string, unknown>;
  response: unknown;
  raw: unknown;
}

export interface HookResult {
  /** 'deny' blocks a pre_tool call; 'context' adds a note for the agent; 'allow' does nothing. */
  action: 'allow' | 'deny' | 'context';
  message?: string;
}

export interface HookContext {
  root: string;
  config: GroundworkConfig;
}

export interface HookHandler {
  name: string;
  events: HookEventName[];
  /** Tool names this handler cares about (agent-native names, e.g. 'Read', 'Bash'); omit for all. */
  tools?: string[];
  run(ev: HookEvent, ctx: HookContext): HookResult | null | Promise<HookResult | null>;
}
