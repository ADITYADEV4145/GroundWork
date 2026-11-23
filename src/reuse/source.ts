import type { Node } from 'web-tree-sitter';
import { fingerprint } from '../extract/fingerprint.js';
import { adapterFor } from '../lang/index.js';
import { parse } from '../lang/parser.js';
import type { ExtractedSymbol } from '../lang/adapter.js';
import type { Language } from '../types.js';
import { sha1 } from '../util/hash.js';
import { contractOf } from './contracts.js';

function bindingHash(body: Node, symbol: ExtractedSymbol): string {
  const locals = new Map<string, string>();
  const declare = (name: string) => { if (!locals.has(name)) locals.set(name, `local:${locals.size}`); };
  for (const param of symbol.params) declare(param.name);
  declare(symbol.name);
  const declarations = new Set(['variable_declarator', 'assignment', 'augmented_assignment', 'for_statement', 'for_in_statement']);
  const collect = (node: Node) => {
    if (declarations.has(node.type)) {
      const target = node.childForFieldName('name') ?? node.childForFieldName('left');
      if (target?.type === 'identifier') declare(target.text);
    }
    for (const child of node.namedChildren) if (child) collect(child);
  };
  collect(body);
  const tokens: string[] = [];
  const walk = (node: Node) => {
    if (node.type === 'comment' || node.type === 'decorator') return;
    if (node.type === 'expression_statement' && node.firstNamedChild?.type === 'string') {
      if (node.parent?.type === 'block' && node.parent.firstNamedChild?.id === node.id) return;
    }
    const attribute = node.parent?.type === 'attribute' && node.parent.childForFieldName('attribute')?.id === node.id;
    if (node.type === 'identifier' && !attribute) {
      tokens.push(locals.get(node.text) ?? `external:${node.text}`);
      return;
    }
    if (['string', 'template_string', 'concatenated_string'].includes(node.type)) {
      // 'x' and "x" are the same literal, with or without a Python prefix; a literal holding a quote is compared as written.
      const plain = node.type === 'string' ? /^([A-Za-z]{0,2})(['"])([^'"]*)\2$/.exec(node.text) : null;
      tokens.push(plain ? `${plain[1]!.toLowerCase()}"${plain[3]}"` : node.text);
      return;
    }
    if (node.childCount === 0) { if (node.text.trim()) tokens.push(node.text); return; }
    for (const child of node.children) if (child) walk(child);
  };
  walk(body);
  return sha1(tokens.join('\u0001'));
}

/** Complement the index's coarse ID/STR/NUM abstraction without changing its stored fingerprints. */
export function extractReuseSource(source: string, language: Language) {
  const extraction = adapterFor(language).extract(source, language);
  if (extraction.hasErrors) return { ...extraction, symbols: extraction.symbols.map((symbol) => ({ ...symbol, bindingHash: null })) };
  const tree = parse(language, source);
  try {
    const nodes: Node[] = [];
    const collect = (node: Node) => {
      if (node.childForFieldName('body')) nodes.push(node);
      for (const child of node.namedChildren) if (child) collect(child);
    };
    collect(tree.rootNode);
    return { ...extraction, symbols: extraction.symbols.map((symbol) => {
      if (!symbol.fingerprint) return { ...symbol, bindingHash: null };
      const node = nodes.find((node) => node.startIndex >= symbol.startByte && node.endIndex <= symbol.endByte &&
        fingerprint(node.childForFieldName('body')!, [symbol.name]).normHash === symbol.fingerprint!.normHash);
      return { ...symbol, bindingHash: node ? bindingHash(node.childForFieldName('body')!, symbol) : null,
        contract: node ? contractOf(source, language, symbol, node.childForFieldName('body')!) : null };
    }) };
  } finally {
    tree.delete();
  }
}
