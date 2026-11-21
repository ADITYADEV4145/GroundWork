/** Format a date as YYYY-MM-DD, or with time. */
export function formatDate(d: Date): string;
export function formatDate(d: Date, withTime: boolean): string;
export function formatDate(d: Date, withTime = false): string {
  return withTime ? d.toISOString() : d.toISOString().slice(0, 10);
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export const DAY_MS = 86400000;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

export function joinParts(sep: string, ...parts: string[]): string {
  return parts.map((p) => pad(Number(p))).join(sep);
}
