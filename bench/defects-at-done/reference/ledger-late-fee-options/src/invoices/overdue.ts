import { lateFee } from '../billing/late.ts';
import type { Invoice } from '../types.ts';
import { subtotalCents } from './total.ts';

export function overdueCents(invoice: Invoice, daysLate: number): number {
  const subtotal = subtotalCents(invoice);
  return subtotal + lateFee(subtotal, { daysLate });
}
