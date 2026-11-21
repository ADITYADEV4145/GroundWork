import starDefault from './lib/star-only'; // expect: unknown-export
import { add } from './lib/math';

export const copied = Object.assign({}, { a: 1 }, starDefault);

export function planted3(): number {
  return add(1); // expect: arity
}
