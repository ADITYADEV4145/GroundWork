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

interface Ctx {
  symbols: ExtractedSymbol[];
  imports: ExtractedImport[];
  calls: ExtractedCall[];
  literals: ExtractedLiteral[];
  allNames: Set<string> | null;
}

function pyString(n: Node | null): string | null {
  if (n?.type !== 'string') return null;
  if (n.namedChildren.some((c) => c?.type === 'interpolation')) return null;
  return n.namedChildren.filter((c) => c?.type === 'string_content').map((c) => c!.text).join('');
}

function docstring(body: Node | null): string | null {
  const first = body?.namedChildren[0];
  if (first?.type !== 'expression_statement') return null;
  const s = pyString(first.namedChildren[0] ?? null);
  if (s === null) return null;
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

function params(node: Node | null, isMethod: boolean): Param[] {
  const out: Param[] = [];
  let keywordOnly = false;
  for (const p of node?.namedChildren ?? []) {
    if (!p || p.type === 'comment') continue;
    switch (p.type) {
      case 'identifier':
        out.push({ name: p.text, keywordOnly });
        break;
      case 'typed_parameter': {
        const inner = p.namedChildren[0];
        const type = p.childForFieldName('type')?.text;
        if (inner?.type === 'list_splat_pattern') {
          out.push({ name: inner.text.replace(/^\*/, ''), type, rest: true });
          keywordOnly = true;
        } else if (inner?.type === 'dictionary_splat_pattern') out.push({ name: inner.text.replace(/^\*\*/, ''), type, kwrest: true });
        else out.push({ name: inner?.text ?? p.text, type, keywordOnly });
        break;
      }
      case 'default_parameter':
      case 'typed_default_parameter':
        out.push({
          name: p.childForFieldName('name')?.text ?? p.text,
          type: p.childForFieldName('type')?.text,
          default: p.childForFieldName('value')?.text,
          optional: true,
          keywordOnly,
        });
        break;
      case 'list_splat_pattern':
        out.push({ name: p.text.replace(/^\*/, ''), rest: true });
        keywordOnly = true;
        break;
      case 'dictionary_splat_pattern':
        out.push({ name: p.text.replace(/^\*\*/, ''), kwrest: true });
        break;
      case 'keyword_separator':
        keywordOnly = true;
        break;
      case 'positional_separator':
        for (const q of out) q.positionalOnly = true;
        break;
    }
  }
  if (isMethod && out.length > 0 && (out[0]!.name === 'self' || out[0]!.name === 'cls')) out.shift();
  return out;
}

/** Positional arity: keyword-only params don't count toward max; required keyword-only don't add to min. */
export function pyArity(ps: Param[]): { min: number; max: number | null } {
  let min = 0;
  let max: number | null = 0;
  for (const p of ps) {
    if (p.kwrest || p.keywordOnly) continue;
    if (p.rest) {
      max = null;
      continue;
    }
    if (max !== null) max++;
    if (!p.optional) min++;
  }
  return { min, max };
}

function addFunction(ctx: Ctx, node: Node, decorators: string[], parent: number | null, outer: Node): number {
  const name = node.childForFieldName('name')?.text ?? '?';
  const parentSym = parent !== null ? ctx.symbols[parent] : undefined;
  const isMethod = parentSym?.kind === 'class' || parentSym?.kind === 'dataclass';
  const isStatic = decorators.includes('staticmethod');
  const ps = params(node.childForFieldName('parameters'), isMethod && !isStatic);
  const ar = pyArity(ps);
  const ret = node.childForFieldName('return_type')?.text ?? null;
  const isAsync = node.children.some((c) => c?.type === 'async');
  const body = node.childForFieldName('body');
  const firstKw = ps.findIndex((p) => p.keywordOnly);
  const sig = `${isAsync ? 'async ' : ''}def ${name}(${ps
    .map((p, i) => `${i === firstKw && !ps.some((q) => q.rest) ? '*, ' : ''}${p.rest ? '*' : p.kwrest ? '**' : ''}${p.name}${p.type ? `: ${p.type}` : ''}${p.default ? ` = ${p.default}` : ''}`)
    .join(', ')})${ret ? ` -> ${ret}` : ''}`;
  ctx.symbols.push({
    name,
    qualifiedName: parentSym ? `${parentSym.qualifiedName}.${name}` : name,
    kind: isMethod ? 'method' : 'function',
    startLine: outer.startPosition.row + 1,
    endLine: outer.endPosition.row + 1,
    startByte: outer.startIndex,
    endByte: outer.endIndex,
    signature: sig,
    params: ps,
    returnType: ret,
    minArity: ar.min,
    maxArity: ar.max,
    docstring: docstring(body),
    decorators,
    exported: parent === null ? !name.startsWith('_') : false,
    isDefaultExport: false,
    isAsync,
    parent,
    fingerprint: body ? fingerprint(body, [name]) : null,
  });
  return ctx.symbols.length - 1;
}

function addClass(ctx: Ctx, node: Node, decorators: string[], parent: number | null, outer: Node): number {
  const name = node.childForFieldName('name')?.text ?? '?';
  const parentSym = parent !== null ? ctx.symbols[parent] : undefined;
  const isDataclass = decorators.some((d) => /(^|\.)dataclass\b/.test(d));
  const body = node.childForFieldName('body');
  const supers = node.childForFieldName('superclasses')?.text ?? '';
  ctx.symbols.push({
    name,
    qualifiedName: parentSym ? `${parentSym.qualifiedName}.${name}` : name,
    kind: isDataclass ? 'dataclass' : 'class',
    startLine: outer.startPosition.row + 1,
    endLine: outer.endPosition.row + 1,
    startByte: outer.startIndex,
    endByte: outer.endIndex,
    signature: `class ${name}${supers}`,
    params: [],
    returnType: null,
    minArity: 0,
    maxArity: null,
    docstring: docstring(body),
    decorators,
    exported: parent === null ? !name.startsWith('_') : false,
    isDefaultExport: false,
    isAsync: false,
    parent,
    fingerprint: body ? fingerprint(body, [name]) : null,
  });
  return ctx.symbols.length - 1;
}

function dataclassInit(ctx: Ctx, cls: number, body: Node | null): void {
  // Synthesize arity for the generated __init__ so grounding can check Foo(a, b).
  const ps: Param[] = [];
  for (const st of body?.namedChildren ?? []) {
    const a = st?.type === 'expression_statement' ? st.namedChildren[0] : null;
    if (a?.type !== 'assignment' || !a.childForFieldName('type')) continue;
    const left = a.childForFieldName('left');
    if (left?.type !== 'identifier') continue;
    const type = a.childForFieldName('type')?.text;
    if (type?.startsWith('ClassVar')) continue;
    ps.push({ name: left.text, type, default: a.childForFieldName('right')?.text, optional: a.childForFieldName('right') !== null });
  }
  const s = ctx.symbols[cls]!;
  const ar = pyArity(ps);
  s.params = ps;
  s.minArity = ar.min;
  s.maxArity = ar.max;
}

/** Calling a class runs __init__, so the class takes its arity. */
function classArityFromInit(ctx: Ctx, cls: number): void {
  const init = ctx.symbols.find((s, i) => i > cls && s.parent === cls && s.name === '__init__');
  if (!init) return;
  const c = ctx.symbols[cls]!;
  c.params = init.params;
  c.minArity = init.minArity;
  c.maxArity = init.maxArity;
}

function relModule(n: Node): string {
  return n.text.replace(/\s+/g, '');
}

function visit(ctx: Ctx, node: Node, parent: number | null, scope: number | null, top: boolean): void {
  switch (node.type) {
    case 'decorated_definition': {
      const decorators = node.namedChildren.filter((c) => c?.type === 'decorator').map((c) => c!.text.replace(/^@/, '').trim());
      const def = node.childForFieldName('definition');
      if (def?.type === 'function_definition') {
        const idx = addFunction(ctx, def, decorators, parent, node);
        walk(ctx, def.childForFieldName('body'), idx, idx, false);
      } else if (def?.type === 'class_definition') {
        const idx = addClass(ctx, def, decorators, parent, node);
        if (ctx.symbols[idx]!.kind === 'dataclass') dataclassInit(ctx, idx, def.childForFieldName('body'));
        walk(ctx, def.childForFieldName('body'), idx, idx, false);
        if (ctx.symbols[idx]!.kind !== 'dataclass') classArityFromInit(ctx, idx);
      }
      for (const d of node.namedChildren) if (d?.type === 'decorator') walk(ctx, d, parent, scope, false);
      return;
    }
    case 'function_definition': {
      const idx = addFunction(ctx, node, [], parent, node);
      walk(ctx, node.childForFieldName('body'), idx, idx, false);
      return;
    }
    case 'class_definition': {
      const idx = addClass(ctx, node, [], parent, node);
      walk(ctx, node.childForFieldName('superclasses'), parent, scope, false);
      walk(ctx, node.childForFieldName('body'), idx, idx, false);
      classArityFromInit(ctx, idx);
      return;
    }
    case 'import_statement': {
      for (const c of node.namedChildren) {
        if (!c) continue;
        if (c.type === 'dotted_name') ctx.imports.push({ module: c.text, name: '*', alias: null, kind: 'module', line: node.startPosition.row + 1, isTypeOnly: false });
        else if (c.type === 'aliased_import')
          ctx.imports.push({
            module: c.childForFieldName('name')?.text ?? c.text,
            name: '*',
            alias: c.childForFieldName('alias')?.text ?? null,
            kind: 'module',
            line: node.startPosition.row + 1,
            isTypeOnly: false,
          });
      }
      return;
    }
    case 'import_from_statement': {
      const modNode = node.childForFieldName('module_name');
      if (!modNode) return;
      const module = relModule(modNode);
      const line = node.startPosition.row + 1;
      if (node.namedChildren.some((c) => c?.type === 'wildcard_import')) {
        ctx.imports.push({ module, name: '*', alias: null, kind: 'reexport-all', line, isTypeOnly: false });
        return;
      }
      for (const c of node.childrenForFieldName('name')) {
        if (!c) continue;
        if (c.type === 'aliased_import')
          ctx.imports.push({ module, name: c.childForFieldName('name')?.text ?? c.text, alias: c.childForFieldName('alias')?.text ?? null, kind: 'named', line, isTypeOnly: false });
        else ctx.imports.push({ module, name: c.text, alias: null, kind: 'named', line, isTypeOnly: false });
      }
      return;
    }
    case 'expression_statement': {
      const a = node.namedChildren[0];
      if (top && a?.type === 'assignment') {
        const left = a.childForFieldName('left');
        const right = a.childForFieldName('right');
        if (left?.type === 'identifier') {
          if (left.text === '__all__' && right && (right.type === 'list' || right.type === 'tuple')) {
            ctx.allNames = new Set(right.namedChildren.map((c) => pyString(c ?? null)).filter((s): s is string => s !== null));
          }
          const isConst = /^[A-Z][A-Z0-9_]*$/.test(left.text);
          const idx = ctx.symbols.length;
          ctx.symbols.push({
            name: left.text,
            qualifiedName: left.text,
            kind: isConst ? 'constant' : 'variable',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            startByte: node.startIndex,
            endByte: node.endIndex,
            signature: `${left.text}${a.childForFieldName('type') ? `: ${a.childForFieldName('type')!.text}` : ''}`,
            params: [],
            returnType: null,
            minArity: 0,
            maxArity: null,
            docstring: null,
            decorators: [],
            exported: !left.text.startsWith('_'),
            isDefaultExport: false,
            isAsync: false,
            parent,
            fingerprint: null,
          });
          const sv = pyString(right ?? null);
          if (sv !== null) {
            const kind = classifyStringLiteral(sv) ?? (isConst ? 'string' : null);
            if (kind) ctx.literals.push({ symbol: idx, value: sv, kind, line: node.startPosition.row + 1, constName: left.text });
            return;
          }
          if (right && (right.type === 'integer' || right.type === 'float') && isConst) {
            ctx.literals.push({ symbol: idx, value: right.text, kind: 'number', line: node.startPosition.row + 1, constName: left.text });
            return;
          }
          walk(ctx, right, parent, scope, false);
          return;
        }
      }
      return walk(ctx, node, parent, scope, false);
    }
    case 'call': {
      const fn = node.childForFieldName('function');
      const args = node.childForFieldName('arguments');
      if (fn && (fn.type === 'identifier' || fn.type === 'attribute')) {
        const name = fn.type === 'identifier' ? fn.text : (fn.childForFieldName('attribute')?.text ?? fn.text);
        const list = args?.type === 'argument_list' ? args.namedChildren.filter((c) => c && c.type !== 'comment') : [];
        const kw = list.filter((c) => c!.type === 'keyword_argument').map((c) => c!.childForFieldName('name')?.text ?? '');
        let text = fn.text.replace(/\s+/g, '');
        if (text.length > 120) text = `…${text.slice(-60)}`;
        ctx.calls.push({
          caller: scope,
          calleeText: text,
          calleeName: name,
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          argCount: list.filter((c) => c!.type !== 'keyword_argument' && c!.type !== 'dictionary_splat').length,
          keywordArgs: kw,
          hasSpread: list.some((c) => c!.type === 'list_splat' || c!.type === 'dictionary_splat'),
          isNew: false,
        });
        // os.environ.get("X") / os.getenv("X")
        if ((/environ\.get$/.test(text) || /getenv$/.test(text)) && list[0]) {
          const v = pyString(list[0]);
          if (v) ctx.literals.push({ symbol: scope, value: v, kind: 'env', line: node.startPosition.row + 1, constName: null });
        }
      }
      return walk(ctx, node, parent, scope, false);
    }
    case 'subscript': {
      if (/^os\.environ$/.test(node.childForFieldName('value')?.text ?? '')) {
        const v = pyString(node.childForFieldName('subscript'));
        if (v) ctx.literals.push({ symbol: scope, value: v, kind: 'env', line: node.startPosition.row + 1, constName: null });
      }
      return walk(ctx, node, parent, scope, false);
    }
    case 'string': {
      const v = pyString(node);
      const kind = v !== null ? classifyStringLiteral(v) : null;
      if (v !== null && kind) ctx.literals.push({ symbol: scope, value: v, kind, line: node.startPosition.row + 1, constName: null });
      return;
    }
    default:
      return walk(ctx, node, parent, scope, top && (node.type === 'if_statement' || node.type === 'block' || node.type === 'try_statement'));
  }
}

function walk(ctx: Ctx, node: Node | null, parent: number | null, scope: number | null, top: boolean): void {
  if (!node) return;
  for (const c of node.namedChildren) if (c) visit(ctx, c, parent, scope, top);
}

export const pythonAdapter: LanguageAdapter = {
  languages: ['python'],
  extract(source: string, lang: Language): ExtractResult {
    const tree = parse(lang, source);
    const ctx: Ctx = { symbols: [], imports: [], calls: [], literals: [], allNames: null };
    try {
      walk(ctx, tree.rootNode, null, null, true);
      if (ctx.allNames) for (const s of ctx.symbols) if (s.parent === null) s.exported = ctx.allNames.has(s.name);
      const { allNames: _a, ...rest } = ctx;
      return { ...rest, hasErrors: tree.rootNode.hasError };
    } finally {
      tree.delete();
    }
  },
};

export type { SymbolKind };
