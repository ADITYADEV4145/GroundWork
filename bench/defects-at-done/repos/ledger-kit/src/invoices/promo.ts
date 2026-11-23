import { applyDiscount } from '../billing/discount.ts';
import type { Invoice } from '../types.ts';
import { subtotalCents } from './total.ts';

export function promoSubtotalCents(invoice: Invoice, percent: number): number {
  // applyDiscount(percent, amountCents) on the whole subtotal
  return applyDiscount(percent, subtotalCents(invoice));
}
