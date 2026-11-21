/** Remove null entries but retain empty strings. */
export function compactValues(values: (string | null)[]): string[] {
  const result: string[] = [];
  for (const value of values) { if (value !== null) result.push(value);
  } return result;
}
