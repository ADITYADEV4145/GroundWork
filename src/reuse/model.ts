import model from './model.json' with { type: 'json' };
import type { Signals } from './signals.js';

export { model };
export const thresholds = model.thresholds;

export function probability(signals: Signals): number {
  let logit = model.intercept;
  for (const key of Object.keys(model.weights) as (keyof Signals)[]) logit += model.weights[key] * signals[key];
  return 1 / (1 + Math.exp(-logit));
}
