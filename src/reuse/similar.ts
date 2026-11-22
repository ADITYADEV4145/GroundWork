import { vocabulary } from '../extract/fingerprint.js';
import { initParsersFor } from '../lang/parser.js';
import { estimateTokens, fitToBudget } from '../util/tokens.js';
import { CandidateIndex } from './candidates.js';
import { scoreSignals } from './model.js';
import { pairSignals, type ComparableSymbol } from './signals.js';
import { extractReuseSource } from './source.js';
import { similarInputSchema, type SimilarInput } from './similar-input.js';

export { similarInputSchema, type SimilarInput } from './similar-input.js';

export interface SimilarMatch {
  symbol: string;
  file: string;
  line: number;
  probability: number;
  verdict: 'reuse as-is' | 'extend' | 'related';
  why: string;
}
export interface SimilarResult { matches: SimilarMatch[] }

export function renderSimilar(result: SimilarResult): string {
  return result.matches.length ? result.matches.map((m) => `${m.verdict}: ${m.symbol} (${m.file}:${m.line}) — ${m.why}`).join('\n') : 'No matches.';
}

export async function findSimilar(index: CandidateIndex, input: SimilarInput): Promise<SimilarResult> {
  const args = similarInputSchema.parse(input);
  let query: ComparableSymbol = { name: args.name ?? '', fingerprint: null, params: null, returnType: null, docstring: args.description };
  let embeddingText = args.description;
  if (args.code || args.signature) {
    await initParsersFor([args.language]);
    const python = args.language === 'python';
    const signature = args.signature?.trim().replace(/[:;]$/, '') ?? '';
    const declaration = python ? (/^(async\s+)?def\s/.test(signature) ? signature : `def ${signature}`)
      : args.language === 'rust' ? (/^(pub(?:\([^)]*\))?\s+)?(async\s+)?fn\s/.test(signature) ? signature : `fn ${signature}`)
      : args.language === 'ruby' ? (/^def\s/.test(signature) ? signature : `def ${signature}`)
      : ['java', 'csharp'].includes(args.language) ? signature
      : args.language === 'go' ? (/^func\s/.test(signature) ? signature : `func ${signature}`)
      : (/^(export\s+)?(async\s+)?function\s/.test(signature) ? signature : `function ${signature}`);
    const source = args.code ?? (['java', 'csharp'].includes(args.language) ? `class Draft { ${declaration} {} }` : `${args.language === 'go' ? 'package draft\n' : ''}${declaration}${python ? ':\n    pass' : args.language === 'ruby' ? '\nend' : ' {}'}`);
    const extracted = extractReuseSource(source, args.language);
    const symbol = ['java', 'csharp'].includes(args.language) && !args.code ? extracted.symbols.find((s) => s.kind === 'method') : extracted.symbols[0];
    if (extracted.hasErrors || !symbol) throw new Error('Draft must contain a valid symbol; set language for Python drafts.');
    embeddingText = args.code ? source.slice(symbol.startByte, symbol.endByte) : args.description;
    query = { ...symbol, name: args.name ?? symbol.name, fingerprint: args.code ? symbol.fingerprint : null,
      docstring: `${args.description} ${symbol.docstring ?? ''}` };
  }
  const extra = vocabulary([args.name ?? '', args.description]);
  query = { ...query, docstring: `${query.docstring ?? ''} ${Object.keys(extra).join(' ')}` };
  query.embedding = await index.embedQuery(embeddingText);
  const matches = index.find(query).map((s): SimilarMatch => {
    const signals = pairSignals(query, s, index.idf);
    const score = scoreSignals(signals, query.embedding?.model);
    const p = score.probability, thresholds = score.thresholds;
    const top = Object.entries(signals).filter(([key, value]) => key !== 'meaning' && value > 0).sort((a, b) => b[1] - a[1]).slice(0, 2);
    return { symbol: s.qualifiedName, file: s.file, line: s.line, probability: p,
      verdict: p >= thresholds.block ? 'reuse as-is' : p >= thresholds.warn ? 'extend' : 'related',
      why: [...top.map(([key, value]) => `${key} ${Math.round(value * 100)}%`), ...(score.meaning ? [`meaning ${Math.round(signals.meaning! * 100)}%`] : [])].join(', ') };
  }).sort((a, b) => b.probability - a.probability || a.file.localeCompare(b.file) || a.line - b.line)
    .filter((m) => args.detail === 'full' || m.verdict !== 'related').slice(0, 5);
  const render = (m: SimilarMatch) => JSON.stringify(m);
  const safe = matches.filter((m) => estimateTokens(render(m)) < 400);
  const kept = fitToBudget(safe, render, 500, estimateTokens(JSON.stringify({ matches: [] })) + 10).items;
  return { matches: kept };
}
