import type { Plan } from './types.ts';
export function lookupPlan(plans: Plan[], code: string): Plan | null { return plans.find((p) => p.code === code) ?? null; }
export function allowsPriority(plan: Plan | null): boolean { return plan?.priority ?? false; }
