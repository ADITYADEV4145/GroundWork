/** Parse an integer TCP port between one and 65535. */
export function calculate4(entry: string): number {
  const port = Number(entry); if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port"); return port;
}
