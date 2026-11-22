import type { Node } from 'web-tree-sitter';
import type { ExtractResult } from './adapter.js';
import { assignmentLabel } from './assignment-label.js';

export function constantOwner(node: Node, result: ExtractResult): { symbol: number; constName: string } | null {
  if (result.symbols.some((s) => ['function', 'method'].includes(s.kind) && s.startByte <= node.startIndex && s.endByte >= node.endIndex)) return null;
  for (let parent = node.parent; parent; parent = parent.parent)
    if (['func_literal', 'function_literal', 'lambda_expression', 'closure_expression', 'lambda'].includes(parent.type)) return null;
  const candidates = result.symbols.map((s, symbol) => ({ ...s, symbol })).filter((s) =>
    s.kind === 'constant' && s.startByte <= node.startIndex && s.endByte >= node.endIndex);
  if (!candidates.length) return null;
  let name: string | undefined;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'variable_declarator') {
      const value = parent.childForFieldName('value') ?? parent.lastNamedChild;
      if (value?.id !== node.id) return null;
      name = parent.childForFieldName('name')?.text; break;
    }
    if (parent.type === 'const_spec') {
      const values = parent.childForFieldName('value')?.namedChildren ?? [];
      if (!values.some((v) => v?.id === node.id)) return null;
      name = assignmentLabel(parent, node)?.text;
      if (!name) return null;
      break;
    }
    if (['const_item', 'static_item', 'assignment'].includes(parent.type)) {
      if ((parent.childForFieldName('value') ?? parent.childForFieldName('right'))?.id !== node.id) return null;
      break;
    }
  }
  const owner = name ? candidates.find((s) => s.name === name) : candidates.length === 1 ? candidates[0] : undefined;
  return owner ? { symbol: owner.symbol, constName: owner.name } : null;
}

export function numberConstant(node: Node, result: ExtractResult): void {
  if (!['int_literal', 'float_literal', 'integer_literal', 'real_literal', 'decimal_integer_literal', 'decimal_floating_point_literal', 'hex_integer_literal', 'octal_integer_literal', 'binary_integer_literal', 'integer', 'float'].includes(node.type)) return;
  const owner = constantOwner(node, result);
  if (owner) result.literals.push({ ...owner, value: node.text, kind: 'number', line: node.startPosition.row + 1 });
}
