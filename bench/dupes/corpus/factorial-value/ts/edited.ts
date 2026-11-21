/** Compute factorial of a nonnegative integer. */
export function factorialValue(value: number): number {
  let result = 1; let index = value; while (index > 1) { result *= index; index--; } return result;
}
