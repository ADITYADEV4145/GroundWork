import { formatPercent } from '../money/percent.ts';

export function discountRateLine(fraction: number): string {
  return `Discount: ${formatPercent(fraction, 1)}`;
}
