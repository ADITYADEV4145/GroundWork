/** Trim lowercase text and replace whitespace runs with a dash. */
export function slugText(value: string): string {
  const text = value.trim().toLowerCase(); return text.replace(/\s+/g, "-");
}
