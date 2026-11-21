/** Compute arithmetic mean, returning zero for an empty list. */
export function meanValue(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
