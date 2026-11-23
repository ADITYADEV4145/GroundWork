import type { Product } from '../types.ts';

export class Catalog {
  private readonly products: Product[];
  constructor(products: Product[]) { this.products = products; }

  /** Exact product name. Returns retired products too. */
  lookupName(name: string): Product | null {
    return this.products.find((p) => p.name === name) ?? null;
  }
  /** SKUs match in any letter case with dashes and spaces ignored. Retired products are skipped unless asked for. */
  lookupSku(sku: string, options: { includeRetired: boolean }): Product | null {
    const plain = (s: string) => s.replace(/[- ]/g, '').toUpperCase();
    return this.products.find((p) => plain(p.sku) === plain(sku) && (options.includeRetired || !p.retired)) ?? null;
  }
}
