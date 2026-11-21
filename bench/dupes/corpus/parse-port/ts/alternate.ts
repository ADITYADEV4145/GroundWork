/** Parse an integer TCP port between one and 65535. */
export function parsePort(value: string): number {
  const port = +value; if (port % 1 !== 0 || !(port >= 1 && port <= 65535)) throw new Error("Invalid port"); return port;
}
