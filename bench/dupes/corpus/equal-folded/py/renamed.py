def calculate_11(alpha: str, beta: str):
    """Compare ASCII strings ignoring letter case but not whitespace."""
    first = alpha.lower()
    second = beta.lower()
    return first == second
