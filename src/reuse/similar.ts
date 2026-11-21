import { z } from 'zod';
import { vocabulary } from '../extract/fingerprint.js';
import { adapterFor, initParsers } from '../lang/index.js';
import { estimateTokens, fitToBudget } from '../util/tokens.js';
import { CandidateIndex } from './candidates.js';
import { probability, thresholds } from './model.js';
import { pairSignals, type ComparableSymbol } from './signals.js';

export const similarInputSchema = z.object({
  description: z.string().trim().min(1).max(10000),
  name: z.string().max(300).optional(),
  signature: z.string().max(10000).optional(),
  code: z.string().max(100000).optional(),
  language: z.enum(['typescript', 'tsx', 'javascript', 'python']).default('typescript'),
}).strict();
export type SimilarInput = z.input<typeof similarInputSchema>;

export const REMINDER = 'State REUSE <symbol> / EXTEND <symbol> / NEW because <reason>.';
export interface SimilarMatch {
  symbol: string;
  file: string;
  line: number;
  probability: number;
  verdict: 'reuse as-is' | 'extend' | 'related';
  why: string;
}
export interface SimilarResult { matches: SimilarMatch[]; reminder: string }

export function renderSimilar(result: SimilarResult): string {
  return [...(result.matches.length ? result.matches.map((m) => `${m.verdict}: ${m.symbol} (${m.file}:${m.line}) — ${m.why}`) : ['No similar symbols found.']), result.reminder].join('\n');
}

export async function findSimilar(index: CandidateIndex, input: SimilarInput): Promise<SimilarResult> {
  const args = similarInputSchema.parse(input);
  let query: ComparableSymbol = { name: args.name ?? '', fingerprint: null, params: null, returnType: null, docstring: args.description };
  if (args.code || args.signature) {
    await initParsers();
    const python = args.language === 'python';
    const signature = args.signature?.trim().replace(/[:;]$/, '') ?? '';
    const declaration = python ? (/^(async\s+)?def\s/.test(signature) ? signature : `def ${signature}`)
      : (/^(export\s+)?(async\s+)?function\s/.test(signature) ? signature : `function ${signature}`);
    const source = args.code ?? `${declaration}${python ? ':\n    pass' : ' {}'}`;
    const extracted = adapterFor(args.language).extract(source, args.language);
    const symbol = extracted.symbols[0];
    if (extracted.hasErrors || !symbol) throw new Error('Draft must contain a valid symbol; set language for Python drafts.');
    query = { ...symbol, name: args.name ?? symbol.name, fingerprint: args.code ? symbol.fingerprint : null,
      docstring: `${args.description} ${symbol.docstring ?? ''}` };
  }
  const extra = vocabulary([args.name ?? '', args.description]);
  query = { ...query, docstring: `${query.docstring ?? ''} ${Object.keys(extra).join(' ')}` };
  const matches = index.find(query).map((s): SimilarMatch => {
    const signals = pairSignals(query, s, index.idf);
    const p = probability(signals);
    const top = Object.entries(signals).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).slice(0, 2);
    return { symbol: s.qualifiedName, file: s.file, line: s.line, probability: p,
      verdict: p >= thresholds.block ? 'reuse as-is' : p >= thresholds.warn ? 'extend' : 'related',
      why: top.map(([key, value]) => `${key} ${Math.round(value * 100)}%`).join(', ') };
  }).sort((a, b) => b.probability - a.probability || a.file.localeCompare(b.file) || a.line - b.line).slice(0, 5);
  const render = (m: SimilarMatch) => JSON.stringify(m);
  const safe = matches.filter((m) => estimateTokens(render(m)) < 400);
  const kept = fitToBudget(safe, render, 500, estimateTokens(JSON.stringify({ matches: [], reminder: REMINDER })) + 10).items;
  return { matches: kept, reminder: REMINDER };
}
