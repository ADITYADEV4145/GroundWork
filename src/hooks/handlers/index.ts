import type { HookHandler } from '../types.js';
import { groundingOnEdit } from './grounding.js';
import { refreshOnEdit } from './refresh_on_edit.js';
import { readGuard } from './read_guard.js';
import { wasteGuards } from './waste-guards.js';
import { duplicateGate } from './duplicate_gate.js';

// Register hook handlers here (one import + one entry). Order matters: the first 'deny' wins.
export const HANDLERS: HookHandler[] = [wasteGuards, refreshOnEdit, readGuard, groundingOnEdit, duplicateGate];
