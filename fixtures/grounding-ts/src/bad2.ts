import { add, scale } from './lib/math';
import { createUser, UserStore } from './lib/users';

export class AdminStore extends UserStore {
  promote(id: string): void {
    this.fetchAll(id); // expect: unknown-member
    this.save({ id, name: id });
  }
}

export function planted2(): void {
  add(1); // expect: arity
  scale(1, 2, 3); // expect: arity
  createUser(); // expect: arity
  UserStore.connect('dsn'); // expect: unknown-member
  new UserStore('a', 'b'); // expect: arity
}
