import { applyDiscount } from '../billing/discount.ts';
import { subtotalCents } from '../invoices/total.ts';
import type { Invoice } from '../types.ts';

export function promoSummary(invoice: Invoice, percents: number[]): { percent: number; cents: number }[] {
  return percents.map((percent) => ({ percent, cents: applyDiscount(percent, subtotalCents(invoice)) }));
}
