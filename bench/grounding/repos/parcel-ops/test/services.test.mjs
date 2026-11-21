import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Inventory } from '../src/stock.ts';
import { quoteShipment } from '../src/shipping.ts';
test('reservations are all or nothing; zones have distinct rates', () => {
  const stock = new Inventory({book:3});
  assert.equal(stock.reserve('book',4),false);
  assert.equal(stock.available('book'),3);
  assert.equal(quoteShipment(1.5,'near',[{zone:'near',baseCents:100,perKgCents:20}]),140);
});
