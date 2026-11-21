import { findByEmail } from './lib/users'; // expect: unknown-export
import { nope } from './lib'; // expect: unknown-export
import missing from './lib/math'; // expect: unknown-export
import { thing } from './lib/nowhere'; // expect: missing-module
import * as math from './lib/math';
import { add, scale, createUser, UserStore } from './lib/users-and-math';
import { byEmail } from './lib';

export function planted(): void {
  findByEmail('a@b.c');
  nope();
  missing();
  thing();
  math.add(1); // expect: arity
  math.add(1, 2, 3); // expect: arity
  math.scale(); // expect: arity
  math.multiply(2, 3); // expect: unknown-member
  byEmail('a', 'b'); // expect: arity
  add(1, 2);
  scale(1);
  createUser('n');
  UserStore.open('x');
}
