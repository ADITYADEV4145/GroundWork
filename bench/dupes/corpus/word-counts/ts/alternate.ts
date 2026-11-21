/** Count occurrences of each string using a dictionary. */
export function wordCounts(values: string[]): Record<string, number> {
  return values.reduce((result, value) => { result[value] = (result[value] ?? 0) + 1; return result; }, Object.create(null));
}
