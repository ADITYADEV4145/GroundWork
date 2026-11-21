import type { Signals } from './signals.js';

export const BLOCK_POLICY = 'independent-compatible-majority-structure-v1';
export const BLOCK_SCORE_FLOOR = 0.750969663;
export interface PairIdentity {
  file?: string;
  qualifiedName?: string;
  startByte?: number;
  endByte?: number;
  kind?: string;
}

export function relatedSymbols(a: PairIdentity, b: PairIdentity): boolean {
  if (!a.file || a.file !== b.file) return false;
  if (a.qualifiedName && b.qualifiedName && (a.qualifiedName === b.qualifiedName ||
    a.qualifiedName.startsWith(b.qualifiedName + '.') || b.qualifiedName.startsWith(a.qualifiedName + '.'))) return true;
  if (a.startByte === undefined || a.endByte === undefined || b.startByte === undefined || b.endByte === undefined) return false;
  return (a.startByte <= b.startByte && a.endByte >= b.endByte) || (b.startByte <= a.startByte && b.endByte >= a.endByte);
}

export function compatibleKinds(a: PairIdentity, b: PairIdentity): boolean {
  const family = (kind?: string) => ['class', 'dataclass'].includes(kind ?? '') ? 'class' :
    ['function', 'method'].includes(kind ?? '') ? 'callable' : undefined;
  return family(a.kind) !== undefined && family(a.kind) === family(b.kind);
}

export function canBlock(a: PairIdentity, b: PairIdentity, signals: Signals): boolean {
  return !relatedSymbols(a, b) && compatibleKinds(a, b) &&
    (signals.bindingExact === 1 || signals.exact === 1 || signals.structure >= 0.5);
}
