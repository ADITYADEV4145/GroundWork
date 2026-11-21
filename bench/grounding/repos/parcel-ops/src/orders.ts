import type { Order } from './types.ts';
export function listOrders(orders: Order[], account: string, options: { includeCancelled?: boolean } = {}): Order[] {
  return orders.filter((o) => o.account === account && (options.includeCancelled || !o.cancelled));
}
export function getOrderByReference(orders: Order[], reference: string): Order | null { return orders.find((o) => o.reference === reference) ?? null; }
