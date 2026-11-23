import { roundHalfEven } from '../money/round.ts';

const RATES: Record<string, number> = { EU: 0.2, UK: 0.2, US: 0.0725, CA: 0.05 };

/** Tax in cents for an amount in a region: taxFor(region, amountCents). Unknown regions pay no tax. */
export function taxFor(region: string, amountCents: number): number {
  return roundHalfEven(amountCents * (RATES[region] ?? 0));
}
