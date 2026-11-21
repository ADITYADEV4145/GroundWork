import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUserByEmail, getUserById } from '../src/users.ts';
import { TicketStore } from '../src/tickets.ts';
test('customer lookup and ticket ownership', () => {
  const users = [{ id: 'u1', name: 'Ada', email: 'Ada@example.test', plan: 'free' }];
  assert.equal(getUserByEmail(users, ' ADA@example.test ').id, 'u1');
  assert.equal(getUserById(users, 'Ada@example.test'), null);
  assert.deepEqual(new TicketStore([{id:'t1',userId:'u1',state:'closed'}]).listOpenForUser('u1'), []);
});
