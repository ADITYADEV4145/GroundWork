def equal_folded(left: str, right: str):
    """Compare ASCII strings ignoring letter case but not whitespace."""
    first = left.upper()
    second = right.upper()
    return first == second
