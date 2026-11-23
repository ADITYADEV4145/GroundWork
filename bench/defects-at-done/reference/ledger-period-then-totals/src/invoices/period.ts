import { billingPeriod } from '../internal/dates/period.ts';
import type { Dated } from '../types.ts';

export function invoicePeriod(invoice: Dated): string {
  return `${billingPeriod(invoice.date)} #${invoice.number}`;
}
