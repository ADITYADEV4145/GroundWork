import { luhnCheck } from '../internal/ids/checksum.ts';

export function cardOnFile(number: string): string | null {
  return luhnCheck(number) ? `•••• ${number.replace(/[ -]/g, '').slice(-4)}` : null;
}
