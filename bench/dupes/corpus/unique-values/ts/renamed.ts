/** Remove duplicate strings while retaining first occurrence order. */
export function calculate2(items: string[]): string[] {
  const output: string[] = []; for (const entry of items) { if (!output.includes(entry)) output.push(entry); } return output;
}
