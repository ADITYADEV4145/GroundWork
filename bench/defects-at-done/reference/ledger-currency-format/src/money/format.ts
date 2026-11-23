/** Formats whole cents as a decimal amount, e.g. (1050, "EUR") -> "10.50 EUR". */
export function formatCents(cents: number, currency: string): string {
  const sign = cents < 0 ? '-' : '', abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')} ${currency}`;
}
