import type { InvoiceBook } from './book.ts';

export function invoiceStatus(book: InvoiceBook, reference: string): 'open' | 'paid' | null {
  const invoice = book.findByReference(reference, { includeVoid: false });
  return invoice && invoice.status !== 'void' ? invoice.status : null;
}
