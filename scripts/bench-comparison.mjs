import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize } from './bench-charts.mjs';

export const AFTER_REVISION = 'e605fe9559cae088a2060a4ed53a27c32daa4df9';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (base, file) => JSON.parse(readFileSync(path.join(base, file), 'utf8'));
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const ci = (value) => `${value.median.toFixed(1)}% [${value.low.toFixed(1)}, ${value.high.toFixed(1)}]`;
const count = (arm) => `${arm.success}/${arm.attempts}`;
const mean = (arm) => `${(arm.wallMs / arm.attempts / 1000).toFixed(2)}s`;
const text = (x, y, value, size = 16) => `<text x="${x}" y="${y}" font-size="${size}">${escape(value)}</text>`;
const line = (x1, y1, x2, y2, color = '#60786e') => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="2"/>`;
const note = 'After LH GroundWork used revised guidance (fewer required calls): this is a protocol change as well as a tool change. Baselines were re-collected at the new commit. Do not attribute before/after differences solely to implementation changes.';
const deviations = 'V2 protocol deviations: LH groundwork-4 and baseline-7 were executed by the session’s sidekick subagent using the same wrappers. LH groundwork-3 and groundwork-7 skipped verify_calls despite new cross-file calls. These are recorded executions, not perfectly uniform protocol adherence. The merged code also includes a later verify_calls budget fix for many unchecked files; that fix was not part of the measured e605fe9 runs.';

export function loadComparison(base = root, revision = AFTER_REVISION) {
  const present = ['nav', 'long-horizon'].map((suite) => existsSync(path.join(base, `bench/${suite}/v2/results/combined.json`)));
  if (present[0] !== present[1]) throw new Error('Both v2 suite reports are required; refusing a partial comparison');
  return ['nav', 'long-horizon'].flatMap((suite) => ['before', 'after'].map((experiment) => {
    const label = `${suite === 'nav' ? 'Compact navigation' : 'Long-horizon'} · ${experiment}`;
    if (experiment === 'after' && !present[0]) return { suite, experiment, label, summary: null };
    const reports = read(base, `bench/${suite}/${experiment === 'after' ? 'v2/' : ''}results/combined.json`);
    if (reports.length !== 1) throw new Error(`Expected one ${label} report`);
    const { summary, evidence } = reports[0];
    const actual = summarize(evidence, read(base, `bench/${suite}/tasks.json`).tasks);
    if (summary.suite !== suite || summary.runs !== 8 || actual.runs !== 8 ||
      JSON.stringify(actual.reduction) !== JSON.stringify(summary.estimatedToolOutputReductionPct) ||
      JSON.stringify(actual.wallReduction) !== JSON.stringify(summary.wallTimeReductionPct) ||
      ['baseline', 'groundwork'].some((arm) => actual[arm].success !== summary[arm].success || actual[arm].attempts !== summary[arm].attempts || actual[arm].wallSeconds !== summary[arm].wallMs / summary[arm].attempts / 1000)) throw new Error(`Inconsistent eight-run ${label} report`);
    if (experiment === 'after' && evidence.captures.some((capture) => capture.captureRevision !== revision)) throw new Error(`Unexpected after capture revision for ${suite}`);
    return { suite, experiment, label, summary };
  }));
}

export function tableRows(rows) {
  return rows.map(({ label, summary: s }) => [label, ...(s ? [
    `${count(s.baseline)} / ${count(s.groundwork)}`, ci(s.estimatedToolOutputReductionPct),
    `${mean(s.baseline)} → ${mean(s.groundwork)}`, ci(s.wallTimeReductionPct),
  ] : ['Pending', 'Pending', 'Pending', 'Pending'])]);
}

export function sections(rows) {
  const headings = ['Eight-run suite / experiment', 'Success, baseline / GroundWork', 'Estimated-output reduction, median [95% CI]', 'Mean wall time, baseline → GroundWork', 'Wall-time reduction, median [95% CI]'];
  const cells = tableRows(rows);
  const direction = (value, positive, negative) => value.low > 0 ? `excludes zero toward ${positive}` : value.high < 0 ? `excludes zero toward ${negative}` : 'includes zero (no significant change under this analysis)';
  const interpretation = rows.filter((row) => row.experiment === 'after' && row.summary).map(({ suite, summary }) => `After ${suite === 'nav' ? 'compact navigation' : 'long-horizon'}: the estimated-output interval ${direction(summary.estimatedToolOutputReductionPct, 'less output', 'more output')}; the wall-time interval ${direction(summary.wallTimeReductionPct, 'faster execution', 'slower execution')}.`).join(' ');
  const pending = rows.some((r) => !r.summary) ? 'After results are pending; no post-fix measurements are published yet.' : 'Each experiment contains eight fresh paired runs per task; before and after are not pooled.';
  const caveat = 'Estimated output is bytes/4, not billed model tokens; no dollar savings are established. Positive reductions mean less output or faster execution; negative means more output or slower execution. Intervals resample paired tasks after summing repeats, not independent sessions. Mean times and median percentage reductions are different estimands. Separate intervals do not test the before/after difference; sequential LH tasks share context.';
  const charts = [['output', 'Estimated tool-output reductions before and after'], ['wall', 'Mean wall times and paired-task reduction intervals before and after'], ['success', 'Baseline and GroundWork success before and after']];
  return {
    markdown: `### Before / after overhead fixes\n\n${pending}\n\n${note}\nCollector/tool revision for after: \`${AFTER_REVISION}\`. Navigation guidance is unchanged except the revision.\n\n${deviations}\n\n| ${headings.join(' | ')} |\n| ${headings.map(() => '---').join(' | ')} |\n${cells.map((row) => `| ${row.join(' | ')} |`).join('\n')}\n\n${interpretation}\n\n${caveat}\n\n${charts.map(([name, alt]) => `![${alt}](docs/assets/bench/before-after-${name}.svg)`).join('\n\n')}\n`,
    html: `<h2>Before / after overhead fixes</h2>\n<p>${pending}</p>\n<p>${note} Collector/tool revision for after: <code>${AFTER_REVISION}</code>. Navigation guidance is unchanged except the revision.</p>\n<p>${deviations}</p>\n<div class="comparison-table" role="region" aria-label="Before and after results" tabindex="0"><table><thead><tr>${headings.map((h) => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${cells.map((row) => `<tr>${row.map((cell, i) => i ? `<td>${escape(cell)}</td>` : `<th scope="row">${escape(cell)}</th>`).join('')}</tr>`).join('')}</tbody></table></div>\n<p>${interpretation}</p>\n<p>${caveat}</p>\n<div class="bench-grid">${charts.map(([name, alt]) => `<figure><a href="./bench/before-after-${name}.svg"><img src="./bench/before-after-${name}.svg" width="800" height="${name === 'wall' ? 900 : 530}" alt="${alt}"></a><figcaption>${alt}. ${name === 'wall' ? 'Bars are means; whiskers are median percentage reductions, not intervals around mean bars.' : name === 'output' ? 'Whiskers are 95% paired-task bootstrap intervals.' : 'Counts are shown separately for both arms; no success advantage is assumed.'}</figcaption></figure>`).join('')}</div>\n`,
  };
}

export function comparisonCharts(rows) {
  const svg = (title, body, height, subtitle) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}" role="img" aria-labelledby="title desc"><title id="title">${escape(title)}</title><desc id="desc">${escape(subtitle)}</desc><rect width="800" height="${height}" rx="12" fill="#fbfaf3"/><g font-family="system-ui,sans-serif" fill="#112e2b">${text(24, 40, title, 25)}${text(24, 70, subtitle, 13)}${body}${text(24, height - 20, '8 runs/arm · task bootstrap, not independent-session variation · LH protocol changed', 12)}</g></svg>\n`;
  const color = (row) => row.experiment === 'before' ? '#385e97' : '#16765a';
  const pending = (y) => text(300, y, 'Pending fresh eight-run results', 16);
  const whisker = (x, y, r, c) => line(x(r.low), y, x(r.high), y, c) + line(x(r.low), y - 6, x(r.low), y + 6, c) + line(x(r.high), y - 6, x(r.high), y + 6, c) + `<circle cx="${x(r.median)}" cy="${y}" r="6" fill="${c}"/>`;
  const reduction = (key, top, step, axisY) => {
    const bound = Math.ceil(Math.max(40, ...rows.filter((r) => r.summary).flatMap((r) => [Math.abs(r.summary[key].low), Math.abs(r.summary[key].high)])) / 20) * 20;
    const x = (v) => 300 + (v + bound) / (2 * bound) * 460;
    let body = line(x(0), top - 25, x(0), axisY - 20, '#bdc9c4');
    rows.forEach((row, i) => {
      const y = top + i * step;
      body += text(24, y, row.label, 16);
      if (!row.summary) body += pending(y + 25);
      else body += text(24, y + 22, `n=${row.summary.baseline.attempts}/arm`, 13) + whisker(x, y, row.summary[key], color(row)) + text(300, y + 26, ci(row.summary[key]), 15);
    });
    for (const tick of [-bound, 0, bound]) body += text(x(tick) - 14, axisY, `${tick}%`, 13);
    return body;
  };
  const output = svg('Before / after · estimated output', reduction('estimatedToolOutputReductionPct', 125, 95, 475), 530, 'Bytes/4, not billed tokens · positive = less output · 95% task-bootstrap intervals');
  let success = '';
  let wall = '';
  const max = Math.max(1, ...rows.filter((r) => r.summary).flatMap((r) => ['baseline', 'groundwork'].map((arm) => r.summary[arm].wallMs / r.summary[arm].attempts / 1000)));
  rows.forEach((row, i) => {
    const y = 125 + i * 95;
    success += text(24, y, row.label, 16);
    wall += text(24, y, row.label, 16);
    if (!row.summary) { success += pending(y + 24); wall += pending(y + 24); return; }
    ['baseline', 'groundwork'].forEach((arm, j) => {
      const d = row.summary[arm], yy = y + j * 26, c = j ? '#16765a' : '#9b542f';
      success += `<rect x="245" y="${yy - 13}" width="${340 * d.success / d.attempts}" height="18" fill="${c}"/>` + text(600, yy, count(d), 15);
      const seconds = d.wallMs / d.attempts / 1000, width = seconds / max * 340;
      wall += `<rect x="245" y="${yy - 13}" width="${width}" height="18" fill="${c}"/>` + text(255 + width, yy, mean(d), 15);
    });
  });
  wall += text(24, 535, 'Median paired-task wall-time reductions [95% CI]', 20) + reduction('wallTimeReductionPct', 585, 65, 830);
  return { output, success: svg('Before / after · task success', success, 530, 'Baseline (brown, upper) / GroundWork (green, lower) · bars 0–100%'),
    wall: svg('Before / after · wall time', wall, 900, 'Baseline (brown, upper) / GroundWork (green, lower) · mean bars start at 0 seconds') };
}

export function generateComparison(base = root, revision = AFTER_REVISION) {
  const rows = loadComparison(base, revision), content = sections(rows);
  const pages = [['README.md', content.markdown], ['website/public/benchmarks.html', content.html]].map(([file, section]) => {
    const target = path.join(base, file), previous = readFileSync(target, 'utf8');
    const start = '<!-- overhead-comparison:start -->', end = '<!-- overhead-comparison:end -->';
    if (!previous.includes(start) || !previous.includes(end)) throw new Error(`Missing comparison markers in ${file}`);
    return [target, previous.slice(0, previous.indexOf(start) + start.length) + '\n' + section + previous.slice(previous.indexOf(end))];
  });
  for (const [target, value] of pages) writeFileSync(target, value);
  for (const [name, chart] of Object.entries(comparisonCharts(rows))) for (const dir of ['docs/assets/bench', 'website/public/bench']) {
    mkdirSync(path.join(base, dir), { recursive: true });
    writeFileSync(path.join(base, dir, `before-after-${name}.svg`), chart);
  }
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generateComparison();
