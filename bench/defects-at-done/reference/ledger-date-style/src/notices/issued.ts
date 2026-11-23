import { formatDate } from '../internal/dates/format.ts';
import type { Dated } from '../types.ts';

export function issuedNotice(invoice: Dated): string {
  return `Invoice ${invoice.number} issued on ${formatDate(invoice.date, invoice.dateStyle)}`;
}
