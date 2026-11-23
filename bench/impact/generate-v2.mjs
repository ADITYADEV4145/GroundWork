import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const anchor = execFileSync('git', ['rev-parse', process.argv[2] ?? 'devin/1795374068-type-aware-checking'], { encoding: 'utf8' }).trim();
const v1 = JSON.parse(readFileSync('bench/impact/tasks.json', 'utf8'));
const tasks = [];
for (const old of v1.tasks.filter((t) => t.operator === 'required-param')) {
  const { repo, file } = old;
  const prefix = repo === 'groundwork' ? '' : `bench/grounding/repos/${repo}/`;
  const source = execFileSync('git', ['show', `${anchor}:${prefix}${file}`], { encoding: 'utf8' });
  let name, before, signature, afterParam, afterReturn;
  const successor = (names) => {
    const sorted = names.filter((n) => n !== old.name).sort();
    if (!sorted.length) throw new Error(`No new target: ${file}`);
    return sorted.find((n) => n > old.name) ?? sorted[0];
  };
  const returns = repo === 'groundwork' ? 'string' : repo === 'dispatch-desk' ? 'int' : '{ id: number } | null';
  if (file.endsWith('.py')) {
    name = successor([...source.matchAll(/^def ([A-Za-z]\w*)\(/gm)].map((m) => m[1]));
    const start = source.indexOf(`def ${name}(`), end = source.indexOf('\ndef ', start + 1);
    before = source.slice(start, end < 0 ? source.length : end);
    signature = before.split('\n')[0];
    afterParam = signature.replace('(', '(impact_required: int, ');
    afterReturn = signature.replace(/ -> .*:$/, ` -> ${returns}:`);
  } else {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const nodes = ast.statements.filter((s) => ts.isFunctionDeclaration(s) && s.name && s.body && s.type && s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
    name = successor(nodes.map((n) => n.name.text));
    const node = nodes.find((n) => n.name.text === name);
    before = source.slice(node.getStart(ast), node.end);
    signature = source.slice(node.getStart(ast), node.body.getStart(ast));
    const offset = node.parameters[0].getStart(ast) - node.getStart(ast);
    afterParam = signature.slice(0, offset) + 'impactRequired: number, ' + signature.slice(offset);
    afterReturn = signature.slice(0, node.type.getStart(ast) - node.getStart(ast)) + returns + signature.slice(node.type.end - node.getStart(ast));
  }
  for (const [operator, oldText, replacement] of [
    ['required-param', signature, afterParam],
    ['rename', signature, signature.replace(name, name + 'RenamedV2')],
    ['delete', before, ''],
    ['return-shape', signature, afterReturn],
  ]) tasks.push({ id: `${repo}/${operator}`, repo, file, name, operator, before: oldText, after: replacement });
}
const json = JSON.stringify({ version: 2, sourceCommit: anchor, tasks }, null, 2) + '\n';
writeFileSync('bench/impact/tasks-v2.json', json);
console.log(`Frozen ${tasks.length} tasks; SHA256 ${createHash('sha256').update(json).digest('hex')}; anchor ${anchor}`);
console.log(tasks.filter((t) => t.operator === 'required-param').map((t) => `${t.repo}/${t.file}:${t.name}`).join('\n'));
