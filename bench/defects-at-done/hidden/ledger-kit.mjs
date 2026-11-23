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
  case 'ledger-due-date': {
    const { dueDate } = await load('src/invoices/due.ts');
    assert.equal(dueDate('2026-03-02', 'net7'), '2026-03-11');
    assert.equal(dueDate('2026-03-06', 'net15'), '2026-03-27');
    assert.equal(dueDate('2026-03-07', 'net7'), '2026-03-17');
    assert.equal(dueDate('2026-12-18', 'net30'), '2027-01-29');
    break;
  }
  case 'ledger-card-on-file': {
    const { cardOnFile } = await load('src/accounts/card.ts');
    assert.equal(cardOnFile('4242 4242 4242 4242'), '•••• 4242');
    assert.equal(cardOnFile('4000-0566-5566-5556'), '•••• 5556');
    assert.equal(cardOnFile('4242 4242 4242 4241'), null);
    assert.equal(cardOnFile('4242x4242x4242x4242'), null);
    assert.equal(cardOnFile('0000'), null);
    break;
  }
  case 'ledger-invoice-status': {
    const { invoiceStatus } = await load('src/invoices/status.ts');
    const { InvoiceBook } = await load('src/invoices/book.ts');
    const book = new InvoiceBook([{ ...invoice, status: 'paid' }, { ...invoice, number: 7, status: 'void' }, { ...invoice, number: 8, status: 'open' }]);
    assert.equal(invoiceStatus(book, 'INV-0042'), 'paid');
    assert.equal(invoiceStatus(book, ' #8 '), 'open');
    assert.equal(invoiceStatus(book, 'inv-8'), 'open');
    assert.equal(invoiceStatus(book, '7'), null);
    assert.equal(invoiceStatus(book, 'a1'), null);
    assert.equal(invoiceStatus(book, '42b'), null);
    break;
  }
  case 'ledger-sku-price': {
    const { unitPrice } = await load('src/catalog/price.ts');
    const { Catalog } = await load('src/catalog/catalog.ts');
    const catalog = new Catalog([{ sku: 'AB-100', name: 'Widget', unitCents: 525, retired: false }, { sku: 'CD-200', name: 'Gadget', unitCents: 900, retired: true }]);
    assert.equal(unitPrice(catalog, 'ab100'), 525);
    assert.equal(unitPrice(catalog, 'Ab 1-00'), 525);
    assert.equal(unitPrice(catalog, 'CD-200'), null);
    assert.equal(unitPrice(catalog, 'Widget'), null);
    break;
  }
  case 'ledger-discount-options': {
    const { applyDiscount } = await load('src/billing/discount.ts');
    const { promoSubtotalCents } = await load('src/invoices/promo.ts');
    const { promoSummary } = await load('src/reports/promo-summary.ts');
    assert.equal(applyDiscount(1050, { percent: 10 }), 945);
    assert.equal(applyDiscount(1050, { percent: 50, capCents: 200 }), 850);
    assert.equal(applyDiscount(25, { percent: 10 }), 23);
    assert.equal(promoSubtotalCents(invoice, 10), 473);
    assert.deepEqual(promoSummary(invoice, [0, 50]), [{ percent: 0, cents: 525 }, { percent: 50, cents: 263 }]);
    break;
  }
  case 'ledger-late-fee-options': {
    const { lateFee } = await load('src/billing/late.ts');
    const { overdueCents } = await load('src/invoices/overdue.ts');
    const { dunningSteps } = await load('src/reports/dunning.ts');
    assert.equal(lateFee(100000, { daysLate: 30 }), 1500);
    assert.equal(lateFee(100000, { daysLate: 30, graceDays: 10 }), 1000);
    assert.equal(lateFee(100000, { daysLate: 5, graceDays: 10 }), 0);
    assert.equal(overdueCents(invoice, 100), 551);
    assert.deepEqual(dunningSteps(invoice, [0, 100]), [{ daysLate: 0, feeCents: 0 }, { daysLate: 100, feeCents: 26 }]);
    break;
  }
  case 'ledger-date-style': {
    const { formatDate } = await load('src/internal/dates/format.ts');
    assert.equal(formatDate('2026-03-05', 'iso'), '2026-03-05');
    assert.equal(formatDate('2026-03-05', 'eu'), '05.03.2026');
    assert.equal(formatDate('2026-03-05', 'us'), '03/05/2026');
    assert.equal(formatDate.length, 2, 'the style must be required');
    const expected = { issued: 'issued on', due: 'is due on', paid: 'was paid on', voided: 'was voided on' };
    for (const [name, label] of Object.entries(expected)) {
      const module = await load(`src/notices/${name}.ts`);
      assert.equal(module[`${name}Notice`]({ number: 7, date: '2026-03-05', dateStyle: 'eu' }), `Invoice 7 ${label} 05.03.2026`);
      assert.equal(module[`${name}Notice`]({ number: 7, date: '2026-03-05', dateStyle: 'us' }), `Invoice 7 ${label} 03/05/2026`);
    }
    break;
  }
  case 'ledger-percent-digits': {
    const { formatPercent } = await load('src/money/percent.ts');
    assert.equal(formatPercent(0.0725, 2), '7.25%');
    assert.equal(formatPercent(0.2, 1), '20.0%');
    assert.equal(formatPercent(0.2, 0), '20%');
    assert.equal(formatPercent.length, 2, 'the digits must be required');
    const expected = { tax: 'Tax: 12.50%', interest: 'Interest: 12.50%', discount: 'Discount: 12.5%', fee: 'Fee: 12.5%' };
    for (const [name, text] of Object.entries(expected)) {
      const module = await load(`src/rates/${name}-line.ts`);
      assert.equal(module[`${name}RateLine`](0.125), text);
    }
    break;
  }
  case 'ledger-instalments-then-shared': {
    const { instalments } = await load('src/invoices/instalments.ts');
    assert.deepEqual(instalments(invoice, 2), [263, 262]);
    assert.deepEqual(instalments(invoice, 4), [132, 131, 131, 131]);
    assert.ok(existsSync(`${root}/src/accounts/shared.ts`), 'second turn was not completed');
    const { sharedCost } = await load('src/accounts/shared.ts');
    assert.deepEqual(sharedCost(1000, ['a1', 'a2', 'a3']), { a1: 334, a2: 333, a3: 333 });
    assert.deepEqual(sharedCost(5, ['a1', 'a2', 'a3']), { a1: 2, a2: 2, a3: 1 });
    assert.deepEqual(sharedCost(900, ['a1']), { a1: 900 });
    break;
  }
  case 'ledger-period-then-totals': {
    const { invoicePeriod } = await load('src/invoices/period.ts');
    assert.equal(invoicePeriod({ number: 7, date: '2026-03-05', dateStyle: 'iso' }), 'FY26-Q4 #7');
    assert.equal(invoicePeriod({ number: 8, date: '2026-04-01', dateStyle: 'iso' }), 'FY27-Q1 #8');
    assert.ok(existsSync(`${root}/src/reports/periods.ts`), 'second turn was not completed');
    const { periodTotals } = await load('src/reports/periods.ts');
    assert.deepEqual(periodTotals([{ date: '2026-03-05', cents: 100 }, { date: '2026-01-15', cents: 50 }, { date: '2026-12-31', cents: 7 }, { date: '2026-10-01', cents: 3 }, { date: '2026-09-30', cents: 1 }]),
      { 'FY26-Q4': 150, 'FY27-Q3': 10, 'FY27-Q2': 1 });
    assert.deepEqual(periodTotals([]), {});
    break;
  }
  default: throw new Error(`Unknown task ${process.env.TASK_ID}`);
}
