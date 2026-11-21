import type { Rate } from './types.ts';
export function quoteShipment(weight: number, zone: string, rates: Rate[]): number | null {
  const rate = rates.find((r) => r.zone === zone);
  return rate && weight > 0 ? rate.baseCents + Math.ceil(weight) * rate.perKgCents : null;
}
export function quoteReturn(weight: number): number { return 100 + Math.ceil(weight) * 25; }
