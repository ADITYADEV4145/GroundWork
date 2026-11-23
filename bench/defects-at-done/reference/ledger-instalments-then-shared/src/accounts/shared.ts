import { splitEvenly } from '../money/split.ts';

export function sharedCost(totalCents: number, accountIds: string[]): Record<string, number> {
  const parts = splitEvenly(totalCents, accountIds.length);
  return Object.fromEntries(accountIds.map((id, i) => [id, parts[i]!]));
}
