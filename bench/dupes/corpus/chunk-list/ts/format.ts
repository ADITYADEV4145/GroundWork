/** Split a list into consecutive chunks for a positive integer size. */
export function chunkList(values: number[], size: number): number[][] {
  const result: number[][] = [];
  for (let index = 0;
  index < values.length;
  index += size) result.push(values.slice(index, index + size));
  return result;
}
