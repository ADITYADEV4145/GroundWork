import type { User } from './types.ts';
export function getUserByEmail(users: User[], email: string): User | null {
  return users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase()) ?? null;
}
export function getUserById(users: User[], id: string): User | null {
  return users.find((u) => u.id === id) ?? null;
}
