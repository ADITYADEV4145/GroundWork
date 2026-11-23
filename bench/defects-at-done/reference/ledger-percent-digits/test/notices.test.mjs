import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issuedNotice } from '../src/notices/issued.ts';
import { dueNotice } from '../src/notices/due.ts';
import { paidNotice } from '../src/notices/paid.ts';
import { voidedNotice } from '../src/notices/voided.ts';
import { taxRateLine } from '../src/rates/tax-line.ts';
import { interestRateLine } from '../src/rates/interest-line.ts';
import { discountRateLine } from '../src/rates/discount-line.ts';
import { feeRateLine } from '../src/rates/fee-line.ts';

const invoice = { number: 7, date: '2026-03-05', dateStyle: 'iso' };
test('notices', () => {
  assert.equal(issuedNotice(invoice), 'Invoice 7 issued on 2026-03-05');
  assert.equal(dueNotice(invoice), 'Invoice 7 is due on 2026-03-05');
  assert.equal(paidNotice(invoice), 'Invoice 7 was paid on 2026-03-05');
  assert.equal(voidedNotice(invoice), 'Invoice 7 was voided on 2026-03-05');
});
test('rate lines', () => {
  assert.equal(taxRateLine(0.2), 'Tax: 20.00%');
  assert.equal(interestRateLine(0.2), 'Interest: 20.00%');
  assert.equal(discountRateLine(0.2), 'Discount: 20.0%');
  assert.equal(feeRateLine(0.2), 'Fee: 20.0%');
});
