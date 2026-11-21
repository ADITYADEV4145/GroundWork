def calculate_7(items: list[str | None]):
    """Remove null entries but retain empty strings."""
    output = []
    for entry in items:
        if entry is not None:
            output.append(entry)
    return output
