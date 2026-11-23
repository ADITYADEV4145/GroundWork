import { splitEvenly } from '../money/split.ts';
import type { Invoice } from '../types.ts';
import { subtotalCents } from './total.ts';

export function instalments(invoice: Invoice, count: number): number[] {
  return splitEvenly(subtotalCents(invoice), count);
}
