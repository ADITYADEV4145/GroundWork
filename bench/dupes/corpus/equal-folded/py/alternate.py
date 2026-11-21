def equal_folded(left: str, right: str):
    """Compare ASCII strings ignoring letter case but not whitespace."""
    return len(left) == len(right) and all(a.lower() == b.lower() for a, b in zip(left, right))
