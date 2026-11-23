import { formatDate } from '../internal/dates/format.ts';
import type { Dated } from '../types.ts';

export function dueNotice(invoice: Dated): string {
  return `Invoice ${invoice.number} is due on ${formatDate(invoice.date, invoice.dateStyle)}`;
}
