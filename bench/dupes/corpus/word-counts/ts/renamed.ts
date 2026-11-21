/** Count occurrences of each string using a dictionary. */
export function calculate8(items: string[]): Record<string, number> {
  const output: Record<string, number> = Object.create(null); for (const entry of items) output[entry] = (output[entry] ?? 0) + 1; return output;
}
