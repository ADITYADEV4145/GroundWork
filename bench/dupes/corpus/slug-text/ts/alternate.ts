/** Trim lowercase text and replace whitespace runs with a dash. */
export function slugText(value: string): string {
  return value.trim().toLowerCase().split(/\s+/).join("-");
}
