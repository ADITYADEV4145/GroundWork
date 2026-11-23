/** Billing period label for an ISO date. The fiscal year starts in April and is named after the year it ends in: "2026-03-05" -> "FY26-Q4". */
export function billingPeriod(iso: string): string {
  const year = Number(iso.slice(0, 4)), month = Number(iso.slice(5, 7));
  const fiscal = month >= 4 ? year + 1 : year, quarter = Math.floor(((month + 8) % 12) / 3) + 1;
  return `FY${String(fiscal % 100).padStart(2, '0')}-Q${quarter}`;
}
