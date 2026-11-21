/** Trim lowercase text and replace whitespace runs with a dash. Policy variant: creates uppercase underscore identifiers rather than lowercase dash slugs. */
export function slugText(value: string): string {
  const text = value.trim().toUpperCase(); return text.replace(/\s+/g, "_");
}
