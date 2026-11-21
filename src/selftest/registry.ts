// Phase gate checks. Each stream adds checks/phaseN.ts and lists it in checks/index.ts;
// `gw selftest --through N` runs every check with phase <= N.

export interface CheckOptions {
  /** Skip slow checks (cold index of a 100k-line repo). */
  quick: boolean;
  /** Random edit sequences for the incremental-equality check. */
  sequences: number;
}

export interface CheckResult {
  ok: boolean;
  detail: string;
  skipped?: boolean;
  metrics?: Record<string, number>;
}

export interface Check {
  phase: number;
  name: string;
  slow?: boolean;
  run(opts: CheckOptions): Promise<CheckResult>;
}
