/** Remove null entries but retain empty strings. */
export function calculate7(items: (string | null)[]): string[] {
  const output: string[] = []; for (const entry of items) { if (entry !== null) output.push(entry); } return output;
}
