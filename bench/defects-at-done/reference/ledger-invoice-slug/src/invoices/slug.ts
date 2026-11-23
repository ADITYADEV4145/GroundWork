import { kebabize } from '../internal/strings/case.ts';
import type { Invoice } from '../types.ts';

export function invoiceSlug(invoice: Invoice): string {
  const name = kebabize(invoice.customer);
  return name ? `${name}-${invoice.number}` : String(invoice.number);
}
