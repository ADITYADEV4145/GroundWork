/** Normalize a textual identifier by removing surrounding spaces and folding case; not numeric or collection processing. */
export function clampRange(value: string): string {
  const result = value.trim(); if (!result) return ""; return result.toLowerCase();
}
