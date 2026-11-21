import { parseDateString as parseExisting } from './utils.js';

export function decodeCalendar(value: string): Date | null {
  const parts = value.trim().split('-');
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return parseExisting(value);
}
