import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const checker = execFileSync('git', ['rev-parse', process.argv[2] ?? '386539e'], { encoding: 'utf8' }).trim();
const seed = 'impact-v3-2026-11-22-js-oracle';
const hash = (text) => createHash('sha256').update(text).digest('hex');
const read = (file) => execFileSync('git', ['show', `${checker}:${file}`], { encoding: 'utf8' });
const tracked = execFileSync('git', ['ls-tree', '-r', '--name-only', checker], { encoding: 'utf8' }).trim().split('\n');
const old = ['tasks.json', 'tasks-v2.json'].flatMap((file) => JSON.parse(readFileSync(`bench/impact/${file}`, 'utf8')).tasks);
const tasks = [], targets = [];
for (const repo of ['customer-desk', 'parcel-ops', 'dispatch-desk', 'groundwork']) {
  const prefix = repo === 'groundwork' ? '' : `bench/grounding/repos/${repo}/`;
  const directory = prefix + (repo === 'groundwork' ? 'src/util/' : repo === 'dispatch-desk' ? 'dispatch/' : 'src/');
  const candidates = [];
  for (const full of tracked.filter((f) => f.startsWith(directory) && !f.endsWith('/workflows.ts') && !f.endsWith('/workflows.py') && (repo === 'dispatch-desk' ? f.endsWith('.py') : f.endsWith('.ts') && !f.endsWith('.d.ts')))) {
    const file = full.slice(prefix.length), source = read(full);
    if (file.endsWith('.py')) {
      for (const match of source.matchAll(/^def ([A-Za-z]\w*)\([^\n]*\) -> ([^\n]+):/gm)) {
        const name = match[1], returns = match[2];
        if (returns === 'None') continue;
        const start = match.index, end = source.indexOf('\ndef ', start + 1);
        candidates.push({ file, name, before: source.slice(start, end < 0 ? source.length : end), signature: match[0], returns, language: 'python' });
      }
    } else {
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      for (const node of ast.statements.filter((n) => ts.isFunctionDeclaration(n) && n.name && n.body && n.type && n.type.kind !== ts.SyntaxKind.VoidKeyword && n.type.kind !== ts.SyntaxKind.NeverKeyword && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))) {
        candidates.push({ file, name: node.name.text, before: source.slice(node.getStart(ast), node.end), signature: source.slice(node.getStart(ast), node.body.getStart(ast)), returns: node.type.getText(ast), paramOffset: (node.parameters[0]?.getStart(ast) ?? node.parameters.pos) - node.getStart(ast), hasParams: node.parameters.length > 0, typeStart: node.type.getStart(ast) - node.getStart(ast), typeEnd: node.type.end - node.getStart(ast), language: 'typescript' });
      }
    }
  }
  const eligible = candidates.filter((c) => !old.some((t) => t.repo === repo && t.name === c.name));
  eligible.sort((a, b) => hash(`${seed}\0${repo}\0${a.file}\0${a.name}`).localeCompare(hash(`${seed}\0${repo}\0${b.file}\0${b.name}`)));
  const target = eligible[0]; if (!target) throw new Error(`No eligible new target for ${repo}`);
  const { file, name, before, signature, returns } = target;
  targets.push({ repo, file, name, rank: hash(`${seed}\0${repo}\0${file}\0${name}`), candidates: eligible.length });
  const afterParam = target.language === 'python' ? signature.replace('(', '(impact_required: int, ') : signature.slice(0, target.paramOffset) + 'impactRequired: number' + (target.hasParams ? ', ' : '') + signature.slice(target.paramOffset);
  const afterReturn = target.language === 'python' ? signature.replace(/ -> .*:$/, ` -> ${returns === 'str' ? 'int' : 'str'}:`) : signature.slice(0, target.typeStart) + (returns === 'string' ? 'number' : 'string') + signature.slice(target.typeEnd);
  for (const [operator, oldText, replacement] of [['required-param', signature, afterParam], ['rename', signature, signature.replace(name, name + 'RenamedV3')], ['delete', before, ''], ['return-shape', signature, afterReturn]]) tasks.push({ id: `${repo}/${operator}`, repo, file, name, operator, before: oldText, after: replacement });
}
const json = JSON.stringify({ version: 3, seed, checkerCommit: checker, sourceCommit: checker, targets, tasks }, null, 2) + '\n';
writeFileSync('bench/impact/tasks-v3.json', json);
console.log(`Frozen ${tasks.length} tasks; SHA256 ${hash(json)}; checker/source ${checker}; seed ${seed}`);
console.log(JSON.stringify(targets, null, 2));
