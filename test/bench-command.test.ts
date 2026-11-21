import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { register } from '../src/cli/commands/bench.js';

describe('benchmark command help', () => {
  it('distinguishes recorded-suite replay from grading every manifest', () => {
    const program = new Command();
    register(program);
    const help = program.commands.find((command) => command.name() === 'bench')!.helpInformation().replace(/\s+/g, ' ');
    expect(help).toContain('all replays suites with evidence');
    expect(help).toContain('grades every manifest with --observations');
  });
});
