import type { HookHandler } from '../types.js';
import { groundingOnEdit } from './grounding.js';
import { refreshOnEdit } from './refresh_on_edit.js';
import { wasteGuards } from './waste-guards.js';
import { duplicateGate } from './duplicate_gate.js';

const readGuard: HookHandler = {
  name: 'read_guard',
  events: ['pre_tool', 'post_tool', 'pre_compact'],
  async run(ev, ctx) {
    if (ev.event !== 'pre_compact' && ev.tool !== 'Read' && !/^mcp__(?:plugin_groundwork_)?groundwork__find_code$/.test(ev.tool ?? '')) return null;
    return (await import('./read_guard.js')).readGuard.run(ev, ctx);
  },
};

// Register hook handlers here (one import + one entry). Order matters: the first 'deny' wins.
export const HANDLERS: HookHandler[] = [wasteGuards, refreshOnEdit, readGuard, groundingOnEdit, duplicateGate];
