export class Templated {
  go(a: number): number {
    return a;
  }
  use(): number {
    return this.go();
  }
}
const prefix = 'g';
Object.defineProperty(Templated.prototype, `${prefix}o`, { value: () => 0 });
