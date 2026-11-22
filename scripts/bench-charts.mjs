import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => JSON.parse(readFileSync(path.join(root, name), 'utf8'));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return (s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2; };

// Same seeded task bootstrap as src/bench/stats.ts; repeats are summed within tasks.
export function interval(values) {
  if (!values.length || values.some((v) => !Number.isFinite(v))) throw new Error('Expected finite, nonempty task reductions');
  let state = 0x963b41d7;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 2 ** 32; };
  const samples = Array.from({ length: 2000 }, () => median(Array.from({ length: values.length }, () => values[Math.floor(next() * values.length)]))).sort((a, b) => a - b);
  return { median: median(values), low: samples[49], high: samples[1949] };
}

export function summarize(evidence, tasks) {
  const runs = new Set(evidence.captures.map((c) => c.run));
  if (!runs.size) throw new Error('Missing baseline samples');
  for (const arm of ['baseline', 'groundwork']) {
    const captures = evidence.captures.filter((c) => c.condition === arm);
    if (captures.length !== runs.size || new Set(captures.map((c) => c.run)).size !== runs.size ||
      captures.some((c) => c.samples.length !== tasks.length || tasks.some((t) => c.samples.filter((s) => s.task === t.id).length !== 1))) {
      throw new Error(`Incomplete or duplicate ${arm} tasks or runs`);
    }
  }
  const arms = Object.fromEntries(['baseline', 'groundwork'].map((arm) => {
    const samples = evidence.captures.filter((c) => c.condition === arm).flatMap((c) => c.samples);
    if (!samples.length) throw new Error(`Missing ${arm} samples`);
    return [arm, { samples, attempts: samples.length, success: samples.filter((s) => s.success).length,
      wallSeconds: samples.reduce((s, v) => s + v.wallMs, 0) / samples.length / 1000 }];
  }));
  const reductions = (metric) => tasks.map(({ id }) => {
    const totals = ['baseline', 'groundwork'].map((arm) => arms[arm].samples.filter((s) => s.task === id).reduce((s, v) => s + v[metric], 0));
    if (!totals[0]) throw new Error(`Missing baseline output for ${id}`);
    return 100 * (totals[0] - totals[1]) / totals[0];
  });
  return { ...arms, reduction: interval(reductions('toolOutputBytes')), wallReduction: interval(reductions('wallMs')), tasks: tasks.length, runs: runs.size };
}

const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const t = (x, y, s, size = 16, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${escape(s)}</text>`;
const line = (x1, y1, x2, y2, color = '#bdc9c4', width = 1) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="${width}"/>`;
const f = (n) => n.toFixed(1);
function svg(title, subtitle, body, height, footer) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}" role="img" aria-labelledby="title desc"><title id="title">${escape(title)}</title><desc id="desc">${escape(subtitle + '. ' + footer)}</desc><rect width="800" height="${height}" rx="12" fill="#fbfaf3"/><g font-family="system-ui,sans-serif" fill="#112e2b">${t(28, 40, title, 25, 'font-weight="650"')}${t(28, 69, subtitle, 14)}${body}${t(28, height - 22, footer, 13)}</g></svg>\n`;
}
function whisker(x, y, low, high, color) {
  return line(x(low), y, x(high), y, color, 3) + line(x(low), y - 6, x(low), y + 6, color, 2) + line(x(high), y - 6, x(high), y + 6, color, 2);
}

export function generate() {
  const tasks = read('bench/nav/tasks.json').tasks;
  const initial = summarize(read('bench/nav/evidence-initial.json'), tasks);
  const nav = summarize(read('bench/nav/results/combined.evidence.json'), tasks);
  const lhEvidence = read('bench/long-horizon/results/combined.evidence.json');
  const lh = summarize(lhEvidence, read('bench/long-horizon/tasks.json').tasks);
  const reuse = read('bench/reuse-v2/report.json');
  const grounding = read('bench/grounding/results/report.json');
  const reductions = [['Navigation · initial', initial], ['Navigation · compact', nav], ['Long-horizon', lh]];
  const extent = Math.max(40, ...reductions.flatMap(([, s]) => [Math.abs(s.reduction.low), Math.abs(s.reduction.high)]));
  const bound = Math.ceil(extent / 20) * 20;
  const x = (v) => 300 + (v + bound) / (2 * bound) * 460;
  let body = line(x(0), 95, x(0), 315, '#526b60', 2);
  for (const tick of [-bound, -bound / 2, 0, bound / 2, bound]) body += t(x(tick), 342, `${tick}%`, 14, 'text-anchor="middle"');
  reductions.forEach(([label, s], i) => {
    const y = 121 + i * 80, r = s.reduction;
    body += t(28, y, label, 17) + t(28, y + 23, `${s.tasks} tasks × ${s.runs} runs; n=${s.baseline.attempts}/arm`, 13);
    body += whisker(x, y, r.low, r.high, '#16765a') + `<circle cx="${x(r.median)}" cy="${y}" r="6" fill="#16765a"/>`;
    body += t(300, y + 29, `${f(r.median)}% [${f(r.low)}, ${f(r.high)}]`, 15);
  });
  const charts = { 'token-reduction': svg('Estimated tool-output reduction', 'Estimated tool-output tokens (bytes/4), not billed model tokens', body, 405, '95% task-bootstrap intervals; positive = less output, negative = more output.') };
  body = '';
  const rateX = (v) => 260 + v * 480;
  for (const [i, arm] of ['baseline', 'groundwork'].entries()) {
    const d = reuse.arms[arm].duplicates, y = 126 + i * 100, color = i ? '#16765a' : '#9b542f';
    body += t(28, y, i ? 'GroundWork' : 'Baseline', 18) + t(28, y + 24, `${d.count}/${d.n} tasks`, 15);
    body += whisker(rateX, y, d.ci.low, d.ci.high, color) + `<circle cx="${rateX(d.rate)}" cy="${y}" r="6" fill="${color}"/>`;
    body += t(260, y + 32, `${f(d.rate * 100)}% [${f(d.ci.low * 100)}, ${f(d.ci.high * 100)}]`, 16);
  }
  for (const tick of [0, .25, .5, .75, 1]) body += t(rateX(tick), 293, `${tick * 100}%`, 14, 'text-anchor="middle"');
  charts['copied-code'] = svg('Reuse v2 · copied-code rate', 'Reviewed copied-code labels; 20 tasks per arm. Lower is better.', body, 350, 'Whiskers: 95% Wilson intervals. This measures copied code, not money saved.');
  body = '';
  const reuseSuccess = Object.fromEntries(['baseline', 'groundwork'].map((arm) => [arm, { success: reuse.arms[arm].success.count, attempts: reuse.arms[arm].success.n }]));
  const successes = [['Nav initial', initial], ['Nav compact', nav], ['Long-horizon', lh], ['Reuse v2', reuseSuccess], ['Grounding v3', { baseline: { success: grounding.arms.baseline.success.count, attempts: grounding.arms.baseline.success.total }, groundwork: { success: grounding.arms.groundwork.success.count, attempts: grounding.arms.groundwork.success.total } }]];
  successes.forEach(([label, s], i) => {
    const y = 114 + i * 65;
    body += t(28, y + 13, label, 16);
    ['baseline', 'groundwork'].forEach((arm, j) => {
      const d = s[arm], yy = y + j * 22;
      body += `<rect x="205" y="${yy - 12}" width="${390 * d.success / d.attempts}" height="15" fill="${j ? '#16765a' : '#9b542f'}"/>` + t(610, yy, `${d.success}/${d.attempts} (${f(100 * d.success / d.attempts)}%)`, 14);
    });
  });
  charts.success = svg('Task success · recorded outcomes', 'Baseline (brown, upper bar) / GroundWork (green, lower bar); axis 0–100%', body, 480, 'Separate suites, not pooled. Grounding v3: 0 wrong calls in both arms (15 tasks).');
  body = '';
  const wallScale = 370 / Math.max(1, nav.baseline.wallSeconds, nav.groundwork.wallSeconds, lh.baseline.wallSeconds, lh.groundwork.wallSeconds);
  [['Navigation · compact', nav], ['Long-horizon', lh]].forEach(([label, s], i) => {
    const y = 124 + i * 110;
    body += t(28, y, label, 17) + t(28, y + 24, `n=${s.baseline.attempts}/arm`, 14);
    ['baseline', 'groundwork'].forEach((arm, j) => {
      const v = s[arm].wallSeconds, yy = y + j * 32;
      body += `<rect x="275" y="${yy - 18}" width="${v * wallScale}" height="24" fill="${j ? '#16765a' : '#9b542f'}"/>` + t(285 + v * wallScale, yy, `${f(v)}s`, 16);
    });
  });
  body += t(28, 332, 'Median paired-task wall-time reduction · 95% bootstrap intervals', 18);
  const wallBound = Math.ceil(Math.max(20, ...[nav, lh].flatMap((s) => [Math.abs(s.wallReduction.low), Math.abs(s.wallReduction.high)])) / 20) * 20;
  const wallX = (v) => 310 + (v + wallBound) / (2 * wallBound) * 440;
  body += line(wallX(0), 350, wallX(0), 470, '#526b60', 2);
  [['Navigation · compact', nav], ['Long-horizon', lh]].forEach(([label, s], i) => {
    const y = 372 + i * 70, r = s.wallReduction;
    body += t(28, y, label, 16) + whisker(wallX, y, r.low, r.high, '#16765a') + `<circle cx="${wallX(r.median)}" cy="${y}" r="6" fill="#16765a"/>`;
    body += t(28, y + 24, `${f(r.median)}% [${f(r.low)}, ${f(r.high)}]`, 15);
  });
  for (const v of [-wallBound, 0, wallBound]) body += t(wallX(v), 494, `${v}%`, 13, 'text-anchor="middle"');
  charts['wall-time'] = svg('Wall time · means and paired reductions', 'Baseline (brown, upper bar) / GroundWork (green, lower bar); bars start at 0s', body, 560, 'Positive = faster; negative = slower. Task bootstrap, not independent-session variation.');
  for (const [name, content] of Object.entries(charts)) for (const dir of ['docs/assets/bench', 'website/public/bench']) {
    mkdirSync(path.join(root, dir), { recursive: true });
    writeFileSync(path.join(root, dir, `${name}.svg`), content);
  }
  const numbers = { reductions: Object.fromEntries(reductions.map(([label, s]) => [label, s.reduction])), wallReductions: { nav: nav.wallReduction, longHorizon: lh.wallReduction }, success: successes.map(([label, s]) => [label, ...['baseline', 'groundwork'].map((a) => `${s[a].success}/${s[a].attempts}`)]), copiedCode: Object.fromEntries(['baseline', 'groundwork'].map((a) => [a, reuse.arms[a].duplicates])), wallSeconds: { nav: [nav.baseline.wallSeconds, nav.groundwork.wallSeconds], longHorizon: [lh.baseline.wallSeconds, lh.groundwork.wallSeconds] }, wrongCalls: [grounding.arms.baseline.metrics.wrongCallsFinal.total, grounding.arms.groundwork.metrics.wrongCallsFinal.total] };
  console.log(JSON.stringify(numbers, null, 2));
  return numbers;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generate();
