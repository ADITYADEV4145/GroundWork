/** Trim lowercase text and replace whitespace runs with a dash. */
export function slugText(value: string): string {
  const text = value.toLowerCase(); const trimmed = text.trim(); return trimmed.replace(/\s+/g, "-");
}
