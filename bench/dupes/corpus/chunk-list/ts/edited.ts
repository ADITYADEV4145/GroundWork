/** Split a list into consecutive chunks for a positive integer size. */
export function chunkList(values: number[], size: number): number[][] {
  const result: number[][] = []; let index = 0; while (index < values.length) { result.push(values.slice(index, index + size)); index += size; } return result;
}
