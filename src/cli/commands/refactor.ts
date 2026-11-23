import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import type { Command } from 'commander';
import { globalOpts, withIndex } from '../context.js';
import { emit, fail } from '../output.js';

async function readBody(file: string, limit: number): Promise<string> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit * 4) throw new Error('Body must be a bounded UTF-8 file.');
    const bytes = Buffer.alloc(limit * 4 + 1);
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await handle.read(bytes, size, bytes.length - size, size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    const input = bytes.subarray(0, size), body = input.toString('utf8');
    if (size === bytes.length || body.length > limit || !Buffer.from(body).equals(input)) {
      throw new Error(`Body must be valid UTF-8 and at most ${limit} characters.`);
    }
    return body;
  } finally { await handle.close(); }
}

export function register(program: Command): void {
  program.command('refactor')
    .description('preview or apply a guarded TypeScript/JavaScript symbol rename or function body edit')
    .argument('<symbol>', 'exact symbol ID, qualified name, or repo-relative file:name')
    .option('--rename <name>', 'new identifier')
    .option('--body-file <path>', 'UTF-8 file containing the complete new function body')
    .option('--apply <preview-id>', 'revalidate and apply this exact preview')
    .action(async (symbol: string, options: { rename?: string; bodyFile?: string; apply?: string }, cmd: Command) => {
      const opts = globalOpts(cmd);
      if ((options.rename === undefined) === (options.bodyFile === undefined)) fail(opts, 'Choose either --rename or --body-file.');
      try {
        const { refactorSymbol, formatRefactor, MAX_BODY } = await import('../../refactor/index.js');
        const request = options.rename !== undefined ? { symbol, name: options.rename } :
          { symbol, body: await readBody(options.bodyFile!, MAX_BODY) };
        const result = await withIndex(opts, (ctx) => refactorSymbol(ctx, request, options.apply));
        emit(opts, result, () => formatRefactor(result));
        if (result.check.blocked) process.exitCode = 1;
      } catch (e) {
        fail(opts, (e as Error).message);
      }
    });
}
