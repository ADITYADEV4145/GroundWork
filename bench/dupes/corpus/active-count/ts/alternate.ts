/** Count enabled boolean flags. */
export function activeCount(values: boolean[]): number {
  return values.filter(Boolean).length;
}
