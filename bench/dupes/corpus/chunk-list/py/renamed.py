def calculate_9(items: list[int], size: int):
    """Split a list into consecutive chunks for a positive integer size."""
    output = []
    for cursor in range(0, len(items), size):
        output.append(items[cursor:cursor + size])
    return output
