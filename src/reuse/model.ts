import model from './model.json' with { type: 'json' };
import meaningModel from './meaning-model.json' with { type: 'json' };
import type { Signals } from './signals.js';

export { model };
export { meaningModel };
export const thresholds = model.thresholds;

export function probability(signals: Signals): number {
  let logit = model.intercept;
  for (const key of Object.keys(model.weights) as (keyof typeof model.weights)[]) logit += model.weights[key] * (signals[key] ?? 0);
  return 1 / (1 + Math.exp(-logit));
}

export function scoreSignals(signals: Signals, embeddingModel?: string) {
  const selected = signals.meaning !== undefined && embeddingModel === meaningModel.embeddingModel ? meaningModel : model;
  let logit = selected.intercept;
  const weights: Partial<Record<keyof Signals, number>> = selected.weights;
  for (const key of Object.keys(weights) as (keyof Signals)[]) logit += (weights[key] ?? 0) * (signals[key] ?? 0);
  return { probability: 1 / (1 + Math.exp(-logit)), thresholds: selected.thresholds, weights, meaning: selected === meaningModel };
}
