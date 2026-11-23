import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { moduleGraph } from '../../index/query.js';
import { ensureGwDir } from '../../util/paths.js';
import { buildViewModel, lastSessionBlocks, renderViewHtml } from '../../view/view.js';
import { globalOpts, withIndex } from '../context.js';
import { emit } from '../output.js';

function openInBrowser(file: string): boolean {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [file]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : ['xdg-open', [file]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export function register(program: Command): void {
  program
    .command('view')
    .description('open a local page with the module graph and where the last session was blocked')
    .option('--no-open', 'write the page without opening a browser')
    .option('-o, --out <file>', 'where to write the page (default: .groundwork/view.html)')
    .action(async (o: { open: boolean; out?: string }, cmd: Command) => {
      const opts = globalOpts(cmd);
      await withIndex(opts, ({ root, db }) => {
        const model = buildViewModel(moduleGraph(db), lastSessionBlocks(root));
        const file = o.out ? path.resolve(o.out) : path.join(ensureGwDir(root), 'view.html');
        writeFileSync(file, renderViewHtml(model, path.basename(root)));
        const opened = o.open && !opts.json ? openInBrowser(file) : false;
        emit(opts, { file, opened, granularity: model.granularity, nodes: model.nodes.length, edges: model.edges.length, session: model.session }, () =>
          [`wrote ${file}`, `${model.nodes.length} ${model.granularity === 'file' ? 'files' : 'directories'}, ${model.edges.length} import edges, ${model.session.blocks.length} block(s) from the last session`, opened ? 'opening it in your browser' : `open it with: file://${file}`].join('\n'),
        );
      });
    });
}
