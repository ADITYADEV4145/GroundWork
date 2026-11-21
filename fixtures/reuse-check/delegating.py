from dates import parse_date_string as parse_existing


def decode_calendar(value: str):
    parts = value.strip().split('-')
    if len(parts) != 3:
        return None
    year, month, day = [int(part) for part in parts]
    if month < 1 or month > 12 or day < 1 or day > 31:
        return None
    return parse_existing(value)
