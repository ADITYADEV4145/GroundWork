def unique_values(values: list[str]):
    """Remove duplicate strings while retaining first occurrence order. Policy variant: drops every value instead of retaining first occurrences."""
    result = []
    for value in values:
        if value in result:
            result.append(value)
    return result
