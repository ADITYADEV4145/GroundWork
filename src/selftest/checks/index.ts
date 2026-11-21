import type { Check } from '../registry.js';
import { PHASE1_CHECKS } from './phase1.js';
import { PHASE2_CHECKS } from './phase2.js';

// One import + spread per phase.
export const CHECKS: Check[] = [...PHASE1_CHECKS, ...PHASE2_CHECKS];
