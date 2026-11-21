def chunk_list(values: list[int], size: int):
    """Split a list into consecutive chunks for a positive integer size."""
    result = []
    index = 0
    while index < len(values):
        result.append(values[index:index + size])
        index += size
    return result
