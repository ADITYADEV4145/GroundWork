import { parseDateString } from './utils.js';

export function displayDate(value: string): string {
  const date = parseDateString(value);
  if (date === null) return 'invalid';
  return date.toISOString();
}
