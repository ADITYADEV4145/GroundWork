/** Renders a fraction as a whole percentage, e.g. 0.2 -> "20%". */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
