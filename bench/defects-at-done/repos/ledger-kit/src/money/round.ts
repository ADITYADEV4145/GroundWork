/** Banker's rounding to a whole number of cents: ties go to the even cent. Every money path must round with this. */
export function roundHalfEven(value: number): number {
  const floor = Math.floor(value), diff = value - floor;
  if (Math.abs(diff - 0.5) < 1e-9) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(value);
}
