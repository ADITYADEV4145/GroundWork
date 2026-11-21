import type { Command } from 'commander';
import { findSymbols, getSymbolDetail, searchSymbols } from '../../index/query.js';
import type { SymbolKind } from '../../types.js';
import { fitToBudget } from '../../util/tokens.js';
import { globalOpts, withIndex } from '../context.js';
import { emit, fail } from '../output.js';

export function register(program: Command): void {
  program
    .command('symbols')
    .description('search symbols by name, words, docs or path')
    .argument('<query...>')
    .option('-k, --kind <kinds>', 'comma-separated kinds (function,class,method,...)')
    .option('-p, --path <glob>', 'only files matching this glob')
    .option('-n, --limit <n>', 'max results', '20')
    .option('--no-tests', 'leave out test files')
    .option('--no-refresh', 'skip the incremental refresh')
    .action(async (query: string[], o: { kind?: string; path?: string; limit: string; tests: boolean; refresh: boolean }, cmd: Command) => {
      const opts = globalOpts(cmd);
      await withIndex({ ...opts, refresh: o.refresh }, ({ db }) => {
        const hits = searchSymbols(db, query.join(' '), {
          limit: Number(o.limit),
          ...(o.kind ? { kinds: o.kind.split(',') as SymbolKind[] } : {}),
          ...(o.path ? { pathGlob: o.path } : {}),
          includeTests: o.tests,
        });
        emit(opts, hits, () => {
          if (!hits.length) return 'no matches';
          const fit = fitToBudget(hits, (h) => `${h.file}:${h.line} ${h.kind} ${h.signature}`, 1500);
          const lines = fit.items.map((h) => `${h.file}:${h.line}  ${h.kind.padEnd(9)} ${h.signature}`);
          if (fit.truncated) lines.push(`… ${fit.truncated} more (use --limit / --path)`);
          return lines.join('\n');
        });
      });
    });

  program
    .command('show')
    .description('one symbol: signature, docs, members, callers and callees')
    .argument('<symbol>', 'name, Qualified.name, file:name or id')
    .option('--no-refresh', 'skip the incremental refresh')
    .action(async (ref: string, o: { refresh: boolean }, cmd: Command) => {
      const opts = globalOpts(cmd);
      await withIndex({ ...opts, refresh: o.refresh }, ({ db }) => {
        const matches = findSymbols(db, ref);
        if (!matches.length) {
          const near = searchSymbols(db, ref, { limit: 5 });
          fail(opts, `no symbol '${ref}'${near.length ? `; did you mean: ${near.map((n) => n.qualifiedName).join(', ')}` : ''}`);
        }
        if (matches.length > 1 && !opts.json) {
          process.stdout.write(`${matches.length} symbols named '${ref}'; showing the first. Others:\n`);
          for (const m of matches.slice(1, 10)) process.stdout.write(`  ${m.file}:${m.line} ${m.qualifiedName}\n`);
        }
        const d = getSymbolDetail(db, matches[0]!.id)!;
        emit(opts, matches.length > 1 ? { ...d, otherMatches: matches.slice(1).map((m) => ({ id: m.id, file: m.file, line: m.line })) } : d, () => {
          const out = [`${d.qualifiedName}  (${d.kind}${d.exported ? ', exported' : ''}${d.isAsync ? ', async' : ''})`, `${d.file}:${d.line}-${d.endLine}`, d.signature];
          if (d.docstring) out.push(d.docstring.split('\n').slice(0, 6).join('\n'));
          if (d.decorators.length) out.push(`decorators: ${d.decorators.join(', ')}`);
          out.push(`arity: ${d.minArity}..${d.maxArity ?? '∞'}`);
          if (d.members.length) out.push(`members: ${d.members.map((m) => m.name).join(', ')}`);
          out.push(`callers (${d.callersTotal}):${d.callers.length ? '' : ' none found'}`);
          for (const c of d.callers) out.push(`  ${c.file}:${c.line}${c.caller ? ` in ${c.caller}` : ''} [${c.confidence}]`);
          if (d.callersTotal > d.callers.length) out.push(`  … ${d.callersTotal - d.callers.length} more`);
          if (d.callees.length) out.push(`calls: ${[...new Set(d.callees.map((c) => c.target ?? c.name))].slice(0, 20).join(', ')}`);
          return out.join('\n');
        });
      });
    });
}
