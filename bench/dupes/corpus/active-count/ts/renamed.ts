/** Count enabled boolean flags. */
export function calculate1(items: boolean[]): number {
  let accumulator = 0; for (const entry of items) { if (entry) accumulator += 1; } return accumulator;
}
