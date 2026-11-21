/** Compute factorial of a nonnegative integer. */
export function factorialValue(value: number): number {
  let result = 1; for (let index = 2; index <= value; index++) result *= index; return result;
}
