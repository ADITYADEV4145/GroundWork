/** Compare ASCII strings ignoring letter case but not whitespace. */
export function equalFolded(left: string, right: string): boolean {
  const first = left.toLowerCase(); const second = right.toLowerCase(); return first === second;
}
