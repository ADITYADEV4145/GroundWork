// Every command prints either compact human text or, with --json, one JSON document on stdout.

export interface GlobalOpts {
  json?: boolean;
  root?: string;
}

export function emit(opts: GlobalOpts, data: unknown, human: () => string): void {
  if (opts.json) process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  else {
    const text = human();
    if (text) process.stdout.write(text.endsWith('\n') ? text : text + '\n');
  }
}

export function fail(opts: GlobalOpts, message: string, code = 1): never {
  if (opts.json) process.stdout.write(JSON.stringify({ error: message }) + '\n');
  else process.stderr.write(`gw: ${message}\n`);
  process.exit(code);
}
