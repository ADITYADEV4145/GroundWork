/** Parse an integer TCP port between one and 65535. */
export function parsePort(value: string): number {
  const port = Number(value); const valid = Number.isInteger(port) && port >= 1 && port <= 65535; if (!valid) throw new Error("Invalid port"); return port;
}
