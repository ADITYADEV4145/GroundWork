/** Clamp a finite number inside ordered inclusive bounds. */
export function clampRange(value: number, low: number, high: number): number {
  let result = value; if (result < low) result = low; else if (result > high) result = high; return result;
}
