import { assert, feature, event, signups, guest } from './common.mjs';
const { deliverDigest } = await feature('delivery');
let calls = 0;
assert.equal(await deliverDigest([event], { 'cafe-code': signups }, guest, async (payload) => {
  assert.deepEqual(payload, { to: 'ada@example.com', subject: 'Event digest', eventIds: ['cafe-code'], totalConfirmed: 2 });
  if (++calls < 2) throw new Error('transient');
  return 42;
}), 42);
assert.equal(calls, 2);
calls = 0;
await deliverDigest([], {}, guest, async (payload) => {
  calls++;
  assert.deepEqual(payload, { to: 'ada@example.com', subject: 'Event digest', eventIds: [], totalConfirmed: 0 });
});
assert.equal(calls, 1);
const last = new Error('permanent'); calls = 0;
await assert.rejects(deliverDigest([], {}, guest, async () => { calls++; throw last; }), (e) => e === last);
assert.equal(calls, 3);
calls = 0;
await assert.rejects(deliverDigest([], {}, { email: '' }, async () => calls++), TypeError);
await assert.rejects(deliverDigest([{ ...event, capacity: 0 }], {}, guest, async () => calls++), RangeError);
assert.equal(calls, 0);
