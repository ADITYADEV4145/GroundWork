import type { Catalog } from './catalog.ts';

export function unitPrice(catalog: Catalog, sku: string): number | null {
  return catalog.lookupSku(sku, { includeRetired: false })?.unitCents ?? null;
}
