import { taxFor } from '../billing/rates.ts';
import { subtotalCents } from '../invoices/total.ts';
import type { Invoice } from '../types.ts';

// Each row is taxFor(region, amountCents) for one region, in the order given.
export function taxSummary(invoice: Invoice, regions: string[]): { region: string; taxCents: number }[] {
  const subtotal = subtotalCents(invoice);
  return regions.map((region) => ({ region, taxCents: taxFor(region, subtotal) }));
}
