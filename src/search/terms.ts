const STOP = new Set('a an the this that these those where what which who why how do does did we i you it is are was were be been being to of for in on at by with and or as can could would should code function method please me my our'.split(' '));
const GROUPS = ['remove delete', 'fetch get load request', 'config configuration settings options', 'auth authentication login credential credentials', 'parse decode', 'error exception fail failure', 'create make build', 'directory folder', 'file document', 'symbol declaration identifier', 'call invocation invoke', 'cache cached', 'read consume', 'write persist save'];

export function stemTerm(term: string): string {
  if (/ies$/.test(term) && term.length > 4) return term.slice(0, -3) + 'y';
  if (/(ied)$/.test(term) && term.length > 4) return term.slice(0, -3) + 'y';
  if (/ing$/.test(term) && term.length > 5) {
    const base = term.slice(0, -3);
    return /([^aeiou])\1$/.test(base) ? base.slice(0, -1) : base;
  }
  if (/ed$/.test(term) && term.length > 4) return term.slice(0, -2);
  if (/s$/.test(term) && !/(ss|us|is)$/.test(term) && term.length > 3) return term.slice(0, -1);
  return term;
}

export function terms(text: string, dropStopwords = true): string[] {
  const words = text.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.filter((w) => !dropStopwords || !STOP.has(w)).map(stemTerm))];
}

const synonyms = GROUPS.map((g) => terms(g, false));
export function alternatives(term: string): string[] {
  return [...new Set([term, ...synonyms.filter((g) => g.includes(term)).flat()])];
}

export function reciprocalRankFusion(rankings: string[][], k = 60): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) for (const [i, id] of [...new Set(ranking)].entries()) {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1));
  }
  return [...scores].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
