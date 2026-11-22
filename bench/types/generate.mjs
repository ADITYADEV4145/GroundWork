import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const anchor = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(anchor ?? '')) throw new Error('Supply the frozen source commit');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).trim();
const sha = (text) => createHash('sha256').update(text).digest('hex');
const seed = 17021991;
const operators = ['unknown-export', 'arity', 'return-member', 'argument-type', 'annotated-property', 'non-callable'];
const read = (file) => execFileSync('git', ['show', `${anchor}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
const repos = ['customer-desk', 'parcel-ops', 'dispatch-desk', 'groundwork'];
const sources = {};
for (const repo of repos) {
  const prefix = repo === 'groundwork' ? '' : `bench/grounding/repos/${repo}/`;
  const files = git('ls-tree', '-r', '--name-only', anchor, '--', repo === 'groundwork' ? 'src/' : prefix).split('\n').map((f) => f.slice(prefix.length)).sort();
  sources[repo] = Object.fromEntries(files.filter((f) => /\.(ts|py)$/.test(f)).map((file) => [file, read(prefix + file)]));
  if (repo !== 'groundwork') {
    const python = repo === 'dispatch-desk';
    sources[repo][python ? 'dispatch/workflows.py' : 'src/workflows.ts'] = read(`bench/grounding/reference/${repo}.${python ? 'py' : 'ts'}.txt`);
  }
}
const mutations = [];
for (const repo of repos) {
  const candidates = [];
  const add = (file, operator, start, end, replacement) => {
    const text = sources[repo][file];
    const line = text.slice(0, start).split('\n').length;
    if (text.slice(start, end).includes('\n') || replacement.includes('\n')) return;
    const lines = text.split('\n');
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const before = lines[line - 1];
    const after = before.slice(0, start - lineStart) + replacement + before.slice(end - lineStart);
    if (before !== after) candidates.push({ repo, operator, file, line, before, after });
  };
  if (repo === 'dispatch-desk') {
    for (const [file, text] of Object.entries(sources[repo])) {
      if (!file.startsWith('dispatch/')) continue;
      for (const m of text.matchAll(/^from \.\w+ import (\w+)/gm)) {
        const at = m.index + m[0].length - m[1].length;
        add(file, 'unknown-export', at, at + m[1].length, `gw_missing_export as ${m[1]}`);
      }
      for (const m of text.matchAll(/\b(get_order|list_orders|get_primary_email|render_receipt|total_due|quote_delivery)\(([^()\n]+)\)/g)) {
        if (/^\s*def\s/.test(text.slice(text.lastIndexOf('\n', m.index) + 1, m.index))) continue;
        const at = m.index + m[1].length + 1;
        add(file, 'arity', at, at + m[2].length, '');
        const first = /^\s*[^,]+/.exec(m[2])[0];
        add(file, 'argument-type', at, at + first.length, '123456' + (m[1] === 'quote_delivery' ? 'j' : ''));
      }
      for (const m of text.matchAll(/\b(order|customer)\.(weight|sku|quantity|cancelled|unit_cents|email|billing_email|id)\b/g)) {
        const at = m.index + m[1].length + 1;
        if (file === 'dispatch/workflows.py' && m[1] === 'order') add(file, 'return-member', at, at + m[2].length, 'gw_missing_member');
        if ((m[1] === 'customer' || file === 'dispatch/pricing.py') && text.includes(`${m[1]}: `)) add(file, 'annotated-property', at, at + m[2].length, 'gw_missing_property');
        add(file, 'non-callable', m.index, m.index + m[0].length, `${m[0]}()`);
      }
    }
  } else {
    const asts = new Map(Object.entries(sources[repo]).map(([file, text]) => [file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)]));
    const resolve = (file, spec) => {
      const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      return [relative, relative.replace(/\.js$/, '.ts'), `${relative}.ts`, `${relative}/index.ts`].find((p) => asts.has(p));
    };
    for (const [file, source] of asts) {
      const functions = new Map(), interfaces = new Map(), returned = new Set();
      const collect = (sf, alias) => {
        for (const statement of sf.statements) {
          if (ts.isFunctionDeclaration(statement) && statement.name) functions.set(alias ?? statement.name.text, statement);
          if (ts.isInterfaceDeclaration(statement)) interfaces.set(alias ?? statement.name.text, statement);
        }
      };
      collect(source);
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const target = resolve(file, statement.moduleSpecifier.text);
        const bindings = statement.importClause?.namedBindings;
        if (!target || !bindings || !ts.isNamedImports(bindings)) continue;
        for (const item of bindings.elements) {
          const original = item.propertyName?.text ?? item.name.text;
          const targetSource = asts.get(target);
          const declaration = targetSource.statements.find((s) => (ts.isFunctionDeclaration(s) || ts.isInterfaceDeclaration(s)) && s.name?.text === original);
          if (declaration && ts.isFunctionDeclaration(declaration)) functions.set(item.name.text, declaration);
          if (declaration && ts.isInterfaceDeclaration(declaration)) interfaces.set(item.name.text, declaration);
          if (!statement.importClause.isTypeOnly && !item.isTypeOnly) add(file, 'unknown-export', item.getStart(source), item.end, `gw_missing_export as ${item.name.text}`);
        }
      }
      const visit = (node) => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)) returned.add(node.name.text);
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const declaration = functions.get(node.expression.text);
          if (declaration) {
            const required = declaration.parameters.some((p) => !p.questionToken && !p.initializer && !p.dotDotDotToken);
            if (required && node.arguments.length) add(file, 'arity', node.arguments.pos, node.arguments.end, '');
            node.arguments.forEach((argument, i) => {
              const type = declaration.parameters[i]?.type;
              const replacement = type?.kind === ts.SyntaxKind.NumberKeyword ? '"gw_wrong_type"' : type?.kind === ts.SyntaxKind.StringKeyword || type?.kind === ts.SyntaxKind.BooleanKeyword || (type && ts.isArrayTypeNode(type)) ? '123456' : undefined;
              if (replacement) add(file, 'argument-type', argument.getStart(source), argument.end, replacement);
            });
          }
        }
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
          if (returned.has(node.expression.text)) add(file, 'return-member', node.name.getStart(source), node.name.end, 'gw_missing_member');
          let owner = node.parent;
          while (owner && !ts.isFunctionLike(owner)) owner = owner.parent;
          const parameter = owner?.parameters?.find((p) => ts.isIdentifier(p.name) && p.name.text === node.expression.text);
          const declaration = parameter?.type && ts.isTypeReferenceNode(parameter.type) && ts.isIdentifier(parameter.type.typeName) ? interfaces.get(parameter.type.typeName.text) : undefined;
          const member = declaration?.members.find((m) => m.name && ts.isIdentifier(m.name) && m.name.text === node.name.text);
          if (member) {
            add(file, 'annotated-property', node.name.getStart(source), node.name.end, 'gw_missing_property');
            if (member.type && [ts.SyntaxKind.StringKeyword, ts.SyntaxKind.NumberKeyword, ts.SyntaxKind.BooleanKeyword].includes(member.type.kind)) add(file, 'non-callable', node.getStart(source), node.end, `${node.getText(source)}()`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  for (const operator of operators) {
    const unique = [...new Map(candidates.filter((c) => c.operator === operator).map((c) => [JSON.stringify(c), c])).values()];
    unique.sort((a, b) => sha(`${seed}:${JSON.stringify(a)}`).localeCompare(sha(`${seed}:${JSON.stringify(b)}`), 'en'));
    if (!unique.length) throw new Error(`${repo}/${operator}: no syntax-eligible candidates`);
    mutations.push(...unique.slice(0, 4));
  }
}
const cleanCommits = git('log', '-40', '--no-merges', '--format=%H %P', anchor, '--', '*.ts').split('\n').filter(Boolean).map((line) => { const [commit, parent] = line.split(' '); return { commit, parent }; });
const manifest = { version: 1, seed, sourceCommit: anchor, compilers: { typescript: ts.version, pyright: 'PATH or project binary; record actual version in results' },
  cleanCommits, sourceHashes: Object.fromEntries(repos.map((repo) => [repo, Object.fromEntries(Object.entries(sources[repo]).map(([file, text]) => [file, sha(text)]))])),
  mutations: mutations.map((m, i) => ({ id: `type-${String(i + 1).padStart(3, '0')}`, ...m })) };
const json = JSON.stringify(manifest, null, 2) + '\n';
writeFileSync(path.join(root, 'bench/types/mutations.json'), json);
console.log(`Frozen ${mutations.length} mutations, ${cleanCommits.length} reachable clean commits; SHA256 ${sha(json)}`);
