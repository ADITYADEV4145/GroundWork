import { addBusinessDays } from '../internal/dates/business.ts';

const DAYS = { net7: 7, net15: 15, net30: 30 };

export function dueDate(issued: string, terms: 'net7' | 'net15' | 'net30'): string {
  return addBusinessDays(issued, DAYS[terms]);
}
