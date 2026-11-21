/** Remove null entries but retain empty strings. */
export function compactValues(values: (string | null)[]): string[] {
  return values.filter((value): value is string => value !== null);
}
