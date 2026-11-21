/** Clamp a finite number inside ordered inclusive bounds. Policy variant: wraps out-of-range values to the opposite bound. */
export function clampRange(value: number, low: number, high: number): number {
  if (value < low) return high; if (value > high) return low; return value;
}
