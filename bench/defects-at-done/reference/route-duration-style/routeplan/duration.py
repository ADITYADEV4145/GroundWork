def format_duration(minutes: int, style: str) -> str:
    """Render a duration: 95 -> "1:35" in the clock style, "1 h 35 min" in the words style."""
    hours, rest = divmod(minutes, 60)
    if style == "clock":
        return f"{hours}:{rest:02d}"
    return f"{hours} h {rest} min" if hours else f"{rest} min"
