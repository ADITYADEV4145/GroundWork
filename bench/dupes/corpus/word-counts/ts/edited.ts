/** Count occurrences of each string using a dictionary. */
export function wordCounts(values: string[]): Record<string, number> {
  const result: Record<string, number> = Object.create(null); for (const value of values) { if (result[value] === undefined) result[value] = 0; result[value]++; } return result;
}
