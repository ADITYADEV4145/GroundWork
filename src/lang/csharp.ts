import type { Node } from 'web-tree-sitter';
import { constantOwner, numberConstant } from './constant-literal.js';
import type { Param, SymbolKind } from '../types.js';
import { fingerprint } from '../extract/fingerprint.js';
import { parse } from './parser.js';
import { classifyStringLiteral, type ExtractResult, type LanguageAdapter } from './adapter.js';

function parameters(node: Node | null): Param[] {
  const ps: Param[] = [];
  for (const p of node?.namedChildren ?? []) {
    if (p?.type !== 'parameter') continue;
    const name = p.childForFieldName('name');
    const eq = p.children.findIndex((c) => c?.type === '=');
    const value = eq < 0 ? undefined : p.children.slice(eq + 1).find((c) => c?.isNamed)?.text;
    ps.push({ name: name?.text ?? '_', type: p.childForFieldName('type')?.text,
      ...(value !== undefined ? { default: value, optional: true } : {}),
      ...(p.children.some((c) => c?.text === 'params') ? { rest: true } : {}) });
  }
  if (node?.children.some((c) => c?.type === 'params')) {
    const name = node.childForFieldName('name'), type = node.childForFieldName('type');
    if (name) ps.push({ name: name.text, type: type?.text, rest: true });
  }
  return ps;
}

function docstring(node: Node): string | null {
  const lines: string[] = [];
  for (let prev = node.previousNamedSibling; prev?.type === 'comment' && prev.text.startsWith('///'); prev = prev.previousNamedSibling) lines.unshift(prev.text.replace(/^\/\/\/ ?/gm, ''));
  if (!lines.length) return null;
  const text = lines.join('\n');
  return (/<summary>([\s\S]*?)<\/summary>/.exec(text)?.[1] ?? text).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export const csharpAdapter: LanguageAdapter = {
  languages: ['csharp'],
  extract(source, lang): ExtractResult {
    const tree = parse(lang, source);
    const r: ExtractResult = { symbols: [], imports: [], calls: [], literals: [], exportAliases: [], hasErrors: tree.rootNode.hasError };
    const kinds: Record<string, SymbolKind> = { class_declaration: 'class', struct_declaration: 'class', record_declaration: 'class', interface_declaration: 'interface', enum_declaration: 'enum' };
    const add = (node: Node, name: string, kind: SymbolKind, parent: number | null): number => {
      const body = node.childForFieldName('body');
      const ps = kind === 'method' || kind === 'function' ? parameters(node.childForFieldName('parameters')) : [];
      const owner = parent === null ? null : r.symbols[parent];
      const mods = node.namedChildren.filter((c) => c?.type === 'modifier').map((c) => c!.text);
      const index = r.symbols.length;
      r.symbols.push({ name, qualifiedName: owner ? `${owner.qualifiedName}.${name}` : name, kind,
        startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1, startByte: node.startIndex, endByte: node.endIndex,
        signature: source.slice(node.startIndex, body?.startIndex ?? node.endIndex).trim().replace(/;$/, ''),
        params: ps, returnType: (node.childForFieldName('returns') ?? node.childForFieldName('type'))?.text ?? null,
        minArity: ps.filter((p) => !p.optional && !p.rest).length, maxArity: ps.some((p) => p.rest) ? null : ps.length,
        docstring: docstring(node), decorators: node.namedChildren.filter((c) => c?.type === 'attribute_list').map((c) => c!.text),
        exported: mods.includes('public'), isDefaultExport: false, isAsync: mods.includes('async'), parent,
        fingerprint: ['method', 'function'].includes(kind) && body ? fingerprint(body, [name]) : null });
      return index;
    };
    const visit = (node: Node, parent: number | null, scope: number | null): void => {
      if (node.type === 'using_directive') {
        const path = node.namedChildren.filter((n) => n && n.type !== 'modifier').at(-1);
        if (path) r.imports.push({ module: path.text, name: path.text.split('.').at(-1)!, alias: node.childForFieldName('name')?.text ?? null,
          kind: 'namespace', line: node.startPosition.row + 1, isTypeOnly: false });
        return;
      }
      const kind = kinds[node.type];
      if (kind) { parent = add(node, node.childForFieldName('name')!.text, kind, parent); scope = null; }
      else if (['method_declaration', 'constructor_declaration', 'local_function_statement'].includes(node.type)) {
        const local = node.type === 'local_function_statement';
        scope = add(node, node.childForFieldName('name')!.text, local ? 'function' : 'method', local ? scope ?? parent : parent);
      } else if (node.type === 'field_declaration') {
        const mods = node.namedChildren.filter((n) => n?.type === 'modifier').map((n) => n!.text);
        if (mods.includes('const') || (mods.includes('static') && mods.includes('readonly'))) {
          const decl = node.namedChildren.find((n) => n?.type === 'variable_declaration');
          for (const v of decl?.namedChildren ?? []) if (v?.type === 'variable_declarator') add(node, v.childForFieldName('name')!.text, 'constant', parent);
        }
      }
      if (node.type === 'invocation_expression' || node.type === 'object_creation_expression') {
        const isNew = node.type === 'object_creation_expression';
        const fn = node.childForFieldName(isNew ? 'type' : 'function');
        if (fn) r.calls.push({ caller: scope, calleeText: fn.text.replace(/\s+/g, ''), calleeName: (fn.childForFieldName('name')?.text ?? fn.text).replace(/<.*>$/, '').split('.').at(-1)!,
          line: node.startPosition.row + 1, column: node.startPosition.column, argCount: node.childForFieldName('arguments')?.namedChildren.filter((n) => n && n.type !== 'comment').length ?? 0,
          keywordArgs: [], hasSpread: false, isNew });
      } else if (['string_literal', 'verbatim_string_literal'].includes(node.type)) {
        let value: string;
        try { value = JSON.parse(node.text) as string; } catch { value = node.text.replace(/^@?"|"$/g, '').replace(/""/g, '"'); }
        const owner = constantOwner(node, r);
        const kind = (classifyStringLiteral(value) ?? (owner ? 'string' : null));
        if (kind) r.literals.push({ symbol: scope, constName: null, ...owner, value, kind, line: node.startPosition.row + 1 });
        return;
      }
      numberConstant(node, r);
      for (const child of node.namedChildren) if (child && child.type !== 'attribute_list') visit(child, parent, scope);
    };
    try { visit(tree.rootNode, null, null); return r; } finally { tree.delete(); }
  },
};
