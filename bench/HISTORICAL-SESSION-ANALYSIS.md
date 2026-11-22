# Historical session-estimator sensitivity

Report only; archives and published results are unchanged. Fixed seed 0x51ab17ed, 10,000 independent whole-session draws/arm; 95% nearest-rank intervals. Eight sessions/arm per round, not the pre-registered 16-session v7 experiment.
Elapsed is the historical first-begin→last-finish envelope proxy, not controller-owned pre-disclosure timing. Tool-side time is unavailable. Ratios of arm means; positive reduction favors GW. Bytes are UTF-8 tool output, not billed tokens. Changed rounds are not pooled. Guardrail means no category success drop; not proof of equal quality.

| Suite | Round | Envelope s/task B → GW; reduction [CI] | Bytes/session B → GW; reduction [CI] | Tool-side | Success B / GW | Guardrail |
| --- | --- | --- | --- | --- | --- | --- |
| nav | original | 5.81 → 7.67; -32.1% [-49.5, -15.8] | 34400.13 → 29380.38; 14.6% [4.3, 23.9] | unavailable | 240/240 / 240/240 | met |
| nav | v2 | 5.43 → 6.86; -26.3% [-38.9, -13.8] | 34027.50 → 26857.63; 21.1% [13.3, 28.1] | unavailable | 240/240 / 240/240 | met |
| nav | v3 | 5.44 → 6.31; -16.0% [-30.8, -3.2] | 35453.75 → 25243.75; 28.8% [19.1, 37.5] | unavailable | 240/240 / 240/240 | met |
| nav | v4 | 5.47 → 6.68; -22.2% [-34.8, -11.5] | 35396.00 → 37306.63; -5.4% [-15.1, 3.7] | unavailable | 240/240 / 240/240 | met |
| nav | v5 | 5.53 → 6.51; -17.8% [-33.8, -3.7] | 36081.63 → 36675.88; -1.6% [-16.8, 10.1] | unavailable | 240/240 / 240/240 | met |
| nav | v6 | 5.46 → 6.24; -14.3% [-27.7, -2.8] | 34267.00 → 31159.50; 9.1% [-0.4, 17.8] | unavailable | 240/240 / 240/240 | met |
| long-horizon | original | 8.47 → 11.29; -33.2% [-52.7, -14.5] | 5778.25 → 8038.25; -39.1% [-85.3, -3.3] | unavailable | 80/80 / 80/80 | met |
| long-horizon | v2 | 9.70 → 11.51; -18.8% [-33.9, -5.0] | 5162.25 → 7199.88; -39.5% [-72.4, -16.5] | unavailable | 80/80 / 80/80 | met |
| long-horizon | v3 | 9.73 → 10.05; -3.3% [-23.5, 13.7] | 5244.50 → 6565.88; -25.2% [-77.7, 9.0] | unavailable | 80/80 / 80/80 | met |
| long-horizon | v4 | 9.72 → 11.31; -16.4% [-32.9, -1.7] | 6066.38 → 6098.13; -0.5% [-26.4, 18.6] | unavailable | 80/80 / 80/80 | met |
| long-horizon | v5 | 9.34 → 9.84; -5.4% [-24.5, 9.9] | 6705.63 → 6493.00; 3.2% [-17.3, 23.8] | unavailable | 80/80 / 80/80 | met |
| long-horizon | v6 | 8.85 → 10.42; -17.8% [-41.0, 1.0] | 4622.75 → 6098.25; -31.9% [-61.1, -11.4] | unavailable | 80/80 / 80/80 | met |

Post-hoc sensitivity only: do not replace preregistered historical conclusions with a selected favorable estimand. Intervals condition on observed within-round session mixtures, not unmeasured shared-wave or new-project variance.
