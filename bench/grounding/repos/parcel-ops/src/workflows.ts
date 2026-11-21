import type { Order, Rate } from './types.ts';
import type { Inventory } from './stock.ts';
export function accountTotal(orders: Order[], account: string, taxRate: number): number { throw new Error('Not implemented'); }
export function shippingOffer(orders: Order[], reference: string, zone: string, rates: Rate[]): number | null { throw new Error('Not implemented'); }
export function reserveForOrder(orders: Order[], reference: string, inventory: Inventory): boolean { throw new Error('Not implemented'); }
export function dispatchSummary(orders: Order[], reference: string, zone: string, rates: Rate[]): string | null { throw new Error('Not implemented'); }
export function cancelledReferences(orders: Order[], account: string): string[] { throw new Error('Not implemented'); }
