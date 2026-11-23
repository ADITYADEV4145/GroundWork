import { formatDate } from '../internal/dates/format.ts';
import type { Dated } from '../types.ts';

export function voidedNotice(invoice: Dated): string {
  return `Invoice ${invoice.number} was voided on ${formatDate(invoice.date, invoice.dateStyle)}`;
}
