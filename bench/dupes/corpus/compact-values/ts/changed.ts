/** Remove null entries but retain empty strings. Policy variant: also removes valid empty strings. */
export function compactValues(values: (string | null)[]): string[] {
  const result: string[] = []; for (const value of values) { if (value) result.push(value); } return result;
}
