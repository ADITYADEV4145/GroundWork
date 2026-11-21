export function add(a: number, b: number): number {
  return a + b;
}

export function sum(...xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function scale(x: number, factor = 2): number {
  return x * factor;
}

export function pick(a: string): string;
export function pick(a: string, b: number): string;
export function pick(a: string, b?: number): string {
  return b === undefined ? a : a.slice(0, b);
}

export const half = (x: number): number => x / 2;
