import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { captureSchema } from '../dist/bench/schema.js';
import { gradeChain } from '../bench/multiturn-reuse/grade.mjs';
import { analyze, agents } from '../bench/multiturn-reuse/analyze.mjs';

const root = fileURLToPath(new URL('../',import.meta.url));
const [input, output] = process.argv.slice(2);
if (!input || !output || process.argv.length!==4) throw new Error('node scripts/bench-multiturn-reuse.mjs EXPORT_DIR OUTPUT_DIR');
const pin = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const captures = readdirSync(input).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync(path.join(input,f),'utf8')));
const revision = JSON.parse(readFileSync(path.join(root,'bench/multiturn-reuse/tasks.json'),'utf8')).revision;
if (captures.length!==64) throw new Error('Require all64 planned exports; partial captures are not confirmatory');
const pairs=new Set();
for (const capture of captures) {
  captureSchema.parse(capture);
  if (capture.captureRevision!==pin || capture.revision!==revision || capture.suite!=='multiturn-reuse' || capture.protocol!=='stable-v1' || capture.sessionStartBasis!=='workspace-ready' || !agents.includes(capture.agent)) throw new Error('Wrong pin/protocol/mode');
  for (let i=0;i<capture.observations.length;i++) {
    const observation=capture.observations[i];
    if(i && observation.startedAt<capture.observations[i-1].endedAt) throw new Error('Overlapping/reversed turns');
    for(let j=0;j<observation.tools.length;j++) {
      if(j && observation.tools[j].startedAt<observation.tools[j-1].endedAt) throw new Error('Overlapping/reversed captured actions');
    }
  }
  if (capture.condition==='baseline' && capture.observations.some(o=>o.tools.some(t=>t.action==='mcp'||t.blocked))) throw new Error('Baseline treatment use');
  const pair=JSON.stringify([capture.agent,capture.chain,capture.condition,capture.run]);
  if(pairs.has(pair)) throw new Error('Duplicate planned unit');
  pairs.add(pair);
}
const records=[];
for(const capture of captures.sort((a,b)=>a.agent.localeCompare(b.agent)||a.chain.localeCompare(b.chain)||a.run-b.run||a.condition.localeCompare(b.condition))) {
  const scratch=mkdtempSync(path.join(os.homedir(),'gw-reuse-grade-'));
  try { records.push(gradeChain(capture,scratch)); }
  finally { rmSync(scratch,{recursive:true,force:true}); }
}
const analysis=analyze(records);
mkdirSync(output,{recursive:true});
writeFileSync(path.join(output,'records.json'),JSON.stringify(records,null,2)+'\n');
writeFileSync(path.join(output,'analysis.json'),JSON.stringify({...analysis,collectorProductPin:pin},null,2)+'\n');
console.log(JSON.stringify(analysis,null,2));
