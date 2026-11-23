import { formatCents } from '../money/format.ts';
import { subtotalCents } from '../invoices/total.ts';
import type { Invoice } from '../types.ts';

export function reminderLine(invoice: Invoice): string {
  return `Amount due: ${formatCents(subtotalCents(invoice), invoice.currency)}`;
}
