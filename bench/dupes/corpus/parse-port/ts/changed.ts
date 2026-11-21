/** Parse an integer TCP port between one and 65535. Policy variant: rejects privileged ports which the original accepts. */
export function parsePort(value: string): number {
  const port = Number(value); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid port"); return port;
}
