import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promoSubtotalCents } from '../src/invoices/promo.ts';
import { promoSummary } from '../src/reports/promo-summary.ts';
import { overdueCents } from '../src/invoices/overdue.ts';
import { dunningSteps } from '../src/reports/dunning.ts';

const invoice = { number: 7, accountId: 'a1', customer: 'Ada', currency: 'EUR', lines: [{ sku: 'x', quantity: 2, unitCents: 525 }] };
test('promo', () => {
  assert.equal(promoSubtotalCents(invoice, 10), 945);
  assert.deepEqual(promoSummary(invoice, [0, 50]), [{ percent: 0, cents: 1050 }, { percent: 50, cents: 525 }]);
});
test('late fees', () => {
  assert.equal(overdueCents(invoice, 30), 1066);
  assert.deepEqual(dunningSteps(invoice, [0, 100]), [{ daysLate: 0, feeCents: 0 }, { daysLate: 100, feeCents: 52 }]);
});
