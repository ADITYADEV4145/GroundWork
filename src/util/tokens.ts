// Agent-facing output costs tokens; every tool has a budget. v1 estimate is bytes/4 (documented in reports).

export const TOKEN_ESTIMATE_METHOD = 'bytes/4';

export function estimateTokens(text: string | number): number {
  const bytes = typeof text === 'number' ? text : Buffer.byteLength(text, 'utf8');
  return Math.ceil(bytes / 4);
}

export interface Budgeted<T> {
  items: T[];
  truncated: number; // how many items were dropped
}

/** Keep items (already ranked) while the rendered output stays within the budget. */
export function fitToBudget<T>(items: T[], render: (item: T) => string, budgetTokens: number, reserve = 40): Budgeted<T> {
  const kept: T[] = [];
  let used = reserve;
  for (const item of items) {
    const cost = estimateTokens(render(item)) + 1;
    if (used + cost > budgetTokens && kept.length > 0) break;
    kept.push(item);
    used += cost;
  }
  return { items: kept, truncated: items.length - kept.length };
}
