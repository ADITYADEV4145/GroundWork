import { formatPercent } from '../money/percent.ts';

export function interestRateLine(fraction: number): string {
  return `Interest: ${formatPercent(fraction)}`;
}
