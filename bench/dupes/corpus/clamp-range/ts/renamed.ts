/** Clamp a finite number inside ordered inclusive bounds. */
export function calculate3(entry: number, minimum: number, maximum: number): number {
  if (entry < minimum) return minimum; if (entry > maximum) return maximum; return entry;
}
