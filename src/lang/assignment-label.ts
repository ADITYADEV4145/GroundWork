import type { Node } from 'web-tree-sitter';

const lists = new Set(['expression_list', 'tuple_pattern', 'tuple_expression', 'left_assignment_list', 'right_assignment_list']);
const items = (node: Node): Node[] => node.namedChildren.filter((n): n is Node => !!n && !['comment', 'line_comment', 'block_comment'].includes(n.type));

function pairedLabel(names: Node[], values: Node[], literal: Node): string | null {
  if (names.length !== values.length) return null;
  const index = values.findIndex((v) => v.startIndex <= literal.startIndex && v.endIndex >= literal.endIndex);
  if (index < 0) return null;
  const name = names[index]!, value = values[index]!;
  if (lists.has(name.type) || lists.has(value.type))
    return lists.has(name.type) && lists.has(value.type) ? pairedLabel(items(name), items(value), literal) : null;
  let binding = name;
  while (['mut_pattern', 'ref_pattern'].includes(binding.type)) {
    const inner = binding.lastNamedChild;
    if (!inner) return null;
    binding = inner;
  }
  return ['identifier', 'instance_variable', 'class_variable', 'global_variable'].includes(binding.type) ? binding.text.replace(/^[@$]+/, '') : null;
}

export function assignmentLabel(context: Node | null, literal: Node): string | null {
  if (!context) return null;
  if (['var_spec', 'const_spec'].includes(context.type)) {
    const names = context.childrenForFieldName('name').filter((n) => n.type === 'identifier');
    const value = context.childForFieldName('value');
    return value ? pairedLabel(names, items(value), literal) : null;
  }
  const label = context.childForFieldName('name') ?? context.childForFieldName('pattern') ?? context.childForFieldName('left') ??
    context.childForFieldName('key') ?? context.childForFieldName('function');
  if (label && lists.has(label.type)) {
    const value = context.childForFieldName('right') ?? context.childForFieldName('value');
    return value && lists.has(value.type) ? pairedLabel(items(label), items(value), literal) : null;
  }
  return label?.text.replace(/^(?:(?:mut|ref)\s+)+/, '').replace(/^[@$]+/, '') ?? null;
}
