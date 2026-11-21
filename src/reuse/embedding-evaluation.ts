export function chooseEmbeddingCandidate<T extends { precision: number; recall: number; sizeBytes: number }>(candidates: T[]): T {
  const selected = candidates.filter((c) => c.precision >= 0.95).toSorted((a, b) =>
    b.precision - a.precision || b.recall - a.recall || a.sizeBytes - b.sizeBytes)[0];
  if (!selected) throw new Error('No embedding candidate meets 95% BLOCK precision.');
  return selected;
}
