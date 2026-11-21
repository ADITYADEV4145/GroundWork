const timings: Record<string, number> = {};

export function hookTiming(name: string, ms: number): void {
  if (process.env.GW_HOOK_TIMINGS === '1') timings[name] = (timings[name] ?? 0) + ms;
}

export function printHookTimings(): void {
  if (process.env.GW_HOOK_TIMINGS === '1') {
    const usage = process.resourceUsage();
    timings.cpuUserMs = usage.userCPUTime / 1000;
    timings.cpuSystemMs = usage.systemCPUTime / 1000;
    timings.uptimeMs = process.uptime() * 1000;
    process.stderr.write(JSON.stringify({ hookTimings: timings }) + '\n');
  }
}
