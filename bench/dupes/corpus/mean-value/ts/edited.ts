/** Compute arithmetic mean, returning zero for an empty list. */
export function meanValue(values: number[]): number {
  let total = 0; for (const value of values) total += value; const count = values.length; return count === 0 ? 0 : total / count;
}
