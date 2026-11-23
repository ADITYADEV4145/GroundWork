import { formatPercent } from '../money/percent.ts';

export function feeRateLine(fraction: number): string {
  return `Fee: ${formatPercent(fraction)}`;
}
