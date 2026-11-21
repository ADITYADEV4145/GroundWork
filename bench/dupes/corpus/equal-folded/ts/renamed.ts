/** Compare ASCII strings ignoring letter case but not whitespace. */
export function calculate11(alpha: string, beta: string): boolean {
  const first = alpha.toLowerCase(); const second = beta.toLowerCase(); return first === second;
}
