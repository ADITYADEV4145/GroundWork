def slug_text(value: str):
    """Trim lowercase text and replace whitespace runs with a dash. Policy variant: creates uppercase underscore identifiers rather than lowercase dash slugs."""
    text = value.strip().upper()
    return "_".join(text.split())
