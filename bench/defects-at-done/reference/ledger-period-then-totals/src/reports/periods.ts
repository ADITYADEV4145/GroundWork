import { billingPeriod } from '../internal/dates/period.ts';

export function periodTotals(items: { date: string; cents: number }[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of items) totals[billingPeriod(item.date)] = (totals[billingPeriod(item.date)] ?? 0) + item.cents;
  return totals;
}
