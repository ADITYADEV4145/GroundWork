import { describe, expect, it } from 'vitest';
import { sessionInterval, sessionSummary } from '../src/bench/session-stats.js';
import { captureSchema, observationSchema, type Evidence } from '../src/bench/schema.js';

const observation = { task: 'first', startedAt: 100, endedAt: 120, wallMs: 20, tools: [{ action: 'shell', bytes: 0, startedAt: 105, endedAt: 115, durationMs: 9.8 }] };
function evidence(): Evidence {
  return { format: 1, suite: 'nav', suiteDigest: '0'.repeat(64), captures: ['baseline', 'groundwork'].flatMap((arm) => Array.from({ length: 16 }, (_, i) => ({
    suite: 'nav', revision: 'a'.repeat(40), captureRevision: 'b'.repeat(40), run: i + 1, condition: arm as 'baseline' | 'groundwork', agent: 'test', model: null, node: 'test', protocol: 'stable-v1' as const,
    sessionStartedAt: 90, sessionEndedAt: arm === 'baseline' ? 130 : 120, sessionStartBasis: 'workspace-ready' as const,
    samples: [{ task: 'first', startedAt: 100, endedAt: 120, wallMs: 20, toolSideMs: arm === 'baseline' ? 10 : 5, toolCalls: 1, toolOutputBytes: arm === 'baseline' ? 100 : 50, success: true, filesRead: 0, readBytes: 0, readBlocks: 0 }],
  }))) };
}
describe('stable session protocol', () => {
  it('uses ratios of means, deterministic independent session draws and zero/empty handling', () => {
    expect(sessionInterval([], [])).toBeNull();
    expect(sessionInterval([0], [1])).toBeNull();
    expect(sessionInterval([10, 10], [5, 5])).toEqual({ median: 50, low: 50, high: 50, adjustedLow: 50 });
    expect(sessionInterval([1, 9], [1, 1])?.median).toBe(80);
    expect(sessionInterval([1, 9], [1, 1])).toEqual(sessionInterval([1, 9], [1, 1]));
    expect(() => sessionInterval([-1], [1])).toThrow('Invalid session metric');
  });
  it('sums tool time and bytes, includes gaps, rejects missing instrumentation and run counts', () => {
    const e = evidence();const p = sessionSummary(e, 1, 16);
    expect(p.elapsedMsPerTask?.reductionPct?.median).toBe(25);
    expect(p.emittedBytesPerSession?.reductionPct?.median).toBe(50);
    expect(p.toolSideMsPerSession?.reductionPct?.median).toBe(50);
    expect(() => sessionSummary(e, 1, 8)).toThrow('16 sessions');
    delete e.captures[0]!.samples[0]!.toolSideMs;
    expect(() => sessionSummary(e, 1, 16)).toThrow('Incomplete stable');
  });
  it('labels old envelopes as proxies and never invents tool durations', () => {
    const e = evidence();for (const c of e.captures) { delete c.protocol;delete c.sessionStartedAt;delete c.sessionEndedAt;delete c.samples[0]!.toolSideMs; }
    const p = sessionSummary(e, 1, 16);
    expect(p.basis).toBe('historical-envelope-proxy');expect(p.toolSideMsPerSession).toBeNull();
    expect(p.elapsedMsPerTask?.baselineMean).toBe(20);
  });
  it('validates complete monotonic action fields and session boundaries without breaking legacy observations', () => {
    expect(observationSchema.safeParse(observation).success).toBe(true);
    expect(observationSchema.safeParse({ ...observation, tools: [{ action: 'read', bytes: 0 }] }).success).toBe(true);
    expect(observationSchema.safeParse({ ...observation, tools: [{ ...observation.tools[0], endedAt: 90 }] }).success).toBe(false);
    expect(observationSchema.safeParse({ ...observation, tools: [{ action: 'read', bytes: 0, durationMs: 1 }] }).success).toBe(false);
    expect(observationSchema.safeParse({ ...observation, endedAt: 121 }).success).toBe(false);
    const c = { ...evidence().captures[0], observations: [observation] };
    expect(captureSchema.safeParse(c).success).toBe(true);
    expect(captureSchema.safeParse({ ...c, sessionEndedAt: 110 }).success).toBe(false);
  });
});
