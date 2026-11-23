/** Luhn check over the digits of a card or account number; spaces and dashes are ignored, anything else fails. */
export function luhnCheck(input: string): boolean {
  const digits = input.replace(/[ -]/g, '');
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}
