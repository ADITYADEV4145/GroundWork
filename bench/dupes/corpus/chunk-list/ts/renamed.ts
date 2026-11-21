/** Split a list into consecutive chunks for a positive integer size. */
export function calculate9(items: number[], size: number): number[][] {
  const output: number[][] = []; for (let cursor = 0; cursor < items.length; cursor += size) output.push(items.slice(cursor, cursor + size)); return output;
}
