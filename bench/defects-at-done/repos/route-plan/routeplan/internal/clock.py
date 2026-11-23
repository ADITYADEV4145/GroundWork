import re


def minutes_of_day(text: str) -> int:
    """Minutes since midnight for a time as dispatchers write it: "9:05", "09.05", "0905" and "9h05" all give 545."""
    match = re.fullmatch(r"\s*(\d{1,2})[:.h]?(\d{2})\s*", text)
    if not match or int(match.group(1)) > 23 or int(match.group(2)) > 59:
        raise ValueError(f"not a time of day: {text!r}")
    return int(match.group(1)) * 60 + int(match.group(2))
