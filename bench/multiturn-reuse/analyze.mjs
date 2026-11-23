import { manifest } from './repositories.mjs';

export const agents = ['Devin normal', 'Devin fusion'];
const mean = xs => xs.reduce((a,b) => a+b,0)/xs.length;

export function bootstrap(groups, field, step = 5) {
  if (!groups.length) throw new Error('Missing chain metrics');
  let state = 0x51ab17ed;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0)/2**32; };
  const draw = xs => mean(xs.map(() => xs[Math.floor(next()*xs.length)]));
  const cells = groups.map(g => Object.fromEntries(['baseline','groundwork'].map(arm => [arm,g.filter(r => r.condition===arm).map(r => r.turns[step-1][field])])));
  if (cells.some(c => ['baseline','groundwork'].some(a => !c[a].length || c[a].some(x => !Number.isFinite(x))))) throw new Error('Missing or malformed chain metric');
  const values = [];
  for (let i=0; i<10000; i++) {
    const b = cells.map(c => draw(c.baseline));
    const g = cells.map(c => draw(c.groundwork));
    values.push(mean(b)-mean(g));
  }
  values.sort((a,b) => a-b);
  return { baselineMean:mean(cells.map(c=>mean(c.baseline))), groundworkMean:mean(cells.map(c=>mean(c.groundwork))),
    difference:mean(cells.map(c=>mean(c.baseline)-mean(c.groundwork))), low:values[249], high:values[9749] };
}

export function analyze(records) {
  if (records.length !== 64) throw new Error('Require all64 planned chain-sessions');
  const results = agents.map(agent => {
    const groups = manifest.chains.map((chain,index) => {
      const group = records.filter(r=>r.agent===agent && r.chain===chain.id);
      for (const arm of ['baseline','groundwork']) {
        const runs=group.filter(r=>r.condition===arm);
        if (runs.length!==4 || new Set(runs.map(r=>r.run)).size!==4 || runs.some(r=>r.run<1||r.run>16||(r.run-1)%4!==index||r.turns.length!==5)) throw new Error('Incomplete mode/chain/arm');
      }
      return group.sort((a,b)=>a.run-b.run||a.condition.localeCompare(b.condition));
    });
    const guardrails = groups.flatMap((group,i)=>Array.from({length:5},(_,step)=>{
      const b=group.filter(r=>r.condition==='baseline').filter(r=>r.turns[step].success).length;
      const g=group.filter(r=>r.condition==='groundwork').filter(r=>r.turns[step].success).length;
      return {chain:manifest.chains[i].id,turn:step+1,baselineSuccess:b,groundworkSuccess:g,met:g>=b};
    }));
    const primary=bootstrap(groups,'duplicateRate');
    primary.differencePp=100*primary.difference;
    primary.ciPp=[100*primary.low,100*primary.high];
    primary.rateScale='fraction; differencePp and ciPp are percentage points';
    const curves=Array.from({length:5},(_,i)=>({turn:i+1,duplicateRate:bootstrap(groups,'duplicateRate',i+1),
      reuseRate:bootstrap(groups,'cumulativeReuseRate',i+1),growth:bootstrap(groups,'cumulativeLoc',i+1)}));
    const guardrail=guardrails.every(g=>g.met);
    return {agent,primary,curves,guardrails,guardrail,win:guardrail&&primary.low>0};
  });
  return {protocol:'reuse-v1',bootstrapDraws:10000,seed:'0x51ab17ed',results,gate:results.every(r=>r.win)};
}
