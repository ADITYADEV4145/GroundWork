import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { Node } from 'web-tree-sitter';
import { goModFor, goRoot } from '../deps/go.js';
import { callFacts, fileFacts, importFacts, indexedFileHash, topLevelFacts, type CallFact, type FileFacts, type ImportFact, type SymbolFact } from '../index/query.js';
import { parse } from '../lang/parser.js';
import type { Db } from '../store/db.js';
import { sha1 } from '../util/hash.js';
import type { Finding, VerifyResult } from './verify.js';

const BUILTINS = new Set('_ append cap clear close complex copy delete imag len make max min new panic print println real recover bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any comparable true false iota nil init'.split(' '));
const PLATFORM_FILE = /_(?:aix|android|darwin|dragonfly|freebsd|hurd|illumos|ios|js|linux|netbsd|openbsd|plan9|solaris|wasip1|windows|zos|386|amd64|amd64p32|arm|armbe|arm64|arm64be|loong64|mips|mipsle|mips64|mips64le|mips64p32|mips64p32le|ppc|ppc64|ppc64le|riscv|riscv64|s390|s390x|sparc|sparc64|wasm)\.go$/;
const BUILD_CONSTRAINT = /^[\t ]*\/\/(?:go:build\b|[\t ]*\+build\b)/m;
const NAMED_BINDINGS = new Set(['parameter_declaration', 'variadic_parameter_declaration', 'type_parameter_declaration', 'var_spec', 'const_spec', 'type_spec', 'type_alias']);
const LEFT_BINDINGS = new Set(['short_var_declaration', 'range_clause', 'receive_statement', 'type_switch_statement']);

interface Declaration { fn?: SymbolFact }
interface GoSource {
  name: string;
  text: string;
  imports: ImportFact[];
  names: Map<string, Declaration[]>;
}
interface GoPackage {
  name: string;
  files: Map<string, GoSource>;
  names: Map<string, Declaration[]>;
}

function addName(names: Map<string, Declaration[]>, name: string, ...declarations: Declaration[]): void {
  const entries = names.get(name);
  if (entries) entries.push(...declarations);
  else names.set(name, declarations);
}

function visit(node: Node, fn: (node: Node) => void): void {
  fn(node);
  for (const child of node.namedChildren) if (child) visit(child, fn);
}

function callKey(line: number, column: number): string {
  return `${line}:${column}`;
}

function simpleCalls(text: string): Map<string, { name: string; qualifier: string | undefined; uncertainArity: boolean }> {
  const tree = parse('go', text);
  const calls = new Map<string, { name: string; qualifier: string | undefined; uncertainArity: boolean }>();
  try {
    for (const scope of tree.rootNode.namedChildren) {
      if (!scope || !['function_declaration', 'method_declaration', 'var_declaration', 'const_declaration'].includes(scope.type)) continue;
      if (scope.childForFieldName('receiver')?.descendantsOfType('type_arguments').length) continue;
      const bindings = new Set<string>();
      const pending: Node[] = [];
      visit(scope, (n) => {
        if (NAMED_BINDINGS.has(n.type)) {
          for (const name of n.childrenForFieldName('name')) bindings.add(name.text);
        }
        if (LEFT_BINDINGS.has(n.type)) {
          const left = n.childForFieldName(n.type === 'type_switch_statement' ? 'alias' : 'left');
          if (left?.type === 'identifier') bindings.add(left.text);
          else for (const name of left?.namedChildren ?? []) if (name?.type === 'identifier') bindings.add(name.text);
        }
        if (n.type === 'call_expression') pending.push(n);
      });
      // Treat a binding anywhere in the enclosing declaration as potential shadowing, even in a sibling block.
      for (const node of pending) {
        if (node.childForFieldName('type_arguments')) continue;
        const fn = node.childForFieldName('function');
        const receiver = fn?.childForFieldName('operand');
        const qualifier = receiver?.type === 'identifier' ? receiver.text : undefined;
        const name = fn?.type === 'identifier' ? fn.text
          : fn?.type === 'selector_expression' && qualifier ? fn.childForFieldName('field')?.text : undefined;
        if (!name || bindings.has(qualifier ?? name)) continue;
        const args = node.childForFieldName('arguments')?.namedChildren.filter((n) => n && n.type !== 'comment') ?? [];
        const uncertainArity = args.length === 1 && ['call_expression', 'parenthesized_expression', 'type_conversion_expression'].includes(args[0]!.type);
        calls.set(callKey(node.startPosition.row + 1, node.startPosition.column), { name, qualifier, uncertainArity });
      }
    }
    return calls;
  } finally { tree.delete(); }
}

export class GoGrounder {
  private readonly packages = new Map<string, GoPackage | null>();

  constructor(private readonly db: Db, private readonly root: string) {}

  private source(rel: string): GoSource | null {
    const file = fileFacts(this.db, rel);
    if (!file || file.language !== 'go' || file.status !== 'ok' || file.isGenerated) return null;
    const buffer = readFileSync(path.join(this.root, rel));
    if (sha1(buffer) !== indexedFileHash(this.db, file.id)) return null;
    const text = buffer.toString('utf8');
    if (BUILD_CONSTRAINT.test(text)) return null;
    const imports = importFacts(this.db, file.id);
    if (imports.some((i) => i.module === 'C')) return null;
    const tree = parse('go', text);
    try {
      const nodes = tree.rootNode.namedChildren;
      const clause = nodes.find((n) => n?.type === 'package_clause');
      const name = clause?.namedChildren.find((n) => n?.type === 'package_identifier')?.text;
      if (!name || tree.rootNode.hasError) return null;
      if (tree.rootNode.descendantsOfType('import_spec').some((n) => n?.childForFieldName('path')?.text.includes('\\'))) return null;
      const facts = topLevelFacts(this.db, file.id);
      const names = new Map<string, Declaration[]>();
      for (const node of nodes) {
        if (node?.type === 'function_declaration') {
          const func = node.childForFieldName('name')?.text;
          if (!func) return null;
          const fn = node.childForFieldName('type_parameters') ? undefined
            : facts.find((s) => s.kind === 'function' && s.name === func && s.startByte === node.startIndex);
          addName(names, func, { fn });
        } else if (node && ['type_declaration', 'var_declaration', 'const_declaration'].includes(node.type)) {
          // Include declarations not necessarily represented as package symbols by the extractor (e.g. grouped vars).
          for (const spec of node.descendantsOfType(['type_spec', 'type_alias', 'var_spec', 'const_spec'])) {
            for (const n of spec?.childrenForFieldName('name') ?? []) addName(names, n.text, {});
          }
        }
      }
      return { name, text, imports, names };
    } finally { tree.delete(); }
  }

  private readPackage(dir: string): GoPackage | null {
    const absolute = path.join(this.root, dir);
    if (realpathSync(absolute) !== path.resolve(realpathSync(this.root), dir)) return null;
    const files = new Map<string, GoSource>();
    const names = new Map<string, Declaration[]>();
    let name: string | undefined;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (/^[._]/.test(entry.name) || !entry.name.endsWith('.go') || entry.name.endsWith('_test.go') || entry.isDirectory()) continue;
      if (!entry.isFile() || PLATFORM_FILE.test(entry.name)) return null;
      const rel = path.posix.join(dir, entry.name);
      const f = this.source(rel);
      if (!f || (name && f.name !== name)) return null;
      name = f.name;
      files.set(rel, f);
      for (const [symbol, entries] of f.names) addName(names, symbol, ...entries);
    }
    return name ? { name, files, names } : null;
  }

  private package(dir: string): GoPackage | null {
    if (!this.packages.has(dir)) {
      let result: GoPackage | null = null;
      try { result = this.readPackage(dir); } catch { /* A missing parser, directory or source leaves the package unchecked. */ }
      this.packages.set(dir, result);
    }
    return this.packages.get(dir) ?? null;
  }

  private importedPackage(mod: NonNullable<ReturnType<typeof goModFor>>, importPath: string): GoPackage | null {
    if (importPath !== mod.module && !importPath.startsWith(mod.module + '/')) return null;
    if ([...mod.requires.keys(), ...mod.replaces.keys()].some((prefix) => importPath === prefix || importPath.startsWith(prefix + '/'))) return null;
    if (!importPath.split('/').every((part) => part && part !== '.' && part !== '..' && part !== 'vendor' && !part.includes('\\'))) return null;
    if (!importPath.split('/')[0]!.includes('.')) {
      const toolchain = goRoot();
      if (!toolchain || existsSync(path.join(toolchain.dir, 'src', importPath))) return null;
    }
    const absolute = path.join(mod.dir, importPath.slice(mod.module.length));
    const dir = path.relative(this.root, absolute).split(path.sep).join('/') || '.';
    if (goModFor(this.root, path.join(dir, 'package.go'))?.dir !== mod.dir) return null;
    const pkg = this.package(dir);
    return pkg?.name === 'main' ? null : pkg;
  }

  verify(file: FileFacts, live: (call: CallFact, lines: string[]) => boolean): VerifyResult {
    const res: VerifyResult = { file: file.path, unchecked: null, findings: [], checked: 0 };
    if (file.path.endsWith('_test.go')) return { ...res, unchecked: 'Go test package' };
    try {
      const pkg = this.package(path.posix.dirname(file.path));
      const source = pkg?.files.get(file.path);
      if (!pkg || !source) return { ...res, unchecked: 'ambiguous or incomplete Go package' };
      const mod = goModFor(this.root, file.path);
      const imports = new Map<string, (GoPackage | null)[]>();
      for (const im of source.imports) {
        if (im.alias === '.' || im.alias === '_') continue;
        const target = mod ? this.importedPackage(mod, im.module) : null;
        const local = im.alias ?? target?.name;
        if (local) imports.set(local, [...(imports.get(local) ?? []), target]);
      }
      const dotImport = source.imports.some((i) => i.alias === '.');
      const syntax = simpleCalls(source.text);
      const lines = source.text.split('\n');
      for (const call of callFacts(this.db, file.id)) {
        const site = syntax.get(callKey(call.line, call.column));
        if (!site || !live(call, lines)) continue;
        const { name, qualifier } = site;
        if (call.calleeText !== (qualifier ? `${qualifier}.${name}` : name)) continue;
        const matching = qualifier ? imports.get(qualifier) : null;
        const target = qualifier ? matching?.length === 1 ? matching[0] : null : pkg;
        if (!target || (qualifier ? !/^\p{Lu}/u.test(name) : dotImport || BUILTINS.has(name))) continue;
        res.checked!++;
        const matches = target.names.get(name);
        if (!matches) {
          res.findings.push({ file: file.path, line: call.line, column: call.column, kind: 'unknown-member', name: call.calleeText,
            message: `package ${target.name} has no ${qualifier ? 'exported ' : ''}declaration '${name}'.`, blocking: true, suggestions: [] });
          continue;
        }
        const fn = matches.length === 1 ? matches[0]?.fn : undefined;
        if (!fn || site.uncertainArity || call.hasSpread) continue;
        const { minArity, maxArity } = fn;
        if (call.argCount < minArity || (maxArity !== null && call.argCount > maxArity)) {
          const expected = maxArity === null ? `at least ${minArity}` : String(maxArity);
          res.findings.push({ file: file.path, line: call.line, column: call.column, kind: 'arity', name: call.calleeText,
            message: `${call.calleeText}() expects ${expected} argument(s), got ${call.argCount} — ${fn.signature} (${fn.file}:${fn.line}).`,
            blocking: true, suggestions: [] });
        }
      }
      return res;
    } catch {
      return { ...res, checked: 0, findings: [], unchecked: 'Go package unavailable' };
    }
  }
}
