import { createRequire } from 'node:module';
import path from 'node:path';
import type * as TS from 'typescript';
import type { TypeFinding } from './index.js';

const services = new Map<string, { service: TS.LanguageService; overlay: Map<string, string>; roots: Set<string> }>();
const blockingCodes = new Set([2304, 2305, 2724, 2339, 2551, 2349, 2554, 2555, 2556, 2345, 2353, 2561]);

export function projectService(root: string, file: string) {
  const ts = createRequire(path.join(root, 'package.json'))('typescript') as typeof TS;
  const config = ts.findConfigFile(path.dirname(file), ts.sys.fileExists);
  const read = config ? ts.readConfigFile(config, ts.sys.readFile) : null;
  if (read?.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
  const parsed = config ? ts.parseJsonConfigFileContent(read!.config, ts.sys, path.dirname(config)) : null;
  const error = parsed?.errors.find((d) => d.code !== 18003);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, ' '));
  const key = `${root}\0${config ?? file}\0${JSON.stringify([parsed?.options, parsed?.fileNames, parsed?.projectReferences])}`;
  let cached = services.get(key);
  if (!cached) {
    const options = parsed?.options ?? { strict: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext };
    const overlay = new Map<string, string>();
    const roots = new Set([...(parsed?.fileNames ?? []), file]);
    const host: TS.LanguageServiceHost = {
      getCompilationSettings: () => options,
      getScriptFileNames: () => [...roots],
      getScriptVersion: (f) => overlay.get(f) ?? ts.sys.readFile(f) ?? '',
      getScriptSnapshot: (f) => { const text = overlay.get(f) ?? ts.sys.readFile(f); return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text); },
      getCurrentDirectory: () => root,
      getProjectReferences: () => parsed?.projectReferences,
      getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
      fileExists: ts.sys.fileExists, readFile: (f) => overlay.get(f) ?? ts.sys.readFile(f), readDirectory: ts.sys.readDirectory,
    };
    cached = { service: ts.createLanguageService(host), overlay, roots };
    services.set(key, cached);
    if (services.size > 8) { const first = services.keys().next().value!; services.get(first)!.service.dispose(); services.delete(first); }
  }
  cached.roots.add(file);
  return { ts, ...cached };
}

export function tsDiagnostics(root: string, file: string, text?: string, others: Map<string, string> = new Map()): TypeFinding[] {
  const absolute = path.resolve(root, file);
  const { ts, service, overlay } = projectService(root, absolute);
  const overridden = [...others].map(([f, t]) => [path.resolve(root, f), t] as const).filter(([f]) => f !== absolute);
  for (const [f, t] of overridden) overlay.set(f, t);
  if (text !== undefined) overlay.set(absolute, text);
  try {
    return [...service.getSyntacticDiagnostics(absolute), ...service.getSemanticDiagnostics(absolute)].flatMap((d) => {
      if (!d.file || d.start === undefined) return [];
      const pos = d.file.getLineAndCharacterOfPosition(d.start);
      const name = d.file.text.slice(d.start, d.start + (d.length ?? 0)).replace(/^['"]|['"]$/g, '');
      return [{ file, line: pos.line + 1, column: pos.character + 1, name, code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, ' '), language: 'typescript' as const,
        blocking: d.category === ts.DiagnosticCategory.Error && blockingCodes.has(d.code) }];
    });
  } finally { overlay.delete(absolute); for (const [f] of overridden) overlay.delete(f); }
}

export function navigate(root: string, target: string, operation: 'def' | 'impl' | 'refs') {
  const match = /^(.*):(\d+):(\d+)$/.exec(target);
  if (!match) throw new Error('Expected file:line:col');
  const file = path.resolve(root, match[1]!);
  if (!/\.[cm]?tsx?$/.test(file)) return { unavailable: 'TypeScript navigation only' };
  const { service } = projectService(root, file);
  const source = service.getProgram()?.getSourceFile(file);
  if (!source) return { unavailable: 'file not in project' };
  const position = source.getPositionOfLineAndCharacter(Number(match[2]) - 1, Number(match[3]) - 1);
  const entries = operation === 'def' ? service.getDefinitionAtPosition(file, position) : operation === 'impl' ? service.getImplementationAtPosition(file, position) : service.getReferencesAtPosition(file, position);
  return (entries ?? []).map((e) => {
    const sf = service.getProgram()?.getSourceFile(e.fileName);
    const p = sf?.getLineAndCharacterOfPosition(e.textSpan.start);
    return { file: path.relative(root, e.fileName), line: (p?.line ?? 0) + 1, column: (p?.character ?? 0) + 1 };
  });
}
