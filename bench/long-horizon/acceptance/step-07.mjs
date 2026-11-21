import { assert, feature, event, signups, broken } from './common.mjs';
const { exportRosterCsv } = await feature('export');
assert.equal(exportRosterCsv(event, signups), 'event,date,name,email\nCafé & Code!,2026-04-03,Ada,ada@example.com\nCafé & Code!,2026-04-03,Zoe,zoe@example.com\n');
assert.equal(exportRosterCsv({ ...event, title: 'Say "Hi", team' }, [{ name: 'Line\nBreak', email: 'x@y.test' }]), 'event,date,name,email\n"Say ""Hi"", team",2026-04-03,"Line\nBreak",x@y.test\n');
assert.equal(exportRosterCsv(event, []), 'event,date,name,email\n');
assert.throws(() => exportRosterCsv(broken, []), TypeError);
assert.throws(() => exportRosterCsv(event, [{ name: 'Bad', email: 'invalid' }]), TypeError);
