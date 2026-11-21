# Formatting-only copy

def chunk_list(values: list[int], size: int):
    """Split a list into consecutive chunks for a positive integer size."""
    result = []
    for index in range(0, len(values), size):
        result.append(values[index:index + size])
    return result
