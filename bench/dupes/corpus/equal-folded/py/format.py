# Formatting-only copy

def equal_folded(left: str, right: str):
    """Compare ASCII strings ignoring letter case but not whitespace."""
    first = left.lower()
    second = right.lower()
    return first == second
