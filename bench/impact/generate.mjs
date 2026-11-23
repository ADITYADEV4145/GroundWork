import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import ts from 'typescript';

const anchor = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const read = (file) => execFileSync('git', ['show', `${anchor}:${file}`], { encoding: 'utf8' });
const targets = [
  ['customer-desk', 'src/users.ts', 'getUserByEmail', '{ id: number } | null'],
  ['parcel-ops', 'src/orders.ts', 'listOrders', 'number[]'],
  ['dispatch-desk', 'dispatch/orders.py', 'list_orders', 'list[int]'],
  ['groundwork', 'src/util/tokens.ts', 'estimateTokens', 'string'],
];
const tasks = [];
for (const [repo, file, name, returns] of targets) {
  const prefix = repo === 'groundwork' ? '' : `bench/grounding/repos/${repo}/`;
  const source = read(prefix + file);
  let before, signature, afterParam, afterReturn;
  if (file.endsWith('.py')) {
    const start = source.indexOf(`def ${name}(`);
    const end = source.indexOf('\ndef ', start + 1);
    before = source.slice(start, end < 0 ? source.length : end);
    signature = before.split('\n')[0];
    afterParam = signature.replace(') ->', ', impact_required: int) ->');
    afterReturn = signature.replace(/ -> .*:$/, ` -> ${returns}:`);
  } else {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const node = ast.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
    if (!node?.body || !node.type) throw Error(`Missing typed target ${file}:${name}`);
    before = source.slice(node.getStart(ast), node.end);
    signature = source.slice(node.getStart(ast), node.body.getStart(ast));
    const offset = node.parameters.end - node.getStart(ast);
    afterParam = signature.slice(0, offset) + ', impactRequired: number' + signature.slice(offset);
    afterReturn = signature.slice(0, node.type.getStart(ast) - node.getStart(ast)) + returns + signature.slice(node.type.end - node.getStart(ast));
  }
  for (const [operator, old, replacement] of [
    ['required-param', signature, afterParam],
    ['rename', signature, signature.replace(name, name + 'Renamed')],
    ['delete', before, ''],
    ['return-shape', signature, afterReturn],
  ]) tasks.push({ id: `${repo}/${operator}`, repo, file, name, operator, before: old, after: replacement });
}
const manifest = { version: 1, sourceCommit: anchor, tasks };
const json = JSON.stringify(manifest, null, 2) + '\n';
writeFileSync('bench/impact/tasks.json', json);
console.log(`Frozen ${tasks.length} tasks; SHA256 ${createHash('sha256').update(json).digest('hex')}; anchor ${anchor}`);
