import type { Node } from 'web-tree-sitter';
import type { Param, SymbolKind } from '../types.js';
import { fingerprint } from '../extract/fingerprint.js';
import { parse } from './parser.js';
import { classifyStringLiteral, type ExtractResult, type LanguageAdapter } from './adapter.js';

function parameters(node: Node | null): Param[] {
  return (node?.namedChildren ?? []).flatMap((p) => {
    if (!p || p.type === 'comment' || p.type === 'block_parameter') return [];
    const name = p.childForFieldName('name')?.text ?? p.text;
    const value = p.childForFieldName('value')?.text;
    return [{ name, ...(value !== undefined ? { default: value, optional: true } : {}),
      ...(p.type === 'keyword_parameter' ? { keywordOnly: true } : {}),
      ...(p.type === 'splat_parameter' ? { rest: true } : {}),
      ...(p.type === 'hash_splat_parameter' ? { kwrest: true } : {}) }];
  });
}

function docstring(node: Node): string | null {
  const lines: string[] = [];
  let row = node.startPosition.row;
  const previous = node.previousNamedSibling ?? (node.parent?.type === 'body_statement' ? node.parent.previousNamedSibling : null);
  for (let prev = previous; prev?.type === 'comment' && prev.endPosition.row === row - 1; prev = prev.previousNamedSibling) {
    lines.unshift(prev.text.replace(/^# ?/gm, '')); row = prev.startPosition.row;
  }
  return lines.length ? lines.join('\n') : null;
}

function stringValue(node: Node): string | null {
  if (node.type !== 'string' || node.namedChildren.some((n) => n?.type === 'interpolation')) return null;
  return node.namedChildren.map((n) => n?.text ?? '').join('');
}

export const rubyAdapter: LanguageAdapter = {
  languages: ['ruby'],
  extract(source, lang): ExtractResult {
    const tree = parse(lang, source);
    const r: ExtractResult = { symbols: [], imports: [], calls: [], literals: [], exportAliases: [], hasErrors: tree.rootNode.hasError };
    const visibility = new Map<number | null, boolean>();
    const namedVisibility = new Map<number | null, Map<string, boolean>>();
    const add = (node: Node, name: string, kind: SymbolKind, parent: number | null): number => {
      const body = node.childForFieldName('body');
      const ps = parameters(node.childForFieldName('parameters'));
      const positional = ps.filter((p) => !p.keywordOnly && !p.kwrest);
      const owner = parent === null ? null : r.symbols[parent];
      const index = r.symbols.length;
      r.symbols.push({ name, qualifiedName: owner ? `${owner.qualifiedName}.${name}` : name, kind,
        startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1, startByte: node.startIndex, endByte: node.endIndex,
        signature: source.slice(node.startIndex, body?.startIndex ?? node.endIndex).trim().replace(/;$/, '').trim(),
        params: ps, returnType: null, minArity: positional.filter((p) => !p.optional && !p.rest).length,
        maxArity: positional.some((p) => p.rest) ? null : positional.length,
        docstring: docstring(node), decorators: [], exported: kind === 'method' || kind === 'function' ? visibility.get(parent) ?? true : true,
        isDefaultExport: false, isAsync: false, parent, fingerprint: kind !== 'class' && body ? fingerprint(body, [name]) : null });
      return index;
    };
    const visit = (node: Node, parent: number | null, scope: number | null): void => {
      if (node.type === 'class' || node.type === 'module') {
        parent = add(node, node.childForFieldName('name')!.text, 'class', parent); scope = null;
      } else if (node.type === 'method' || node.type === 'singleton_method') {
        const object = node.childForFieldName('object');
        const name = node.childForFieldName('name')!.text;
        scope = add(node, name, parent !== null || object ? 'method' : 'function', parent);
        if (object && object.text !== 'self') r.symbols[scope]!.qualifiedName = `${object.text}.${name}`;
      } else if (node.type === 'assignment' && node.childForFieldName('left')?.type === 'constant') {
        add(node, node.childForFieldName('left')!.text, 'constant', parent);
      }
      if (scope === null && node.type === 'identifier' && ['private', 'public', 'protected'].includes(node.text)) {
        visibility.set(parent, node.text === 'public'); return;
      }
      if (node.type === 'call') {
        const method = node.childForFieldName('method')?.text ?? '?';
        const receiver = node.childForFieldName('receiver')?.text;
        const args = node.childForFieldName('arguments')?.namedChildren.filter((n) => n && n.type !== 'comment') ?? [];
        if (!receiver && ['private', 'public', 'protected'].includes(method) && scope === null) {
          let names = namedVisibility.get(parent);
          if (!names) namedVisibility.set(parent, (names = new Map()));
          for (const arg of args) if (arg?.type === 'simple_symbol') names.set(arg.text.slice(1), method === 'public');
          return;
        }
        if (!receiver && ['require', 'require_relative'].includes(method) && args[0]) {
          const module = stringValue(args[0]);
          if (module !== null) r.imports.push({ module, name: module.split('/').at(-1)!, alias: null, kind: method === 'require_relative' ? 'side-effect' : 'module', line: node.startPosition.row + 1, isTypeOnly: false });
        }
        r.calls.push({ caller: scope, calleeText: receiver ? `${receiver}.${method}` : method, calleeName: method,
          line: node.startPosition.row + 1, column: node.startPosition.column,
          argCount: args.filter((n) => n?.type !== 'pair' && n?.type !== 'hash_splat_argument').length,
          keywordArgs: args.filter((n) => n?.type === 'pair').map((n) => n!.childForFieldName('key')?.text ?? ''),
          hasSpread: args.some((n) => n && ['splat_argument', 'hash_splat_argument'].includes(n.type)), isNew: method === 'new' && !!receiver });
      } else if (node.type === 'string') {
        const value = stringValue(node);
        const kind = value === null ? null : classifyStringLiteral(value);
        if (value !== null && kind) r.literals.push({ symbol: scope, value, kind, line: node.startPosition.row + 1, constName: null });
        return;
      }
      for (const child of node.namedChildren) if (child) visit(child, parent, scope);
    };
    try {
      visit(tree.rootNode, null, null);
      for (const s of r.symbols) if (s.kind === 'method' || s.kind === 'function') s.exported = namedVisibility.get(s.parent)?.get(s.name) ?? s.exported;
      return r;
    } finally { tree.delete(); }
  },
};
