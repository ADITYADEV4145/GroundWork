import type { Order } from './types.ts';
export function formatDispatch(order: Order, shippingCents: number): string { return `${order.reference}:${order.sku}x${order.quantity}:${shippingCents}`; }
export function formatReturn(order: Order): string { return `RETURN:${order.reference}`; }
