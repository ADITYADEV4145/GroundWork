import { assert, feature, event, guest, broken } from './common.mjs';
const { buildInvitation } = await feature('invitation');
assert.deepEqual(buildInvitation(event, guest), { to: 'ada@example.com', subject: 'Invitation: Café & Code!', url: '/events/cafe-code' });
assert.throws(() => buildInvitation(event, { email: '' }), TypeError);
assert.throws(() => buildInvitation(event, { email: 'not-an-email' }), TypeError);
assert.throws(() => buildInvitation(broken, guest), TypeError);
