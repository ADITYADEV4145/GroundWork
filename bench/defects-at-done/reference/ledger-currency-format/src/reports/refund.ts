import { formatCents } from '../money/format.ts';
import { subtotalCents } from '../invoices/total.ts';
import type { Invoice } from '../types.ts';

export function refundLine(invoice: Invoice): string {
  return `Refunded: ${formatCents(subtotalCents(invoice), invoice.currency)}`;
}
