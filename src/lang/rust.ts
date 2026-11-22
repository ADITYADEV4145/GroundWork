import type { Node } from 'web-tree-sitter';
import type { Param, SymbolKind } from '../types.js';
import { fingerprint } from '../extract/fingerprint.js';
import { parse } from './parser.js';
import { classifyStringLiteral, type ExtractResult, type LanguageAdapter } from './adapter.js';

function metadata(node: Node): { docstring: string | null; decorators: string[] } {
  const docs: string[] = [], decorators: string[] = [];
  for (let n = node.previousNamedSibling; n; n = n.previousNamedSibling) {
    if (n.type === 'attribute_item') {
      if (!/^#\[doc\b/.test(n.text)) decorators.unshift(n.text);
    } else if (n.type === 'line_comment' && /^\/\/[!/]/.test(n.text)) docs.unshift(n.text.replace(/^\/\/[!/] ?/, '').trimEnd());
    else break;
  }
  return { docstring: docs.length ? docs.join('\n') : null, decorators };
}

function typeName(node: Node | null): string {
  if (!node) return '?';
  if (node.type === 'generic_type') return typeName(node.childForFieldName('type'));
  return node.childForFieldName('name')?.text ?? node.text;
}

export const rustAdapter: LanguageAdapter = {
  languages: ['rust'],
  extract(source, lang): ExtractResult {
    const tree = parse(lang, source);
    const r: ExtractResult = { symbols: [], imports: [], calls: [], literals: [], exportAliases: [], hasErrors: tree.rootNode.hasError };
    const types = new Map<string, number>(), pending = new Map<number, string>();
    const kinds: Record<string, SymbolKind> = { struct_item: 'class', enum_item: 'enum', trait_item: 'interface', type_item: 'type', const_item: 'constant', static_item: 'constant' };
    const use = (node: Node, prefix: string, line: number): void => {
      if (node.type === 'scoped_use_list') {
        const path = node.childForFieldName('path')?.text;
        const base = [prefix, path].filter(Boolean).join('::');
        for (const child of node.childForFieldName('list')?.namedChildren ?? []) if (child) use(child, base, line);
        return;
      }
      if (node.type === 'use_list') {
        for (const child of node.namedChildren) if (child) use(child, prefix, line);
        return;
      }
      const alias = node.childForFieldName('alias')?.text ?? null;
      const raw = node.type === 'use_as_clause' ? node.childForFieldName('path')!.text : node.text;
      const full = [prefix, raw].filter(Boolean).join('::');
      const parts = full.split('::');
      const name = parts.pop()!;
      r.imports.push({ module: parts.join('::'), name, alias, kind: name === '*' ? 'namespace' : 'named', line, isTypeOnly: false });
    };
    const visit = (node: Node, scope: number | null, owner: string | null, parent: number | null): void => {
      if (node.type === 'macro_invocation') return;
      if (node.type === 'use_declaration') {
        const arg = node.childForFieldName('argument');
        if (arg) use(arg, '', node.startPosition.row + 1);
        return;
      }
      if (node.type === 'impl_item') {
        const target = typeName(node.childForFieldName('type'));
        const body = node.childForFieldName('body');
        if (body) for (const child of body.namedChildren) if (child) visit(child, scope, target, null);
        return;
      }
      const callable = node.type === 'function_item' || node.type === 'function_signature_item';
      const kind = callable ? (owner ? 'method' : 'function') : kinds[node.type];
      if (kind) {
        const name = node.childForFieldName('name')?.text ?? '?';
        const body = node.childForFieldName('body');
        const ps: Param[] = (node.childForFieldName('parameters')?.namedChildren ?? []).flatMap((p) => {
          if (p?.type !== 'parameter') return [];
          return [{ name: p.childForFieldName('pattern')?.text ?? '_', type: p.childForFieldName('type')?.text }];
        });
        const index = r.symbols.length;
        r.symbols.push({ name, qualifiedName: owner ? `${owner}.${name}` : name, kind,
          startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1, startByte: node.startIndex, endByte: node.endIndex,
          signature: source.slice(node.startIndex, body?.startIndex ?? node.endIndex).trim().replace(/;$/, ''),
          params: ps, returnType: node.childForFieldName('return_type')?.text ?? null, minArity: ps.length, maxArity: ps.length,
          ...metadata(node), exported: node.namedChildren.some((c) => c?.type === 'visibility_modifier'), isDefaultExport: false,
          isAsync: node.namedChildren.some((c) => c?.type === 'function_modifiers' && /\basync\b/.test(c.text)),
          parent, fingerprint: callable && body ? fingerprint(body, [name]) : null });
        if (callable) { scope = index; if (owner && parent === null) pending.set(index, owner); }
        else if (['class', 'enum', 'interface'].includes(kind)) {
          types.set(name, index);
          if (kind === 'interface') { owner = name; parent = index; }
        }
      }
      if (node.type === 'call_expression') {
        const fn = node.childForFieldName('function');
        const args = node.childForFieldName('arguments')?.namedChildren.filter((n) => n && n.type !== 'line_comment' && n.type !== 'block_comment') ?? [];
        if (fn) {
          const callee = fn.type === 'generic_function' ? fn.childForFieldName('function') ?? fn : fn;
          r.calls.push({ caller: scope, calleeText: callee.text.replace(/\s+/g, ''), calleeName: callee.childForFieldName('field')?.text ?? callee.childForFieldName('name')?.text ?? callee.text,
            line: node.startPosition.row + 1, column: node.startPosition.column, argCount: args.length, keywordArgs: [], hasSpread: false, isNew: false });
        }
      } else if (node.type === 'string_literal' || node.type === 'raw_string_literal') {
        let value = node.text.replace(/^r#*"|"#*$/g, '');
        if (node.type === 'string_literal') { try { value = JSON.parse(node.text) as string; } catch { value = node.text.slice(1, -1); } }
        const kind = classifyStringLiteral(value);
        if (kind) r.literals.push({ symbol: scope, value, kind, line: node.startPosition.row + 1, constName: null });
        return;
      }
      for (const child of node.namedChildren) if (child && child.type !== 'attribute_item') visit(child, scope, owner, parent);
    };
    try {
      visit(tree.rootNode, null, null, null);
      for (const [index, owner] of pending) r.symbols[index]!.parent = types.get(owner) ?? null;
      return r;
    } finally { tree.delete(); }
  },
};
