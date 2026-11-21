import { assert, feature, event, card, broken } from './common.mjs';
const { createEventCard } = await feature('event-card');
assert.deepEqual(createEventCard(event), card);
assert.deepEqual(createEventCard({ ...event, title: '  A / B  ' }), { ...card, id: 'a-b', title: 'A / B' });
assert.throws(() => createEventCard({ ...event, title: '  ' }), TypeError);
assert.throws(() => createEventCard(broken), TypeError);
