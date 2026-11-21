/** Clamp a finite number inside ordered inclusive bounds. */
export function clampRange(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
