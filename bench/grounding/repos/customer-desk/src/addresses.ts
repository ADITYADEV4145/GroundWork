import type { User } from './types.ts';
export function getPrimaryAddress(user: User): string { return user.email.trim().toLowerCase(); }
export function getDisplayAddress(user: User): string { return `${user.name} <${user.email}>`; }
