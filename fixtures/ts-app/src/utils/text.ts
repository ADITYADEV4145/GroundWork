export function slug(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-');
}

export type Casing = 'upper' | 'lower';

export interface TextOptions {
  casing?: Casing;
}

export enum Mode {
  Plain,
  Rich,
}
