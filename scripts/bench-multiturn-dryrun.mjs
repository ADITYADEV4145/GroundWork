import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifest } from '../bench/multiturn-reuse/repositories.mjs';
import { gradeChain } from '../bench/multiturn-reuse/grade.mjs';
import { captureSchema } from '../dist/bench/schema.js';

const source=fileURLToPath(new URL('../',import.meta.url));
const output=process.argv[2]??mkdtempSync(path.join(os.homedir(),'gw-reuse-dry-'));
mkdirSync(output,{recursive:true});
const rows=[];
for(const chain of manifest.chains) for(const style of ['ideal','copy']) {
  const state=path.join(output,chain.id+'-'+style);
  const env={...process.env,GW_BENCH_SUITE:'multiturn-reuse',GW_BENCH_CHAIN:chain.id,GW_BENCH_PROTOCOL:'stable-v1',GW_BENCH_AGENT:'scripted-'+style};
  const capture=(...args)=>execFileSync(process.execPath,['bench/capture.mjs',...args],{cwd:source,env,encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024});
  capture('init',state,'baseline','1');
  const workspace=path.join(state,'workspace');
  for(let step=1;step<=5;step++) {
    const disclosed=JSON.parse(capture('list',state));
    if(disclosed.length!==1||disclosed[0].step!==step)throw new Error('Requirement disclosure is not one turn at a time');
    const task=disclosed[0].id;
    capture('begin',state,task);
    const code=execFileSync(process.env.GW_REUSE_PYTHON??'python3',[path.join(source,'bench/multiturn-reuse/hidden/scripted.py'),workspace,chain.id,String(step),style],{encoding:'utf8'});
    const target=`src/${chain.package}/steps.py`;
    const command=`mkdir -p src/${chain.package}; printf '%s' '${Buffer.from(code).toString('base64')}' | base64 -d > ${target}`;
    capture('shell',state,task,command);
    capture('finish',state,task);
  }
  if(JSON.parse(capture('list',state)).length)throw new Error('Finished chain reveals further tasks');
  const raw=capture('export',state);
  const exported=JSON.parse(raw);captureSchema.parse(exported);
  writeFileSync(path.join(output,chain.id+'-'+style+'.json'),raw);
  const scratch=path.join(output,chain.id+'-'+style+'-grade');mkdirSync(scratch);
  const graded=gradeChain(exported,scratch);
  writeFileSync(path.join(output,chain.id+'-'+style+'-graded.json'),JSON.stringify(graded,null,2)+'\n');
  const final=graded.turns[4];
  rows.push({chain:chain.id,style,success:graded.turns.filter(t=>t.success).length,
    duplicatedPct:100*final.duplicateRate,reusePct:100*final.cumulativeReuseRate,
    repoTokens:final.cumulativeRepoDuplicateTokens,earlierTokens:final.cumulativeEarlierDuplicateTokens,
    addedTokens:final.cumulativeTokens,netLoc:final.cumulativeLoc});
}
for(const chain of manifest.chains) {
  const a=rows.find(r=>r.chain===chain.id&&r.style==='ideal'),b=rows.find(r=>r.chain===chain.id&&r.style==='copy');
  if(a.success!==5||b.success!==5||a.reusePct!==100||b.reusePct!==0||b.duplicatedPct<=a.duplicatedPct+20)throw new Error('Calibration did not separate valid solutions: '+JSON.stringify([a,b]));
}
writeFileSync(path.join(output,'metrics.json'),JSON.stringify(rows,null,2)+'\n');
console.log('| Chain | Scripted solution | Success | Cumulative duplicate rate, turn5 | Cumulative reuse rate | Net LOC |');
console.log('| --- | --- | --- | --- | --- | --- |');
for(const r of rows)console.log(`| ${r.chain} | ${r.style} | ${r.success}/5 | ${r.duplicatedPct.toFixed(1)}% | ${r.reusePct.toFixed(1)}% | ${r.netLoc} |`);
console.log('PASS scripted calibration: eight full stable-v1 chains, persistent workspaces, turn-by-turn disclosure, hidden acceptance and AST/clone grading; not agent data');
