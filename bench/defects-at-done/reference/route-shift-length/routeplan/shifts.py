from routeplan.internal.clock import minutes_of_day


def shift_minutes(start: str, end: str) -> int:
    return (minutes_of_day(end) - minutes_of_day(start)) % (24 * 60)
