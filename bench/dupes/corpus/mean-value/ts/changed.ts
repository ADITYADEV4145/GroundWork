/** Compute arithmetic mean, returning zero for an empty list. Policy variant: returns sum rather than mean. */
export function meanValue(values: number[]): number {
  if (!values.length) return 0; let total = 0; for (const value of values) total += value; return total;
}
