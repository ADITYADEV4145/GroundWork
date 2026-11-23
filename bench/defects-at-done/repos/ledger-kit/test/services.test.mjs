import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountStore } from '../src/accounts/store.ts';
import { kebabize } from '../src/internal/strings/case.ts';
import { roundHalfEven } from '../src/money/round.ts';
import { totalCents } from '../src/invoices/total.ts';

const invoice = { number: 7, accountId: 'a1', customer: 'Ada', currency: 'EUR', lines: [{ sku: 'x', quantity: 2, unitCents: 500 }] };
test('accounts', () => {
  const store = new AccountStore([{ id: 'a1', handle: 'ada', email: 'Ada@example.test', name: 'Ada', active: false, region: 'EU' }]);
  assert.equal(store.findByEmail(' ada@example.test ')?.id, 'a1');
  assert.equal(store.findByHandle('@Ada', { includeInactive: false }), null);
  assert.equal(store.findByHandle('@Ada', { includeInactive: true })?.id, 'a1');
});
test('money', () => {
  assert.equal(roundHalfEven(2.5), 2);
  assert.equal(roundHalfEven(3.5), 4);
  assert.equal(totalCents(invoice, 'EU'), 1200);
  assert.equal(kebabize('Ünited  Parcel, Inc.'), 'united-parcel-inc');
});
