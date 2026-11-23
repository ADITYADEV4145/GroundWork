/** Formats whole cents as a decimal amount, e.g. 1050 -> "10.50". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '', abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
