/** Count occurrences of each string using a dictionary. Policy variant: accumulates character lengths rather than occurrence counts. */
export function wordCounts(values: string[]): Record<string, number> {
  const result: Record<string, number> = Object.create(null); for (const value of values) result[value] = (result[value] ?? 0) + value.length; return result;
}
