import type { Check } from '../registry.js';
import { ADOPTION_CHECKS } from './adoption.js';
import { PHASE1_CHECKS } from './phase1.js';
import { PHASE2_CHECKS } from './phase2.js';
import { PHASE3_CHECKS } from './phase3.js';
import { PHASE4_CHECKS } from './phase4.js';
import { PHASE5_CHECKS } from './phase5.js';

// One import + spread per phase.
export const CHECKS: Check[] = [...PHASE1_CHECKS, ...PHASE2_CHECKS, ...PHASE3_CHECKS, ...PHASE4_CHECKS, ...PHASE5_CHECKS, ...ADOPTION_CHECKS];
