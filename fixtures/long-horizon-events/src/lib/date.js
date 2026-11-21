export function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError('Invalid event date');
  }
  return date.toISOString().slice(0, 10);
}
