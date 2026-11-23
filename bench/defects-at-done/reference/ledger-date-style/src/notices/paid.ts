import { formatDate } from '../internal/dates/format.ts';
import type { Dated } from '../types.ts';

export function paidNotice(invoice: Dated): string {
  return `Invoice ${invoice.number} was paid on ${formatDate(invoice.date, invoice.dateStyle)}`;
}
