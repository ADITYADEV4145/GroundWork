import type { User, Ticket, Policy, Plan } from './types.ts';
export function welcomeByAddress(users: User[], email: string, locale: string): string | null { throw new Error('Not implemented'); }
export function openCasesByAddress(users: User[], tickets: Ticket[], email: string): string[] { throw new Error('Not implemented'); }
export function contactableAddresses(users: User[], policies: Policy[]): string[] { throw new Error('Not implemented'); }
export function priorityCaseIds(users: User[], tickets: Ticket[], plans: Plan[], email: string): string[] { throw new Error('Not implemented'); }
export function accountSnapshot(users: User[], tickets: Ticket[], policies: Policy[], email: string): { id: string; open: number; contact: boolean } | null { throw new Error('Not implemented'); }
