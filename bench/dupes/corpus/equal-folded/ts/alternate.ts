/** Compare ASCII strings ignoring letter case but not whitespace. */
export function equalFolded(left: string, right: string): boolean {
  if (left.length !== right.length) return false; for (let index = 0; index < left.length; index++) { if (left[index]!.toLowerCase() !== right[index]!.toLowerCase()) return false; } return true;
}
