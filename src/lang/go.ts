import type { Node } from 'web-tree-sitter';
import { constantOwner, numberConstant } from './constant-literal.js';
import type { Param, SymbolKind } from '../types.js';
import { fingerprint } from '../extract/fingerprint.js';
import { parse } from './parser.js';
import { classifyStringLiteral, type ExtractResult, type LanguageAdapter } from './adapter.js';

function parameters(node: Node | null): Param[] {
  return (node?.namedChildren ?? []).flatMap((p) => {
    if (!p || !['parameter_declaration', 'variadic_parameter_declaration'].includes(p.type)) return [];
    const type = p.childForFieldName('type')?.text;
    const names = p.childrenForFieldName('name');
    return (names.length ? names.map((n) => n.text) : ['_']).map((name) => ({
      name, type, ...(p.type === 'variadic_parameter_declaration' ? { rest: true } : {}),
    }));
  });
}

function documentation(node: Node): string | null {
  if (['type_spec', 'type_alias', 'const_spec', 'var_spec'].includes(node.type) && node.parent?.namedChildren[0]?.id === node.id) node = node.parent;
  const lines: string[] = [];
  let row = node.startPosition.row;
  for (let prev = node.previousNamedSibling; prev?.type === 'comment' && prev.text.startsWith('//') && prev.endPosition.row === row - 1; prev = prev.previousNamedSibling) {
    lines.unshift(prev.text.replace(/^\/\/ ?/gm, ''));
    row = prev.startPosition.row;
  }
  return lines.length ? lines.join('\n') : null;
}

function stringValue(node: Node): string {
  if (node.type === 'raw_string_literal') return node.text.slice(1, -1).replace(/\r/g, '');
  try { return JSON.parse(node.text) as string; } catch { return node.text.slice(1, -1); }
}

export const goAdapter: LanguageAdapter = {
  languages: ['go'],
  extract(source, lang): ExtractResult {
    const tree = parse(lang, source);
    const result: ExtractResult = { symbols: [], imports: [], calls: [], literals: [], exportAliases: [], hasErrors: tree.rootNode.hasError };
    const types = new Map<string, number>();
    const receivers = new Map<number, string>();
    const add = (node: Node, name: string, kind: SymbolKind, receiver?: string): number => {
      const body = node.childForFieldName('body');
      const ps = parameters(node.childForFieldName('parameters'));
      const index = result.symbols.length;
      result.symbols.push({ name, qualifiedName: receiver ? `${receiver}.${name}` : name, kind,
        startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1,
        startByte: node.startIndex, endByte: node.endIndex,
        signature: source.slice(node.startIndex, body?.startIndex ?? node.endIndex).trim(),
        params: ps, returnType: node.childForFieldName('result')?.text ?? null,
        minArity: ps.filter((p) => !p.rest).length, maxArity: ps.some((p) => p.rest) ? null : ps.length,
        docstring: documentation(node), decorators: [], exported: /^\p{Lu}/u.test(name),
        isDefaultExport: false, isAsync: false, parent: null, fingerprint: body ? fingerprint(body, [name]) : null });
      if (receiver) receivers.set(index, receiver);
      return index;
    };
    const visit = (node: Node, scope: number | null): void => {
      if (node.type === 'function_declaration' || node.type === 'method_declaration') {
        const receiver = node.childForFieldName('receiver')?.namedChildren[0]?.childForFieldName('type');
        const typeName = receiver?.descendantsOfType('type_identifier')[0]?.text ?? receiver?.text.replace(/^\*/, '');
        scope = add(node, node.childForFieldName('name')?.text ?? '?', receiver ? 'method' : 'function', typeName);
      } else if (node.type === 'type_spec' || node.type === 'type_alias') {
        const name = node.childForFieldName('name')!.text;
        const type = node.childForFieldName('type')?.type;
        types.set(name, add(node, name, type === 'struct_type' ? 'class' : type === 'interface_type' ? 'interface' : 'type'));
      } else if (node.type === 'const_spec' || (node.type === 'var_spec' && node.parent?.parent?.type === 'source_file')) {
        for (const name of node.childrenForFieldName('name')) add(node, name.text, node.type === 'const_spec' ? 'constant' : 'variable');
      } else if (node.type === 'import_spec') {
        const path = node.childForFieldName('path');
        if (path) {
          const module = stringValue(path);
          result.imports.push({ module, name: module.split('/').at(-1)!, alias: node.childForFieldName('name')?.text ?? null, kind: 'module', line: node.startPosition.row + 1, isTypeOnly: false });
        }
        return;
      } else if (node.type === 'call_expression') {
        const fn = node.childForFieldName('function');
        const args = node.childForFieldName('arguments')?.namedChildren.filter((n) => n && n.type !== 'comment') ?? [];
        if (fn) {
          const text = fn.text.replace(/\s+/g, '');
          const name = fn.childForFieldName('field')?.text ?? fn.childForFieldName('function')?.text ?? fn.text;
          result.calls.push({ caller: scope, calleeText: text, calleeName: name, line: node.startPosition.row + 1,
            column: node.startPosition.column, argCount: args.length, keywordArgs: [], hasSpread: args.some((n) => n?.type === 'variadic_argument'), isNew: false });
        }
      } else if (node.type === 'interpreted_string_literal' || node.type === 'raw_string_literal') {
        const value = stringValue(node);
        const owner = constantOwner(node, result);
        const kind = (classifyStringLiteral(value) ?? (owner ? 'string' : null));
        if (kind) result.literals.push({ symbol: scope, constName: null, ...owner, value, kind, line: node.startPosition.row + 1 });
        return;
      }
      numberConstant(node, result);
      for (const child of node.namedChildren) if (child) visit(child, scope);
    };
    try {
      visit(tree.rootNode, null);
      for (const [index, receiver] of receivers) result.symbols[index]!.parent = types.get(receiver) ?? null;
      return result;
    } finally { tree.delete(); }
  },
};
