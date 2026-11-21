def equal_folded(left: str, right: str):
    """Compare ASCII strings ignoring letter case but not whitespace. Policy variant: ignores whitespace as well as case."""
    first = left.strip().lower()
    second = right.strip().lower()
    return first == second
