import { assert, feature, event, signups, card } from './common.mjs';
const { buildDashboard } = await feature('dashboard');
const early = Object.freeze({ ...event, title: 'Early', startsAt: '2026-01-01T00:00:00Z' });
const events = Object.freeze([event, early]);
const digestCard = { ...card, confirmed: 2, remaining: 0, waitlisted: 0 };
assert.deepEqual(buildDashboard(events, { 'cafe-code': signups }, Object.freeze({ search: '  CODE  ', page: 1, pageSize: 1 })), { items: [digestCard], total: 1, page: 1, pageSize: 1, totalPages: 1 });
assert.deepEqual(buildDashboard(events, { 'cafe-code': signups }, { page: 2, pageSize: 1 }).items, [digestCard]);
assert.equal(buildDashboard(events, {}).total, 2);
assert.deepEqual(buildDashboard([], {}), { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
assert.deepEqual(buildDashboard(events, {}, { page: 9 }).items, []);
for (const value of [0, -1, 1.5, '2', NaN, Infinity]) {
  assert.throws(() => buildDashboard([], {}, { page: value }), RangeError);
  assert.throws(() => buildDashboard([], {}, { pageSize: value }), RangeError);
}
