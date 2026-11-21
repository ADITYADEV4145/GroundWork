/** Compute factorial of a nonnegative integer. */
export function factorialValue(value: number): number {
  return value <= 1 ? 1 : value * factorialValue(value - 1);
}
