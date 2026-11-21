/** Compare ASCII strings ignoring letter case but not whitespace. */
export function equalFolded(left: string, right: string): boolean {
  const first = left.toUpperCase(); const second = right.toUpperCase(); return first === second;
}
