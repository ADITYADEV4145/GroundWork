import { lateFee } from '../billing/late.ts';
import { subtotalCents } from '../invoices/total.ts';
import type { Invoice } from '../types.ts';

export function dunningSteps(invoice: Invoice, days: number[]): { daysLate: number; feeCents: number }[] {
  return days.map((daysLate) => ({ daysLate, feeCents: lateFee(subtotalCents(invoice), { daysLate }) }));
}
