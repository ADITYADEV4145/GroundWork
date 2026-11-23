import { roundHalfEven } from '../money/round.ts';

/** Amount in cents after a percentage discount: applyDiscount(percent, amountCents). */
export function applyDiscount(percent: number, amountCents: number): number {
  return amountCents - roundHalfEven(amountCents * percent / 100);
}
