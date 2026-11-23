/** Renders an ISO date (yyyy-mm-dd) for a notice, e.g. "2026-03-05". */
export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
