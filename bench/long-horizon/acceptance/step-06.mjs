import { assert, feature, event, signups } from './common.mjs';
const { summarizeAttendance } = await feature('attendance');
assert.deepEqual(summarizeAttendance(event, signups), { confirmed: 2, remaining: 0, waitlisted: 0 });
assert.deepEqual(summarizeAttendance({ ...event, capacity: 1 }, signups), { confirmed: 1, remaining: 0, waitlisted: 1 });
assert.deepEqual(summarizeAttendance(event, []), { confirmed: 0, remaining: 2, waitlisted: 0 });
for (const capacity of [0, -1, 1.5, '2']) assert.throws(() => summarizeAttendance({ ...event, capacity }, []), RangeError);
assert.throws(() => summarizeAttendance(event, [{ email: 'invalid' }]), TypeError);
