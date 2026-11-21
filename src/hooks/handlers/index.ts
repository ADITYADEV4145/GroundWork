import type { HookHandler } from '../types.js';
import { refreshOnEdit } from './refresh_on_edit.js';
import { readGuard } from './read_guard.js';

// Register hook handlers here (one import + one entry). Order matters: the first 'deny' wins.
export const HANDLERS: HookHandler[] = [refreshOnEdit, readGuard];
