/** Remove duplicate strings while retaining first occurrence order. */
export function uniqueValues(values: string[]): string[] {
  const result: string[] = [];
  for (const value of values) { if (!result.includes(value)) result.push(value);
  } return result;
}
