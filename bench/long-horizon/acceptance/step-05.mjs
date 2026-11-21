import { assert, feature, signups } from './common.mjs';
const { buildRoster } = await feature('roster');
assert.deepEqual(buildRoster(signups), [{ name: 'Ada', email: 'ada@example.com' }, { name: 'Zoe', email: 'zoe@example.com' }]);
assert.deepEqual(buildRoster([]), []);
assert.deepEqual(buildRoster([{name:'A',email:'b@x.test'}, {name:'A',email:'a@x.test'}]).map((s) => s.email), ['b@x.test','a@x.test']);
assert.throws(() => buildRoster([{ name: 'Bad', email: 'invalid' }]), TypeError);
