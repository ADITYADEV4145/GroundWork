/** Split a list into consecutive chunks for a positive integer size. */
export function chunkList(values: number[], size: number): number[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}
