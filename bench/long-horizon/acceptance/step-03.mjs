import { assert, feature, event, card, broken } from './common.mjs';
const { buildAgenda } = await feature('agenda');
const early = Object.freeze({ ...event, title: 'Early', startsAt: '2026-01-01T00:00:00Z' });
const tie = Object.freeze({ ...event, title: 'Tie' });
const events = Object.freeze([event, early, tie]);
assert.deepEqual(buildAgenda(events), [{ id: 'early', title: 'Early', dateLabel: '2026-01-01' }, card, { ...card, id: 'tie', title: 'Tie' }]);
assert.deepEqual(buildAgenda([]), []);
assert.throws(() => buildAgenda([broken]), TypeError);
