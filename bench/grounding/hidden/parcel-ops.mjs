import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const w = await import(pathToFileURL(`${process.env.WORKSPACE_DIR}/src/workflows.ts`));
const { Inventory } = await import(pathToFileURL(`${process.env.WORKSPACE_DIR}/src/stock.ts`));
for (const n of process.env.CASE_NUMBER ? [Number(process.env.CASE_NUMBER)] : [1, 2, 3, 4]) {
  const orders = [{reference:`r${n}`,account:'a',cancelled:false,sku:'book',quantity:n,unitCents:125,weight:1.2},{reference:'c',account:'a',cancelled:true,sku:'book',quantity:99,unitCents:100,weight:2},{reference:'b',account:'b',cancelled:false,sku:'pen',quantity:1,unitCents:50,weight:1}];
  const rates = [{zone:'near',baseCents:130,perKgCents:20},{zone:'far',baseCents:500,perKgCents:100}];
  switch (process.env.TASK_ID) {
    case 'parcel-total':
      assert.equal(w.accountTotal(orders,'a',0.2),n*150); assert.equal(w.accountTotal(orders,'missing',0.2),0); break;
    case 'parcel-quote':
      assert.equal(w.shippingOffer(orders,`r${n}`,'near',rates),170);
      assert.equal(w.shippingOffer(orders,`r${n}`,'far',rates),700);
      assert.equal(w.shippingOffer(orders,'c','near',rates),null);
      assert.equal(w.shippingOffer(orders,'missing','near',rates),null);
      assert.equal(w.shippingOffer(orders,`r${n}`,'unknown',rates),null); break;
    case 'parcel-reserve': {
      const inventory = new Inventory({book:n});
      assert.equal(w.reserveForOrder(orders,`r${n}`,inventory),true); assert.equal(inventory.available('book'),0);
      assert.equal(w.reserveForOrder(orders,`r${n}`,inventory),false);
      assert.equal(w.reserveForOrder(orders,'c',inventory),false); break;
    }
    case 'parcel-dispatch':
      assert.equal(w.dispatchSummary(orders,`r${n}`,'near',rates),`r${n}:bookx${n}:170`);
      assert.equal(w.dispatchSummary(orders,'c','near',rates),null);
      assert.equal(w.dispatchSummary(orders,`r${n}`,'unknown',rates),null); break;
    case 'parcel-cancelled':
      assert.deepEqual(w.cancelledReferences(orders,'a'),['c']); assert.deepEqual(w.cancelledReferences(orders,'missing'),[]); break;
    default: throw new Error('Unknown task');
  }
}
