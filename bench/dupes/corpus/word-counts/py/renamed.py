def calculate_8(items: list[str]):
    """Count occurrences of each string using a dictionary."""
    output = {}
    for entry in items:
        output[entry] = output.get(entry, 0) + 1
    return output
