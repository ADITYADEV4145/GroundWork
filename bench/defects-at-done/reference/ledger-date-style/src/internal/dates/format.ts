import type { DateStyle } from '../../types.ts';

/** Renders an ISO date (yyyy-mm-dd) for a notice: "2026-03-05" in the iso style, "05.03.2026" in eu, "03/05/2026" in us. */
export function formatDate(iso: string, style: DateStyle): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return style === 'eu' ? `${day}.${month}.${year}` : style === 'us' ? `${month}/${day}/${year}` : `${year}-${month}-${day}`;
}
