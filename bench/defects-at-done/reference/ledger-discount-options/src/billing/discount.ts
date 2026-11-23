import { roundHalfEven } from '../money/round.ts';

/** Amount in cents after a percentage discount, never taking off more than capCents: applyDiscount(amountCents, { percent, capCents }). */
export function applyDiscount(amountCents: number, options: { percent: number; capCents?: number }): number {
  return amountCents - Math.min(roundHalfEven(amountCents * options.percent / 100), options.capCents ?? Infinity);
}
