import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ModuleGraph } from '../index/query.js';
import { gwPath, toPosix } from '../util/paths.js';

// `gw view`: one self-contained HTML file (no network, no server) with the module graph
// and where the last agent session was blocked or warned.

export interface SessionBlock {
  /** What stopped or warned the agent, e.g. `duplicate`, `grounding:type`, `read-guard`. */
  kind: string;
  file: string;
  line: number | null;
  symbol: string | null;
  outcome: 'blocked' | 'warned';
  at: string;
}

export interface LastSession { sessionId: string | null; blocks: SessionBlock[] }

export interface ViewNode { id: string; files: number; lines: number; language: string | null; blocks: number }
export interface ViewModel {
  /** 'file' when every file is a node, 'directory' when the repo is large and files are grouped. */
  granularity: 'file' | 'directory';
  nodes: ViewNode[];
  edges: { from: string; to: string; weight: number }[];
  session: LastSession;
}

const MAX_FILE_NODES = 400;

function relative(root: string, file: string): string {
  return toPosix(path.isAbsolute(file) ? path.relative(root, file) : file);
}

/** Blocks and warnings of the most recent session that has any, read from .groundwork/logs/groundwork.log. */
export function lastSessionBlocks(root: string): LastSession {
  let text: string;
  try {
    text = readFileSync(gwPath(root, 'logs', 'groundwork.log'), 'utf8');
  } catch {
    return { sessionId: null, blocks: [] };
  }
  const all: (SessionBlock & { sessionId: string | null })[] = [];
  for (const line of text.split('\n')) {
    if (!line.includes('"duplicate_gate"') && !line.includes('"read_guard_blocked"')) continue;
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const sessionId = typeof e.sessionId === 'string' ? e.sessionId : null;
    const at = String(e.t ?? '');
    if (e.event === 'read_guard_blocked' && typeof e.file === 'string')
      all.push({ sessionId, kind: 'read-guard', file: relative(root, e.file), line: typeof e.from === 'number' ? e.from : null, symbol: null, outcome: 'blocked', at });
    if (e.event === 'duplicate_gate' && (e.status === 'blocked' || e.status === 'warned') && Array.isArray(e.findings))
      for (const f of e.findings as Record<string, unknown>[])
        if (f && typeof f.file === 'string')
          all.push({ sessionId, kind: String(f.kind ?? 'duplicate'), file: relative(root, f.file), line: typeof f.line === 'number' ? f.line : null, symbol: typeof f.symbol === 'string' ? f.symbol : null, outcome: e.status, at });
  }
  const last = all.at(-1);
  if (!last) return { sessionId: null, blocks: [] };
  return { sessionId: last.sessionId, blocks: all.filter((b) => b.sessionId === last.sessionId).map(({ sessionId: _s, ...b }) => b) };
}

export function buildViewModel(graph: ModuleGraph, session: LastSession): ViewModel {
  const byDir = graph.files.length > MAX_FILE_NODES;
  const key = (file: string) => (byDir ? path.posix.dirname(file) : file);
  const nodes = new Map<string, ViewNode>();
  for (const f of graph.files) {
    const id = key(f.path);
    const n = nodes.get(id) ?? { id, files: 0, lines: 0, language: f.language, blocks: 0 };
    n.files += 1;
    n.lines += f.lines;
    nodes.set(id, n);
  }
  for (const b of session.blocks) {
    const n = nodes.get(key(b.file));
    if (n) n.blocks += 1;
  }
  const edges = new Map<string, { from: string; to: string; weight: number }>();
  for (const e of graph.edges) {
    const from = key(e.from), to = key(e.to);
    if (from === to) continue;
    const k = `${from}\0${to}`;
    const edge = edges.get(k) ?? { from, to, weight: 0 };
    edge.weight += 1;
    edges.set(k, edge);
  }
  return { granularity: byDir ? 'directory' : 'file', nodes: [...nodes.values()], edges: [...edges.values()], session };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderViewHtml(model: ViewModel, title: string): string {
  // `<` is escaped so no string in the data can close the script element.
  const data = JSON.stringify(model).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>${escapeHtml(title)} - Groundwork view</title>
<style>
body{margin:0;font:14px/1.4 system-ui,sans-serif;color:#1c1f24;background:#f7f7f5;display:flex;height:100vh}
#graph{flex:1;min-width:0}
svg{width:100%;height:100%;display:block;cursor:grab}
aside{width:340px;overflow:auto;background:#fff;border-left:1px solid #ddd;padding:16px;box-sizing:border-box}
h1{font-size:16px;margin:0 0 4px}h2{font-size:13px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#666}
p{margin:4px 0;color:#555}
li{margin:0 0 8px;list-style:none;padding:6px 8px;border-left:3px solid #c0392b;background:#fbf1ef;cursor:pointer;word-break:break-all}
li.warned{border-color:#c98a00;background:#fdf6e3}
ul{padding:0;margin:0}
.kind{font-weight:600}
line{stroke:#b9bcc2;stroke-opacity:.6}
circle{stroke:#fff;stroke-width:1}
circle.hit{stroke:#c0392b;stroke-width:3}
text{font-size:10px;fill:#333;pointer-events:none}
</style></head><body>
<div id="graph"><svg id="svg"><g id="world"><g id="edges"></g><g id="nodes"></g></g></svg></div>
<aside>
<h1>${escapeHtml(title)}</h1>
<p id="summary"></p>
<h2>Last session</h2>
<p id="session"></p>
<ul id="blocks"></ul>
<h2>Selected</h2>
<p id="selected">Click a node.</p>
</aside>
<script>
const model = ${data};
const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('svg'), world = document.getElementById('world');
const W = svg.clientWidth || 900, H = svg.clientHeight || 700;
const colors = { typescript: '#3178c6', javascript: '#d4b000', python: '#3d7a57', go: '#00a0c4', rust: '#b5651d', java: '#c0504d', csharp: '#7b4fa3', ruby: '#a51d2d' };
const nodes = model.nodes.map((n, i) => ({ ...n, x: W / 2 + Math.cos(i * 2.4) * (30 + i * 2 % 300), y: H / 2 + Math.sin(i * 2.4) * (30 + i * 2 % 300), vx: 0, vy: 0 }));
const index = new Map(nodes.map((n) => [n.id, n]));
const edges = model.edges.map((e) => ({ s: index.get(e.from), t: index.get(e.to) })).filter((e) => e.s && e.t);
// Small force layout: springs on imports, repulsion between nodes, pull to the centre.
const steps = nodes.length > 250 ? 120 : 300;
for (let step = 0; step < steps; step++) {
  const k = 1 - step / steps;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y; const d2 = dx * dx + dy * dy + 0.01; const f = 400 / d2;
    dx *= f; dy *= f; a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
  }
  for (const e of edges) { const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y; e.s.vx += dx * 0.01; e.s.vy += dy * 0.01; e.t.vx -= dx * 0.01; e.t.vy -= dy * 0.01; }
  for (const n of nodes) { n.vx += (W / 2 - n.x) * 0.02; n.vy += (H / 2 - n.y) * 0.02; n.x += Math.max(-20, Math.min(20, n.vx)) * k; n.y += Math.max(-20, Math.min(20, n.vy)) * k; n.vx *= 0.6; n.vy *= 0.6; }
}
if (nodes.length > 1) {
  // Fit the layout to the window by moving the nodes, so circles and labels keep their size.
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  for (const n of nodes) { n.x = 60 + (n.x - x0) / Math.max(1, x1 - x0) * (W - 220); n.y = 40 + (n.y - y0) / Math.max(1, y1 - y0) * (H - 80); }
}
const el = (name, attrs, parent) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
for (const e of edges) el('line', { x1: e.s.x, y1: e.s.y, x2: e.t.x, y2: e.t.y }, document.getElementById('edges'));
const label = (id) => model.granularity === 'file' ? id.split('/').pop() : id;
const select = (n) => {
  const out = model.edges.filter((e) => e.from === n.id).length, inc = model.edges.filter((e) => e.to === n.id).length;
  document.getElementById('selected').textContent = n.id + ' - ' + n.files + ' file(s), ' + n.lines + ' lines, imports ' + out + ', imported by ' + inc + (n.blocks ? ', ' + n.blocks + ' block(s) last session' : '');
};
for (const n of nodes) {
  const c = el('circle', { cx: n.x, cy: n.y, r: 4 + Math.min(10, Math.sqrt(n.lines) / 6), fill: colors[n.language] || '#888', class: n.blocks ? 'hit' : '' }, document.getElementById('nodes'));
  c.addEventListener('click', () => select(n));
  el('title', {}, c).textContent = n.id;
  if (nodes.length <= 120 || n.blocks) el('text', { x: n.x + 8, y: n.y + 3 }, document.getElementById('nodes')).textContent = label(n.id);
}
let tx = 0, ty = 0, scale = 1, drag = null;
const apply = () => world.setAttribute('transform', 'translate(' + tx + ',' + ty + ') scale(' + scale + ')');
svg.addEventListener('wheel', (e) => { e.preventDefault(); const f = e.deltaY < 0 ? 1.1 : 0.9; tx = e.offsetX - (e.offsetX - tx) * f; ty = e.offsetY - (e.offsetY - ty) * f; scale *= f; apply(); }, { passive: false });
svg.addEventListener('mousedown', (e) => { drag = { x: e.clientX - tx, y: e.clientY - ty }; });
window.addEventListener('mousemove', (e) => { if (drag) { tx = e.clientX - drag.x; ty = e.clientY - drag.y; apply(); } });
window.addEventListener('mouseup', () => { drag = null; });
document.getElementById('summary').textContent = model.nodes.length + (model.granularity === 'file' ? ' files, ' : ' directories, ') + model.edges.length + ' import edges';
const blocks = model.session.blocks;
document.getElementById('session').textContent = blocks.length ? blocks.length + ' block(s) or warning(s)' + (model.session.sessionId ? ' in session ' + model.session.sessionId : '') : 'No blocks or warnings recorded yet.';
for (const b of blocks) {
  const li = document.createElement('li'); li.className = b.outcome;
  const kind = document.createElement('span'); kind.className = 'kind'; kind.textContent = b.outcome + ' ' + b.kind;
  li.append(kind, document.createElement('br'), b.file + (b.line ? ':' + b.line : '') + (b.symbol ? ' (' + b.symbol + ')' : ''));
  li.addEventListener('click', () => { const n = index.get(model.granularity === 'file' ? b.file : b.file.split('/').slice(0, -1).join('/') || '.'); if (n) select(n); });
  document.getElementById('blocks').appendChild(li);
}
</script></body></html>
`;
}
