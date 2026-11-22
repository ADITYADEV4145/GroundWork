import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize } from './bench-charts.mjs';

export const AFTER_REVISION = 'e605fe9559cae088a2060a4ed53a27c32daa4df9';
export const ROUND2_REVISION = 'abafcba361f358b61e54fc906977209e494cf07a';
export const ROUND3_REVISION = 'ff578514d78397faffd2ac1836fb3cbd03e62ee1';
export const EXPERIMENTS = [
  { id: 'before', directory: '', name: 'original' },
  { id: 'after', directory: 'v2', name: 'round 1', revision: AFTER_REVISION },
  { id: 'round2', directory: 'v3', name: 'round 2', revision: ROUND2_REVISION },
  { id: 'round3', directory: 'v4', name: 'Round 3 at ff57851', revision: ROUND3_REVISION },
];
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (base, file) => JSON.parse(readFileSync(path.join(base, file), 'utf8'));
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const ci = (value) => `${value.median.toFixed(1)}% [${value.low.toFixed(1)}, ${value.high.toFixed(1)}]`;
const count = (arm) => `${arm.success}/${arm.attempts}`;
const mean = (arm) => `${(arm.wallMs / arm.attempts / 1000).toFixed(2)}s`;
const text = (x, y, value, size = 16) => `<text x="${x}" y="${y}" font-size="${size}">${escape(value)}</text>`;
const line = (x1, y1, x2, y2, color = '#60786e') => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="2"/>`;
const chartHeights = (rows) => ({ main: 150 + rows.length * 95, wall: 260 + rows.length * 170 });
const note = `Round 1 (v2, ${AFTER_REVISION}): LH GroundWork used revised guidance (fewer required calls); navigation guidance was unchanged except the revision. Round 2 (v3, ${ROUND2_REVISION}): the GroundWork arm prompts mirrored the new SKILL.md guidance: rg for trivial lookups, exact-first find_code, actionable-only find_similar, and verify_calls only for unconfirmed cross-file calls. Round 3 (v4, ${ROUND3_REVISION}): GroundWork navigation prompts mirror explore-first traces, opt-in find_code bodies, batched read_symbol and carried unchanged evidence; long-horizon prompts mirror cross-step/session reuse and batched verify_calls instead of verification-only rereads. The navigation capture allowlist adds explore; graders are unchanged. Each round is a protocol change as well as a tool change; baselines were re-collected at that round’s commit in completed experiments. Round 3 also requires fresh baselines at its pinned commit. Do not attribute differences solely to implementation changes.`;
const deviations = 'V2 protocol deviations: LH groundwork-4 and baseline-7 were executed by the session’s sidekick subagent using the same wrappers. LH groundwork-3 and groundwork-7 skipped verify_calls despite new cross-file calls. These are recorded executions, not perfectly uniform protocol adherence. The merged code also includes a later verify_calls budget fix for many unchecked files; that fix was not part of the measured e605fe9 runs.';
const round2Notes = 'V3 session notes: several GroundWork long-horizon runs skipped find_similar for small shared helpers and made no verify_calls because the targets had already been read, following the new guidance as written. A few sessions had early wrapper failures from incorrect working directories or environment variables; these were retried before work. One navigation GroundWork where_used validation error was not retried, and one navigation GroundWork session read a whole file using shell cat. These are recorded executions, not perfectly uniform tool use; wrapper failures and shell reads should not be silently treated as successful indexed navigation.';
const round3Notes = 'V4 workflow session notes: several GroundWork outline calls failed on path/files arguments instead of file, with corrected retries; early cwd/environment setup failures were also retried, sometimes before reaching capture. Navigation baseline-4 and GroundWork-8 used shell cat instead of the read wrapper; GroundWork-1/6 used shell sed for source ranges. These reads still went through the shell wrapper. Several navigation GroundWork runs seeded names from AGENTS.md or earlier tasks, then checked them with current-task tools. Some runs used local wrapper helpers, sequentially chained calls, or scripts staged outside the workspace; LH GroundWork-2 also wrote an unused /tmp/t4.mjs. Navigation GroundWork-1 used repo_map depth 2, and LH GroundWork-3 repeated an unchanged helper lookup. LH GroundWork-5 skipped similarity checks for compositions of confirmed helpers; LH GroundWork-4 skipped explicit verification after read_symbol confirmation. These are recorded executions, not perfectly uniform protocol adherence. Work outside wrappers or task timers is unmeasured; shell writes still do not dispatch edit or Stop hooks.';

export function loadComparison(base = root) {
  const available = new Map(EXPERIMENTS.map(({ directory }) => {
    const present = ['nav', 'long-horizon'].map((suite) => existsSync(path.join(base, 'bench', suite, directory, 'results/combined.json')));
    if (present[0] !== present[1]) throw new Error(`Both ${directory || 'original'} suite reports are required; refusing a partial comparison`);
    return [directory, present[0]];
  }));
  return ['nav', 'long-horizon'].flatMap((suite) => EXPERIMENTS.map(({ id: experiment, directory, name, revision }) => {
    const label = `${suite === 'nav' ? 'Compact nav' : 'Long-horizon'} · ${name}`;
    if (directory && !available.get(directory)) return { suite, experiment, label, summary: null };
    const reports = read(base, path.join('bench', suite, directory, 'results/combined.json'));
    if (reports.length !== 1) throw new Error(`Expected one ${label} report`);
    const { summary, evidence } = reports[0];
    const actual = summarize(evidence, read(base, `bench/${suite}/tasks.json`).tasks);
    if (summary.suite !== suite || summary.runs !== 8 || actual.runs !== 8 ||
      JSON.stringify(actual.reduction) !== JSON.stringify(summary.estimatedToolOutputReductionPct) ||
      JSON.stringify(actual.wallReduction) !== JSON.stringify(summary.wallTimeReductionPct) ||
      ['baseline', 'groundwork'].some((arm) => actual[arm].success !== summary[arm].success || actual[arm].attempts !== summary[arm].attempts || actual[arm].wallSeconds !== summary[arm].wallMs / summary[arm].attempts / 1000)) throw new Error(`Inconsistent eight-run ${label} report`);
    if (revision && evidence.captures.some((capture) => capture.captureRevision !== revision)) throw new Error(`Unexpected ${directory} capture revision for ${suite}`);
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
  const heights = chartHeights(rows);
  const headings = ['Eight-run suite / experiment', 'Success, baseline / GroundWork', 'Estimated-output reduction, median [95% CI]', 'Mean wall time, baseline → GroundWork', 'Wall-time reduction, median [95% CI]'];
  const cells = tableRows(rows);
  const direction = (value, positive, negative) => value.low > 0 ? `excludes zero toward ${positive}` : value.high < 0 ? `excludes zero toward ${negative}` : 'includes zero (no significant change under this analysis)';
  const interpretation = rows.filter((row) => row.experiment !== 'before' && row.summary).map(({ label, summary }) => `${label}: the estimated-output interval ${direction(summary.estimatedToolOutputReductionPct, 'less output', 'more output')}; the wall-time interval ${direction(summary.wallTimeReductionPct, 'faster execution', 'slower execution')}.`).join(' ');
  const missing = EXPERIMENTS.filter(({ id }) => rows.some((row) => row.experiment === id && !row.summary)).map(({ name }) => name);
  const pending = missing.length ? `${missing.join(' and ')} results are pending; no measurements for those experiments are published yet. Completed experiments remain separate.` : 'Each experiment contains eight fresh paired runs per task; experiments are not pooled.';
  const sessionNotes = [deviations, ...(rows.some((row) => row.experiment === 'round2' && row.summary) ? [round2Notes] : []), ...(rows.some((row) => row.experiment === 'round3' && row.summary) ? [round3Notes] : [])].join('\n\n');
  const caveat = 'Estimated output is bytes/4, not billed model tokens; no dollar savings are established. Positive reductions mean less output or faster execution; negative means more output or slower execution. Intervals resample paired tasks after summing repeats, not independent sessions. Mean times and median percentage reductions are different estimands. Separate intervals do not test the before/after difference; sequential LH tasks share context.';
  const charts = [['output', 'Estimated tool-output reductions across four experiments'], ['wall', 'Mean wall times and paired-task reduction intervals across four experiments'], ['success', 'Baseline and GroundWork success across four experiments']];
  return {
    markdown: `### Original / round 1 / round 2 / round 3 overhead experiments\n\n${pending}\n\n${note}\n\n${sessionNotes}\n\n| ${headings.join(' | ')} |\n| ${headings.map(() => '---').join(' | ')} |\n${cells.map((row) => `| ${row.join(' | ')} |`).join('\n')}\n\n${interpretation}\n\n${caveat}\n\n${charts.map(([name, alt]) => `![${alt}](docs/assets/bench/before-after-${name}.svg)`).join('\n\n')}\n`,
    html: `<h2>Original / round 1 / round 2 / round 3 overhead experiments</h2>\n<p>${pending}</p>\n<p>${escape(note)}</p>\n${sessionNotes.split('\n\n').map((paragraph) => `<p>${escape(paragraph)}</p>`).join('\n')}\n<div class="comparison-table" role="region" aria-label="Four-experiment results" tabindex="0"><table><thead><tr>${headings.map((h) => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${cells.map((row) => `<tr>${row.map((cell, i) => i ? `<td>${escape(cell)}</td>` : `<th scope="row">${escape(cell)}</th>`).join('')}</tr>`).join('')}</tbody></table></div>\n<p>${interpretation}</p>\n<p>${caveat}</p>\n<div class="bench-grid">${charts.map(([name, alt]) => `<figure><a href="./bench/before-after-${name}.svg"><img src="./bench/before-after-${name}.svg" width="800" height="${name === 'wall' ? heights.wall : heights.main}" alt="${alt}"></a><figcaption>${alt}. ${name === 'wall' ? 'Bars are means; whiskers are median percentage reductions, not intervals around mean bars.' : name === 'output' ? 'Whiskers are 95% paired-task bootstrap intervals.' : 'Counts are shown separately for both arms; no success advantage is assumed.'}</figcaption></figure>`).join('')}</div>\n`,
  };
}

export function comparisonCharts(rows) {
  const heights = chartHeights(rows);
  const svg = (title, body, height, subtitle) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}" role="img" aria-labelledby="title desc"><title id="title">${escape(title)}</title><desc id="desc">${escape(subtitle)}</desc><rect width="800" height="${height}" rx="12" fill="#fbfaf3"/><g font-family="system-ui,sans-serif" fill="#112e2b">${text(24, 40, title, 25)}${text(24, 70, subtitle, 13)}${body}${text(24, height - 20, '8 runs/arm · task bootstrap, not independent-session variation · LH protocol changed', 12)}</g></svg>\n`;
  const color = (row) => ({ before: '#385e97', after: '#16765a', round2: '#85549c', round3: '#b06b24' })[row.experiment];
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
  const output = svg('Four experiments · estimated output', reduction('estimatedToolOutputReductionPct', 125, 95, heights.main - 55), heights.main, 'Bytes/4, not billed tokens · positive = less output · 95% task-bootstrap intervals');
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
      success += `<rect x="300" y="${yy - 13}" width="${300 * d.success / d.attempts}" height="18" fill="${c}"/>` + text(615, yy, count(d), 15);
      const seconds = d.wallMs / d.attempts / 1000, width = seconds / max * 300;
      wall += `<rect x="300" y="${yy - 13}" width="${width}" height="18" fill="${c}"/>` + text(310 + width, yy, mean(d), 15);
    });
  });
  wall += text(24, heights.main + 15, 'Median paired-task wall-time reductions [95% CI]', 20) + reduction('wallTimeReductionPct', heights.main + 65, 75, heights.wall - 70);
  return { output, success: svg('Four experiments · task success', success, heights.main, 'Baseline (brown, upper) / GroundWork (green, lower) · bars 0–100%'),
    wall: svg('Four experiments · wall time', wall, heights.wall, 'Baseline (brown, upper) / GroundWork (green, lower) · mean bars start at 0 seconds') };
}

export function generateComparison(base = root) {
  const rows = loadComparison(base), content = sections(rows);
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
