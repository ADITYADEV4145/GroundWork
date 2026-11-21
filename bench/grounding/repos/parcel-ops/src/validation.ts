import type { Order } from './types.ts';
export function isDispatchable(order: Order | null): order is Order { return !!order && !order.cancelled && order.quantity > 0; }
export function isReturnable(order: Order): boolean { return !order.cancelled; }
