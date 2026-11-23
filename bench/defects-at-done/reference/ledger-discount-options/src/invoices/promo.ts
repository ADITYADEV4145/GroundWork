import { applyDiscount } from '../billing/discount.ts';
import type { Invoice } from '../types.ts';
import { subtotalCents } from './total.ts';

export function promoSubtotalCents(invoice: Invoice, percent: number): number {
  return applyDiscount(subtotalCents(invoice), { percent });
}
