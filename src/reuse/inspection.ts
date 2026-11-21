import type { Node } from 'web-tree-sitter';
import { parse } from '../lang/parser.js';
import type { Language } from '../types.js';

const CONFIG_NAME = /(?:timeout|delay|interval|retry|retries|limit|port|size|ttl|config|endpoint|region|mode|backoff|threshold|capacity|batch|duration|attempt|_ms\b|Ms\b|^max|^min)/i;

export function configName(name: string): boolean { return CONFIG_NAME.test(name); }

export function inspectSource(source: string, language: Language) {
  const comments: { start: number; end: number; line: number; text: string }[] = [];
  const literals: { start: number; end: number; line: number; value: string; kind: 'number' | 'string'; configish: boolean }[] = [];
  const trivialAccessors: { start: number; end: number }[] = [];
  const tree = parse(language, source);
  const plainReference = (n: Node | null): boolean => !!n && (['identifier', 'this', 'self'].includes(n.type) ||
    (['member_expression', 'attribute'].includes(n.type) && n.namedChildren.every((c) => !c || plainReference(c) || c.type === 'property_identifier')));
  const visit = (n: Node) => {
    if (n.type === 'comment') { comments.push({ start: n.startIndex, end: n.endIndex, line: n.startPosition.row + 1, text: n.text }); return; }
    const body = n.childForFieldName('body');
    const accessor = n.type === 'method_definition' && n.children.some((c) => c?.type === 'get' || c?.type === 'set');
    const property = n.type === 'function_definition' && n.parent?.type === 'decorated_definition' &&
      n.parent.namedChildren.some((c) => c?.type === 'decorator' && /^@(?:property|[\w.]+\.setter)$/.test(c.text));
    if (body && (accessor || property)) {
      const statements = body.namedChildren.filter((c): c is Node => !!c && c.type !== 'comment');
      const statement = statements[0];
      const expression = statement?.firstNamedChild ?? null;
      if (statements.length === 1 && ((statement?.type === 'return_statement' && plainReference(expression)) ||
        (statement?.type === 'expression_statement' && expression?.type === 'assignment_expression' &&
          plainReference(expression.childForFieldName('left')) && plainReference(expression.childForFieldName('right')))))
        trivialAccessors.push({ start: n.startIndex, end: n.endIndex });
    }
    if (['number', 'integer', 'float', 'string'].includes(n.type)) {
      let context = n.parent;
      while (context && !['variable_declarator', 'assignment', 'pair', 'keyword_argument', 'call', 'call_expression', 'return_statement',
        'required_parameter', 'optional_parameter', 'default_parameter', 'typed_default_parameter'].includes(context.type)) context = context.parent;
      const label = context?.childForFieldName('name') ?? context?.childForFieldName('pattern') ?? context?.childForFieldName('left') ??
        context?.childForFieldName('key') ?? context?.childForFieldName('function');
      const string = n.type === 'string';
      const signed = !string && ['unary_expression', 'unary_operator'].includes(n.parent?.type ?? '') && /^[+-]\s*[\d.]/.test(n.parent!.text);
      const value = string ? n.text.replace(/^[rubf]*(?:"""|'''|"|')/i, '').replace(/(?:"""|'''|"|')$/, '') : signed ? n.parent!.text.replace(/\s/g, '') : n.text;
      if (!string || !n.namedChildren.some((c) => c?.type === 'interpolation' || c?.type === 'string_interpolation'))
        literals.push({ start: n.startIndex, end: n.endIndex, line: n.startPosition.row + 1, value, kind: string ? 'string' : 'number', configish: !!label && configName(label.text) });
      return;
    }
    for (const child of n.namedChildren) if (child) visit(child);
  };
  try { visit(tree.rootNode); return { comments, literals, trivialAccessors }; }
  finally { tree.delete(); }
}

export function allowReason(source: string, symbol: { startByte: number; endByte: number; line: number }, inspection: ReturnType<typeof inspectSource>): { reason: string; valid: boolean } | null {
  const comment = [...inspection.comments].reverse().find((c) => {
    if (!/groundwork:\s*allow-duplicate\b/.test(c.text)) return false;
    if (c.start >= symbol.startByte && c.end <= symbol.endByte && c.line === symbol.line) return true;
    const between = source.slice(c.end, symbol.startByte);
    return c.end <= symbol.startByte && /^(?:export\s*(?:default\s*)?)?(?:(?:const|let|var)\s*)?$/.test(between.trim()) && between.split('\n').length <= 2;
  });
  if (!comment) return null;
  const reason = /groundwork:\s*allow-duplicate\b([^\r\n]*)/.exec(comment.text)![1]!.replace(/\*\/\s*$/, '').trim();
  const words = reason.toLowerCase().match(/[a-z][a-z0-9-]*/g) ?? [];
  const vague = new Set(['needed', 'different', 'ok', 'okay', 'temp', 'temporary', 'because', 'it', 'is', 'for', 'the', 'a', 'an', 'to', 'this', 'that', 'required', 'duplicate', 'code']);
  return { reason, valid: words.length >= 3 && new Set(words.filter((w) => !vague.has(w))).size >= 3 };
}
