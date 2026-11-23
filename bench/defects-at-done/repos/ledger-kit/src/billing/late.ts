import { roundHalfEven } from '../money/round.ts';

/** Late fee in cents, 0.05% of the amount per day late: lateFee(daysLate, amountCents). */
export function lateFee(daysLate: number, amountCents: number): number {
  return roundHalfEven(amountCents * 0.0005 * Math.max(0, daysLate));
}
