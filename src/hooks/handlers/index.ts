import type { HookHandler } from '../types.js';
import { EDIT_TOOLS } from '../edit-tools.js';
import { duplicateGate } from './duplicate_gate.js';

const wasteGuards: HookHandler = {
  name: 'waste_guards', events: ['pre_tool', 'post_tool', 'stop'],
  async run(ev, ctx) {
    if (ev.event === 'pre_tool' && ev.tool !== 'Bash') return null;
    return (await import('./waste-guards.js')).wasteGuards.run(ev, ctx);
  },
};
const sessionMemory: HookHandler = {
  name: 'session_memory', events: ['prompt'],
  async run(ev, ctx) {
    if (!ctx.config.reuse.sessionMemory || !ev.sessionId) return null;
    return (await import('./session_memory.js')).sessionMemoryPrompt.run(ev, ctx);
  },
};
const refreshOnEdit: HookHandler = {
  name: 'refresh_on_edit', events: ['post_tool'], tools: EDIT_TOOLS,
  async run(ev, ctx) { return (await import('./refresh_on_edit.js')).refreshOnEdit.run(ev, ctx); },
};
const groundingOnEdit: HookHandler = {
  name: 'grounding_on_edit', events: ['post_tool'], tools: EDIT_TOOLS,
  async run(ev, ctx) { return (await import('./grounding.js')).groundingOnEdit.run(ev, ctx); },
};

const readGuard: HookHandler = {
  name: 'read_guard',
  events: ['pre_tool', 'post_tool', 'pre_compact'],
  async run(ev, ctx) {
    if (ev.event !== 'pre_compact' && ev.tool !== 'Read' && !/^mcp__(?:plugin_groundwork_)?groundwork__find_code$/.test(ev.tool ?? '')) return null;
    return (await import('./read_guard.js')).readGuard.run(ev, ctx);
  },
};

// Register hook handlers here (one import + one entry). Order matters: the first 'deny' wins.
export const HANDLERS: HookHandler[] = [sessionMemory, wasteGuards, refreshOnEdit, readGuard, groundingOnEdit, duplicateGate];
