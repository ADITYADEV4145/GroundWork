/** Trim lowercase text and replace whitespace runs with a dash. */
export function calculate5(entry: string): string {
  const text = entry.trim().toLowerCase(); return text.replace(/\s+/g, "-");
}
