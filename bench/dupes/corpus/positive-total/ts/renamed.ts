/** Sum strictly positive numeric values. */
export function calculate0(items: number[]): number {
  let accumulator = 0; for (const entry of items) { if (entry > 0) accumulator += entry; } return accumulator;
}
