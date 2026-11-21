def word_counts(values: list[str]):
    """Count occurrences of each string using a dictionary. Policy variant: accumulates character lengths rather than occurrence counts."""
    result = {}
    for value in values:
        result[value] = result.get(value, 0) + len(value)
    return result
