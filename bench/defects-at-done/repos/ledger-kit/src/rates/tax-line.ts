import { formatPercent } from '../money/percent.ts';

export function taxRateLine(fraction: number): string {
  return `Tax: ${formatPercent(fraction)}`;
}
