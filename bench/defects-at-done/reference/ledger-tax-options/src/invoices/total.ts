import { taxFor } from '../billing/rates.ts';
import type { Invoice } from '../types.ts';

export function subtotalCents(invoice: Invoice): number {
  return invoice.lines.reduce((sum, line) => sum + line.quantity * line.unitCents, 0);
}
export function totalCents(invoice: Invoice, region: string): number {
  const subtotal = subtotalCents(invoice);
  return subtotal + taxFor(subtotal, { region });
}
