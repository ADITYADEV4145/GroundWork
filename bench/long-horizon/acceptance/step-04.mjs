import { assert, feature, event, guest, broken } from './common.mjs';
const { sendReminder } = await feature('reminders');
let calls = 0;
assert.equal(await sendReminder(event, guest, async () => { calls++; return 'first'; }), 'first');
assert.equal(calls, 1);
calls = 0;
assert.equal(await sendReminder(event, guest, async (payload) => {
  assert.deepEqual(payload, { to: 'ada@example.com', subject: 'Invitation: Café & Code!', url: '/events/cafe-code' });
  if (++calls < 3) throw new Error('transient');
  return 'delivered';
}), 'delivered');
assert.equal(calls, 3);
const last = new Error('permanent'); calls = 0;
await assert.rejects(sendReminder(event, guest, async () => { calls++; throw last; }), (e) => e === last);
assert.equal(calls, 3);
calls = 0;
await assert.rejects(sendReminder(event, { email: '' }, async () => calls++), TypeError);
await assert.rejects(sendReminder(broken, guest, async () => calls++), TypeError);
assert.equal(calls, 0);
