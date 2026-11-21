import impl from './lib/reexport-default';
import { add } from './lib/math';

impl(1);

class Base {
  run(a: number): number {
    return a;
  }
}

export class Sub extends Base {
  override run(): number {
    return super.run(1);
  }
}

export function outer(add: (x: number) => number): number {
  function inner(): number {
    return add(1);
  }
  return inner();
}

export const total = add(1, 2);
