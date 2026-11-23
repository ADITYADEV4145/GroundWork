import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp/server.ts';

const args = process.argv.slice(2);
const compare = args[0] === '--compare' && args.length === 2;
const json = args[0] === '--json' && args.length === 1;
if (args.length && !compare && !json) throw new Error('Usage: node --import tsx scripts/measure-mcp-schemas.mjs [--json | --compare baseline.json]');

const client = new Client({ name: 'measure-mcp-schemas', version: '1' });
const server = await createMcpServer(process.cwd());
const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
const tools = [];
try {
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  let cursor;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
} finally {
  await Promise.all([client.close(), server.close()]);
}

const inventory = JSON.stringify(tools);
if (json) {
  console.log(inventory);
} else {
  const count = (payload) => Number(execFileSync('python3', ['-c',
    'import sys, tiktoken; print(len(tiktoken.get_encoding("cl100k_base").encode_ordinary(sys.stdin.read())))',
  ], { input: payload, encoding: 'utf8' }).trim());
  const current = count(inventory);
  if (compare) {
    const baseline = JSON.parse(readFileSync(args[1], 'utf8'));
    const contract = (value) => JSON.parse(JSON.stringify(value, (key, entry) =>
      key === 'description' && typeof entry === 'string' ? undefined : entry));
    assert.deepEqual(contract(tools), contract(baseline), 'Tool validation contracts changed');
    const before = count(JSON.stringify(baseline));
    console.log(`cl100k_base: ${before} → ${current} tokens across ${tools.length} tools (${((current - before) / before * 100).toFixed(1)}%); validation contracts unchanged`);
  } else {
    console.log(`cl100k_base: ${current} tokens across ${tools.length} tools`);
  }
}
