import type { AccountStore } from './store.ts';

export function ownerEmail(store: AccountStore, handle: string): string | null {
  return store.findByHandle(handle, { includeInactive: false })?.email.toLowerCase() ?? null;
}
