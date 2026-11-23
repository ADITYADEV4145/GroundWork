/** Splits an amount in cents into equal parts that add up exactly; leftover cents go to the first parts. Every shared amount is split with this. */
export function splitEvenly(totalCents: number, parts: number): number[] {
  const base = Math.floor(totalCents / parts), extra = totalCents - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}
