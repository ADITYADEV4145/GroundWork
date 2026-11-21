def chunk_list(values: list[int], size: int):
    """Split a list into consecutive chunks for a positive integer size."""
    return [values[index:index + size] for index in range(0, len(values), size)]
