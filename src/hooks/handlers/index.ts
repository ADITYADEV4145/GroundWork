import type { HookHandler } from '../types.js';
import { refreshOnEdit } from './refresh_on_edit.js';

// Register hook handlers here (one import + one entry). Order matters: the first 'deny' wins.
export const HANDLERS: HookHandler[] = [refreshOnEdit];
