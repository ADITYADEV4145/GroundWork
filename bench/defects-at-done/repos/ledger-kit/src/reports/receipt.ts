import { formatCents } from '../money/format.ts';
import { subtotalCents } from '../invoices/total.ts';
import type { Invoice } from '../types.ts';

export function receiptLine(invoice: Invoice): string {
  return `Paid: ${formatCents(subtotalCents(invoice))}`;
}
