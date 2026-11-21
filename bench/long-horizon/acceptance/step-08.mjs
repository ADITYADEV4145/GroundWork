import { assert, feature, event, signups, card, broken } from './common.mjs';
const { buildOrganizerDigest } = await feature('digest');
const early = Object.freeze({ ...event, title: 'Early', startsAt: '2026-01-01T00:00:00Z' });
const tie = Object.freeze({ ...event, title: 'Tie' });
assert.deepEqual(buildOrganizerDigest(Object.freeze([event, early, tie]), Object.freeze({ 'cafe-code': signups })), [
  { id: 'early', title: 'Early', dateLabel: '2026-01-01', confirmed: 0, remaining: 2, waitlisted: 0 },
  { ...card, confirmed: 2, remaining: 0, waitlisted: 0 },
  { ...card, id: 'tie', title: 'Tie', confirmed: 0, remaining: 2, waitlisted: 0 },
]);
assert.deepEqual(buildOrganizerDigest([], {}), []);
assert.throws(() => buildOrganizerDigest([broken], {}), TypeError);
assert.throws(() => buildOrganizerDigest([{ ...event, capacity: 0 }], {}), RangeError);
assert.throws(() => buildOrganizerDigest([event], { 'cafe-code': [{email:'invalid'}] }), TypeError);
