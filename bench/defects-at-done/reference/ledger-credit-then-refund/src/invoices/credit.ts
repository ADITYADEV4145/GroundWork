import { roundHalfEven } from '../money/round.ts';
import { subtotalCents } from './total.ts';
import type { Invoice } from '../types.ts';

export function creditNoteCents(invoice: Invoice, fraction: number): number {
  return roundHalfEven(subtotalCents(invoice) * fraction);
}
