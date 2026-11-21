import type { Check } from '../registry.js';
import { PHASE1_CHECKS } from './phase1.js';

// One import + spread per phase.
export const CHECKS: Check[] = [...PHASE1_CHECKS];
