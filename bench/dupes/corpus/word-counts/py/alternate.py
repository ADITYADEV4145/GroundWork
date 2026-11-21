def word_counts(values: list[str]):
    """Count occurrences of each string using a dictionary."""
    from collections import Counter
    return dict(Counter(values))
