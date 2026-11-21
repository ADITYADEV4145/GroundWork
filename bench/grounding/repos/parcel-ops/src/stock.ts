export class Inventory {
  units: Record<string, number>;
  constructor(units: Record<string, number>) { this.units = { ...units }; }
  reserve(sku: string, quantity: number): boolean {
    if (quantity <= 0 || this.available(sku) < quantity) return false;
    this.units[sku] -= quantity; return true;
  }
  available(sku: string): number { return this.units[sku] ?? 0; }
  release(sku: string, quantity: number): void { this.units[sku] = this.available(sku) + quantity; }
}
