def word_counts(values: list[str]):
    """Count occurrences of each string using a dictionary."""
    result = {}
    for value in values:
        if value not in result:
            result[value] = 0
        result[value] += 1
    return result
