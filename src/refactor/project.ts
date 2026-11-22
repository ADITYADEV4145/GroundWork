import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { discoverFiles, looksGenerated } from '../index/discover.js';
import { sourceLocation } from '../index/navigation.js';
import { fileFacts, findSymbols, symbolFact } from '../index/query.js';
import type { SymbolFact } from '../index/query.js';
import type { ToolContext } from '../mcp/registry.js';
import { sha1 } from '../util/hash.js';
import { readRepoFile, repoRelative } from '../util/repo-file.js';

const scripts = /\.[cm]?[jt]sx?$/i;
const compilerPath = (file: string) => path.resolve(file).split(path.sep).join('/');
const fileKey = (file: string) => ts.sys.useCaseSensitiveFileNames ? compilerPath(file) : compilerPath(file).toLowerCase();
export const MAX_BODY = 32_768;
export const MAX_SITES = 1_000;

export interface TextEdit {
  start: number;
  end: number;
  text: string;
  nameOffset?: number;
}

export interface FileEdit {
  file: string;
  before: string;
  after: string;
  edits: TextEdit[];
}

export type RefactorRequest = { symbol: string } & ({ name: string; body?: never } | { body: string; name?: never });

export function readEditable({ root, db, config }: ToolContext, file: string): string {
  const absolute = path.join(root, file);
  const facts = fileFacts(db, file);
  if (!facts || facts.status !== 'ok' || facts.isGenerated || !scripts.test(file) || /\.d\.[cm]?ts$/i.test(file) ||
    realpathSync(absolute) !== path.join(realpathSync(root), file)) {
    throw new Error(`Not an editable, fully indexed TypeScript/JavaScript file: ${file}`);
  }
  const bytes = readRepoFile(root, file, config.index.maxFileBytes);
  const text = bytes?.toString('utf8');
  if (text === undefined || !Buffer.from(text).equals(bytes!) || looksGenerated(file, text)) {
    throw new Error(`Not an editable UTF-8 source file: ${file}`);
  }
  return text;
}

function resolve(ctx: ToolContext, ref: string): SymbolFact {
  const colon = ref.lastIndexOf(':');
  const matches = findSymbols(ctx.db, ref).filter((s) => colon < 0 || s.file === ref.slice(0, colon));
  if (matches.length !== 1) {
    const choices = matches.slice(0, 5).map((s) => `${s.file}:${s.qualifiedName} (line ${s.line}, id ${s.id})`);
    throw new Error(matches.length ? `Ambiguous symbol; choose an exact id: ${choices.join(', ')}` : `No exact indexed symbol: ${ref}`);
  }
  return symbolFact(ctx.db, matches[0]!.id)!;
}

function projectConfig(root: string, absolute: string): string | undefined {
  for (let dir = path.dirname(path.resolve(absolute)); ; dir = path.dirname(dir)) {
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
      const file = path.join(dir, name);
      if (existsSync(file)) return file;
    }
    if (fileKey(dir) === fileKey(root) || path.dirname(dir) === dir) return undefined;
  }
}

function project(ctx: ToolContext, file: string) {
  const absolute = compilerPath(path.join(ctx.root, file));
  const configFile = projectConfig(ctx.root, absolute);
  const files = discoverFiles(ctx.root, { ...ctx.config, index: { ...ctx.config.index, include: [], exclude: [] } })
    .filter((p) => scripts.test(p));
  if (files.length > 3_000) throw new Error('Refactoring supports up to 3,000 repository source files.');
  const options: ts.CompilerOptions = {
    allowJs: true, checkJs: true, noEmit: true, skipLibCheck: true,
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    ...(!configFile && { jsx: ts.JsxEmit.Preserve }),
  };
  const peers = files.map((f) => path.join(ctx.root, f)).filter((f) => projectConfig(ctx.root, f) === configFile);
  let roots = peers;
  let references: readonly ts.ProjectReference[] | undefined;
  if (configFile) {
    const read = ts.readConfigFile(configFile, ts.sys.readFile);
    if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configFile), {}, configFile);
    if (parsed.errors.length) throw new Error(ts.flattenDiagnosticMessageText(parsed.errors[0]!.messageText, ' '));
    references = parsed.projectReferences;
    Object.assign(options, parsed.options, { allowJs: parsed.options.allowJs ?? /jsconfig\.json$/.test(configFile) });
    // Test and tooling files may be excluded from compilation but still consume the project's symbols.
    roots = [...new Set([...parsed.fileNames, ...peers.filter((f) => options.allowJs || /\.[cm]?tsx?$/i.test(f))])];
  }
  if (roots.length > 3_000) throw new Error('Refactoring supports up to 3,000 configured root files.');
  const changed = new Map<string, string>();
  const snapshots = new Map<string, ts.IScriptSnapshot | undefined>();
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => options,
    getScriptFileNames: () => roots,
    getScriptVersion: (f) => changed.has(fileKey(f)) ? '1' : '0',
    getScriptSnapshot(f) {
      const key = fileKey(f);
      if (changed.has(key)) return ts.ScriptSnapshot.fromString(changed.get(key)!);
      if (!snapshots.has(key)) {
        const text = ts.sys.readFile(f);
        snapshots.set(key, text === undefined ? undefined : ts.ScriptSnapshot.fromString(text));
      }
      return snapshots.get(key);
    },
    getCurrentDirectory: () => ctx.root,
    getProjectReferences: () => references,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    realpath: ts.sys.realpath,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  const service = ts.createLanguageService(host);
  const isFullyCovered = () => files.every((f) => {
    if (/\.d\.[cm]?ts$/i.test(f)) return true;
    const file = path.join(ctx.root, f);
    return projectConfig(ctx.root, file) === configFile && service.getProgram()!.getSourceFile(file) !== undefined;
  });
  return { absolute, service, changed, files, isFullyCovered };
}

type Declaration = { name: ts.Identifier; node: ts.Node; body?: ts.ConciseBody };

function declarations(source: ts.SourceFile, name: string): Declaration[] {
  const found: Declaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node) ||
      ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) ||
      ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) {
      if (node.name && ts.isIdentifier(node.name) && node.name.text === name) {
        const initializer = ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) ? node.initializer : undefined;
        const body = ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ? node.body :
          initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) ? initializer.body : undefined;
        found.push({ name: node.name, node, body });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function locate(source: ts.SourceFile, fact: SymbolFact): Declaration {
  const hits = declarations(source, fact.name).filter(({ name, node }) =>
    name.getStart(source) >= fact.startByte && name.end <= fact.endByte &&
    (node.end === fact.endByte || (source.text[node.end - 1] === ';' && node.end === fact.endByte + 1)));
  if (hits.length !== 1) throw new Error('The indexed symbol has no unique supported compiler declaration.');
  return hits[0]!;
}

function callableType(program: ts.Program, body: ts.ConciseBody): string | undefined {
  const checker = program.getTypeChecker();
  const signature = checker.getSignatureFromDeclaration(body.parent as ts.SignatureDeclaration);
  if (!signature) return undefined;
  return checker.signatureToString(signature, body.parent, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType);
}

const key = (file: string, start: number) => `${fileKey(file)}\0${start}`;
const errorText = (diagnostic: ts.Diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');

function compilerErrors(service: ts.LanguageService, root: string): ts.Diagnostic[] {
  const files = service.getProgram()!.getSourceFiles().filter((s) =>
    repoRelative(root, s.fileName) && !compilerPath(s.fileName).split('/').includes('node_modules'));
  return files.flatMap((f) => [...service.getSyntacticDiagnostics(f.fileName), ...service.getSemanticDiagnostics(f.fileName)])
    .filter((d) => d.category === ts.DiagnosticCategory.Error);
}

export function originalPosition(edits: TextEdit[], start: number): number {
  let offset = 0;
  for (const edit of edits) {
    if (start < edit.start + offset) break;
    if (start < edit.start + offset + edit.text.length) return -1;
    offset += edit.text.length - (edit.end - edit.start);
  }
  return start - offset;
}

function assertNoNewErrors(ctx: ToolContext, service: ts.LanguageService, before: ts.Diagnostic[], edits: FileEdit[]) {
  const byFile = new Map(edits.map((f) => [fileKey(path.join(ctx.root, f.file)), f.edits]));
  const signature = (d: ts.Diagnostic, start = d.start ?? -1) => `${d.file ? key(d.file.fileName, start) : start}\0${d.code}\0${errorText(d)}`;
  const baseline = new Set(before.map((d) => signature(d)));
  for (const d of compilerErrors(service, ctx.root)) {
    const changes = d.file && byFile.get(fileKey(d.file.fileName));
    const start = changes && d.start !== undefined ? originalPosition(changes, d.start) : d.start;
    if (baseline.has(signature(d, start))) continue;
    const line = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 1;
    throw new Error(`Compiler rejected candidate: ${path.relative(ctx.root, d.file?.fileName ?? ctx.root)}:${line} TS${d.code} ${errorText(d)}`);
  }
}

export function planEdits(ctx: ToolContext, request: RefactorRequest): { edits: FileEdit[]; target: SymbolFact } {
  const target = resolve(ctx, request.symbol);
  const original = readEditable(ctx, target.file);
  if (sourceLocation(ctx.db, target.id)?.hash !== sha1(original)) throw new Error('The indexed symbol is stale. Refresh and try again.');
  const { absolute, service, changed, files, isFullyCovered } = project(ctx, target.file);
  try {
    const source = service.getProgram()?.getSourceFile(absolute);
    if (!source || source.text !== original) {
      throw new Error('The target must be in the TypeScript compiler project, unchanged on disk, and UTF-8 without a BOM.');
    }
    const declaration = locate(source, target);
    const changes = new Map<string, TextEdit[]>();
    const start = declaration.name.getStart(source);
    const rename = request.name;
    const requireStableType = rename === undefined && !isFullyCovered();
    let beforeType: string | undefined;
    if (rename !== undefined) {
      const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, rename);
      if (!/^[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*$/u.test(rename) || scanner.scan() !== ts.SyntaxKind.Identifier ||
        rename === target.name || rename.length > 128) throw new Error('Provide a different, valid TypeScript identifier.');
      const info = service.getRenameInfo(absolute, start, { allowRenameOfImportPath: false });
      if (!info.canRename) throw new Error(info.localizedErrorMessage);
      const sites = service.findRenameLocations(absolute, start, false, false, true) ?? [];
      if (!sites.length || sites.length > MAX_SITES) throw new Error(`Rename must have between 1 and ${MAX_SITES} static locations.`);
      for (const site of sites) {
        const file = repoRelative(ctx.root, site.fileName);
        if (!file) throw new Error('Rename reaches a file outside the repository.');
        const prefix = site.prefixText ?? '';
        const span = site.textSpan;
        const edit = { start: span.start, end: span.start + span.length, text: prefix + rename + (site.suffixText ?? ''), nameOffset: prefix.length };
        if (!changes.has(file)) changes.set(file, []);
        changes.get(file)!.push(edit);
      }
      for (const file of files) {
        if (service.getProgram()!.getSourceFile(path.join(ctx.root, file))) continue;
        const text = readRepoFile(ctx.root, file, ctx.config.index.maxFileBytes)?.toString('utf8');
        if (text === undefined || text.includes(target.name) || /\\u(?:\{|[\da-f]{4})/i.test(text)) {
          throw new Error(`Rename may be incomplete: ${file} is outside the compiler project.`);
        }
      }
    } else {
      const body = declaration.body;
      if (!body || !['function', 'method', 'component'].includes(target.kind)) throw new Error('Only named functions and methods with bodies can be edited.');
      if (!request.body.trim() || request.body.length > MAX_BODY) throw new Error(`Provide a complete function body up to ${MAX_BODY} characters.`);
      if (requireStableType) beforeType = callableType(service.getProgram()!, body);
      changes.set(target.file, [{ start: body.getStart(source), end: body.end, text: request.body }]);
    }
    const beforeErrors = compilerErrors(service, ctx.root);
    const positions = new Set<string>();
    let newStart: number | undefined;
    const edits = [...changes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([file, spans]) => {
      const before = readEditable(ctx, file);
      const fileName = path.join(ctx.root, file);
      if (service.getProgram()!.getSourceFile(fileName)?.text !== before) throw new Error(`Compiler snapshot changed or has an unsupported encoding: ${file}`);
      const ordered = spans.sort((a, b) => a.start - b.start);
      let after = '', cursor = 0;
      for (const edit of ordered) {
        if (edit.start < cursor || edit.start >= edit.end || edit.end > before.length) throw new Error('Compiler returned overlapping or invalid edit locations.');
        const newOffset = after.length + edit.start - cursor + (edit.nameOffset ?? 0);
        if (rename !== undefined) positions.add(key(fileName, newOffset));
        if (file === target.file && edit.start === start) newStart = newOffset;
        after += before.slice(cursor, edit.start) + edit.text;
        cursor = edit.end;
      }
      after += before.slice(cursor);
      if (after === before) throw new Error('No changes.');
      return { file, before, after, edits: ordered };
    });
    for (const f of edits) changed.set(fileKey(path.join(ctx.root, f.file)), f.after);
    if (rename !== undefined) {
      const renamed = newStart === undefined ? [] : service.findRenameLocations(absolute, newStart, false, false, true) ?? [];
      const actual = new Set(renamed.map((r) => key(r.fileName, r.textSpan.start)));
      if (actual.size !== positions.size || [...positions].some((p) => !actual.has(p))) throw new Error('Rename would change symbol bindings or capture a different reference.');
    } else {
      const candidate = service.getProgram()!.getSourceFile(absolute)!;
      const body = declarations(candidate, target.name).find((d) => d.name.getStart(candidate) === start)?.body;
      const edit = edits[0]!.edits[0]!;
      const offset = edit.text.length - edit.text.trimStart().length;
      if (!body || body.getStart(candidate) !== edit.start + offset || body.end !== edit.start + edit.text.trimEnd().length) {
        throw new Error('Replacement must be exactly one function body, without changing its surrounding declaration.');
      }
      if (requireStableType && (beforeType === undefined || beforeType !== callableType(service.getProgram()!, body))) {
        throw new Error('Cannot change the callable type when files outside the compiler project may use it.');
      }
    }
    assertNoNewErrors(ctx, service, beforeErrors, edits);
    return { edits, target };
  } finally {
    service.dispose();
  }
}
