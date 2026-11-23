import { roundHalfEven } from '../money/round.ts';

/** Late fee in cents, 0.05% of the amount per day late: lateFee(amountCents, { daysLate, graceDays }). Days inside the grace period are free. */
export function lateFee(amountCents: number, options: { daysLate: number; graceDays?: number }): number {
  return roundHalfEven(amountCents * 0.0005 * Math.max(0, options.daysLate - (options.graceDays ?? 0)));
}
