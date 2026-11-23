import { roundHalfEven } from '../money/round.ts';

const RATES: Record<string, number> = { EU: 0.2, UK: 0.2, US: 0.0725, CA: 0.05 };

/** Tax in cents for an amount in a region: taxFor(amountCents, { region, exempt }). Exempt customers and unknown regions pay no tax. */
export function taxFor(amountCents: number, options: { region: string; exempt?: boolean }): number {
  if (options.exempt) return 0;
  return roundHalfEven(amountCents * (RATES[options.region] ?? 0));
}
