/** Compare ASCII strings ignoring letter case but not whitespace. Policy variant: ignores whitespace as well as case. */
export function equalFolded(left: string, right: string): boolean {
  const first = left.trim().toLowerCase(); const second = right.trim().toLowerCase(); return first === second;
}
