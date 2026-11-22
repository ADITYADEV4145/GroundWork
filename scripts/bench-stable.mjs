import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshot = 'bench/HISTORICAL-SESSION-ANALYSIS.md';
const protocol = 'https://github.com/ADITYADEV4145/GroundWork/blob/01b142647e338ce557ef85bb7ef6c15e0c4f9257/bench/PROTOCOL.md';
const escape = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const markdownTable = (headings, rows) => `| ${headings.join(' | ')} |\n| ${headings.map(() => '---').join(' | ')} |\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`;
const htmlTable = (label, headings, rows) => `<div class="comparison-table" role="region" aria-label="${escape(label)}" tabindex="0"><table><thead><tr>${headings.map((h) => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => i ? `<td>${escape(c)}</td>` : `<th scope="row">${escape(c)}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;

export function historicalRows(report) {
  const lines = report.split('\n').filter((l) => l.startsWith('| '));
  const rows = lines.slice(2).map((l) => l.split('|').slice(1, -1).map((s) => s.trim()));
  const expected = new Set(['nav', 'long-horizon'].flatMap((suite) => ['original', 'v2', 'v3', 'v4', 'v5', 'v6'].map((round) => `${suite}/${round}`)));
  const seen = new Set();
  const metric = /^\d+\.\d{2} → \d+\.\d{2}; -?\d+\.\d% \[-?\d+\.\d, -?\d+\.\d\]$/;
  for (const row of rows) {
    const [suite, round, elapsed, bytes, tools, success, guard] = row;
    const key = `${suite}/${round}`;
    if (row.length !== 7 || !expected.has(key) || seen.has(key) || !metric.test(elapsed) || !metric.test(bytes) || tools !== 'unavailable' || !/^\d+\/\d+ \/ \d+\/\d+$/.test(success) || !['met', 'NOT MET'].includes(guard)) throw new Error('Invalid historical session report');
    seen.add(key);
  }
  if (seen.size !== 12) throw new Error('Expected all 12 historical session rows');
  return rows;
}

export function loadV7(base = root) {
  const files = ['nav', 'long-horizon'].map((s) => path.join(base, 'bench', s, 'v7/results/combined.json'));
  if (files.every((f) => !existsSync(f))) return null;
  if (files.some((f) => !existsSync(f))) throw new Error('Both v7 reports are required');
  return files.map((f, i) => {
    const reports = JSON.parse(readFileSync(f, 'utf8'));
    const { summary, evidence } = reports[0];
    const suite = ['nav', 'long-horizon'][i];
    if (reports.length !== 1 || summary.suite !== suite || summary.runs !== 16 || evidence.captures.length !== 32 || summary.sessionPrimary?.basis !== 'recorded-session') throw new Error('Invalid v7 report');
    for (const arm of ['baseline', 'groundwork']) {
      const cs = evidence.captures.filter((c) => c.condition === arm);
      if (cs.length !== 16 || new Set(cs.map((c) => c.run)).size !== 16 || cs.some((c) => c.run < 1 || c.run > 16 || c.captureRevision !== '01b142647e338ce557ef85bb7ef6c15e0c4f9257' || c.protocol !== 'stable-v1' || c.samples.length !== (i ? 10 : 30))) throw new Error('Invalid v7 provenance');
    }
    for (const key of ['elapsedMsPerTask', 'emittedBytesPerSession', 'toolSideMsPerSession']) {
      const m = summary.sessionPrimary[key];
      if (!m || ![m.baselineMean, m.groundworkMean, m.reductionPct?.median, m.reductionPct?.low, m.reductionPct?.high, m.reductionPct?.adjustedLow].every(Number.isFinite) || m.reductionPct.low > m.reductionPct.high) throw new Error('Missing v7 primary metric');
      const means = ['baseline', 'groundwork'].map((arm) => evidence.captures.filter((c) => c.condition === arm).reduce((n, c) => n + (key === 'elapsedMsPerTask' ? (c.sessionEndedAt - c.sessionStartedAt) / c.samples.length : c.samples.reduce((n, s) => n + s[key === 'emittedBytesPerSession' ? 'toolOutputBytes' : 'toolSideMs'], 0)), 0) / 16);
      const same = (a, b) => Math.abs(a - b) < 1e-8 * Math.max(1, Math.abs(a));
      if (!same(means[0], m.baselineMean) || !same(means[1], m.groundworkMean) || !same(100 * (1 - means[1] / means[0]), m.reductionPct.median)) throw new Error('Inconsistent v7 primary metric');
    }
    return summary;
  });
}

export function sections(report, results = null) {
  const rows = historicalRows(report);
  const title = 'Stable protocol (v7)';
  const status = 'Pending — v7 collection is in progress. No v7 results are published yet. There are 16 independent sessions per arm per suite (64 sessions total); the product under test is main at e0cad99, with collector 01b1426 and experimental read paths off.';
  const estimands = 'Pre-registered primary estimands are session elapsed/task (ms), aggregate emitted UTF-8 bytes/session, and total tool-side ms/session. Each cost cell will show baseline mean → GroundWork mean and reduction = 100 × (1 − GW mean / baseline mean), with a 95% whole-session bootstrap CI: 10,000 draws per arm, fixed seed 0x51ab17ed. Positive reduction favors GroundWork. Success is a guardrail (no category success drop); confirmatory latency claims also require the protocol’s multiplicity rule. Old median task-window metrics remain secondary.';
  const clock = 'The harness starts the v7 session clock once the first workspace is ready, before revealing tasks, and ends it at the last finish. Inter-task gaps are included; provisioning, install/build and pre-init instructions are excluded. Tool-side time sums serial dispatch spans, including hooks and transport, but excludes CLI startup before dispatch and final output delivery. This is not a clock around the entire outer agent call.';
  const why = 'Why change? Agent-owned begin→finish windows can include or exclude planning and turn latency depending on command batching. In archived v6 long-horizon runs, excluded gaps were about 50% of the baseline’s observed first-begin→last-finish span versus 11% of GroundWork’s. These figures show measurement-window allocation, not identified thinking/provider latency or a performance win.';
  const caveat = 'Post-hoc sensitivity only, not v7 results and not a replacement for the published historical rows below. Elapsed is a first-begin→last-finish envelope proxy reconstructed from old records, not pre-disclosure controller timing. Ratios of arm means use eight sessions/arm and 95% whole-session bootstrap CIs with the same seed/draw count. Historical tool-side time is unavailable. B = baseline; GW = GroundWork. Rounds changed products/protocols and are not pooled. Bytes are tool output, not billed model tokens or dollar savings.';
  const headings = ['Suite', 'Success guardrail', 'Session elapsed/task (ms)', 'Emitted bytes/session', 'Tool-side ms/session'];
  const pending = ['Navigation', 'Long-horizon'].map((suite) => [suite, 'Pending', 'Pending', 'Pending', 'Pending']);
  const resultHeadings = ['Suite', 'Estimand', 'Baseline mean', 'GroundWork mean', 'Reduction [95% CI]', 'Success guardrail'];
  const resultRows = results?.flatMap((s) => [['Session elapsed/task (ms)', 'elapsedMsPerTask'], ['Emitted bytes/session', 'emittedBytesPerSession'], ['Tool-side ms/session', 'toolSideMsPerSession']].map(([label, key]) => {
    const m = s.sessionPrimary[key], c = m.reductionPct;
    return [s.suite, label, m.baselineMean.toFixed(2), m.groundworkMean.toFixed(2), `${c.median.toFixed(1)}% [${c.low.toFixed(1)}, ${c.high.toFixed(1)}]`, `${s.noSuccessDrop ? 'met' : 'NOT MET'}: ${s.baseline.success}/${s.baseline.attempts} / ${s.groundwork.success}/${s.groundwork.attempts}`];
  }));
  const completedStatus = 'Completed: 16 sessions per arm per suite (64 total), collector 01b1426; product main at e0cad99, experimental read paths off. All submitted sessions are retained.';
  const interpretation = results?.map((s) => {
    const p = s.sessionPrimary;
    const describe = (m) => m.reductionPct.low > 0 ? 'reduced cost (nominal 95% CI excludes zero)' : m.reductionPct.high < 0 ? 'increased cost (nominal 95% CI excludes zero)' : 'inconclusive (95% CI includes zero)';
    return `${s.suite}: session elapsed ${describe(p.elapsedMsPerTask)}; emitted output ${describe(p.emittedBytesPerSession)}; tool-side time ${describe(p.toolSideMsPerSession)}. Success guardrail ${s.noSuccessDrop ? 'met' : 'NOT MET'}. Multiplicity-adjusted latency lower bound: ${p.elapsedMsPerTask.reductionPct.adjustedLow.toFixed(1)}%; ${s.noSuccessDrop && p.elapsedMsPerTask.reductionPct.adjustedLow > 0 ? 'confirmatory latency-win criterion met' : 'no confirmatory latency win'}.`;
  }).join(' ');
  const historyHeadings = ['Suite', 'Archive', 'Envelope s/task B → GW; reduction [95% CI]', 'Bytes/session B → GW; reduction [95% CI]', 'Tool-side time', 'Success B / GW', 'Guardrail'];
  const content = {
    markdown: `### ${title}\n\n${status}\n\n${estimands}\n\n${markdownTable(headings, pending)}\n\n${clock}\n\n${why}\n\n[Pre-registered protocol](${protocol}).\n\n#### Post-hoc historical envelope re-analysis (not v7)\n\n${caveat}\n\n${markdownTable(historyHeadings, rows)}\n\nFrozen report: [historical session analysis](${snapshot}); reproduce with \`node scripts/bench-historical.mjs OUTPUT.md\` after building the collector.\n\n### Historical published results (original analysis)\n`,
    html: `<h2 id="stable-protocol-v7">${title}</h2>\n<p>${escape(status)}</p>\n<p>${escape(estimands)}</p>\n${htmlTable('Stable protocol v7 pending results', headings, pending)}\n<p>${escape(clock)}</p>\n<p>${escape(why)}</p>\n<p><a href="${protocol}">Pre-registered protocol</a>.</p>\n<h3>Post-hoc historical envelope re-analysis (not v7)</h3>\n<p>${escape(caveat)}</p>\n${htmlTable('Post-hoc historical session analysis, not v7', historyHeadings, rows)}\n`,
  };
  if (results) {
    const notes = 'V7 workflow notes (64 reviewed, including all 10 mentioning failed/error): early cwd/env/usage failures and retries, including harness-source inspection by LH GW-2/7; repeated orientation and begin attempts; external scratch/staged scripts and command files; captured shell cat/sed reads; AGENTS-seeded names and carried evidence; two captured invalid read_symbols calls; a similarity check after writing, new shared helpers without similarity checks, confirmation-based verify_calls skips, and uneven smoke testing. Sequential command chaining was also reported. All sessions remain included; these are not perfectly uniform executions. Session elapsed includes post-init retry/gap time, but uncaptured outputs and work before init remain unmeasured. Captured tool spans do not separate daemon, relay and hook subcomponents.';
    content.markdown = content.markdown.replace(status, completedStatus).replace(markdownTable(headings, pending), markdownTable(resultHeadings, resultRows) + '\n\n' + interpretation + '\n\n' + notes + '\n\n[Tool-side totals and deviation review](bench/V7-ANALYSIS.md).').replace('Each cost cell will show', 'Each metric row reports');
    content.html = content.html.replace(escape(status), escape(completedStatus)).replace(htmlTable('Stable protocol v7 pending results', headings, pending), htmlTable('Stable protocol v7 primary results', resultHeadings, resultRows) + `\n<p>${escape(interpretation)}</p>\n<p>${escape(notes)}</p>\n<p><a href="https://github.com/ADITYADEV4145/GroundWork/blob/main/bench/V7-ANALYSIS.md">Tool-side totals and deviation review</a>.</p>`).replace('Each cost cell will show', 'Each metric row reports');
  }
  return content;
}

export function generateStable(base = root) {
  const content = sections(readFileSync(path.join(base, snapshot), 'utf8'), loadV7(base));
  const pages = [['README.md', content.markdown], ['website/public/benchmarks.html', content.html]].map(([file, section]) => {
    const target = path.join(base, file), previous = readFileSync(target, 'utf8');
    const start = '<!-- stable-protocol:start -->', end = '<!-- stable-protocol:end -->';
    if (previous.split(start).length !== 2 || previous.split(end).length !== 2 || previous.indexOf(end) < previous.indexOf(start)) throw new Error(`Missing or duplicate stable protocol markers in ${file}`);
    return [target, previous.slice(0, previous.indexOf(start) + start.length) + '\n' + section + previous.slice(previous.indexOf(end))];
  });
  for (const [target, content] of pages) writeFileSync(target, content);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generateStable();
