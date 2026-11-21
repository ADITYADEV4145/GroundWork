import type { Node } from 'web-tree-sitter';
import type { Language, Param, SymbolKind } from '../types.js';
import { fingerprint } from '../extract/fingerprint.js';
import { parse } from './parser.js';
import {
  classifyStringLiteral,
  type ExtractedCall,
  type ExtractedImport,
  type ExtractedLiteral,
  type ExtractedSymbol,
  type ExtractResult,
  type LanguageAdapter,
} from './adapter.js';

const FN_VALUE = new Set(['arrow_function', 'function_expression', 'function', 'generator_function']);
const JSX = ['jsx_element', 'jsx_self_closing_element', 'jsx_fragment'];

function stringValue(n: Node | null): string | null {
  if (!n) return null;
  if (n.type === 'string') return n.namedChildren.filter((c) => c?.type === 'string_fragment').map((c) => c!.text).join('');
  if (n.type === 'template_string' && n.namedChildren.every((c) => c?.type === 'string_fragment')) return n.text.slice(1, -1);
  return null;
}

function jsdoc(node: Node): string | null {
  let prev = node.previousNamedSibling;
  if (!prev && node.parent?.type === 'export_statement') prev = node.parent.previousNamedSibling;
  if (prev?.type !== 'comment' || !prev.text.startsWith('/**')) return null;
  if (node.startPosition.row - prev.endPosition.row > 1 && node.parent?.type !== 'export_statement') return null;
  return prev.text
    .replace(/^\/\*\*|\*\/$/g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\* ?/, '').trim())
    .filter(Boolean)
    .join('\n');
}

function params(paramsNode: Node | null): Param[] {
  if (!paramsNode) return [];
  if (paramsNode.type === 'identifier') return [{ name: paramsNode.text }];
  const out: Param[] = [];
  for (const p of paramsNode.namedChildren) {
    if (!p || p.type === 'comment') continue;
    const pattern = p.childForFieldName('pattern') ?? p;
    const type = p.childForFieldName('type')?.text.replace(/^:\s*/, '');
    const value = p.childForFieldName('value')?.text;
    if (pattern.type === 'this') continue;
    if (pattern.type === 'rest_pattern' || p.type === 'rest_pattern') {
      out.push({ name: pattern.text.replace(/^\.\.\./, ''), type, rest: true });
      continue;
    }
    if (p.type === 'assignment_pattern') {
      out.push({ name: p.childForFieldName('left')?.text ?? p.text, default: p.childForFieldName('right')?.text, optional: true });
      continue;
    }
    out.push({ name: pattern.text, type, default: value, optional: p.type === 'optional_parameter' || value !== undefined });
  }
  return out;
}

export function arityOf(ps: Param[]): { min: number; max: number | null } {
  let min = 0;
  let max: number | null = 0;
  ps.forEach((p, i) => {
    if (p.rest) {
      max = null;
      return;
    }
    if (max !== null) max++;
    if (!p.optional) min = i + 1;
  });
  return { min, max };
}

interface Ctx {
  src: string;
  symbols: ExtractedSymbol[];
  imports: ExtractedImport[];
  calls: ExtractedCall[];
  literals: ExtractedLiteral[];
  exportedNames: Map<string, string>; // local -> exported name ('default' allowed)
  overloads: Map<string, { min: number; max: number | null }[]>;
}

function addSymbol(
  ctx: Ctx,
  node: Node,
  name: string,
  kind: SymbolKind,
  parent: number | null,
  opts: { fnNode?: Node | null; exported?: boolean; isDefault?: boolean; docNode?: Node } = {},
): number {
  const fn = opts.fnNode ?? null;
  const ps = fn ? params(fn.childForFieldName('parameters') ?? fn.childForFieldName('parameter')) : [];
  const ar = fn ? arityOf(ps) : { min: 0, max: null };
  const ret = fn?.childForFieldName('return_type')?.text.replace(/^:\s*/, '') ?? null;
  const isAsync = fn ? fn.children.some((c) => c?.type === 'async') : false;
  const parentSym = parent !== null ? ctx.symbols[parent] : undefined;
  const qualifiedName = parentSym ? `${parentSym.qualifiedName}.${name}` : name;
  const body = fn?.childForFieldName('body') ?? (kind === 'class' ? node.childForFieldName('body') : null);
  let finalKind = kind;
  if (fn && kind === 'function' && /^[A-Z]/.test(name) && body && body.descendantsOfType(JSX).length > 0) finalKind = 'component';
  const decorators = node.children.filter((c) => c?.type === 'decorator').map((c) => c!.text.replace(/^@/, ''));
  const sig = fn
    ? `${isAsync ? 'async ' : ''}${name}(${ps.map((p) => `${p.rest ? '...' : ''}${p.name}${p.optional && !p.default ? '?' : ''}${p.type ? `: ${p.type}` : ''}${p.default ? ` = ${p.default}` : ''}`).join(', ')})${ret ? `: ${ret}` : ''}`
    : `${kind} ${name}`;
  const docNode = opts.docNode ?? node;
  ctx.symbols.push({
    name,
    qualifiedName,
    kind: finalKind,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startByte: node.startIndex,
    endByte: node.endIndex,
    signature: sig,
    params: ps,
    returnType: ret,
    minArity: ar.min,
    maxArity: ar.max,
    docstring: jsdoc(docNode),
    decorators,
    exported: opts.exported ?? false,
    isDefaultExport: opts.isDefault ?? false,
    isAsync,
    parent,
    fingerprint: body ? fingerprint(body, [name]) : null,
  });
  return ctx.symbols.length - 1;
}

function callInfo(ctx: Ctx, node: Node, caller: number | null): void {
  const isNew = node.type === 'new_expression';
  const fnNode = isNew ? node.childForFieldName('constructor') : node.childForFieldName('function');
  if (!fnNode) return;
  const argsNode = node.childForFieldName('arguments');
  if (fnNode.type === 'import') {
    const v = stringValue(argsNode?.namedChildren[0] ?? null);
    if (v) ctx.imports.push({ module: v, name: '*', alias: null, kind: 'module', line: node.startPosition.row + 1, isTypeOnly: false });
    return;
  }
  let text: string;
  let name: string;
  if (fnNode.type === 'identifier') {
    text = name = fnNode.text;
    if (name === 'require' && argsNode) {
      const v = stringValue(argsNode.namedChildren[0] ?? null);
      if (v) {
        const decl = node.parent?.type === 'variable_declarator' ? node.parent.childForFieldName('name') : null;
        const line = node.startPosition.row + 1;
        if (decl?.type === 'object_pattern') {
          for (const p of decl.namedChildren) {
            if (p?.type === 'shorthand_property_identifier_pattern') ctx.imports.push({ module: v, name: p.text, alias: null, kind: 'named', line, isTypeOnly: false });
            else if (p?.type === 'pair_pattern')
              ctx.imports.push({ module: v, name: p.childForFieldName('key')?.text ?? p.text, alias: p.childForFieldName('value')?.text ?? null, kind: 'named', line, isTypeOnly: false });
          }
        } else ctx.imports.push({ module: v, name: '*', alias: decl?.type === 'identifier' ? decl.text : null, kind: 'namespace', line, isTypeOnly: false });
      }
      return;
    }
  } else if (fnNode.type === 'member_expression') {
    const prop = fnNode.childForFieldName('property');
    if (!prop) return;
    name = prop.text;
    text = fnNode.text.replace(/\s+/g, '');
    if (text.length > 120) text = `…${text.slice(-60)}`;
  } else return;
  const args = argsNode?.type === 'arguments' ? argsNode.namedChildren.filter((c) => c && c.type !== 'comment') : [];
  ctx.calls.push({
    caller,
    calleeText: text,
    calleeName: name,
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
    argCount: argsNode?.type === 'template_string' ? 1 : args.length,
    keywordArgs: [],
    hasSpread: args.some((a) => a!.type === 'spread_element'),
    isNew,
  });
}

function visit(ctx: Ctx, node: Node, parent: number | null, scope: number | null, exportCtx: { exported: boolean; isDefault: boolean }, topLevel: boolean): void {
  switch (node.type) {
    case 'export_statement': {
      const decl = node.childForFieldName('declaration');
      const isDefault = node.children.some((c) => c?.type === 'default');
      const source = stringValue(node.childForFieldName('source'));
      const clause = node.namedChildren.find((c) => c?.type === 'export_clause');
      if (source) {
        const line = node.startPosition.row + 1;
        const typeOnly = node.children.some((c) => c?.type === 'type');
        if (clause) {
          for (const s of clause.namedChildren) {
            if (s?.type !== 'export_specifier') continue;
            const n = s.childForFieldName('name')?.text ?? s.text;
            const a = s.childForFieldName('alias')?.text ?? null;
            ctx.imports.push({ module: source, name: n, alias: a, kind: 'reexport', line, isTypeOnly: typeOnly });
          }
        } else {
          const ns = node.namedChildren.find((c) => c?.type === 'namespace_export');
          ctx.imports.push({ module: source, name: '*', alias: ns ? ns.text.replace(/^\*\s*as\s*/, '') : null, kind: 'reexport-all', line, isTypeOnly: typeOnly });
        }
        return;
      }
      if (clause) {
        for (const s of clause.namedChildren) {
          if (s?.type !== 'export_specifier') continue;
          const n = s.childForFieldName('name')?.text ?? s.text;
          ctx.exportedNames.set(n, s.childForFieldName('alias')?.text ?? n);
        }
        return;
      }
      if (decl) return visit(ctx, decl, parent, scope, { exported: true, isDefault }, topLevel);
      const value = node.childForFieldName('value') ?? node.namedChildren.find((c) => c && c.type !== 'comment' && c.type !== 'decorator') ?? null;
      if (value && isDefault) {
        if (value.type === 'identifier') ctx.exportedNames.set(value.text, 'default');
        else if (FN_VALUE.has(value.type)) {
          const idx = addSymbol(ctx, value, 'default', 'function', parent, { fnNode: value, exported: true, isDefault: true, docNode: node });
          walkBody(ctx, value.childForFieldName('body'), idx);
        }
        else visitOne(ctx, value, parent, scope);
      }
      return;
    }
    case 'assignment_expression': {
      // CommonJS exports: module.exports = { a, b } / module.exports = fn / exports.a = ...
      const left = node.childForFieldName('left')?.text.replace(/\s+/g, '') ?? '';
      const right = node.childForFieldName('right');
      if (parent === null && right) {
        if (left === 'module.exports' && right.type === 'object') {
          for (const p of right.namedChildren) {
            if (p?.type === 'shorthand_property_identifier') ctx.exportedNames.set(p.text, p.text);
            else if (p?.type === 'pair' && p.childForFieldName('value')?.type === 'identifier')
              ctx.exportedNames.set(p.childForFieldName('value')!.text, p.childForFieldName('key')?.text ?? p.text);
          }
        } else if (left === 'module.exports' && right.type === 'identifier') ctx.exportedNames.set(right.text, 'default');
        else {
          const m = /^(?:module\.)?exports\.([A-Za-z_$][\w$]*)$/.exec(left);
          if (m && right.type === 'identifier') ctx.exportedNames.set(right.text, m[1]!);
          else if (m && FN_VALUE.has(right.type)) {
            const idx = addSymbol(ctx, node, m[1]!, 'function', null, { fnNode: right, exported: true });
            walkBody(ctx, right.childForFieldName('body'), idx);
            return;
          }
        }
      }
      return walkChildren(ctx, node, parent, scope);
    }
    case 'function_declaration':
    case 'generator_function_declaration': {
      const name = node.childForFieldName('name')?.text ?? 'default';
      const idx = addSymbol(ctx, node, name, 'function', parent, { fnNode: node, exported: exportCtx.exported, isDefault: exportCtx.isDefault });
      walkBody(ctx, node.childForFieldName('body'), idx);
      return;
    }
    case 'function_signature': {
      const name = node.childForFieldName('name')?.text;
      if (name && parent === null) {
        const ar = arityOf(params(node.childForFieldName('parameters')));
        ctx.overloads.set(name, [...(ctx.overloads.get(name) ?? []), ar]);
      }
      return;
    }
    case 'class_declaration':
    case 'abstract_class_declaration':
    case 'class': {
      const name = node.childForFieldName('name')?.text ?? (exportCtx.isDefault ? 'default' : null);
      if (!name) return walkChildren(ctx, node, parent, scope);
      const idx = addSymbol(ctx, node, name, 'class', parent, { exported: exportCtx.exported, isDefault: exportCtx.isDefault });
      const body = node.childForFieldName('body');
      const ctor = body?.namedChildren.find((m) => m?.type === 'method_definition' && m.childForFieldName('name')?.text === 'constructor');
      const cls = ctx.symbols[idx]!;
      if (ctor) {
        cls.params = params(ctor.childForFieldName('parameters'));
        const car = arityOf(cls.params);
        cls.minArity = car.min;
        cls.maxArity = car.max;
      } else if (!node.namedChildren.some((c) => c?.type === 'class_heritage')) cls.maxArity = 0;
      for (const m of body?.namedChildren ?? []) {
        if (!m) continue;
        if (m.type === 'method_definition') {
          const mname = m.childForFieldName('name')?.text ?? '?';
          const midx = addSymbol(ctx, m, mname, 'method', idx, { fnNode: m });
          walkBody(ctx, m.childForFieldName('body'), midx);
        } else if (m.type === 'public_field_definition' || m.type === 'field_definition') {
          const v = m.childForFieldName('value');
          const fname = (m.childForFieldName('name') ?? m.childForFieldName('property'))?.text ?? '?';
          if (v && FN_VALUE.has(v.type)) {
            const midx = addSymbol(ctx, m, fname, 'method', idx, { fnNode: v });
            walkBody(ctx, v.childForFieldName('body'), midx);
          } else if (v) visitOne(ctx, v, idx, idx);
        } else if (m.type === 'method_signature' || m.type === 'abstract_method_signature') {
          continue;
        } else walkChildren(ctx, m, idx, idx);
      }
      return;
    }
    case 'interface_declaration':
    case 'type_alias_declaration':
    case 'enum_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (!name) return;
      const kind: SymbolKind = node.type === 'interface_declaration' ? 'interface' : node.type === 'enum_declaration' ? 'enum' : 'type';
      addSymbol(ctx, node, name, kind, parent, { exported: exportCtx.exported, isDefault: exportCtx.isDefault });
      return;
    }
    case 'lexical_declaration':
    case 'variable_declaration': {
      const isConst = node.children.some((c) => c?.type === 'const');
      for (const d of node.namedChildren) {
        if (d?.type !== 'variable_declarator') continue;
        const nameNode = d.childForFieldName('name');
        const value = d.childForFieldName('value');
        if (nameNode?.type !== 'identifier') {
          if (value) visitOne(ctx, value, parent, scope);
          continue;
        }
        if (value && isRequire(value)) {
          visitOne(ctx, value, parent, scope);
          continue;
        }
        const name = nameNode.text;
        if (value && FN_VALUE.has(value.type)) {
          const idx = addSymbol(ctx, d, name, 'function', parent, { fnNode: value, exported: exportCtx.exported, docNode: node });
          walkBody(ctx, value.childForFieldName('body'), idx);
          continue;
        }
        if (value?.type === 'class') {
          visit(ctx, value, parent, scope, exportCtx, topLevel);
          continue;
        }
        if (topLevel) {
          const idx = addSymbol(ctx, d, name, isConst ? 'constant' : 'variable', parent, { exported: exportCtx.exported, docNode: node });
          const sv = stringValue(value);
          if (sv !== null) {
            const kind = classifyStringLiteral(sv) ?? (isConst ? 'string' : null);
            if (kind) ctx.literals.push({ symbol: idx, value: sv, kind, line: d.startPosition.row + 1, constName: name });
          } else if (value?.type === 'number' && isConst) {
            ctx.literals.push({ symbol: idx, value: value.text, kind: 'number', line: d.startPosition.row + 1, constName: name });
          }
          if (value) visitOne(ctx, value, parent, scope);
        } else if (value) visitOne(ctx, value, parent, scope);
      }
      return;
    }
    case 'import_statement': {
      const source = stringValue(node.childForFieldName('source'));
      if (!source) return;
      const line = node.startPosition.row + 1;
      const typeOnly = node.children.some((c) => c?.type === 'type');
      const clause = node.namedChildren.find((c) => c?.type === 'import_clause');
      if (!clause) {
        ctx.imports.push({ module: source, name: '*', alias: null, kind: 'side-effect', line, isTypeOnly: false });
        return;
      }
      for (const c of clause.namedChildren) {
        if (!c) continue;
        if (c.type === 'identifier') ctx.imports.push({ module: source, name: 'default', alias: c.text, kind: 'default', line, isTypeOnly: typeOnly });
        else if (c.type === 'namespace_import')
          ctx.imports.push({ module: source, name: '*', alias: c.namedChildren[0]?.text ?? null, kind: 'namespace', line, isTypeOnly: typeOnly });
        else if (c.type === 'named_imports')
          for (const s of c.namedChildren) {
            if (s?.type !== 'import_specifier') continue;
            const n = s.childForFieldName('name')?.text ?? s.text;
            const specType = typeOnly || s.children.some((x) => x?.type === 'type');
            ctx.imports.push({ module: source, name: n, alias: s.childForFieldName('alias')?.text ?? null, kind: 'named', line, isTypeOnly: specType });
          }
      }
      return;
    }
    case 'call_expression':
    case 'new_expression':
      callInfo(ctx, node, scope);
      return walkChildren(ctx, node, parent, scope);
    case 'member_expression': {
      // process.env.FOO -> env literal
      if (/^process\.env\.[A-Z_][A-Z0-9_]*$/.test(node.text)) {
        ctx.literals.push({ symbol: scope, value: node.text.slice('process.env.'.length), kind: 'env', line: node.startPosition.row + 1, constName: null });
        return;
      }
      return walkChildren(ctx, node, parent, scope);
    }
    case 'string': {
      const call = node.parent?.type === 'arguments' ? node.parent.parent : null;
      if (call && isRequire(call)) return;
      const v = stringValue(node);
      const kind = v !== null ? classifyStringLiteral(v) : null;
      if (v !== null && kind) ctx.literals.push({ symbol: scope, value: v, kind, line: node.startPosition.row + 1, constName: null });
      return;
    }
    default:
      return walkChildren(ctx, node, parent, scope);
  }
}

function isRequire(n: Node): boolean {
  return n.type === 'call_expression' && n.childForFieldName('function')?.text === 'require';
}

function visitOne(ctx: Ctx, node: Node, parent: number | null, scope: number | null): void {
  visit(ctx, node, parent, scope, { exported: false, isDefault: false }, false);
}

/** Arrow functions can have an expression body (`() => helper()`), which is itself a node to visit. */
function walkBody(ctx: Ctx, body: Node | null, owner: number): void {
  if (!body) return;
  if (body.type === 'statement_block' || body.type === 'class_body') walkChildren(ctx, body, owner, owner);
  else visitOne(ctx, body, owner, owner);
}

function walkChildren(ctx: Ctx, node: Node | null, parent: number | null, scope: number | null): void {
  if (!node) return;
  for (const c of node.namedChildren) if (c) visit(ctx, c, parent, scope, { exported: false, isDefault: false }, false);
}

export const typescriptAdapter: LanguageAdapter = {
  languages: ['typescript', 'tsx', 'javascript'],
  extract(source: string, lang: Language): ExtractResult {
    const tree = parse(lang, source);
    const ctx: Ctx = { src: source, symbols: [], imports: [], calls: [], literals: [], exportedNames: new Map(), overloads: new Map() };
    try {
      for (const c of tree.rootNode.namedChildren) if (c) visit(ctx, c, null, null, { exported: false, isDefault: false }, true);
      for (const s of ctx.symbols) {
        if (s.parent !== null) continue;
        const exp = ctx.exportedNames.get(s.name);
        if (exp) {
          s.exported = true;
          if (exp === 'default') s.isDefaultExport = true;
        }
        const ov = ctx.overloads.get(s.name);
        if (ov && (s.kind === 'function' || s.kind === 'component')) {
          s.minArity = Math.min(s.minArity, ...ov.map((o) => o.min));
          s.maxArity = s.maxArity === null || ov.some((o) => o.max === null) ? null : Math.max(s.maxArity, ...ov.map((o) => o.max as number));
        }
      }
      return { ...ctx, hasErrors: tree.rootNode.hasError };
    } finally {
      tree.delete();
    }
  },
};
