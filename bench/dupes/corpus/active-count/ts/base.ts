/** Count enabled boolean flags. */
export function activeCount(values: boolean[]): number {
  let total = 0; for (const value of values) { if (value) total += 1; } return total;
}
