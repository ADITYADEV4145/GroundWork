import { createHash } from 'node:crypto';
import type { Node } from 'web-tree-sitter';
import type { ExtractedSymbol } from '../src/lang/adapter.js';
import { parse } from '../src/lang/parser.js';
import type { Language } from '../src/types.js';

export interface Contract {
  reads: string[]; writes: string[]; calls: string[]; returns: string[]; raises: string[]; guards: string[]; literals: string[];
  arity: number; parameterUse: number[]; earlyReturns: number;
}

const declarations = ['function_definition', 'function_declaration', 'method_definition', 'arrow_function', 'function_expression', 'generator_function_declaration'];
const members = ['attribute', 'member_expression', 'subscript', 'subscript_expression'];
const mutations = new Set(['append', 'extend', 'add', 'remove', 'discard', 'pop', 'push', 'set', 'delete', 'clear', 'update', 'write', 'insert', 'sort', 'reverse']);
const sorted = (set: Set<string>) => [...set].sort();

export function contractOf(source: string, language: Language, symbol: ExtractedSymbol): Contract | null {
  if (!['function', 'method'].includes(symbol.kind)) return null;
  const tree = parse(language, source);
  try {
    if (tree.rootNode.hasError) return null;
    const declaration = tree.rootNode.descendantsOfType(declarations).filter((n) => n.startIndex >= symbol.startByte && n.endIndex <= symbol.endByte)
      .sort((a, b) => (b.endIndex - b.startIndex) - (a.endIndex - a.startIndex))[0];
    const body = declaration?.childForFieldName('body');
    if (!body) return null;
    const params = symbol.params.filter((p) => !['self', 'cls'].includes(p.name));
    const parameterUse = params.map(() => 0), reads = new Set<string>(), writes = new Set<string>(), calls = new Set<string>();
    const returns = new Set<string>(), raises = new Set<string>(), guards = new Set<string>(), literals = new Set<string>();
    let earlyReturns = 0;
    const name = (node: Node | null): string => {
      if (!node) return '?';
      if (['self', 'cls', 'this'].includes(node.text)) return 'SELF';
      const i = params.findIndex((p) => p.name === node.text);
      if (i >= 0) return `$${i}`;
      if (['attribute', 'member_expression'].includes(node.type)) return `${name(node.childForFieldName('object'))}.${(node.childForFieldName('attribute') ?? node.childForFieldName('property'))?.text ?? '?'}`;
      if (['subscript', 'subscript_expression'].includes(node.type)) {
        const index = node.childForFieldName('subscript') ?? node.childForFieldName('index');
        const key = index && ['string', 'integer', 'number'].includes(index.type) ? index.text.replace(/^['"]|['"]$/g, '') : '*';
        return `${name(node.childForFieldName('value') ?? node.childForFieldName('object'))}[${key}]`;
      }
      return node.text.replace(/\s+/g, '').slice(0, 100);
    };
    const callName = (node: Node): string => name(node.childForFieldName('function') ?? node.childForFieldName('constructor'));
    const shape = (node: Node | null): string | null => {
      if (!node) return 'void';
      if (['none', 'null'].includes(node.type)) return 'null';
      if (['true', 'false'].includes(node.type)) return 'boolean';
      if (['integer', 'float', 'number'].includes(node.type)) return 'number';
      if (['string', 'template_string', 'concatenated_string'].includes(node.type)) return 'string';
      if (['list', 'array', 'list_comprehension'].includes(node.type)) return 'array';
      if (['tuple', 'expression_list'].includes(node.type)) return `tuple:${node.namedChildCount}`;
      if (['dictionary', 'object'].includes(node.type)) {
        const keys = node.namedChildren.flatMap((p) => { const key = p?.childForFieldName('key'); return key ? [key.text.replace(/['"]/g, '')] : []; }).sort();
        return keys.length ? `object:{${keys.join(',')}}` : 'object';
      }
      if (node.type === 'new_expression') return `new:${name(node.childForFieldName('constructor'))}`;
      if (['call', 'call_expression'].includes(node.type)) return 'call';
      if (node.type === 'comparison_operator' || node.type === 'not_operator') return 'boolean';
      if (node.type === 'binary_expression' && ['===', '!==', '==', '!=', '<', '>', '<=', '>=', 'in', 'instanceof'].includes(node.childForFieldName('operator')?.text ?? '')) return 'boolean';
      if (node.type === 'unary_expression' && node.childForFieldName('operator')?.text === '!') return 'boolean';
      if (node.type === 'parenthesized_expression') return shape(node.firstNamedChild);
      if (params.some((p) => p.name === node.text)) return `parameter:${name(node)}`;
      return null;
    };
    const writeTargets = new Set<number>();
    const mark = (node: Node | null) => {
      if (!node) return;
      if (members.includes(node.type)) { writes.add(name(node)); writeTargets.add(node.id); return; }
      for (const child of node.namedChildren) if (child) mark(child);
    };
    const walk = (node: Node, conditional = false) => {
      if (node !== body && (declarations.includes(node.type) || ['class_definition', 'class_declaration', 'type_annotation', 'comment'].includes(node.type))) return;
      if (node.type === 'expression_statement' && node.parent?.id === body.id && body.firstNamedChild?.id === node.id && node.firstNamedChild?.type === 'string') return;
      if (['string', 'template_string', 'integer', 'float', 'number'].includes(node.type)) literals.add(createHash('sha256').update(node.text).digest('hex'));
      if (['assignment', 'assignment_expression', 'augmented_assignment', 'augmented_assignment_expression'].includes(node.type)) {
        const target = node.childForFieldName('left'); mark(target);
        if (node.type.startsWith('augmented_') && target && members.includes(target.type)) reads.add(name(target));
      }
      if (node.type === 'update_expression') {
        const target = node.childForFieldName('argument'); mark(target);
        if (target && members.includes(target.type)) reads.add(name(target));
      }
      if (members.includes(node.type) && !writeTargets.has(node.id)) reads.add(name(node));
      if (node.type === 'identifier') {
        const i = params.findIndex((p) => p.name === node.text);
        const property = (node.parent?.childForFieldName('attribute') ?? node.parent?.childForFieldName('property'));
        if (i >= 0 && property?.id !== node.id) parameterUse[i]!++;
      }
      if (['call', 'call_expression', 'new_expression'].includes(node.type)) {
        const called = callName(node); calls.add(called);
        if (called.includes('.') && mutations.has(called.split('.').at(-1)!)) writes.add(`mutate:${called.slice(0, called.lastIndexOf('.'))}`);
      }
      if (node.type === 'return_statement') {
        const kind = shape(node.firstNamedChild); if (kind) returns.add(kind);
        if (conditional) earlyReturns++;
      }
      if (['raise_statement', 'throw_statement'].includes(node.type)) {
        const expression = node.firstNamedChild;
        raises.add(expression && ['call', 'call_expression', 'new_expression'].includes(expression.type) ? callName(expression) : expression?.text ?? '<reraise>');
      }
      if (node.type === 'if_statement') {
        const condition = node.childForFieldName('condition')?.text ?? '';
        const category = /isinstance|typeof|instanceof/.test(condition) ? 'type' : /\bNone\b|\bnull\b|undefined/.test(condition) ? 'null' : /[<>=]|\b(?:in|is)\b/.test(condition) ? 'comparison' : 'truth';
        const consequence = node.childForFieldName('consequence') ?? node.childForFieldName('body');
        const contains = (types: string[]) => {
          if (!consequence) return false;
          if (types.includes(consequence.type)) return true;
          return consequence.descendantsOfType(types).some((n) => {
            for (let p = n.parent; p && p.id !== consequence.id; p = p.parent) if (declarations.includes(p.type) || ['class_definition', 'class_declaration'].includes(p.type)) return false;
            return true;
          });
        };
        if (contains(['return_statement'])) guards.add(`${category}:return`);
        if (contains(['raise_statement', 'throw_statement'])) guards.add(`${category}:raise`);
      }
      for (const child of node.namedChildren) if (child) walk(child, conditional || node.type === 'if_statement');
    };
    walk(body);
    if (!['block', 'statement_block'].includes(body.type)) { const kind = shape(body); if (kind) returns.add(kind); }
    return { reads: sorted(reads), writes: sorted(writes), calls: sorted(calls), returns: sorted(returns), raises: sorted(raises), guards: sorted(guards), literals: sorted(literals), arity: params.length, parameterUse, earlyReturns };
  } finally { tree.delete(); }
}

export function jaccard(a: string[], b: string[]): number | null {
  const x = new Set(a), y = new Set(b), union = new Set([...a, ...b]);
  return union.size ? [...x].filter((k) => y.has(k)).length / union.size : null;
}
const ratio = (a: number, b: number) => a || b ? Math.min(a, b) / Math.max(a, b) : null;
const opposites = [['add', 'remove'], ['open', 'close'], ['get', 'set'], ['start', 'stop'], ['read', 'write'], ['encode', 'decode'], ['load', 'dump'], ['create', 'destroy'], ['register', 'unregister'], ['connect', 'disconnect'], ['acquire', 'release'], ['push', 'pop'], ['enable', 'disable'], ['schedule', 'cancel'], ['setup', 'teardown']];
const verb = (s: string) => s.replace(/^_+/, '').replace(/([a-z])([A-Z])/g, '$1_$2').split('_')[0]!.toLowerCase();
export function compareContracts(a: Contract | null, b: Contract | null, identity: { aName: string; bName: string; sameFile: boolean }): Record<string, number | null> {
  const sameFile = Number(identity.sameFile), verbOpposition = Number(opposites.some(([x, y]) => [verb(identity.aName), verb(identity.bName)].sort().join(':') === [x, y].sort().join(':')));
  if (!a || !b) return { sameFile, verbOpposition };
  const norm = (x: number[]) => Math.sqrt(x.reduce((n, v) => n + v * v, 0));
  const denominator = norm(a.parameterUse) * norm(b.parameterUse);
  return { sameFile, verbOpposition,
    reads: jaccard(a.reads, b.reads), writes: jaccard(a.writes, b.writes), calls: jaccard(a.calls, b.calls), returnShape: jaccard(a.returns, b.returns),
    exceptions: jaccard(a.raises, b.raises), validation: jaccard(a.guards, b.guards), arity: a.arity || b.arity ? ratio(a.arity, b.arity) : 1,
    literals: jaccard(a.literals, b.literals),
    parameterUse: denominator ? a.parameterUse.reduce((n, v, i) => n + v * (b.parameterUse[i] ?? 0), 0) / denominator : null,
    earlyReturns: ratio(a.earlyReturns, b.earlyReturns), writePresenceMismatch: Number(Boolean(a.writes.length) !== Boolean(b.writes.length)),
  };
}
