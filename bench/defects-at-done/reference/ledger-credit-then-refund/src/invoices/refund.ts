import { roundHalfEven } from '../money/round.ts';
import { subtotalCents } from './total.ts';
import type { Invoice } from '../types.ts';

export function refundCents(invoice: Invoice, feeFraction: number): number {
  const subtotal = subtotalCents(invoice);
  return subtotal - roundHalfEven(subtotal * feeFraction);
}
