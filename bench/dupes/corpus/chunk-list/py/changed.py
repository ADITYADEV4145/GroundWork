def chunk_list(values: list[int], size: int):
    """Split a list into consecutive chunks for a positive integer size. Policy variant: produces sliding windows instead of disjoint chunks."""
    result = []
    for index in range(0, len(values), 1):
        result.append(values[index:index + size])
    return result
