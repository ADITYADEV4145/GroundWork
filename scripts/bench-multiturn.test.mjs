import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyze, bootstrap, agents } from '../bench/multiturn-reuse/analyze.mjs';
import { manifest } from '../bench/multiturn-reuse/repositories.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
test('independent AST resolver and clone detector distinguish reuse, rename copies and near misses',()=>{
  const output=execFileSync(process.env.GW_REUSE_PYTHON??'python3',['bench/multiturn-reuse/test_metrics.py'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.equal(output,'');
});

const records=()=>agents.flatMap(agent=>manifest.chains.flatMap((chain,index)=>['baseline','groundwork'].flatMap(condition=>Array.from({length:4},(_,i)=>({agent,chain:chain.id,condition,run:index+1+i*4,turns:Array.from({length:5},(_,j)=>({success:true,duplicateRate:condition==='baseline'?(j+1)/10:0,cumulativeReuseRate:condition==='baseline'?0:1,cumulativeLoc:condition==='baseline'?100:50}))})))));

test('stratified whole-chain bootstrap is deterministic and gate requires both modes and all turn guardrails',()=>{
  const data=records(),result=analyze(data);
  assert.equal(result.gate,true);
  assert.deepEqual(analyze(data),result);
  assert.equal(result.results[0].primary.low,0.5);
  data.find(r=>r.agent==='Devin fusion'&&r.condition==='groundwork').turns[2].success=false;
  assert.equal(analyze(data).gate,false);
});

test('empty, duplicate, missing, wrong-mode and nonfinite analysis inputs fail closed',()=>{
  assert.throws(()=>analyze([]),/64/);
  assert.throws(()=>bootstrap([], 'duplicateRate'), /missing|malformed/i);
  const data=records();data[0].run=2;assert.throws(()=>analyze(data),/Incomplete/);
  const wrong=records();wrong[0].agent='different';assert.throws(()=>analyze(wrong),/Incomplete/);
  const bad=records();bad[0].turns[4].duplicateRate=NaN;assert.throws(()=>analyze(bad),/malformed/);
});

test('four chains each have five requirements and hidden canonical and earlier-capability labels',()=>{
  const tasks=JSON.parse(readFileSync(new URL('../bench/multiturn-reuse/tasks.json',import.meta.url),'utf8')).tasks;
  const hidden=JSON.parse(readFileSync(new URL('../bench/multiturn-reuse/hidden/opportunities.json',import.meta.url),'utf8')).chains;
  assert.equal(new Set(manifest.chains.map(c=>c.repo)).size,2);
  for(const chain of hidden) {
    assert.deepEqual(tasks.filter(t=>t.sequence===chain.id).map(t=>t.step),[1,2,3,4,5]);
    for(const turn of chain.turns) {
      assert.equal(turn.opportunities[0].kind,'repo');
      for(const op of turn.opportunities.slice(1)) {
        assert.ok(op.createdAt<turn.turn);
        assert.equal(op.createdByRequirement,chain.id+'-'+op.createdAt);
      }
    }
  }
});
