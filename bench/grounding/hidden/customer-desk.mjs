import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const w = await import(pathToFileURL(`${process.env.WORKSPACE_DIR}/src/workflows.ts`));
for (const n of process.env.CASE_NUMBER ? [Number(process.env.CASE_NUMBER)] : [1, 2, 3, 4]) {
  const users = [{id:`a${n}`,email:`Person${n}@test.local`,name:`Person ${n}`,plan:'pro'},{id:'b',email:'b@test.local',name:'B',plan:'free'}];
  const tickets = [{id:'z',userId:`a${n}`,state:'open'},{id:'x',userId:`a${n}`,state:'closed'},{id:'a',userId:`a${n}`,state:'open'},{id:'b',userId:'b',state:'open'}];
  const policies = [{userId:`a${n}`,contact:true,billing:false},{userId:'b',contact:false,billing:true}];
  const email = ` PERSON${n}@test.local `;
  switch (process.env.TASK_ID) {
    case 'customer-welcome':
      assert.equal(w.welcomeByAddress(users,email,'es'),`Hola, Person ${n}!`);
      assert.equal(w.welcomeByAddress(users,email,'en'),`Hello, Person ${n}!`);
      assert.equal(w.welcomeByAddress([],email,'es'),null); break;
    case 'customer-cases':
      assert.deepEqual(w.openCasesByAddress(users,tickets,email),['a','z']);
      assert.deepEqual(w.openCasesByAddress(users,tickets,'missing'),[]); break;
    case 'customer-contact':
      assert.deepEqual(w.contactableAddresses(users,policies),[`person${n}@test.local`]);
      assert.deepEqual(w.contactableAddresses(users,[]),[]); break;
    case 'customer-priority':
      assert.deepEqual(w.priorityCaseIds(users,tickets,[{code:'pro',priority:true}],email),['a','z']);
      assert.deepEqual(w.priorityCaseIds(users,tickets,[],email),[]);
      assert.deepEqual(w.priorityCaseIds(users,tickets,[{code:'free',priority:false}],'b@test.local'),[]); break;
    case 'customer-snapshot':
      assert.deepEqual(w.accountSnapshot(users,tickets,policies,email),{id:`a${n}`,open:2,contact:true});
      assert.equal(w.accountSnapshot(users,tickets,policies,'missing'),null); break;
    default: throw new Error('Unknown task');
  }
}
