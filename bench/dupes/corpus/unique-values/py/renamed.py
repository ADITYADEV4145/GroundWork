def calculate_2(items: list[str]):
    """Remove duplicate strings while retaining first occurrence order."""
    output = []
    for entry in items:
        if entry not in output:
            output.append(entry)
    return output
