import type { Order } from './types.ts';
export function summarizeOrder(order: Order, taxRate: number): number { return Math.round(order.quantity * order.unitCents * (1 + taxRate)); }
export function summarizeLineItem(unitCents: number): string { return `${(unitCents / 100).toFixed(2)}`; }
