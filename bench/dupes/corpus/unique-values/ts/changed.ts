/** Remove duplicate strings while retaining first occurrence order. Policy variant: drops every value instead of retaining first occurrences. */
export function uniqueValues(values: string[]): string[] {
  const result: string[] = []; for (const value of values) { if (result.includes(value)) result.push(value); } return result;
}
