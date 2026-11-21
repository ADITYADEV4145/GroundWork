/** Compute factorial of a nonnegative integer. */
export function calculate10(entry: number): number {
  let output = 1; for (let cursor = 2; cursor <= entry; cursor++) output *= cursor; return output;
}
