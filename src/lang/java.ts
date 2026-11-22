import type { Node } from 'web-tree-sitter';
import { constantOwner, numberConstant } from './constant-literal.js';
import type { Param, SymbolKind } from '../types.js';
import { fingerprint } from '../extract/fingerprint.js';
import { parse } from './parser.js';
import { classifyStringLiteral, type ExtractResult, type LanguageAdapter } from './adapter.js';

function parameters(node: Node | null): Param[] {
  return (node?.namedChildren ?? []).flatMap((p) => {
    if (!p || !['formal_parameter', 'spread_parameter', 'receiver_parameter'].includes(p.type)) return [];
    if (p.type === 'receiver_parameter') return [];
    const rest = p.type === 'spread_parameter';
    const name = p.childForFieldName('name') ?? p.namedChildren.find((c) => c?.type === 'variable_declarator')?.childForFieldName('name');
    const type = p.childForFieldName('type') ?? p.namedChildren.find((c) => c && c.type !== 'modifiers' && c.type !== 'variable_declarator');
    return [{ name: name?.text ?? '_', type: type?.text, ...(rest ? { rest: true } : {}) }];
  });
}

function docstring(node: Node): string | null {
  const prev = node.previousNamedSibling;
  if (prev?.type !== 'block_comment' || !prev.text.startsWith('/**')) return null;
  return prev.text.slice(3, -2).split('\n').map((s) => s.replace(/^\s*\* ?/, '').trim()).join('\n').trim().split(/\n\s*\n/)[0] ?? null;
}

export const javaAdapter: LanguageAdapter = {
  languages: ['java'],
  extract(source, lang): ExtractResult {
    const tree = parse(lang, source);
    const r: ExtractResult = { symbols: [], imports: [], calls: [], literals: [], exportAliases: [], hasErrors: tree.rootNode.hasError };
    const kinds: Record<string, SymbolKind> = { class_declaration: 'class', record_declaration: 'class', interface_declaration: 'interface', enum_declaration: 'enum', annotation_type_declaration: 'interface' };
    const add = (node: Node, name: string, kind: SymbolKind, parent: number | null, ps: Param[]): number => {
      const body = node.childForFieldName('body');
      const modifiers = node.namedChildren.find((n) => n?.type === 'modifiers');
      const owner = parent === null ? null : r.symbols[parent];
      const index = r.symbols.length;
      r.symbols.push({ name, qualifiedName: owner ? `${owner.qualifiedName}.${name}` : name, kind,
        startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1, startByte: node.startIndex, endByte: node.endIndex,
        signature: source.slice(node.startIndex, body?.startIndex ?? node.endIndex).trim().replace(/;$/, ''),
        params: ps, returnType: node.childForFieldName('type')?.text ?? null,
        minArity: ps.filter((p) => !p.rest).length, maxArity: ps.some((p) => p.rest) ? null : ps.length,
        docstring: docstring(node), decorators: modifiers?.namedChildren.filter((n) => n && ['annotation', 'marker_annotation'].includes(n.type)).map((n) => n!.text) ?? [],
        exported: modifiers?.children.some((n) => n?.type === 'public') ?? false,
        isDefaultExport: false, isAsync: false, parent, fingerprint: kind === 'method' && body ? fingerprint(body, [name]) : null });
      return index;
    };
    const visit = (node: Node, parent: number | null, scope: number | null): void => {
      if (node.type === 'import_declaration') {
        const path = node.namedChildren.find((n) => n && ['identifier', 'scoped_identifier'].includes(n.type))?.text;
        if (path) {
          const wildcard = node.namedChildren.some((n) => n?.type === 'asterisk');
          const parts = path.split('.');
          const name = wildcard ? '*' : parts.pop()!;
          r.imports.push({ module: parts.join('.'), name, alias: null, kind: wildcard ? 'namespace' : 'named', line: node.startPosition.row + 1, isTypeOnly: false });
        }
        return;
      }
      const kind = kinds[node.type];
      if (kind) {
        parent = add(node, node.childForFieldName('name')!.text, kind, parent, []);
        scope = null;
      } else if (['method_declaration', 'constructor_declaration', 'compact_constructor_declaration', 'annotation_type_element_declaration'].includes(node.type)) {
        const ps = parameters(node.childForFieldName('parameters') ?? (node.type === 'compact_constructor_declaration' ? node.parent?.parent?.childForFieldName('parameters') ?? null : null));
        scope = add(node, node.childForFieldName('name')!.text, 'method', parent, ps);
      } else if (node.type === 'field_declaration' || node.type === 'constant_declaration') {
        const mods = node.namedChildren.find((n) => n?.type === 'modifiers');
        const constant = node.type === 'constant_declaration' || ['static', 'final'].every((m) => mods?.children.some((n) => n?.type === m));
        if (constant) for (const decl of node.childrenForFieldName('declarator')) add(node, decl.childForFieldName('name')!.text, 'constant', parent, []);
      }
      if (node.type === 'method_invocation' || node.type === 'object_creation_expression') {
        const isNew = node.type === 'object_creation_expression';
        const name = (node.childForFieldName(isNew ? 'type' : 'name')?.text ?? '?');
        const object = node.childForFieldName('object')?.text;
        r.calls.push({ caller: scope, calleeText: object ? `${object}.${name}` : name, calleeName: name.replace(/<.*>$/, '').split('.').at(-1)!,
          line: node.startPosition.row + 1, column: node.startPosition.column,
          argCount: node.childForFieldName('arguments')?.namedChildren.filter((n) => n && !['line_comment', 'block_comment'].includes(n.type)).length ?? 0,
          keywordArgs: [], hasSpread: false, isNew });
      } else if (node.type === 'string_literal') {
        let value: string;
        try { value = JSON.parse(node.text) as string; } catch { value = node.text.slice(1, -1); }
        const owner = constantOwner(node, r);
        const kind = (classifyStringLiteral(value) ?? (owner ? 'string' : null));
        if (kind) r.literals.push({ symbol: scope, constName: null, ...owner, value, kind, line: node.startPosition.row + 1 });
        return;
      }
      numberConstant(node, r);
      for (const child of node.namedChildren) if (child && child.type !== 'modifiers') visit(child, parent, scope);
    };
    try { visit(tree.rootNode, null, null); return r; } finally { tree.delete(); }
  },
};
