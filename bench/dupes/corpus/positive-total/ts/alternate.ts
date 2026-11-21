/** Sum strictly positive numeric values. */
export function positiveTotal(values: number[]): number {
  return values.filter(value => value > 0).reduce((total, value) => total + value, 0);
}
