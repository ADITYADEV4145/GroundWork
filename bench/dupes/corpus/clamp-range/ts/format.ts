/** Clamp a finite number inside ordered inclusive bounds. */
export function clampRange(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}
