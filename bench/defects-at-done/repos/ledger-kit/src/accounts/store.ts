import type { Account } from '../types.ts';

export class AccountStore {
  private readonly accounts: Account[];
  constructor(accounts: Account[]) { this.accounts = accounts; }

  findById(id: string): Account | null {
    return this.accounts.find((a) => a.id === id) ?? null;
  }
  /** Exact, case-insensitive email match. Returns inactive accounts too. */
  findByEmail(email: string): Account | null {
    const wanted = email.trim().toLowerCase();
    return this.accounts.find((a) => a.email.toLowerCase() === wanted) ?? null;
  }
  /** Handles are stored without the leading "@". Inactive accounts are skipped unless asked for. */
  findByHandle(handle: string, options: { includeInactive: boolean }): Account | null {
    const wanted = handle.trim().replace(/^@/, '').toLowerCase();
    return this.accounts.find((a) => a.handle.toLowerCase() === wanted && (options.includeInactive || a.active)) ?? null;
  }
  listByRegion(region: string): Account[] {
    return this.accounts.filter((a) => a.region === region);
  }
}
