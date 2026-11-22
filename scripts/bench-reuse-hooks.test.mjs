import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../', import.meta.url));
const suite = JSON.parse(readFileSync(path.join(source, 'bench/multiturn-reuse/tasks.json')));
const tasks = suite.tasks.filter(task => task.sequence === 'click-summary');
const moduleUrl = text => 'data:text/javascript,' + encodeURIComponent(text);
const preload = moduleUrl(`import cp from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = cp.spawnSync;
cp.spawnSync = (command, args, options) => {
  if (args?.[0]?.endsWith('/dist/cli/main.js') && args[1] === 'refresh') return {status:0,stdout:''};
  if (args?.[1] !== 'hook') return original(command,args,options);
  const payload=JSON.parse(options.input);
  appendFileSync(process.env.GW_TEST_HOOK_LOG,JSON.stringify({event:args[3],payload})+'\\n');
  const start=performance.now(); while(performance.now()-start<12) {}
  const mode=process.env.GW_TEST_HOOK_MODE;
  if(mode==='throw') throw new Error('hook failed');
  if(mode==='timeout') return {status:null,stdout:'{}',error:new Error('timeout')};
  if(mode==='invalid') return {status:0,stdout:'not json'};
  if(mode==='empty') return {status:0,stdout:''};
  if(mode==='nonzero') return {status:1,stdout:'{"decision":"block","reason":"must fail open"}'};
  if(args[3]==='stop') return {status:0,stdout:JSON.stringify(mode==='block'
    ? {decision:'block',reason:'FIX_BEFORE_FINISH'} : {systemMessage:'STOP_FEEDBACK'})};
  return {status:0,stdout:JSON.stringify({hookSpecificOutput:{additionalContext:args[3]==='prompt'?'PROMPT_FEEDBACK':'EDIT_FEEDBACK'}})};
}; syncBuiltinESMExports();`);

function fixture(condition, product) {
  const parent = mkdtempSync(path.join(os.homedir(), 'gw-reuse-hooks-'));
  const collector = path.join(parent, 'collector'), state = path.join(parent, 'state'), root = path.join(state, 'workspace');
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {cwd: root, encoding:'utf8'}).trim();
  mkdirSync(path.join(collector, 'bench/multiturn-reuse'), {recursive:true});
  for (const file of ['capture.mjs','workspace.mjs','multiturn-reuse/hooks.mjs','multiturn-reuse/repositories.mjs','multiturn-reuse/repos.json','multiturn-reuse/tasks.json']) {
    copyFileSync(path.join(source,'bench',file),path.join(collector,'bench',file));
  }
  symlinkSync(path.join(source,'node_modules'),path.join(collector,'node_modules'));
  if (product) symlinkSync(path.join(product,'dist'),path.join(collector,'dist'));
  mkdirSync(root,{recursive:true});
  writeFileSync(path.join(root,'seed.py'),'def baseline_seed(values):\n    total = sum(values)\n    count = len(values)\n    return total, count\n');
  git('init','-q','--template='); git('add','seed.py');
  git('-c','user.name=Aditya','-c','user.email=adityapunjani9@gmail.com','commit','-qm','Hook test fixture');
  writeFileSync(path.join(state,'metadata.json'),JSON.stringify({suite:'multiturn-reuse',revision:suite.revision,
    condition,run:1,chain:'click-summary',protocol:'stable-v1',sessionStartedAt:Date.now(),sessionStartBasis:'workspace-ready'}));
  const log = path.join(parent,'hooks.jsonl');
  const run = (args, mode) => {
    const result=spawnSync(process.execPath,[...(!product?['--import',preload]:[]),path.join(collector,'bench/capture.mjs'),...args],{
      encoding:'utf8',timeout:30000,env:{...process.env,GW_BENCH_SUITE:'multiturn-reuse',GW_BENCH_CHAIN:'click-summary',
        GW_BENCH_PROTOCOL:'stable-v1',GW_TEST_HOOK_LOG:log,GW_TEST_HOOK_MODE:mode??''}});
    assert.equal(result.status,0,result.stderr); return result.stdout;
  };
  return {root,state,log,run,record: step=>JSON.parse(readFileSync(path.join(state,tasks[step-1].id+'.json'))),
    events:()=>existsSync(log)?readFileSync(log,'utf8').trim().split('\n').map(JSON.parse):[],
    close:()=>rmSync(parent,{recursive:true,force:true})};
}

const write = (file, code) => `printf '%s' '${Buffer.from(code).toString('base64')}' | base64 -d > '${file}'`;

test('reuse dispatches prompt, Write/Edit and Stop with host payloads only in GroundWork, with measured feedback',()=>{
  for (const condition of ['groundwork','baseline']) {
    const f=fixture(condition);
    try {
      const listed=JSON.parse(f.run(['list',f.state]));
      assert.equal(listed[0].id,tasks[0].id); assert.equal(listed[0].prompt,undefined);
      f.run(['list',f.state]); assert.deepEqual(f.events(),[]);
      const begun=JSON.parse(f.run(['begin',f.state,tasks[0].id]));
      assert.equal(begun.prompt,tasks[0].prompt);
      assert.equal(begun.hookContext,condition==='groundwork'?'PROMPT_FEEDBACK':undefined);
      const written=f.run(['shell',f.state,tasks[0].id,write('feature.py','def helper(x):\n    return x\n')+"; printf '%09000d' 0"]);
      assert.equal(written.includes('EDIT_FEEDBACK'),condition==='groundwork');
      f.run(['shell',f.state,tasks[0].id,write('feature.py','def helper(x):\n    return x\n')]);
      f.run(['shell',f.state,tasks[0].id,write('feature.py','def helper(x):\n    return x + 1\n')]);
      const stopped=f.run(['finish',f.state,tasks[0].id]);
      assert.equal(stopped.includes('STOP_FEEDBACK'),condition==='groundwork');
      const events=f.events(), row=f.record(1);
      if (condition==='baseline') { assert.deepEqual(events,[]); assert.equal(row.tools.length,3); continue; }
      assert.deepEqual(events.map(e=>e.event),['prompt','post_tool','post_tool','stop']);
      assert.deepEqual(events.map(e=>e.payload.hook_event_name),['UserPromptSubmit','PostToolUse','PostToolUse','Stop']);
      assert.equal(events[0].payload.prompt,tasks[0].prompt);
      assert.equal(events[1].payload.tool_name,'Write'); assert.equal(events[2].payload.tool_name,'Edit');
      assert.deepEqual(events[1].payload.tool_input,{file_path:path.join(f.root,'feature.py'),content:'def helper(x):\n    return x\n'});
      assert.deepEqual(events[2].payload.tool_input,{file_path:path.join(f.root,'feature.py'),old_string:'def helper(x):\n    return x\n',new_string:'def helper(x):\n    return x + 1\n'});
      assert.equal(events[3].payload.stop_hook_active,false);
      assert.equal(new Set(events.map(e=>e.payload.session_id)).size,1);
      assert.match(events[0].payload.session_id,/^reuse-[a-f0-9]{64}$/);
      assert.ok(events.every(e=>e.payload.cwd===f.root));
      assert.deepEqual(row.tools.map(t=>t.name??t.action),['hook:prompt','shell','shell','shell','hook:stop']);
      for (const [i,tool] of row.tools.entries()) {
        assert.ok(tool.startedAt>=row.startedAt && tool.endedAt<=row.endedAt);
        if (i!==2) assert.ok(tool.durationMs>=10);
      }
    } finally { f.close(); }
  }
});

test('reuse hooks fail open on empty, malformed, failed, throwing and timed-out hooks; blocked Stop permits corrections',()=>{
  for (const mode of ['empty','invalid','nonzero','throw','timeout','block']) {
    const f=fixture('groundwork');
    try {
      f.run(['begin',f.state,tasks[0].id],mode);
      assert.equal(f.run(['shell',f.state,tasks[0].id,write('feature.py','value = 1\n')],mode).includes('Error:'),false);
      const stopped=f.run(['finish',f.state,tasks[0].id],mode);
      if (mode==='block') {
        assert.match(stopped,/FIX_BEFORE_FINISH/); assert.equal(f.record(1).wallMs,undefined);
        f.run(['shell',f.state,tasks[0].id,write('feature.py','value = 2\n')]);
        f.run(['finish',f.state,tasks[0].id]);
      }
      assert.ok(f.record(1).wallMs>=0);
    } finally { f.close(); }
  }
});

test('real PR42 product offers both helpers from a cold multi-file turn1 write in the turn2 prompt',{
  skip:!process.env.GW_REUSE_MEMORY_PRODUCT,
},()=>{
  const product=process.env.GW_REUSE_MEMORY_PRODUCT;
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:product,encoding:'utf8'}).trim(),'6fe635f586654359514c614402b0b0243c915b32');
  const f=fixture('groundwork',product);
  try {
    const first=JSON.parse(f.run(['begin',f.state,tasks[0].id]));
    assert.equal(first.hookContext,undefined);
    const code='def remembered_summary(values):\n    total = 0\n    count = 0\n    for value in values:\n        if value is not None:\n            total += value\n            count += 1\n    average = total / count if count else 0\n    return total, count, average\n';
    f.run(['shell',f.state,tasks[0].id,write('feature.py',code)+'; '+write('second.py',code.replace('remembered_summary','remembered_second'))]);
    f.run(['finish',f.state,tasks[0].id]);
    for (const task of tasks.slice(1)) {
      const begun=JSON.parse(f.run(['begin',f.state,task.id]));
      assert.match(begun.hookContext,/Code you wrote earlier in this session/);
      assert.match(begun.hookContext,/remembered_summary/); assert.match(begun.hookContext,/remembered_second/);
      assert.doesNotMatch(begun.hookContext,/baseline_seed/);
      f.run(['finish',f.state,task.id]);
    }
    assert.ok(f.record(5).wallMs>=0);
  } finally { f.close(); }
});
