export function normalizeEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TypeError('Invalid email');
  }
  return email;
}

export function positiveInteger(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError('Expected a positive integer');
  }
  return value;
}
