import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementLine } from '../src/reports/statement.ts';
import { receiptLine } from '../src/reports/receipt.ts';
import { reminderLine } from '../src/reports/reminder.ts';
import { refundLine } from '../src/reports/refund.ts';
import { digestLine } from '../src/reports/digest.ts';
import { taxSummary } from '../src/reports/tax-summary.ts';

const invoice = { number: 7, accountId: 'a1', customer: 'Ada', currency: 'EUR', lines: [{ sku: 'x', quantity: 2, unitCents: 525 }] };
test('report lines', () => {
  assert.equal(statementLine(invoice), 'Statement total: 10.50');
  assert.equal(receiptLine(invoice), 'Paid: 10.50');
  assert.equal(reminderLine(invoice), 'Amount due: 10.50');
  assert.equal(refundLine(invoice), 'Refunded: 10.50');
  assert.equal(digestLine(invoice), 'Open balance: 10.50');
});
test('tax summary', () => {
  assert.deepEqual(taxSummary(invoice, ['EU', 'ZZ']), [{ region: 'EU', taxCents: 210 }, { region: 'ZZ', taxCents: 0 }]);
});
