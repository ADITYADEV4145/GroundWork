/** Compute arithmetic mean, returning zero for an empty list. */
export function calculate6(items: number[]): number {
  if (!items.length) return 0; let accumulator = 0; for (const entry of items) accumulator += entry; return accumulator / items.length;
}
