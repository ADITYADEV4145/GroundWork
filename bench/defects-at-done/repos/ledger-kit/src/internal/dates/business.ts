/** Adds working days to an ISO date (yyyy-mm-dd), skipping Saturdays and Sundays. Payment terms are counted with this. */
export function addBusinessDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  for (let left = days; left > 0;) {
    at.setUTCDate(at.getUTCDate() + 1);
    if (at.getUTCDay() !== 0 && at.getUTCDay() !== 6) left--;
  }
  return at.toISOString().slice(0, 10);
}
