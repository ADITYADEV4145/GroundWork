import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.env.WORKSPACE_DIR;
const load = (file) => import(pathToFileURL(`${root}/${file}`));
const invoice = { number: 42, accountId: 'a1', customer: 'Ünited  Parcel, Inc.', currency: 'EUR', lines: [{ sku: 'x', quantity: 3, unitCents: 175 }] };
const accounts = [
  { id: 'a1', handle: 'ada', email: 'Ada@example.test', name: 'Ada', active: true, region: 'EU' },
  { id: 'a2', handle: 'bob', email: 'bob@example.test', name: 'Bob', active: false, region: 'US' },
];
switch (process.env.TASK_ID) {
  case 'ledger-invoice-slug': {
    const { invoiceSlug } = await load('src/invoices/slug.ts');
    assert.equal(invoiceSlug(invoice), 'united-parcel-inc-42');
    assert.equal(invoiceSlug({ ...invoice, customer: '  Crème Brûlée & Co ', number: 7 }), 'creme-brulee-co-7');
    assert.equal(invoiceSlug({ ...invoice, customer: '!!!', number: 9 }), '9');
    break;
  }
  case 'ledger-owner-email': {
    const { ownerEmail } = await load('src/accounts/owner.ts');
    const { AccountStore } = await load('src/accounts/store.ts');
    const store = new AccountStore(accounts);
    assert.equal(ownerEmail(store, '@ADA'), 'ada@example.test');
    assert.equal(ownerEmail(store, 'bob'), null);
    assert.equal(ownerEmail(store, 'ada@example.test'), null);
    assert.equal(ownerEmail(store, 'nobody'), null);
    break;
  }
  case 'ledger-tax-options': {
    const { taxFor } = await load('src/billing/rates.ts');
    const { totalCents } = await load('src/invoices/total.ts');
    const { taxSummary } = await load('src/reports/tax-summary.ts');
    assert.equal(taxFor(1000, { region: 'EU' }), 200);
    assert.equal(taxFor(1000, { region: 'EU', exempt: true }), 0);
    assert.equal(taxFor(1000, { region: 'ZZ' }), 0);
    assert.equal(totalCents(invoice, 'EU'), 630);
    assert.deepEqual(taxSummary(invoice, ['US', 'CA']), [{ region: 'US', taxCents: 38 }, { region: 'CA', taxCents: 26 }]);
    break;
  }
  case 'ledger-currency-format': {
    const { formatCents } = await load('src/money/format.ts');
    assert.equal(formatCents(1050, 'EUR'), '10.50 EUR');
    assert.equal(formatCents(-5, 'USD'), '-0.05 USD');
    const expected = { statement: 'Statement total', receipt: 'Paid', reminder: 'Amount due', refund: 'Refunded', digest: 'Open balance' };
    for (const [name, label] of Object.entries(expected)) {
      const module = await load(`src/reports/${name}.ts`);
      assert.equal(module[`${name}Line`](invoice), `${label}: 5.25 EUR`);
      assert.equal(module[`${name}Line`]({ ...invoice, currency: 'GBP' }), `${label}: 5.25 GBP`);
    }
    break;
  }
  case 'ledger-credit-then-refund': {
    const { creditNoteCents } = await load('src/invoices/credit.ts');
    assert.equal(creditNoteCents(invoice, 0.5), 262);
    assert.equal(creditNoteCents({ ...invoice, lines: [{ sku: 'y', quantity: 1, unitCents: 7 }] }, 0.5), 4);
    assert.equal(creditNoteCents(invoice, 0), 0);
    assert.ok(existsSync(`${root}/src/invoices/refund.ts`), 'second turn was not completed');
    const { refundCents } = await load('src/invoices/refund.ts');
    assert.equal(refundCents(invoice, 0.1), 473);
    assert.equal(refundCents({ ...invoice, lines: [{ sku: 'y', quantity: 1, unitCents: 5 }] }, 0.5), 3);
    assert.equal(refundCents({ ...invoice, lines: [{ sku: 'y', quantity: 1, unitCents: 25 }] }, 0.1), 23);
    assert.match(readFileSync(`${root}/src/invoices/refund.ts`, 'utf8'), /refundCents/);
    break;
  }
  default: throw new Error(`Unknown task ${process.env.TASK_ID}`);
}
