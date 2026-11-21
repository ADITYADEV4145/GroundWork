import type { Policy } from './types.ts';
export function readContactPolicy(policies: Policy[], userId: string): boolean { return policies.find((p) => p.userId === userId)?.contact ?? false; }
export function readBillingPolicy(policies: Policy[], userId: string): boolean { return policies.find((p) => p.userId === userId)?.billing ?? false; }
