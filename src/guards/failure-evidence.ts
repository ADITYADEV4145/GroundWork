// Independent corpus oracle: do not share detection patterns with the trimmer.
export function failureEvidence(output: string): string[] {
  const lines = output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').split(/\r?\n/);
  return [...new Set(lines.filter((line) =>
    /fail|error|exception|assert|traceback|expected|received|●|×|✗|✕|❯|err[_!]|^\s*e\s|^\s*>/i.test(line) ||
    /\b(?:TS\d{4}|[EFW]\d{3}|ERR_[A-Z_]+)\b/.test(line)
  ))];
}
