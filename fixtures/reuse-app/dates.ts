/** Parse a date string into a Date, rejecting invalid input. */
export function parseDateString(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  return date;
}

/** Renamed clone of the date parser. */
export function decodeTimestamp(text: string): Date {
  const result = new Date(text);
  if (Number.isNaN(result.getTime())) throw new Error('Bad timestamp');
  return result;
}

/** Parse a date string into a Date using numeric calendar fields. */
export function dateFromParts(input: string): Date {
  const fields = input.split('-').map(Number);
  const result = new Date(fields[0]!, fields[1]! - 1, fields[2]);
  if (!Number.isFinite(result.valueOf())) throw new RangeError('Invalid calendar date');
  return result;
}

/** Format a Date as a display string, not a parser. */
export function formatDateString(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function countValidOrders(orders: { active: boolean; total: number }[]): number {
  let count = 0;
  for (const order of orders) {
    if (order.active && order.total > 0) count += 1;
  }
  return count;
}

export function tiny(value: number): number { return value; }
