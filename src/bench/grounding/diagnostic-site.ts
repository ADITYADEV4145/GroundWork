import { languageForPath, parse } from '../../lang/parser.js';

export function diagnosticCallSite(file: string, source: string, line: number, column: number, code: number, message: string): { line: number; column: number; name: string } | null {
  const language = languageForPath(file);
  if (!language || language === 'python') return null;
  const arity = /Expected (?:at least )?(\d+)(?:-(\d+))? arguments?, but got (\d+)/.exec(message);
  const argument = code === 2345 || code === 2353 || (code === 2554 && arity !== null && Number(arity[3]) > Number(arity[2] ?? arity[1]));
  const point = { row: line - 1, column };
  const contains = (start: { row: number; column: number }, end: { row: number; column: number }) =>
    (point.row > start.row || (point.row === start.row && point.column >= start.column)) &&
    (point.row < end.row || (point.row === end.row && point.column < end.column));
  const tree = parse(language, source);
  try {
    for (let node = tree.rootNode.descendantForPosition(point); node; node = node.parent) {
      if (node.type !== 'call_expression' && node.type !== 'new_expression') continue;
      const callee = node.childForFieldName(node.type === 'new_expression' ? 'constructor' : 'function');
      const region = argument ? node.childForFieldName('arguments') : callee;
      const name = callee?.type === 'member_expression' ? callee.childForFieldName('property')?.text : callee?.text;
      if (name && region && contains(region.startPosition, region.endPosition))
        return { line: node.startPosition.row + 1, column: node.startPosition.column, name };
    }
    return null;
  } finally { tree.delete(); }
}
