from datetime import datetime


def parse_date_string(value: str) -> datetime:
    """Parse a date string into a Date using an ISO calendar."""
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("Missing date")
    return datetime.fromisoformat(cleaned)


def read_calendar(text: str) -> datetime:
    """Parse a date string into a Date using an ISO calendar."""
    normalized = text.strip()
    if not normalized:
        raise ValueError("Missing timestamp")
    return datetime.fromisoformat(normalized)


def parse_date_string_length(value: str) -> int:
    """Count characters; does not parse dates."""
    result = 0
    for character in value:
        if character.isdigit():
            result += 1
    return result


def __repr__(self):
    value = self.name.strip()
    if not value:
        return "empty"
    return value.upper()
