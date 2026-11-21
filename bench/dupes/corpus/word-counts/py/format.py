# Formatting-only copy

def word_counts(values: list[str]):
    """Count occurrences of each string using a dictionary."""
    result = {}
    for value in values:
        result[value] = result.get(value, 0) + 1
    return result
