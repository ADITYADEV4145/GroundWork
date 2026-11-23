import type { FiledInvoice } from '../types.ts';

export class InvoiceBook {
  private readonly invoices: FiledInvoice[];
  constructor(invoices: FiledInvoice[]) { this.invoices = invoices; }

  /** Exact invoice number. Returns void invoices too. */
  findByNumber(number: number): FiledInvoice | null {
    return this.invoices.find((i) => i.number === number) ?? null;
  }
  /** References are written "INV-0042", "#42" or "42". Void invoices are skipped unless asked for. */
  findByReference(reference: string, options: { includeVoid: boolean }): FiledInvoice | null {
    const match = /^(?:INV-|#)?0*(\d+)$/i.exec(reference.trim());
    if (!match) return null;
    return this.invoices.find((i) => i.number === Number(match[1]) && (options.includeVoid || i.status !== 'void')) ?? null;
  }
  listByAccount(accountId: string): FiledInvoice[] {
    return this.invoices.filter((i) => i.accountId === accountId);
  }
}
