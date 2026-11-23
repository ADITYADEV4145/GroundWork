import { formatCents } from '../money/format.ts';
import { subtotalCents } from '../invoices/total.ts';
import type { Invoice } from '../types.ts';

export function statementLine(invoice: Invoice): string {
  return `Statement total: ${formatCents(subtotalCents(invoice))}`;
}
