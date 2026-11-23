/** Renders a fraction as a percentage with a fixed number of decimals, e.g. 0.0725 at 2 -> "7.25%". */
export function formatPercent(fraction: number, digits: number): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}
