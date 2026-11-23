import { formatCents } from '../money/format.ts';
import { subtotalCents } from '../invoices/total.ts';
import type { Invoice } from '../types.ts';

export function digestLine(invoice: Invoice): string {
  return `Open balance: ${formatCents(subtotalCents(invoice), invoice.currency)}`;
}
