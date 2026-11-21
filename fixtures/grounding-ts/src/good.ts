import { readFileSync } from 'node:fs';
import data from './data.json';
import './styles.css';
import defaultStore, { createUser, getUserByEmail, UserStore, type User } from './lib/users';
import * as math from './lib/math';
import { byEmail, math as m2 } from './lib';

class Registry {
  [key: string]: unknown;
  run(): void {
    (this as unknown as { anything(): void }).anything();
  }
}

class Failure extends Error {
  report(): void {
    this.toString();
  }
}

export class Widget {
  handler: () => void = () => undefined;
  constructor(private readonly onDone: () => void) {}
  fire(): void {
    this.handler();
    this.onDone();
  }
}

export function valid(name: string, args: number[]): User | null {
  math.sum();
  math.sum(1, 2, 3, 4);
  math.scale(1);
  math.scale(1, 3);
  math.pick('a');
  math.pick('a', 2);
  math.half(4);
  math.add(...(args as [number, number]));
  m2.add(1, 2);
  createUser('a');
  createUser('a', 'b', 'c', 'd');
  UserStore.open('x').save({ id: '1', name: 'x' });
  defaultStore().find('1');
  const store = new UserStore('dsn');
  const method = 'find';
  (store as unknown as Record<string, (id: string) => void>)[method]!('1');
  new Registry().run();
  new Failure('x').report();
  readFileSync(name, 'utf8');
  void data;
  return getUserByEmail(name) ?? byEmail(name);
}

export function shadowed(): number {
  const math = { multiply: (a: number, b: number) => a * b };
  return math.multiply(2, 3);
}
